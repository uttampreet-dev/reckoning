// What the engine says about a call is recorded as a sentence key and its figures, and read in the reader's language.
import { describe, expect, it } from "vitest";
import { note, noteText, type Note, type NoteKey } from "../src/engine/notes";
import { replay } from "../src/engine/replay";
import type { Call } from "../src/engine/types";
import { en, type Strings } from "../src/lib/strings/en";
import { hi } from "../src/lib/strings/hi";
import { mr } from "../src/lib/strings/mr";
import { gu } from "../src/lib/strings/gu";
import { pa } from "../src/lib/strings/pa";
import { bn } from "../src/lib/strings/bn";
import { ta } from "../src/lib/strings/ta";
import { te } from "../src/lib/strings/te";

const languages: [string, Strings][] = [["en", en], ["hi", hi], ["mr", mr], ["gu", gu], ["pa", pa], ["bn", bn], ["ta", ta], ["te", te]];

// one of every sentence that carries a figure
const withFigures: Note[] = [
  note("levelNotReached", "₹251.5", 3),
  note("priceOutside", "₹420", "₹301.2", "₹388.75"),
  note("tooRecent", 30, "2026-09-01"),
  note("beforeData", "2024-01-01"),
  note("offExchange", "CRUDEOIL", "MCX"),
  note("offCrypto", "BITCOIN"),
  note("offAbroad", "NASDAQ"),
  note("notInCash", "XYZLTD"),
  note("noDerivatives", "XYZLTD"),
  note("noFuture", "RELIANCE"),
  note("stockOptionsFrom", "2025-04-01"),
  note("noOptionExpiry", "RELIANCE"),
  note("optionNotTraded", "BANKNIFTY 57700 CE"),
  note("quotedNotTraded", "₹96.4"),
  note("noPeriodShare", 10),
  note("indexInferred", "SENSEX"),
  note("readAs", "BANKNIFY", "BANKNIFTY"),
];

describe("notes on a call", () => {
  it.each(languages)("every sentence is written in %s and keeps its figures", (_, strings) => {
    const date = (ymd: string) => `<${ymd}>`;
    for (const k of Object.keys(en.notes) as NoteKey[]) {
      const n = withFigures.find((w) => w.k === k) ?? { k, a: [] };
      expect(typeof en.notes[k] === "function", k).toBe(n.a.length > 0);
      const text = noteText(n, strings.notes, date);
      expect(text.length, k).toBeGreaterThan(8);
      for (const figure of n.a) expect(text, k).toContain(typeof figure === "string" && /^\d{4}-/.test(figure) ? date(figure) : String(figure));
    }
  });

  it("the replay records the sentence, and English reads as before", () => {
    const call: Call = {
      id: "1", msgId: 1, ts: "2026-01-05T04:00:00Z", kind: "option", symbol: "NIFTY", strike: 24000, optType: "CE", side: "long",
      entry: { type: "above", lo: 250 }, targets: [300], stop: 200, horizon: "intraday", raw: "", confidence: "high", notes: [],
    };
    const out = replay({ call, bars: [{ d: 5, o: 200, h: 240, l: 190, c: 210, v: 1000 }], day: 5, session: "in-session", lastDay: 20 });
    expect(out.reason).toEqual({ k: "levelNotReached", a: ["₹250", 1] });
    expect(noteText(out.reason!, en.notes, String)).toBe("The entry level ₹250 did not trade within the day of the call.");
    expect(noteText(note("tooRecent", 30, "2026-09-01"), en.notes, () => "1 Sep 2026")).toBe(
      "Too recent to check. Price data for investor education carries a 30-day lag, so prices are available up to 1 Sep 2026.",
    );
  });
});
