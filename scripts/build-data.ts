// Turns the raw bhavcopy archives in data-raw/ (NSE cash, NSE F&O, BSE index F&O) into the compact static files
// the app reads from public/data/.
// Usage: npm run data:build
//
//   public/data/meta.json          trading calendar, coverage, build date
//   public/data/symbols.json       every cash symbol: company name, series, days covered, split/bonus adjustments
//   public/data/cm/<SYMBOL>.rkn    daily [day, open, high, low, close, volume]            (prices in paise)
//   public/data/fo/index.json      every F&O underlying: expiries, lot sizes, what exists
//   public/data/fo/<U>/<EXP>.rkn   options of one expiry [strike, type, day, o, h, l, c, contracts]
//   public/data/fo/<U>/fut.rkn     futures [expiry, day, o, h, l, c, contracts]
//   public/data/fo/<U>/u.rkn       underlying close [day, price]
//
// "day" is always an index into meta.days. Rows with no trades are dropped: a call on an untraded contract
// cannot be verified, and the app says so instead of inventing a price.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { encodeTable } from "../src/data/codec";
import { fileKey } from "../src/data/keys";

const ROOT = path.resolve(import.meta.dirname, "..");
const RAW = path.join(ROOT, "data-raw");
const OUT = path.join(ROOT, "public", "data");

// cash series kept, in order of preference when a symbol is listed in more than one on the same day
const SERIES = ["EQ", "BE", "BZ", "SM", "ST"];
const SME = new Set(["SM", "ST"]);
// stock options are the bulk of the archive; they are kept from this date on (index options and all futures: full range)
const STOCK_OPTIONS_FROM = process.env.STOCK_OPTIONS_FROM ?? "2024-01-01";
const LAG_DAYS = Number(process.env.LAG_DAYS ?? 30);

const paise = (s: string) => Math.round(parseFloat(s) * 100);

// Splits, bonuses, consolidations and demergers are not flagged in the bhavcopy. They show up as an opening price
// far outside the 20% daily band, or as a restated "previous close". The factor is the price ratio across the event,
// snapped to a simple fraction (1:1 bonus = 1/2, 5-for-1 split = 1/5) when it is close to one.
function adjustment(lastClose: number | undefined, prevClose: number, open: number): number {
  if (!lastClose || !prevClose || !open) return 1;
  let factor = 1;
  if (Math.abs(prevClose / lastClose - 1) > 0.01) factor *= prevClose / lastClose;
  if (Math.abs(open / prevClose - 1) > 0.21) factor *= open / prevClose;
  if (factor === 1) return 1;
  // simplest fraction first: 1/2 before 10/19
  let best = factor;
  search: for (let sum = 3; sum <= 21; sum++) {
    for (let a = 1; a < sum; a++) {
      const b = sum - a;
      // the first price after a 1:1 bonus or a split is rarely the exact theoretical one
      if (a !== b && Math.abs(a / b / factor - 1) < (a === 1 ? 0.05 : 0.015)) {
        best = a / b;
        break search;
      }
    }
  }
  return Math.round(best * 1e5) / 1e5;
}

// The "close" column is not always a traded price: for a thinly traded contract it can be a theoretical value,
// and on expiry day BSE writes the index's settlement level there. A close outside the day's own high-low range
// is replaced by the last traded price.
function tradedClose(close: number, last: number, high: number, low: number): number {
  if (close >= low && close <= high) return close;
  return Math.min(Math.max(last, low), high);
}

async function csvOf(file: string) {
  const zip = unzipSync(new Uint8Array(await readFile(file)));
  const name = Object.keys(zip)[0];
  return strFromU8(zip[name]);
}

