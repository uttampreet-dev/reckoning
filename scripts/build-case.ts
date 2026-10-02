// Measures the pattern checks on a known case: the stock recommendations listed in Annexure A of SEBI's ex-parte
// interim order WTM/KV/ISD/ISD-SEC-7/32413/2026-27 of 22 May 2026. For each recommendation the price files cover,
// the same shape measurements the report uses are taken on the day the order treats as the first trading day after
// the post, and again on ordinary days in the same stocks, so the two rates can be set side by side.
// Usage: npm run case   (needs data-raw/sebi/order_32413_annexure_a.json, parsed from the order's PDF)
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { openMarket } from "../src/data/node-loader";
import { shapeAround, THRESHOLDS as T } from "../src/engine/detect";
import { inCallTerms } from "../src/engine/resolve";
import { lowerBound } from "../src/engine/time";

const ROOT = path.resolve(import.meta.dirname, "..");
interface Row { page: number; recoDate: string; scrip: string; recoTime: string; effDateT: string }

const plain = (s: string) =>
  s
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/\b(LIMITED|LTD|CO|COMPANY|INDIA|THE)\b|\(INDIA\)/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

async function main() {
  const market = await openMarket();
  const days = market.days;
  const src = JSON.parse(await readFile(path.join(ROOT, "data-raw", "sebi", "order_32413_annexure_a.json"), "utf8"));
  const rows: Row[] = src.rows;

  // company name -> NSE symbol, by the name the exchange file carries
  const byName = new Map<string, string>();
  for (const [sym, info] of Object.entries(market.symbols)) byName.set(plain(info.n), sym);
  // names the exchange abbreviates beyond what the matching below can follow; each was checked by hand
  const KNOWN: Record<string, string> = {
    "IL&FS Engineering & Construction Co Ltd": "IL&FSENGG",
    "Sterling & Wilson Renewable Energy Ltd": "SWSOLAR",
    "Akanksha Power & Infrastructure Ltd": "AKANKSHA",
    "Tourism Finance Corporation of India Ltd": "TFCILTD",
    "DB Corp Ltd": "DBCORP",
    "Rudra Global Infra Products Ltd": "RUDRA",
    "Naman In-Store (India) Ltd": "NAMAN",
    "KP Energy Ltd": "KPEL",
    "Suryoday Small Finance Bank Ltd": "SURYODAY",
    "RPP Infra Projects Ltd": "RPPINFRA",
    "Agarwal Toughened Glass India Ltd": "AGARWALTUF",
    "Ansal Housing Ltd": "ANSALHSG",
  };
  const symbolOf = (scrip: string) => {
    const known = KNOWN[scrip];
    if (known) return market.symbols[known] ? known : undefined;
    return byName.get(plain(scrip)) ?? [...byName].find(([n]) => n.startsWith(plain(scrip)) || plain(scrip).startsWith(n))?.[1];
  };

  // one recommendation = one scrip at one date and time, however many noticees traded on it
  const recos = new Map<string, Row>();
  for (const r of rows) recos.set(`${r.scrip}|${r.recoDate}|${r.recoTime}`, r);
  const scrips = [...new Set(rows.map((r) => r.scrip))];
  const mapped = new Map(scrips.map((s) => [s, symbolOf(s)] as const));

  const fires = (s: NonNullable<ReturnType<typeof shapeAround>>) => ({
    spike: s.postGain >= T.spikeGain && s.postVolume >= T.spikeVolume,
    pump: s.postGain >= T.spikeGain && s.postVolume >= T.spikeVolume && s.fall >= T.dumpFall,
    preRun: s.preGain >= T.preRunGain && s.preVolume >= T.preRunVolume,
    thin: s.turnover > 0 && s.turnover < T.thinTurnover,
  });
  type Tally = { n: number; spike: number; pump: number; preRun: number; thin: number; sme: number };
  const blank = (): Tally => ({ n: 0, spike: 0, pump: 0, preRun: 0, thin: 0, sme: 0 });
  const reco = blank(), base = blank();
  const table: unknown[] = [];
  const recoDays = new Map<string, number[]>();
  let outside = 0;

  for (const r of [...recos.values()].sort((a, b) => a.effDateT.localeCompare(b.effDateT))) {
    const sym = mapped.get(r.scrip);
    const info = sym ? market.symbols[sym] : undefined;
    const raw = sym ? await market.cash(sym) : null;
    const day = lowerBound(days, r.effDateT);
    if (!sym || !info || !raw || r.effDateT < days[0] || day >= days.length) { outside++; continue; }
    const shape = shapeAround(inCallTerms(raw, info.x, day).bars, day);
    if (!shape) { outside++; continue; }
    const f = fires(shape);
    const sme = !!info.m || info.r === "SM" || info.r === "ST";
    reco.n++; if (f.spike) reco.spike++; if (f.pump) reco.pump++; if (f.preRun) reco.preRun++; if (f.thin) reco.thin++; if (sme) reco.sme++;
    recoDays.set(sym, [...(recoDays.get(sym) ?? []), day]);
    table.push({ scrip: r.scrip, symbol: sym, sme, posted: r.recoDate, time: r.recoTime, day: days[day], page: r.page, postGain: +shape.postGain.toFixed(4), postVolume: +shape.postVolume.toFixed(2), fall: +shape.fall.toFixed(4), fallDays: shape.fallDays, preGain: +shape.preGain.toFixed(4), ...f });
  }

  // ordinary days in the same stocks: every fifth trading day at least fifteen days from any recommendation in it
  for (const [sym, marked] of recoDays) {
    const info = market.symbols[sym];
    const raw = (await market.cash(sym))!;
    for (let k = 30; k < raw.length - 12; k += 5) {
      const day = raw[k].d;
      if (marked.some((m) => Math.abs(m - day) < 15)) continue;
      const shape = shapeAround(inCallTerms(raw, info.x, day).bars, day);
      if (!shape) continue;
      const f = fires(shape);
      base.n++; if (f.spike) base.spike++; if (f.pump) base.pump++; if (f.preRun) base.preRun++; if (f.thin) base.thin++;
    }
  }

  // price around the recommendations for the three stocks with the most of them
  const top = [...recoDays].sort((a, b) => b[1].length - a[1].length).slice(0, 3);
  const charts = [];
  for (const [sym, marked] of top) {
    const info = market.symbols[sym];
    const raw = (await market.cash(sym))!;
    const lo = Math.min(...marked) - 25, hi = Math.max(...marked) + 30;
    const bars = inCallTerms(raw, info.x, marked[0]).bars.filter((b) => b.d >= lo && b.d <= hi);
    charts.push({ symbol: sym, name: info.n, sme: !!info.m || info.r === "SM" || info.r === "ST", from: days[bars[0].d], to: days[bars.at(-1)!.d], close: bars.map((b) => +b.c.toFixed(2)), volume: bars.map((b) => b.v), marks: [...new Set(marked)].map((d) => bars.findIndex((b) => b.d >= d)).filter((i) => i >= 0) });
  }

  const out = {
    order: { ref: "WTM/KV/ISD/ISD-SEC-7/32413/2026-27", date: "2026-05-22", kind: "ex-parte interim order", pdf: src.pdf, annexurePages: "198–234", statedTotalINR: src.statedTotalINR },
    coverage: { rows: rows.length, recommendations: recos.size, scrips: scrips.length, scripsInData: [...mapped.values()].filter(Boolean).length, measured: reco.n, notMeasured: outside, stocksMeasured: recoDays.size, dataFrom: days[0] },
    thresholds: T,
    onRecommendations: reco,
    onOrdinaryDays: base,
    charts,
    table,
  };
  await writeFile(path.join(ROOT, "src", "samples", "case.json"), JSON.stringify(out));
  const pc = (a: number, n: number) => `${a}/${n} = ${n ? ((a / n) * 100).toFixed(1) : "0"}%`;
  console.log(`scrips: ${scrips.length}, found in NSE data: ${out.coverage.scripsInData}; not found: ${scrips.filter((s) => !mapped.get(s)).join(", ")}`);
  console.log(`recommendations: ${recos.size}; measured ${reco.n}; outside the data ${outside}`);
  for (const k of ["spike", "pump", "preRun", "thin"] as const) console.log(`${k.padEnd(7)} on recommendations ${pc(reco[k], reco.n)}   on ordinary days ${pc(base[k], base.n)}`);
  console.log(`SME-platform: ${pc(reco.sme, reco.n)} of measured recommendations`);
  console.log("charts:", charts.map((c) => `${c.symbol} ${c.from}..${c.to} marks ${c.marks.length}`).join("; "));
}
main();
