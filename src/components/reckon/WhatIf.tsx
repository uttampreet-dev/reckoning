"use client";
// The same replayed calls under the reader's own money: how much they start with, how much goes into each call,
// and how much of it is borrowed. Only the arithmetic is redone; the prices and results stay as replayed.
import { useMemo, useState } from "react";
import { buildLedger, DEFAULT_PARAMS, type LedgerParams } from "@/engine/ledger";
import type { Reckoning } from "@/engine/reckon";
import { rupees, shortDate } from "@/lib/format";
import { useLang } from "@/lib/i18n";

const CAPITALS = [10_000, 25_000, 50_000, 1_00_000, 2_00_000, 5_00_000];

export function WhatIf({ r, days }: { r: Reckoning; days: string[] }) {
  const { t, lang } = useLang();
  const W = t.report.whatIf;
  const [capitalAt, setCapitalAt] = useState(CAPITALS.indexOf(DEFAULT_PARAMS.capital));
  const [stake, setStake] = useState(DEFAULT_PARAMS.stakeFraction);
  const [borrowed, setBorrowed] = useState(0);
  const capital = CAPITALS[capitalAt];

  const outcomes = useMemo(() => new Map(Object.entries(r.outcomes)), [r]);
  const L = useMemo(() => {
    const params: LedgerParams = { ...DEFAULT_PARAMS, capital, stakeFraction: stake, borrowedFraction: borrowed };
    return buildLedger(r.extraction.calls, outcomes, params);
  }, [r, outcomes, capital, stake, borrowed]);

  const date = (i?: number) => (i === undefined ? "" : shortDate(days[Math.min(i, days.length - 1)], lang, true));
  const lost = L.finalBalance < L.startBalance;
  const presets: [string, () => void][] = [
    [W.presets.savings, () => (setStake(0.2), setBorrowed(0))],
    [W.presets.half, () => (setStake(0.2), setBorrowed(0.5))],
    [W.presets.all, () => (setStake(1), setBorrowed(0))],
  ];

  // the account as a step line: it moves only when a call settles
  const VW = 640,
    VH = 150;
  const top = Math.max(L.startBalance * 1.1, ...L.curve.map((p) => p.balance));
  const d0 = L.curve[0]?.day ?? 0;
  const d1 = Math.max(L.curve.at(-1)?.day ?? 1, d0 + 1);
  const x = (d: number) => 4 + ((d - d0) / (d1 - d0)) * (VW - 84);
  const y = (v: number) => VH - 8 - (v / top) * (VH - 20);
  const path = `M${x(d0)},${y(L.startBalance)}` + L.curve.map((p) => `H${x(p.day)}V${y(p.balance)}`).join("") + `H${x(d1)}`;
  const debt = L.loan ? y(L.loan.borrowed) : null;

  const Slider = ({ label, value, min, max, step, onChange, shown, id }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; shown: string; id: string }) => (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[15px] font-medium">
          {label}
        </label>
        <output htmlFor={id} className="tnum font-mono text-[15px] font-semibold">
          {shown}
        </output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="range mt-2 w-full" />
    </div>
  );

  return (
    <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-8 xl:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
      <div className="space-y-6">
        {Slider({ id: "wi-capital", label: W.capital, value: capitalAt, min: 0, max: CAPITALS.length - 1, step: 1, onChange: setCapitalAt, shown: rupees(capital) })}
        <div>
          {Slider({ id: "wi-stake", label: W.stake, value: stake, min: 0.05, max: 1, step: 0.05, onChange: setStake, shown: `${Math.round(stake * 100)}%` })}
          <div className="mt-1 font-mono text-[11px] text-soft">{W.perCall(rupees(capital * stake))}</div>
        </div>
        <div>
          {Slider({ id: "wi-borrowed", label: W.borrowed, value: borrowed, min: 0, max: 0.9, step: 0.1, onChange: setBorrowed, shown: `${Math.round(borrowed * 100)}%` })}
          <div className="mt-1 font-mono text-[11px] text-soft">{borrowed > 0 ? W.borrowedOf(rupees(capital * borrowed)) : " "}</div>
        </div>
        <div className="flex flex-wrap gap-2 font-mono text-[11.5px]">
          {presets.map(([label, apply]) => (
            <button key={label} onClick={apply} className="cursor-pointer border-[1.5px] border-type/30 px-2.5 py-1.5 text-type/80 transition-colors hover:border-type hover:text-type">
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="sheet min-w-0 px-5 pb-5 pt-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-b-2 border-type pb-3">
          <div>
            <div className="eyebrow font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-soft">{W.ends}</div>
            <div className="mt-1 font-mono text-[11px] text-soft">{L.outOfMoneyDay !== undefined ? W.ranOut(date(L.outOfMoneyDay), L.counts.taken) : W.taken(L.counts.taken)}</div>
          </div>
          <div data-whatif-final className={`tnum font-mono text-[2rem] font-semibold leading-none tracking-tight sm:text-[2.4rem] ${lost ? "text-red" : "text-type"}`}>
            {rupees(L.finalBalance)}
          </div>
        </div>

        <svg viewBox={`0 0 ${VW} ${VH}`} className="mt-3 block w-full" role="img" aria-label={`${rupees(L.startBalance)} → ${rupees(L.finalBalance)}`}>
          <line x1={4} x2={VW - 80} y1={y(L.startBalance)} y2={y(L.startBalance)} className="stroke-faint" strokeDasharray="2 5" />
          <text x={VW - 76} y={y(L.startBalance) + 3} className="fill-soft font-mono text-[10px]">
            {rupees(L.startBalance)}
          </text>
          {debt !== null && (
            <>
              <rect x={4} y={debt} width={VW - 84} height={VH - 8 - debt} className="fill-ochre/10" />
              <line x1={4} x2={VW - 80} y1={debt} y2={debt} className="stroke-ochre" strokeDasharray="5 4" />
            </>
          )}
          <line x1={4} x2={VW - 80} y1={y(0)} y2={y(0)} className="stroke-hair" />
          <path d={path} fill="none" strokeWidth="2" strokeLinejoin="round" className={lost ? "stroke-red" : "stroke-type"} />
          <circle cx={x(d1)} cy={y(L.finalBalance)} r="3.5" className={lost ? "fill-red" : "fill-type"} />
        </svg>

        <dl className="mt-3 divide-y divide-hair border-t border-hair text-[15px]">
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt>{W.fall}</dt>
            <dd className="tnum font-mono font-semibold">{Math.round(L.maxDrawdownPct)}%</dd>
          </div>
          {L.loan && (
            <>
              <div className="flex items-baseline justify-between gap-4 py-2.5">
                <dt>{W.owed}</dt>
                <dd className="tnum font-mono font-semibold text-ochre">{rupees(L.loan.owed)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2.5">
                <dt>{W.netWorth}</dt>
                <dd className={`tnum font-mono font-semibold ${L.loan.netWorth < 0 ? "text-red" : "text-type"}`}>{rupees(L.loan.netWorth)}</dd>
              </div>
              <div className={`py-2.5 ${L.loan.ownMoneyGoneDay !== undefined ? "font-medium text-red" : "text-type/80"}`}>{L.loan.ownMoneyGoneDay !== undefined ? W.ownGone(date(L.loan.ownMoneyGoneDay)) : W.ownKept}</div>
            </>
          )}
        </dl>
        {borrowed > 0 && <p className="mt-3 font-mono text-[10.5px] leading-relaxed text-soft">{W.loanNote(Math.round(DEFAULT_PARAMS.loanMonthlyRate * 100))}</p>}
        <p className="mt-3 border-t border-hair pt-3 text-[12.5px] leading-snug text-type/75">{t.report.paperOnly}</p>
      </div>
    </div>
  );
}
