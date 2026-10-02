// Maps the names people type in tip messages to exchange tickers.
// Built from the exchange's own symbol and company-name list plus a small table of nicknames.
import type { SymbolInfo, Underlying } from "../data/market";
import { INDEX_ALIASES, OFF_EXCHANGE, STOCK_ALIASES, SUCCESSORS, WORD_TICKERS } from "./aliases";

export interface Resolved {
  symbol: string;
  kind: "index" | "stock";
  /** how the name was matched: its ticker, a nickname, or the company name */
  via: "ticker" | "alias" | "name";
  /** number of words of the message that formed the name */
  words: number;
}

const NAME_NOISE = new Set([
  "LTD", "LIMITED", "LTD.", "INDIA", "INDIAN", "INDUSTRIES", "INDUSTRY", "IND", "INDS", "CORPORATION", "CORP", "COMPANY", "CO",
  "OF", "THE", "AND", "&", "PVT", "PRIVATE", "ENTERPRISES", "ENTERPRISE", "HOLDINGS", "GROUP",
]);
/** exchange-traded funds are listed under the fund house's name, which is not what a tip means by that name */
const FUND = /\bAMC\b|\bETF\b|BEES\b|\bMF\b|MUTUAL\s+FUND| - /;

const squash = (s: string) => s.toUpperCase().replace(/[^A-Z0-9&]/g, "");

type Hit = { symbol: string; via: Resolved["via"] };

export class Dictionary {
  private byKey = new Map<string, Hit[]>();
  /** company-name keys long enough to tolerate a spelling slip */
  private longKeys: string[] = [];

  constructor(
    private symbols: Record<string, SymbolInfo>,
    private fo: Record<string, Underlying>,
  ) {
    const add = (key: string, symbol: string, via: Resolved["via"]) => {
      if (key.length < 2) return;
      const list = this.byKey.get(key) ?? [];
      if (!list.some((x) => x.symbol === symbol)) list.push({ symbol, via });
      this.byKey.set(key, list);
    };
    for (const sym of Object.keys(symbols)) add(squash(sym), sym, "ticker");
    for (const sym of Object.keys(fo)) add(squash(sym), sym, "ticker");
    for (const [alias, sym] of Object.entries(STOCK_ALIASES)) if (symbols[sym]) add(squash(alias), sym, "alias");

    // company names: "TATA STEEL LIMITED" -> TATASTEEL, and a distinctive first word on its own
    const names = new Map<string, string[]>();
    const firstWords = new Map<string, string[]>();
    const push = (m: Map<string, string[]>, k: string, sym: string) => m.set(k, [...(m.get(k) ?? []), sym]);
    for (const [sym, info] of Object.entries(symbols)) {
      if (FUND.test(info.n.toUpperCase())) continue;
      const words = info.n
        .toUpperCase()
        .replace(/\(.*?\)/g, " ")
        .split(/[^A-Z0-9&]+/)
        .filter((w) => w && !NAME_NOISE.has(w));
      if (!words.length) continue;
      push(names, words.join(""), sym);
      if (words.length > 2) push(names, words.slice(0, 2).join(""), sym);
      if (words[0].length >= 5) push(firstWords, words[0], sym);
    }
    // a name key counts only when it points at one company (a renamed ticker and its successor count as one)
    const oneCompany = (syms: string[]) => syms.length === 1 || new Set(syms.map((s) => symbols[s].n)).size === 1 || syms.filter((s) => fo[s]).length === 1;
    for (const [key, syms] of names) {
      if (this.byKey.has(key) || !oneCompany(syms)) continue;
      for (const sym of syms.length > 1 && syms.some((s) => fo[s]) ? syms.filter((s) => fo[s]) : syms) add(key, sym, "name");
      if (key.length >= 8) this.longKeys.push(key);
    }
    for (const [word, syms] of firstWords) if (syms.length === 1 && !this.byKey.has(word)) add(word, syms[0], "name");
    for (const sym of Object.keys(symbols)) if (sym.length >= 8) this.longKeys.push(squash(sym));
  }

