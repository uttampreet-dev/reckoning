"use client";
// The pattern checks measured on a case SEBI has examined: the recommendations in Annexure A of its interim order
// of 22 May 2026, set against ordinary days in the same stocks. Figures come from scripts/build-case.ts.
import gsap from "gsap";
import { useState } from "react";
import data from "@/samples/case.json";
import { percent, rupees, shortDate } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import { EASE, Step, useScene, useWidth } from "./landing/kit";

type Key = "spike" | "pump" | "preRun" | "thin";
const KEYS: Key[] = ["spike", "pump", "preRun", "thin"];
const on = data.onRecommendations;
const off = data.onOrdinaryDays;
const SHOWN = 24;

export function CaseFile() {
  const { t, lang } = useLang();
  const C = t.caseFile;
  const [all, setAll] = useState(false);
  const rows = all ? data.table : data.table.slice(0, SHOWN);

  const scene = useScene<HTMLDivElement>((root) => {
    gsap.from(root.querySelectorAll("[data-bar]"), { scaleX: 0, transformOrigin: "0% 50%", duration: 1, ease: EASE, stagger: 0.07, scrollTrigger: { trigger: root, start: "top 80%" } });
  });

  return (
    <div className="mx-auto max-w-[1440px] px-5 pb-24 pt-10 font-body sm:px-10 lg:px-[72px] lg:pt-14">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div>
          <div className="tag">{C.tag}</div>
          <h1 className={`display mt-4 ${lang === "hi" ? "text-[2.2rem] leading-[1.28] sm:text-[3.1rem]" : "text-[2.6rem] font-bold leading-[1] sm:text-[3.7rem] lg:text-[4.2rem]"}`}>{C.title}</h1>
        </div>
        <div className="lg:pt-10">
          <p className="text-[18px] leading-relaxed text-type/85">{C.lead(shortDate(data.order.date, lang, true))}</p>
          <p className="mt-4 border-l-2 border-ochre pl-4 text-[15px] leading-relaxed text-type/80">{C.caution}</p>
        </div>
      </div>

      {/* the order, in the figures it states itself */}
      <dl className="mt-12 grid grid-cols-[minmax(0,1fr)] border-y-2 border-type sm:grid-cols-2 lg:grid-cols-4">
        {[
          [C.orderRef, data.order.ref, "text-[13px] sm:text-[14px] break-all"],
          [C.impounded, rupees(data.order.statedTotalINR), "text-[1.5rem]"],
          [C.recos, String(data.coverage.recommendations), "text-[1.5rem]"],
          [C.measured, String(data.coverage.measured), "text-[1.5rem] text-red"],
        ].map(([label, value, cls], i) => (
          <div key={label} className={`border-hair py-4 ${i ? "border-t sm:border-t-0 lg:border-l lg:pl-6" : ""} ${i === 1 ? "sm:border-l sm:pl-6" : ""} ${i === 2 ? "sm:border-t lg:border-t-0" : ""} ${i === 3 ? "sm:border-l sm:border-t sm:pl-6 lg:border-t-0" : ""}`}>
            <dt>
              <Step>{label}</Step>
            </dt>
            <dd className={`tnum mt-1.5 font-mono font-semibold leading-tight ${cls}`}>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-type/80">{C.coverage(data.coverage.measured, data.coverage.recommendations, data.coverage.stocksMeasured, shortDate(data.coverage.dataFrom, lang, true))}</p>

      {/* ---------------- the rates ---------------- */}
      <section ref={scene} className="mt-16">
        <h2 className="display text-[2.1rem] font-bold leading-tight sm:text-[2.5rem]">{C.ratesTitle}</h2>
        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 font-mono text-[11.5px]">
          <span className="flex items-center gap-2">
            <span className="size-3 bg-red" /> {C.onRecos} ({on.n})
          </span>
          <span className="flex items-center gap-2">
            <span className="size-3 bg-faint" /> {C.onOrdinary} ({off.n.toLocaleString("en-IN")})
          </span>
        </div>
        <div className="mt-6 border-t-[1.5px] border-type">
          {KEYS.map((k) => {
            const a = on[k] / on.n;
            const b = off[k] / off.n;
            const more = a > b * 1.5;
            return (
              <div key={k} data-rate={k} className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-3 border-b border-hair py-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_minmax(0,13rem)] lg:items-center">
                <div>
                  <div className="text-[19px] font-semibold leading-snug">{C.patterns[k][0]}</div>
                  <div className="mt-1 text-[14px] leading-snug text-type/75">{C.patterns[k][1]}</div>
                </div>
                <div className="space-y-2">
                  {(
                    [
                      [a, on[k], on.n, more ? "bg-red" : "bg-type"],
                      [b, off[k], off.n, "bg-faint"],
                    ] as const
                  ).map(([share, n, of, tone], i) => (
                    <div key={i} className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-3">
                      <div className="h-5 bg-hair/60">
                        <div data-bar className={`h-full ${tone}`} style={{ width: `${Math.max(share * 100 * 2.5, 0.6)}%` }} />
                      </div>
                      <div className="tnum whitespace-nowrap font-mono text-[13px]">
                        <b className="text-[15px]">{percent(share)}</b> <span className="text-soft">{n.toLocaleString("en-IN")} / {of.toLocaleString("en-IN")}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className={`text-[15px] leading-snug ${more ? "font-semibold text-red" : "text-type/75"}`}>{more ? C.times((a / b).toFixed(1)) : C.notMore}</div>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-[15px] leading-relaxed text-type/80">{C.smeLine(on.sme, on.n)}</p>
      </section>

      {/* ---------------- three stocks ---------------- */}
      <section className="mt-16">
        <h2 className="display text-[2.1rem] font-bold leading-tight sm:text-[2.5rem]">{C.chartsTitle}</h2>
        <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-type/80">{C.chartsLead}</p>
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-3">
          {data.charts.map((c) => (
            <StockChart key={c.symbol} c={c} sub={`${shortDate(c.from, lang, true)} – ${shortDate(c.to, lang, true)} · ${C.recoCount(c.marks.length)}`} />
          ))}
        </div>
      </section>

      {/* ---------------- every recommendation ---------------- */}
      <section className="mt-16">
        <h2 className="display text-[2.1rem] font-bold leading-tight sm:text-[2.5rem]">{C.tableTitle}</h2>
        <div className="mt-6 overflow-x-auto border-[1.5px] border-type bg-sheet">
          <table className="w-full min-w-[40rem] border-collapse text-left font-mono text-[12px]">
            <thead>
              <tr className="eyebrow border-b-[1.5px] border-type text-[10px] font-semibold uppercase tracking-[0.14em] text-soft">
                <th className="px-4 py-2.5 font-semibold">{C.cols.day}</th>
                <th className="px-2 py-2.5 font-semibold">{C.cols.stock}</th>
                <th className="px-2 py-2.5 text-right font-semibold">{C.cols.up}</th>
                <th className="px-2 py-2.5 text-right font-semibold">{C.cols.volume}</th>
                <th className="px-2 py-2.5 text-right font-semibold">{C.cols.fall}</th>
                <th className="px-4 py-2.5 font-semibold">{C.cols.marks}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-hair last:border-0">
                  <td className="whitespace-nowrap px-4 py-2 text-soft">{shortDate(r.day, lang, true)}</td>
                  <td className="px-2 py-2 font-medium" lang="en">
                    {r.scrip.replace(/ Ltd$/, "")}
                    {r.sme && <span className="ml-2 border border-ochre px-1 py-px text-[9px] font-semibold text-ochre">{C.sme}</span>}
                  </td>
                  <td className={`tnum px-2 py-2 text-right ${r.postGain >= data.thresholds.spikeGain ? "font-semibold text-red" : ""}`}>{(r.postGain * 100).toFixed(0)}%</td>
                  <td className={`tnum px-2 py-2 text-right ${r.postVolume >= data.thresholds.spikeVolume ? "font-semibold text-red" : ""}`}>{r.postVolume >= 10 ? Math.round(r.postVolume) : r.postVolume.toFixed(1)}×</td>
                  <td className={`tnum px-2 py-2 text-right ${r.fall >= data.thresholds.dumpFall ? "font-semibold text-red" : ""}`}>−{(r.fall * 100).toFixed(0)}%</td>
                  <td className="px-4 py-2 font-body text-[12.5px]">{[r.pump ? C.patterns.pump[0] : r.spike ? C.patterns.spike[0] : "", r.preRun ? C.patterns.preRun[0] : ""].filter(Boolean).join(" · ") || <span className="text-faint">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!all && data.table.length > SHOWN && (
          <button onClick={() => setAll(true)} className="mt-4 cursor-pointer border-[1.5px] border-type px-4 py-2 font-mono text-xs transition-colors hover:bg-type hover:text-page">
            {C.showAll(data.table.length)}
          </button>
        )}
        <p className="mt-6 font-mono text-[11px] leading-relaxed text-soft">{C.source}</p>
        <a href={data.order.pdf} target="_blank" rel="noreferrer" className="mt-2 inline-block border-b border-type pb-px text-[15px] font-medium transition-colors hover:border-red hover:text-red">
          {C.openOrder} ↗
        </a>
      </section>
    </div>
  );
}

/** closing price as a line, volume as bars under it, and a mark at each recommendation */
function StockChart({ c, sub }: { c: (typeof data.charts)[number]; sub: string }) {
  const [box, W] = useWidth<HTMLDivElement>(400);
  const H = 210,
    priceH = 140,
    volTop = 152;
  const n = c.close.length;
  const hi = Math.max(...c.close),
    lo = Math.min(...c.close);
  const vmax = Math.max(...c.volume);
  const x = (i: number) => 2 + (i / (n - 1)) * (W - 4);
  const y = (v: number) => 8 + (1 - (v - lo) / (hi - lo || 1)) * (priceH - 16);
  const line = c.close.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const bw = Math.max(0.6, (W - 4) / n - 0.4);
  return (
    <div className="sheet min-w-0 px-4 pb-3 pt-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-mono text-[13px] font-semibold" lang="en">
          {c.symbol}
        </div>
        <div className="tnum font-mono text-[10.5px] text-soft">
          {lo.toFixed(0)} – {hi.toFixed(0)}
        </div>
      </div>
      <div className="mt-0.5 font-mono text-[10.5px] text-soft">{sub}</div>
      <div ref={box} className="mt-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`${c.symbol}: ${sub}`}>
          {c.marks.map((m, i) => (
            <line key={i} x1={x(m)} x2={x(m)} y1={0} y2={H} className="stroke-red" strokeWidth="1" opacity="0.75" />
          ))}
          {c.volume.map((v, i) => (
            <rect key={i} x={x(i) - bw / 2} width={bw} y={volTop + (1 - v / vmax) * (H - volTop)} height={(v / vmax) * (H - volTop)} className="fill-faint" />
          ))}
          <path d={line} fill="none" strokeWidth="1.6" strokeLinejoin="round" className="stroke-type" />
        </svg>
      </div>
    </div>
  );
}
