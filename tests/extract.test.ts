// The reader is checked against real messages from public channels (names, links and disclaimers removed).
// Every expectation in fixtures/messages.json was read and confirmed by hand.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { openMarket } from "../src/data/node-loader";
import type { Market } from "../src/data/market";
import { extract, normalise } from "../src/engine/extract";
import { dictionaryOf } from "../src/engine/reckon";

interface Fixture {
  text: string;
  ts: string;
  is: "call" | "result" | "other";
  expect?: Record<string, unknown>;
}
const fixtures: Fixture[] = JSON.parse(readFileSync(new URL("./fixtures/messages.json", import.meta.url), "utf8"));

let market: Market;
const read = (text: string, ts = "2026-08-12T04:00:00Z") => extract([{ id: 1, ts, text }], dictionaryOf(market), market.days);
beforeAll(async () => {
  market = await openMarket();
});

describe("real messages", () => {
  it("has a labelled set of at least 180 messages", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(180);
  });

  it.each(fixtures.filter((f) => f.is === "call").map((f) => [f.text.split("\n").join(" / ").slice(0, 70), f] as const))("reads the call: %s", (_, f) => {
    const { calls } = read(f.text, f.ts);
    expect(calls).toHaveLength(1);
    const c = calls[0];
    expect({
      kind: c.kind,
      symbol: c.symbol,
      ...(c.strike !== undefined ? { strike: c.strike, optType: c.optType } : {}),
      side: c.side,
      entry: c.entry,
      targets: c.targets,
      ...(c.stop !== undefined ? { stop: c.stop } : {}),
      horizon: c.horizon,
    }).toEqual(f.expect);
  });

  it.each(fixtures.filter((f) => f.is === "result").map((f) => [f.text.split("\n").join(" / ").slice(0, 70), f] as const))("treats as a result post, not a call: %s", (_, f) => {
    const x = read(f.text, f.ts);
    expect(x.calls).toHaveLength(0);
    expect(x.followUps[0]?.kind).toBe(f.expect!.kind);
  });

  it.each(fixtures.filter((f) => f.is === "other").map((f) => [f.text.split("\n").join(" / ").slice(0, 70), f] as const))("finds no call in: %s", (_, f) => {
    const x = read(f.text, f.ts);
    expect(x.calls).toHaveLength(0);
    expect(x.followUps).toHaveLength(0);
  });
});