  /** Is this single word a known index (or commodity, or foreign) name? */
  index(word: string): string | undefined {
    return INDEX_ALIASES[squash(word)];
  }

  /**
   * Resolve the instrument named by up to three consecutive words. `day` picks between tickers that share a name
   * across a rename. `strict` refuses tickers that are also ordinary words (IDEA, STAR, PREMIUM).
   */
  resolve(words: string[], day: number, strict = false): Resolved | null {
    for (let n = Math.min(3, words.length); n >= 1; n--) {
      const key = squash(words.slice(0, n).join(""));
      if (!key) continue;
      const idx = INDEX_ALIASES[key];
      // commodity and foreign names double as ordinary words ("gold"), so they need an instrument position
      if (idx && !(strict && OFF_EXCHANGE[idx] && !this.fo[idx])) return { symbol: idx, kind: "index", via: idx === key ? "ticker" : "alias", words: n };
      const hits = this.byKey.get(key);
      if (!hits) continue;
      if (strict && n === 1 && (WORD_TICKERS.has(key) || key.length <= 2)) continue;
      const pick = this.alive(hits, day);
      if (!pick) continue;
      if (strict && pick.via === "name" && n === 1) continue;
      return { symbol: pick.symbol, kind: this.fo[pick.symbol]?.kind === "index" ? "index" : "stock", via: pick.via, words: n };
    }
    return null;
  }

  /** A long name with a spelling slip: "RAMCO SYSTEM" for RAMCOSYSTEMS, "HAPPIESTMIND" for HAPPIESTMINDS. */
  near(words: string[]): Resolved | null {
    for (let n = Math.min(3, words.length); n >= 1; n--) {
      const key = squash(words.slice(0, n).join(""));
      if (key.length < 8) continue;
      const limit = key.length >= 12 ? 2 : 1;
      let close = this.longKeys.filter((k) => Math.abs(k.length - key.length) <= limit && distance(k, key) <= limit);
      // or a clipped name: "MANALIPETRO" for MANALIPETROCHEMICALS
      if (!close.length) close = this.longKeys.filter((k) => k.startsWith(key));
      const symbols = new Set(close.flatMap((k) => (this.byKey.get(k) ?? []).map((h) => h.symbol)));
      if (symbols.size === 1) {
        const symbol = [...symbols][0];
        return { symbol, kind: "stock", via: "name", words: n };
      }
    }
    return null;
  }

  /** The single F&O underlying whose ticker is one edit away from `word` ("KYNES" -> KAYNES), or null. */
  nearUnderlying(word: string): Resolved | null {
    const w = squash(word);
    if (w.length < 5) return null;
    const limit = w.length >= 9 ? 2 : 1;
    const close = (a: string) => Object.keys(this.fo).filter((sym) => Math.abs(sym.length - a.length) <= limit && distance(squash(sym), a) <= limit);
    let near = close(w);
    // "TVSMOTORS" for TVSMOTOR
    if (!near.length && w.endsWith("S")) near = close(w.slice(0, -1));
    return near.length === 1 ? { symbol: near[0], kind: this.fo[near[0]].kind, via: "name", words: 1 } : null;
  }

  private alive(hits: Hit[], day: number): Hit {
    const active = (sym: string) => {
      const info = this.symbols[sym];
      return info ? day >= info.a - 10 && day <= info.z + 10 : !!this.fo[sym];
    };
    const live = hits.filter((h) => active(h.symbol));
    if (live.length) return live.sort((a, b) => rank(a.via) - rank(b.via))[0];
    for (const h of hits) {
      const next = SUCCESSORS[h.symbol];
      if (next && active(next)) return { symbol: next, via: "alias" };
    }
    // not trading on that date: still return it so the ledger can say so
    return hits[0];
  }
}

const rank = (via: Resolved["via"]) => (via === "ticker" ? 0 : via === "alias" ? 1 : 2);

/** edit distance with adjacent swaps counted once */
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}
