import { describe, expect, it } from "vitest";
import { buildLedger, DEFAULT_PARAMS, tradingCosts } from "../src/engine/ledger";
import type { Call, Outcome } from "../src/engine/types";

const call = (id: string, over: Partial<Call> = {}): Call => ({
  id, msgId: +id, ts: "2026-01-05T04:00:00Z", kind: "option", symbol: "NIFTY", strike: 24000, optType: "CE", side: "long",
  entry: { type: "at", lo: 100 }, targets: [130], stop: 80, horizon: "unspecified", raw: "", confidence: "high", notes: [], ...over,
});
const out = (id: string, entryDay: number, exitDay: number, entry: number, exit: number, cls: Outcome["cls"] = "target"): Outcome => ({
  callId: id, cls, entryDay, exitDay, entryPrice: entry, exitPrice: exit, move: exit - entry, retPct: ((exit - entry) / entry) * 100, daysHeld: exitDay - entryDay, lot: 50, assumptions: [],
});

describe("the follower's account", () => {
  it("buys whole lots with a fixed stake and charges costs", () => {
    const calls = [call("1")];
    const L = buildLedger(calls, new Map([["1", out("1", 10, 10, 100, 130)]]));
    // ₹10,000 stake, a lot of 50 at ₹100 costs ₹5,000: two lots
    expect(L.lines[0]).toMatchObject({ status: "taken", lots: 2, quantity: 100, blocked: 10000, gross: 3000 });
    expect(L.lines[0].costs).toBeCloseTo(tradingCosts("option", 10000, 13000, true));
    expect(L.finalBalance).toBeCloseTo(50000 + 3000 - L.lines[0].costs!);
    expect(L.hitRate).toBe(1);
  });

  it("takes one lot even when it costs more than the stake, and stops when the money is gone", () => {
    const calls = [call("1"), call("2"), call("3")];
    const outcomes = new Map([
      ["1", out("1", 10, 10, 600, 0, "expired")],
      ["2", out("2", 11, 11, 390, 0, "expired")],
      ["3", out("3", 12, 12, 100, 130)],
    ]);
    const L = buildLedger(calls, outcomes);
    // each expired lot also costs the flat ₹40 of brokerage
    expect(L.lines[0]).toMatchObject({ lots: 1, blocked: 30000, net: -30040 });
    expect(L.lines[1]).toMatchObject({ status: "taken", blocked: 19500 });
    expect(L.finalBalance).toBe(420);
    expect(L.lines[2].status).toBe("no-funds");
    expect(L.outOfMoneyDay).toBe(12);
  });

  it("leaves unchecked, untriggered and low-confidence calls out of the money", () => {
    const calls = [call("1"), call("2"), call("3", { confidence: "low" })];
    const outcomes = new Map<string, Outcome>([
      ["1", { callId: "1", cls: "unverifiable", assumptions: [] }],
      ["2", { callId: "2", cls: "not-triggered", assumptions: [] }],
      ["3", out("3", 10, 10, 100, 130)],
    ]);
    const L = buildLedger(calls, outcomes);
    expect(L.counts).toMatchObject({ taken: 0, unverifiable: 1, notTriggered: 1, lowConfidence: 1 });
    expect(L.finalBalance).toBe(50000);
    expect(buildLedger(calls, outcomes, { ...DEFAULT_PARAMS, includeLowConfidence: true }).counts.taken).toBe(1);
  });

  it("tracks borrowed money: the day the follower's own money is gone, and what is still owed", () => {
    const calls = [call("1"), call("2")];
    const outcomes = new Map([
      ["1", out("1", 10, 10, 600, 100, "stop")],
      ["2", out("2", 30, 31, 500, 100, "stop")],
    ]);
    const L = buildLedger(calls, outcomes, { ...DEFAULT_PARAMS, borrowedFraction: 0.6 });
    expect(L.loan).toMatchObject({ borrowed: 30000, own: 20000, ownMoneyGoneDay: 10 });
    expect(L.loan!.owed).toBeCloseTo(30000 * 1.03);
    expect(L.loan!.netWorth).toBeLessThan(0);
  });

  it("keeps the call-by-call record going after the account is empty, and gives the chance benchmark", () => {
    const calls = [call("1", { targets: [750], stop: undefined }), call("2", { targets: [500], stop: 300 }), call("3")];
    const outcomes = new Map([
      ["1", out("1", 10, 10, 600, 0, "expired")],
      ["2", out("2", 11, 11, 400, 0, "expired")],
      ["3", out("3", 12, 12, 100, 130)],
    ]);
    const L = buildLedger(calls, outcomes);
    // the second call could not be afforded, yet it still counts in the record
    expect(L.counts).toMatchObject({ taken: 2, noFunds: 1 });
    expect(L.record).toMatchObject({ checked: 3, target: 1, expired: 2, expiredWorthless: 2, profitable: 1 });
    expect(L.record.hitRate).toBeCloseTo(1 / 3);
    // (600-0)/(750-0) = 0.8, (400-300)/(500-300) = 0.5, (100-80)/(130-80) = 0.4
    expect(L.record.chanceHitRate).toBeCloseTo((0.8 + 0.5 + 0.4) / 3);
    expect(L.record.flatNet).toBeLessThan(-45000);
  });

  it("measures the deepest fall from a peak", () => {
    const calls = [call("1"), call("2")];
    const outcomes = new Map([
      ["1", out("1", 10, 10, 100, 200)],
      ["2", out("2", 11, 11, 100, 0, "expired")],
    ]);
    const L = buildLedger(calls, outcomes);
    expect(L.maxDrawdownPct).toBeGreaterThan(15);
    expect(L.curve).toHaveLength(2);
  });
});