type Cash = { name: string; series: string; sme: number; d: number[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[]; adj: [number, number][] };

async function main() {
  // SEBI permits market price data for investor education only with a 30-day lag, so newer days are never shipped.
  const cutoff = new Date(Date.now() - LAG_DAYS * 864e5).toISOString().slice(0, 10).replaceAll("-", "");
  const cmFiles = (await readdir(path.join(RAW, "cm"))).filter((f) => f.endsWith(".zip") && f.slice(0, 8) <= cutoff).sort();
  const days = cmFiles.map((f) => `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}`);
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  console.log(`trading days: ${days.length} (${days[0]} to ${days.at(-1)})`);

  // only the price folders are written here; other data files (the SEBI register) stay
  await rm(path.join(OUT, "cm"), { recursive: true, force: true });
  await rm(path.join(OUT, "fo"), { recursive: true, force: true });
  await mkdir(path.join(OUT, "cm"), { recursive: true });
  await mkdir(path.join(OUT, "fo"), { recursive: true });

  // ---------- cash ----------
  const cash = new Map<string, Cash>();
  let cashRows = 0;
  for (let di = 0; di < cmFiles.length; di++) {
    const lines = (await csvOf(path.join(RAW, "cm", cmFiles[di]))).split("\n");
    const best = new Map<string, string[]>();
    for (let i = 1; i < lines.length; i++) {
      const f = lines[i].split(",");
      if (f.length < 30) continue;
      const rank = SERIES.indexOf(f[8]);
      if (rank < 0) continue;
      const prev = best.get(f[7]);
      if (!prev || rank < SERIES.indexOf(prev[8])) best.set(f[7], f);
    }
    for (const [sym, f] of best) {
      const vol = parseInt(f[24]) || 0;
      if (!vol) continue;
      let s = cash.get(sym);
      if (!s) cash.set(sym, (s = { name: f[13], series: f[8], sme: 0, d: [], o: [], h: [], l: [], c: [], v: [], adj: [] }));
      const factor = adjustment(s.c.at(-1), paise(f[19]), paise(f[14]));
      if (factor !== 1) s.adj.push([di, factor]);
      s.name = f[13];
      s.series = f[8];
      if (SME.has(f[8])) s.sme++;
      s.d.push(di);
      s.o.push(paise(f[14]));
      s.h.push(paise(f[15]));
      s.l.push(paise(f[16]));
      s.c.push(paise(f[17]));
      s.v.push(vol);
      cashRows++;
    }
  }
  const symbols: Record<string, { n: string; r: string; a: number; z: number; m?: 1; x?: [number, number][] }> = {};
  const seenKeys = new Map<string, string>();
  let cashBytes = 0;
  for (const [sym, s] of cash) {
    const key = fileKey(sym);
    if (seenKeys.has(key)) throw new Error(`file key collision: ${sym} vs ${seenKeys.get(key)}`);
    seenKeys.set(key, sym);
    const bytes = encodeTable([s.d, s.o, s.h, s.l, s.c, s.v]);
    cashBytes += bytes.length;
    await writeFile(path.join(OUT, "cm", `${key}.rkn`), bytes);
    symbols[sym] = { n: s.name, r: s.series, a: s.d[0], z: s.d.at(-1)!, ...(s.sme ? { m: 1 } : {}), ...(s.adj.length ? { x: s.adj } : {}) };
  }
  await writeFile(path.join(OUT, "symbols.json"), JSON.stringify(symbols));
  console.log(`cash: ${cash.size} symbols, ${cashRows} rows, ${(cashBytes / 1e6).toFixed(1)} MB`);
  cash.clear();

  // ---------- F&O ----------
  type Opt = number[][]; // strike, type, day, o, h, l, c, v
  const opts = new Map<string, Opt>(); // "SYM|YYYY-MM-DD"
  const futs = new Map<string, number[][]>(); // SYM -> expiry, day, o, h, l, c, v
  const under = new Map<string, Map<number, number>>(); // SYM -> day -> price
  const info = new Map<string, { k: "I" | "S"; x: Map<string, { lot: number; o: 0 | 1; f: 0 | 1 }> }>();
  const stockFromDay = days.findIndex((d) => d >= STOCK_OPTIONS_FROM);
  let optRows = 0,
    futRows = 0;

  // one day of one exchange's F&O file; BSE is read for its index contracts only (its stock options duplicate NSE's)
  const ingest = (lines: string[], day: number, indexOnly: boolean) => {
    for (let i = 1; i < lines.length; i++) {
      const f = lines[i].split(",");
      if (f.length < 30) continue;
      const type = f[4],
        sym = f[7],
        expiry = f[9];
      const isOpt = type === "IDO" || type === "STO";
      const isFut = type === "IDF" || type === "STF";
      if (!isOpt && !isFut) continue;
      if (indexOnly && type[0] !== "I") continue;

      if (f[20]) {
        let u = under.get(sym);
        if (!u) under.set(sym, (u = new Map()));
        if (!u.has(day)) u.set(day, paise(f[20]));
      }
      const vol = parseInt(f[24]) || 0;
      if (!vol) continue;
      if (type === "STO" && day < stockFromDay) continue;

      let meta = info.get(sym);
      if (!meta) info.set(sym, (meta = { k: type[0] === "I" ? "I" : "S", x: new Map() }));
      let ex = meta.x.get(expiry);
      if (!ex) meta.x.set(expiry, (ex = { lot: 0, o: 0, f: 0 }));
      ex.lot = parseInt(f[28]) || ex.lot;

      const o = paise(f[14]),
        h = paise(f[15]),
        l = paise(f[16]),
        c = tradedClose(paise(f[17]), paise(f[18]), h, l);
      if (isOpt) {
        ex.o = 1;
        const key = `${sym}|${expiry}`;
        let t = opts.get(key);
        if (!t) opts.set(key, (t = [[], [], [], [], [], [], [], []]));
        t[0].push(paise(f[11]));
        t[1].push(f[12] === "PE" ? 1 : 0);
        t[2].push(day);
        t[3].push(o);
        t[4].push(h);
        t[5].push(l);
        t[6].push(c);
        t[7].push(vol);
        optRows++;
      } else {
        ex.f = 1;
        let t = futs.get(sym);
        if (!t) futs.set(sym, (t = [[], [], [], [], [], [], []]));
        t[0].push(parseInt(expiry.replaceAll("-", "")));
        t[1].push(day);
        t[2].push(o);
        t[3].push(h);
        t[4].push(l);
        t[5].push(c);
        t[6].push(vol);
        futRows++;
      }
    }
  };

  const dayOf = (file: string) => dayIndex.get(`${file.slice(0, 4)}-${file.slice(4, 6)}-${file.slice(6, 8)}`);
  for (const file of (await readdir(path.join(RAW, "fo"))).filter((f) => f.endsWith(".zip")).sort()) {
    const day = dayOf(file);
    if (day !== undefined) ingest((await csvOf(path.join(RAW, "fo", file))).split("\n"), day, false);
  }
  const bse = await readdir(path.join(RAW, "bfo")).catch(() => [] as string[]);
  for (const file of bse.filter((f) => f.endsWith(".csv")).sort()) {
    const day = dayOf(file);
    if (day !== undefined) ingest((await readFile(path.join(RAW, "bfo", file), "utf8")).split(/\r?\n/), day, true);
  }
  console.log(`BSE days read: ${bse.length}`);

  // sort each table so that neighbouring rows are similar (that is what makes the deltas small)
  const sorted = (t: number[][], keys: number[]) => {
    const order = Array.from(t[0].keys()).sort((a, b) => {
      for (const k of keys) if (t[k][a] !== t[k][b]) return t[k][a] - t[k][b];
      return 0;
    });
    return t.map((col) => order.map((i) => col[i]));
  };

  let optBytes = 0,
    futBytes = 0,
    biggest = { key: "", bytes: 0 };
  const dirs = new Set<string>();
  const dirOf = async (sym: string) => {
    const dir = path.join(OUT, "fo", fileKey(sym));
    if (!dirs.has(dir)) {
      await mkdir(dir, { recursive: true });
      dirs.add(dir);
    }
    return dir;
  };
  for (const [key, t] of opts) {
    const [sym, expiry] = key.split("|");
    const bytes = encodeTable(sorted(t, [0, 1, 2]));
    optBytes += bytes.length;
    if (bytes.length > biggest.bytes) biggest = { key, bytes: bytes.length };
    await writeFile(path.join(await dirOf(sym), `${expiry.replaceAll("-", "")}.rkn`), bytes);
  }
  for (const [sym, t] of futs) {
    const bytes = encodeTable(sorted(t, [0, 1]));
    futBytes += bytes.length;
    await writeFile(path.join(await dirOf(sym), "fut.rkn"), bytes);
  }
  let underBytes = 0;
  for (const [sym, u] of under) {
    if (!info.has(sym)) continue;
    const ds = [...u.keys()].sort((a, b) => a - b);
    const bytes = encodeTable([ds, ds.map((d) => u.get(d)!)]);
    underBytes += bytes.length;
    await writeFile(path.join(await dirOf(sym), "u.rkn"), bytes);
  }
  const foIndex: Record<string, { k: "I" | "S"; x: [string, number, 0 | 1, 0 | 1][] }> = {};
  for (const [sym, meta] of [...info].sort((a, b) => a[0].localeCompare(b[0]))) {
    foIndex[sym] = { k: meta.k, x: [...meta.x].sort((a, b) => a[0].localeCompare(b[0])).map(([e, v]) => [e, v.lot, v.o, v.f]) };
  }
  await writeFile(path.join(OUT, "fo", "index.json"), JSON.stringify(foIndex));

  console.log(`options: ${opts.size} expiry files, ${optRows} rows, ${(optBytes / 1e6).toFixed(1)} MB (largest ${biggest.key} ${(biggest.bytes / 1e3).toFixed(0)} KB)`);
  console.log(`futures: ${futs.size} underlyings, ${futRows} rows, ${(futBytes / 1e6).toFixed(1)} MB; underlying closes ${(underBytes / 1e6).toFixed(1)} MB`);

  await writeFile(
    path.join(OUT, "meta.json"),
    JSON.stringify({
      source: "NSE daily bhavcopy (cash and F&O) and BSE derivatives bhavcopy (SENSEX, BANKEX)",
      built: new Date().toISOString().slice(0, 10),
      from: days[0],
      to: days.at(-1),
      lagDays: LAG_DAYS,
      stockOptionsFrom: days[Math.max(0, stockFromDay)],
      days,
    }),
  );
}

main();
