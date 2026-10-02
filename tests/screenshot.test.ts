import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openMarket } from "../src/data/node-loader";
import { reckon } from "../src/engine/reckon";
import { toIst } from "../src/engine/time";
import { guessDay, parseScreenshotText } from "../src/ingest/screenshot";

// What the reader made of two phone screenshots of a real channel (the day's calls, then its result posts),
// once in Telegram's light theme and once in the dark one. Only the channel's name has been changed.
const read = (theme: string) => readFileSync(new URL(`./fixtures/screenshot-${theme}.txt`, import.meta.url), "utf8");
const at = (ts: string) => {
  const { date, minutes } = toIst(ts);
  return `${date} ${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
};

describe("text read from screenshots", () => {
  for (const theme of ["light", "dark"]) {
    it(`${theme} theme: the day's calls and replies come out as they were posted`, () => {
      const text = read(theme);
      expect(guessDay(text, "2026-10-02")).toBe("2025-12-01");
      const { messages, subscribers } = parseScreenshotText(text, "2025-12-01");
      expect(subscribers).toBe("19.8K");
      expect(messages[0]).toMatchObject({ text: "BUY BANKNIFTY 59400 PE At 380 - 360 SL PAID\nTGT 600+++" });
      expect(messages[1]).toMatchObject({ text: "BUY NIFTY 26500 PE At 190 - 200 SL PAID TGT\n250+++" });
      expect(at(messages[0].ts)).toBe("2025-12-01 10:09");
      // the sender's name, the view counts and the lines quoted above each reply are not part of any message
      for (const m of messages) {
        expect(m.text).not.toMatch(/ALPHA TRADES/);
        expect(m.text).not.toMatch(/\b(?:824|791|729|882|962)\b/);
      }
      expect(messages.filter((m) => /^BUY /m.test(m.text))).toHaveLength(2);
      // each result post answers the call it quoted
      const result = (price: number) => messages.find((m) => m.text.includes(`CMP PRICE ${price}"`));
      expect(result(220)?.replyTo).toBe(2);
      expect(result(600)?.replyTo).toBe(1);
      // the part of an older post above the date line belongs to an earlier day and is left out
      expect(messages.every((m) => !m.text.includes('"40" POINT\nPROFIT 2800'))).toBe(true);
    });

    it(`${theme} theme: the report is the one the channel's own messages give`, async () => {
      const r = await reckon(parseScreenshotText(read(theme), "2025-12-01"), await openMarket(), null);
      expect(r.extraction.calls.map((c) => [c.symbol, c.strike, c.optType, c.targets])).toEqual([
        ["BANKNIFTY", 59400, "PE", [600]],
        ["NIFTY", 26500, "PE", [250]],
      ]);
      expect(Object.values(r.outcomes).map((o) => o.contract)).toEqual(["BANKNIFTY 30-Dec-2025 59400 PE", "NIFTY 02-Dec-2025 26500 PE"]);
      // 580, 600 and "target hit" were posted on a day the contract's high was 542.60
      const disputed = [...r.followThrough.impossible, ...r.followThrough.unsupported];
      expect(disputed.map((d) => d.claimed).sort()).toEqual([580, 600, 600]);
      expect(disputed.every((d) => d.reached === 542.6)).toBe(true);
    });
  }

  it("does not take a date line under the messages as their day", () => {
    const text = 'CMP PRICE 480" "100" POINT\nPROFIT 7000 RS/ 2 LOT\n821 © 14:41\nDecember 2, 2025';
    expect(guessDay(text, "2026-10-02")).toBeUndefined();
    const { messages } = parseScreenshotText(text, "2025-12-01");
    expect(messages).toHaveLength(1);
    expect(at(messages[0].ts)).toBe("2025-12-01 14:41");
  });

  it("moves to the next day at a date line, and reads a date with no year as the latest one not in the future", () => {
    const text = "BUY TCS ABOVE 3000 TGT 3100 SL 2950\n9:20 am\n12 August\nSELL INFY BELOW 1500 TGT 1450 SL 1520\n2:05 pm";
    const { messages } = parseScreenshotText(text, "2026-08-11");
    expect(messages.map((m) => at(m.ts))).toEqual(["2026-08-11 09:20", "2026-08-12 14:05"]);
    expect(guessDay("28 December\nBUY TCS ABOVE 3000\n10:00", "2026-10-02")).toBe("2025-12-28");
  });

  it("keeps a figure that ends a message where there are no view counts", () => {
    const { messages } = parseScreenshotText("BUY NIFTY 24500 CE ABOVE 120 SL 95 TGT\n150 10:09 am ✓✓", "2026-08-11");
    expect(messages[0].text).toBe("BUY NIFTY 24500 CE ABOVE 120 SL 95 TGT\n150");
  });

  it("counts a message once when two screenshots overlap", () => {
    const one = "BUY TCS ABOVE 3000 TGT 3100 SL 2950\n9:20\nBOOK PROFIT IN TCS\n11:45";
    const { messages } = parseScreenshotText(`${one}\n\nBOOK PROFIT IN TCS\n11:45\nSELL INFY BELOW 1500 TGT 1450 SL 1520\n14:05`, "2026-08-11");
    expect(messages.map((m) => m.text)).toEqual(["BUY TCS ABOVE 3000 TGT 3100 SL 2950", "BOOK PROFIT IN TCS", "SELL INFY BELOW 1500 TGT 1450 SL 1520"]);
  });

  it("falls back to blank lines when no time was read", () => {
    const { messages } = parseScreenshotText("BUY TCS CMP 3000\n\nSELL INFY BELOW 1500", "2026-08-11");
    expect(messages.map((m) => m.text)).toEqual(["BUY TCS CMP 3000", "SELL INFY BELOW 1500"]);
    expect(messages.every((m) => toIst(m.ts).date === "2026-08-11")).toBe(true);
  });
});
