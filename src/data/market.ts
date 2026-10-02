// Read access to the compact price files. The same code runs in the browser (fetch) and in Node (fs):
// the caller supplies `load`, which returns the bytes of one file under public/data/ or null if it is absent.
import { decodeTable } from "./codec";
import { fileKey } from "./keys";
import type { Bar } from "../engine/types";

export interface Meta {
  source: string;
  built: string;
  from: string;
  to: string;
  /** newest price day is kept this many calendar days behind the build date */
  lagDays: number;
  stockOptionsFrom: string;
  days: string[];
}

export interface SymbolInfo {
  /** company name as the exchange prints it */
  n: string;
  /** series on the last day it traded: EQ, BE, BZ, SM, ST */
  r: string;
  /** first and last day index with trades */
  a: number;
  z: number;
  /** traded on the SME board at some point */
  m?: 1;
  /** splits, bonuses and rights: [day index it took effect, price factor], e.g. 0.5 for a 1:1 bonus */
  x?: [number, number][];
}

export interface Expiry {
  date: string;
  lot: number;
  hasOptions: boolean;
  hasFutures: boolean;
}

export interface Underlying {
  kind: "index" | "stock";
  expiries: Expiry[];
}

export type Loader = (path: string) => Promise<Uint8Array | null>;

const rupees = (paise: number) => paise / 100;

export class Market {
  private cache = new Map<string, Promise<unknown>>();
  private constructor(
    private load: Loader,
    readonly meta: Meta,
    readonly symbols: Record<string, SymbolInfo>,
    readonly fo: Record<string, Underlying>,
  ) {}

  static async open(load: Loader): Promise<Market> {
    const json = async (p: string) => {
      const bytes = await load(p);
      if (!bytes) throw new Error(`missing data file ${p}`);
      return JSON.parse(new TextDecoder().decode(bytes));
    };
    const [meta, symbols, foRaw] = await Promise.all([json("meta.json"), json("symbols.json"), json("fo/index.json")]);
    const fo: Record<string, Underlying> = {};
    for (const [sym, v] of Object.entries(foRaw as Record<string, { k: string; x: [string, number, number, number][] }>)) {
      fo[sym] = {
        kind: v.k === "I" ? "index" : "stock",
        expiries: v.x.map(([date, lot, o, f]) => ({ date, lot, hasOptions: !!o, hasFutures: !!f })),
      };
    }
    return new Market(load, meta, symbols, fo);
  }

  get days() {
    return this.meta.days;
  }

  private once<T>(key: string, make: () => Promise<T>): Promise<T> {
    let p = this.cache.get(key) as Promise<T> | undefined;
    if (!p) this.cache.set(key, (p = make()));
    return p;
  }

  /** daily bars of a stock in the cash market, oldest first */
  cash(symbol: string): Promise<Bar[] | null> {
    return this.once(`cm/${symbol}`, async () => {
      if (!this.symbols[symbol]) return null;
      const bytes = await this.load(`cm/${fileKey(symbol)}.rkn`);
      if (!bytes) return null;
      const [d, o, h, l, c, v] = decodeTable(bytes);
      return d.map((day, i) => ({ d: day, o: rupees(o[i]), h: rupees(h[i]), l: rupees(l[i]), c: rupees(c[i]), v: v[i] }));
    });
  }

  /** all traded option contracts of one expiry, keyed "24500CE" */
  options(underlying: string, expiry: string): Promise<Map<string, Bar[]> | null> {
    return this.once(`fo/${underlying}/${expiry}`, async () => {
      const bytes = await this.load(`fo/${fileKey(underlying)}/${expiry.replaceAll("-", "")}.rkn`);
      if (!bytes) return null;
      const [strike, type, d, o, h, l, c, v] = decodeTable(bytes);
      const out = new Map<string, Bar[]>();
      for (let i = 0; i < d.length; i++) {
        const key = optionKey(rupees(strike[i]), type[i] ? "PE" : "CE");
        let bars = out.get(key);
        if (!bars) out.set(key, (bars = []));
        bars.push({ d: d[i], o: rupees(o[i]), h: rupees(h[i]), l: rupees(l[i]), c: rupees(c[i]), v: v[i] });
      }
      return out;
    });
  }

  /** futures of an underlying, keyed by expiry date */
  futures(underlying: string): Promise<Map<string, Bar[]> | null> {
    return this.once(`fo/${underlying}/fut`, async () => {
      const bytes = await this.load(`fo/${fileKey(underlying)}/fut.rkn`);
      if (!bytes) return null;
      const [exp, d, o, h, l, c, v] = decodeTable(bytes);
      const out = new Map<string, Bar[]>();
      for (let i = 0; i < d.length; i++) {
        const e = String(exp[i]);
        const key = `${e.slice(0, 4)}-${e.slice(4, 6)}-${e.slice(6, 8)}`;
        let bars = out.get(key);
        if (!bars) out.set(key, (bars = []));
        bars.push({ d: d[i], o: rupees(o[i]), h: rupees(h[i]), l: rupees(l[i]), c: rupees(c[i]), v: v[i] });
      }
      return out;
    });
  }

  /** closing value of the underlying (index level or stock price) by day index */
  spot(underlying: string): Promise<Map<number, number> | null> {
    return this.once(`fo/${underlying}/u`, async () => {
      const bytes = await this.load(`fo/${fileKey(underlying)}/u.rkn`);
      if (!bytes) return null;
      const [d, p] = decodeTable(bytes);
      return new Map(d.map((day, i) => [day, rupees(p[i])]));
    });
  }
}

export const optionKey = (strike: number, type: "CE" | "PE") => `${+strike.toFixed(2)}${type}`;
