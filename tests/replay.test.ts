import { describe, expect, it } from "vitest";
import { replay, type ReplayInput } from "../src/engine/replay";
import type { Bar, Call } from "../src/engine/types";

const bar = (d: number, o: number, h: number, l: number, c: number): Bar => ({ d, o, h, l, c, v: 1000 });
const call = (over: Partial<Call>): Call => ({
  id: "1", msgId: 1, ts: "2026-01-05T04:00:00Z", kind: "option", symbol: "NIFTY", strike: 24000, optType: "CE", side: "long",
  entry: { type: "at", lo: 100 }, targets: [130], stop: 80, horizon: "unspecified", raw: "", confidence: "high", notes: [], ...over,
});
const run = (over: Partial<ReplayInput> & { call: Call; bars: Bar[] }) => replay({ day: 10, session: "in-session", minutesIn: 120, lastDay: 100, expiryDay: 14, ...over });

describe("the day of the call", () => {
  // opened at 140 (above the target), fell through the quoted price, closed at 90
  const bars = [bar(10, 140, 142, 85, 90), bar(11, 90, 95, 70, 72)];

  it("best reading counts a target that traded that day", () => {
    expect(run({ call: call({}), bars, reading: "best" })).toMatchObject({ cls: "target", exitPrice: 130, entryPrice: 100 });
  });

  it("worst reading does not: the high may have printed before the message", () => {
    const out = run({ call: call({}), bars, reading: "worst" });
    expect(out).toMatchObject({ cls: "stop", exitDay: 11 });
  });

  it("likely reading follows the channel's own announcement", () => {
    expect(run({ call: call({}), bars, reading: "likely", announced: true }).cls).toBe("target");
    expect(run({ call: call({}), bars, reading: "likely", announced: false }).cls).toBe("stop");
  });

  it("a close beyond the target settles it under every reading", () => {
    const up = [bar(10, 95, 150, 92, 145)];
    for (const reading of ["best", "worst", "likely"] as const) expect(run({ call: call({}), bars: up, reading }).cls).toBe("target");
  });

  it("a message at the open can trust the day's range beyond the open", () => {
    // opened 98, the high of 135 is above both the open and the quoted price, so it came after the message
    const early = [bar(10, 98, 135, 90, 110)];
    expect(run({ call: call({}), bars: early, minutesIn: 3, reading: "worst" }).cls).toBe("target");
    // but a high that is just the open proves nothing
    const openHigh = [bar(10, 135, 135, 90, 95), bar(11, 95, 96, 60, 62)];
    expect(run({ call: call({}), bars: openHigh, minutesIn: 3, reading: "worst" }).cls).toBe("stop");
  });

  it("target and stop both traded: best says target, worst says stop", () => {
    const both = [bar(10, 100, 135, 75, 100)];
    expect(run({ call: call({}), bars: both, minutesIn: 2, reading: "best" }).cls).toBe("target");
    expect(run({ call: call({}), bars: both, minutesIn: 2, reading: "worst" }).cls).toBe("stop");
  });

  it("a quoted price the contract never traded at is not replayed", () => {
    const far = [bar(10, 300, 320, 280, 310)];
    expect(run({ call: call({}), bars: far })).toMatchObject({ cls: "unverifiable", code: "price-mismatch" });
  });

  it("an intraday call with no price cannot be placed", () => {
    expect(run({ call: call({ entry: { type: "none" }, horizon: "intraday" }), bars: [bar(10, 100, 120, 90, 110)] })).toMatchObject({ code: "no-entry" });
  });
});