describe("reading rules", () => {
  it("maps Hindi and Hinglish trade words", () => {
    expect(normalise("बैंक निफ्टी 52000 कॉल खरीदें 250 के ऊपर, टारगेट 300, स्टॉपलॉस 220")).toMatch(/BANKNIFTY\s+52000 CE\s+BUY\s+250\s+ABOVE\s*,\s+TGT\s+300,\s+SL\s+220/);
    const [c] = read("Nifty 24500 ce 120 ke upar buy karo, target 150, sl 100").calls;
    expect(c).toMatchObject({ symbol: "NIFTY", strike: 24500, optType: "CE", entry: { type: "above", lo: 120 }, targets: [150], stop: 100 });
  });

  it("keeps thousands separators and lists apart", () => {
    expect(normalise("NIFTY 24,500 TGT 120,150,180 profit 1,24,500")).toContain("24500 TGT 120,150,180");
  });

  it("does not let a list index eat the first digit of a price", () => {
    expect(read("BUY BSE 3200 CE ABOVE 91 TRG 360/460/560 SL 60").calls[0].targets).toEqual([360, 460, 560]);
    expect(read("BUY TCS CMP 3000 TARGET 1: 3100 TARGET 2: 3200 SL 2900").calls[0].targets).toEqual([3100, 3200]);
  });

  it("reads levels given as percent or points from the entry", () => {
    const [c] = read("Bought #GANDHAR 247\nSL 1%\nTarget 4-6%").calls;
    expect(c.stop).toBeCloseTo(244.53);
    expect(c.targets).toEqual([256.88, 261.82]);
    expect(read("BUY RELIANCE ABOVE 1300 TGT 20 POINTS SL 15 POINTS").calls[0]).toMatchObject({ targets: [1320], stop: 1285 });
  });

  it("tolerates a misspelt name only when one instrument is a letter away", () => {
    expect(read("BUY KYNES 3450 CE 129 TRG 142-155-170 SL 90").calls[0]).toMatchObject({ symbol: "KAYNES", confidence: "medium" });
    expect(read("BUY TVSMOTORS @ 4396.8 SL 4344 TGT 4463").calls[0].symbol).toBe("TVSMOTOR");
  });

  it("does not turn commentary into calls", () => {
    expect(read("Nifty need to manage above 24257/324 then perfect bullish formation.").calls).toHaveLength(0);
    expect(read("NIFTY support 23500 resistance 24000, bank nifty looks weak below 54000").calls).toHaveLength(0);
    expect(read("RELIANCE trading below support level. Next important zone near 1190-1220").calls).toHaveLength(0);
    expect(read("CONTINUE POSTED OPTION IN ONLY BNF JUNE CE SINCE LAST 6 DAYS, EVERYONE BEARISH TGT 50K").calls).toHaveLength(0);
  });

  it("ignores disclaimers when deciding what kind of instrument it is", () => {
    const text = "Mcx sell below 3335\nTarget - 3325/ 3315\nSl- 3350\nIntraday\n📢 Read everything to avoid any future conflict of interest.";
    expect(read(text).calls[0]).toMatchObject({ kind: "equity", symbol: "MCX", side: "short" });
  });

  it("counts a call repeated the same day once", () => {
    const d = dictionaryOf(market);
    const x = extract(
      [
        { id: 1, ts: "2026-08-12T04:00:00Z", text: "Buy IRCTC in cash @ 505.50 SL 492 TGT 528" },
        { id: 2, ts: "2026-08-13T04:00:00Z", text: "Stopped out..... Buy IRCTC in cash @ 505.50 SL 492 TGT 528" },
        { id: 3, ts: "2026-08-12T07:00:00Z", text: "Buy IRCTC in cash @ 505.50 SL 492 TGT 528" },
        { id: 4, ts: "2026-08-14T04:00:00Z", text: "Buy IRCTC in cash @ 505.50 SL 492 TGT 528" },
      ],
      d,
      market.days,
    );
    // the same-day repeat is a reminder; the one two days later is a fresh call
    expect(x.calls.map((c) => c.id)).toEqual(["1", "4"]);
    expect(x.reposts).toBe(1);
    expect(x.followUps[0]).toMatchObject({ kind: "stop-hit", callId: "1" });
  });

  it("links a result post to the call it replies to, and never to a different instrument", () => {
    const d = dictionaryOf(market);
    const x = extract(
      [
        { id: 10, ts: "2026-08-12T04:00:00Z", text: "BUY GRASIM 3000 CE ABOVE 54 TRG 70-83-92 SL 40" },
        { id: 11, ts: "2026-08-12T05:00:00Z", text: "4.5 TO 10 #BIOCON 400 CE\nALL TARGET HIT" },
        { id: 12, ts: "2026-08-12T06:00:00Z", replyTo: 10, text: "54 TO 71\nFIRST TARGET HIT" },
      ],
      d,
      market.days,
    );
    expect(x.followUps.find((f) => f.msgId === 11)?.callId).toBeUndefined();
    expect(x.followUps.find((f) => f.msgId === 12)).toMatchObject({ callId: "10", claimsTarget: true, quoted: 71 });
  });

  it("reads a running price with points gained as a result post, and keeps the price it quotes", () => {
    const d = dictionaryOf(market);
    const x = extract(
      [
        { id: 20, ts: "2026-08-12T04:00:00Z", text: "BUY NIFTY 24500 CE At 170 - 160 SL PAID TGT 250+++" },
        { id: 21, ts: "2026-08-12T05:00:00Z", replyTo: 20, text: '🔥🔥CMP PRICE  220"  "40" POINT #NIFTY' },
        { id: 22, ts: "2026-08-12T05:30:00Z", text: "BUY BANKNIFTY 55000 CE CMP 320 SL 20 POINTS TGT 400" },
      ],
      d,
      market.days,
    );
    expect(x.followUps).toHaveLength(1);
    expect(x.followUps[0]).toMatchObject({ msgId: 21, kind: "profit", callId: "20", quoted: 220 });
    expect(x.calls.map((c) => c.msgId)).toEqual([20, 22]);
  });

  it("takes the instrument from the previous message when levels arrive on their own", () => {
    const d = dictionaryOf(market);
    const x = extract(
      [
        { id: 1, ts: "2026-08-12T04:00:00Z", text: "Nifty 24500 CE looking strong" },
        { id: 2, ts: "2026-08-12T04:03:00Z", text: "Buy above 270\nSL 245\nTarget 290/320/350" },
      ],
      d,
      market.days,
    );
    expect(x.calls[0]).toMatchObject({ symbol: "NIFTY", strike: 24500, optType: "CE", entry: { type: "above", lo: 270 }, stop: 245, confidence: "medium" });
  });

  it("reports what it could not read instead of guessing", () => {
    const x = read("BUY XYZQW 123 CE @ 20 SL 10 TGT 40");
    expect(x.calls).toHaveLength(0);
    expect(x.unread[0].why).toBe("no-instrument");
    expect(extract([{ id: 1, ts: "2026-08-12T04:00:00Z", text: "", hasPhoto: true }], dictionaryOf(market), market.days).unread[0].why).toBe("image-only");
  });

  it("picks up accuracy claims", () => {
    expect(read("Join our premium group, 95% accuracy guaranteed").claims[0].percent).toBe(95);
  });
});