describe("after the day of the call", () => {
  it("a later bar is wholly after the entry", () => {
    const bars = [bar(10, 100, 110, 95, 105), bar(11, 106, 131, 104, 128)];
    expect(run({ call: call({}), bars, reading: "worst" })).toMatchObject({ cls: "target", exitDay: 11, exitPrice: 130, retPct: 30 });
  });

  it("a gap through the stop fills at the open, not at the stop", () => {
    const bars = [bar(10, 100, 110, 95, 105), bar(11, 60, 65, 50, 55)];
    expect(run({ call: call({}), bars })).toMatchObject({ cls: "stop", exitPrice: 60, exitBasis: "gap-open" });
  });

  it("an option held to expiry settles at its value against the underlying", () => {
    const bars = [bar(10, 100, 110, 95, 105), bar(11, 100, 105, 90, 95), bar(12, 90, 95, 85, 88), bar(13, 85, 90, 82, 84), bar(14, 60, 70, 2, 3)];
    const out = run({ call: call({ targets: [200], stop: undefined }), bars, settlement: 0 });
    expect(out).toMatchObject({ cls: "expired", exitPrice: 0, retPct: -100, exitBasis: "settlement" });
  });

  it("a contract that stops trading before expiry still settles", () => {
    const bars = [bar(10, 100, 110, 95, 105), bar(11, 100, 105, 90, 95)];
    expect(run({ call: call({ targets: [200], stop: undefined }), bars, settlement: 12 })).toMatchObject({ cls: "expired", exitPrice: 12 });
  });

  it("BTST sells at the next open", () => {
    const bars = [bar(10, 100, 110, 95, 105), bar(11, 112, 140, 100, 101)];
    expect(run({ call: call({ horizon: "btst" }), bars })).toMatchObject({ cls: "horizon", exitPrice: 112, exitBasis: "next-open" });
  });

  it("a position still running when the data ends is valued, and marked open", () => {
    const bars = [bar(10, 100, 110, 95, 105), bar(11, 104, 108, 100, 107)];
    expect(run({ call: call({}), bars, lastDay: 11, expiryDay: 20 })).toMatchObject({ cls: "open", exitPrice: 107 });
  });
});

describe("entries", () => {
  const eq = (over: Partial<Call>) => call({ kind: "equity", symbol: "RELIANCE", strike: undefined, optType: undefined, ...over });

  it("a trigger that never trades leaves the call untaken", () => {
    const bars = [bar(10, 480, 495, 470, 490), bar(11, 490, 498, 480, 485), bar(12, 485, 499, 480, 482), bar(13, 500, 520, 499, 515)];
    const out = run({ call: eq({ entry: { type: "above", lo: 500 }, targets: [520], stop: 490 }), bars, expiryDay: undefined });
    expect(out).toMatchObject({ cls: "not-triggered", code: "level-not-reached" });
  });

  it("a trigger reached on the second day enters there, and its target that day is certain", () => {
    const bars = [bar(10, 480, 495, 470, 490), bar(11, 492, 525, 488, 510)];
    const out = run({ call: eq({ entry: { type: "above", lo: 500 }, targets: [520], stop: 485 }), bars, expiryDay: undefined, reading: "worst" });
    expect(out).toMatchObject({ entryDay: 11, entryPrice: 500, cls: "target" });
  });

  it("a short call earns when the price falls", () => {
    const bars = [bar(10, 520, 521, 500, 505)];
    const out = run({ call: eq({ side: "short", entry: { type: "below", lo: 519 }, targets: [514], stop: 522 }), bars, minutesIn: 1, expiryDay: undefined, reading: "worst" });
    expect(out).toMatchObject({ cls: "target", move: 5 });
  });

  it("an after-hours call with no price enters at the next open", () => {
    const bars = [bar(10, 480, 495, 470, 490)];
    const out = run({ call: eq({ entry: { type: "none" }, targets: [494], stop: 460 }), bars, session: "after-close", expiryDay: undefined });
    expect(out).toMatchObject({ entryPrice: 480, entryBasis: "open", cls: "target" });
  });

  it("no holding period on a stock closes after ten trading days", () => {
    const bars = Array.from({ length: 14 }, (_, k) => bar(10 + k, 100, 101, 99, 100));
    const out = run({ call: eq({ entry: { type: "at", lo: 100 }, targets: [120], stop: 90 }), bars, expiryDay: undefined });
    expect(out).toMatchObject({ cls: "horizon", exitDay: 20 });
  });
});
