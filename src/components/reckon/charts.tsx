"use client";
// Small charts drawn by hand so they stay light on a slow phone.
import { rupees } from "@/lib/format";
import type { CurvePoint } from "@/engine/ledger";
import type { Bar, Call, Outcome } from "@/engine/types";

/** The account over time: the main reading as a line, the best and worst readings as the band around it. */
export function EquityBand({ main, best, worst, start, days }: { main: CurvePoint[]; best: CurvePoint[]; worst: CurvePoint[]; start: number; days: string[] }) {
  const W = 760,
    H = 220,
    padL = 8,
    padR = 64,
    padY = 16;
  const all = [...main, ...best, ...worst];
  if (!all.length) return null;
  const d0 = Math.min(...all.map((p) => p.day));
  const d1 = Math.max(...all.map((p) => p.day), d0 + 1);
  const max = Math.max(start * 1.1, ...all.map((p) => p.balance));
  const x = (d: number) => padL + ((d - d0) / (d1 - d0)) * (W - padL - padR);
  const y = (v: number) => H - padY - (v / max) * (H - padY * 2);
  const steps = (pts: CurvePoint[]) => {
    let d = `M${x(d0)},${y(start)}`;
    for (const p of pts) d += `H${x(p.day)}V${y(p.balance)}`;
    return d + `H${x(d1)}`;
  };
  // the band: best along the top, worst back along the bottom
  const lastOf = (pts: CurvePoint[]) => (pts.length ? pts[pts.length - 1].balance : start);
  const back = (pts: CurvePoint[]) => {
    let d = "";
    let prev = lastOf(pts);
    d += `L${x(d1)},${y(prev)}`;
    for (let i = pts.length - 1; i >= 0; i--) {
      const before = i > 0 ? pts[i - 1].balance : start;
      d += `H${x(pts[i].day)}V${y(before)}`;
      prev = before;
    }
    return d + `H${x(d0)}Z`;
  };
  const end = lastOf(main);
  const tone = end < start ? "text-red" : "text-type";
  const label = (v: number, cls: string) => (
    <text x={W - padR + 6} y={y(v) + 3} className={`font-mono text-[10px] ${cls}`}>
      {rupees(v)}
    </text>
  );
  const months = [...new Set(days.slice(d0, d1 + 1).map((d) => d.slice(0, 7)))];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`${rupees(start)} → ${rupees(end)}`}>
      <line x1={padL} x2={W - padR} y1={y(start)} y2={y(start)} className="stroke-faint" strokeDasharray="2 5" />
      <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} className="stroke-hair" />
      <path d={steps(best) + back(worst)} className="fill-ochre/10" />
      <path d={steps(best)} fill="none" className="stroke-ochre/60" strokeWidth="1" strokeDasharray="3 3" />
      <path d={steps(worst)} fill="none" className="stroke-ochre/60" strokeWidth="1" strokeDasharray="3 3" />
      <path d={steps(main)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className={tone} />
      <circle cx={x(d1)} cy={y(end)} r="3.5" fill="currentColor" className={tone} />
      {label(start, "fill-soft")}
      {Math.abs(y(end) - y(start)) > 12 && label(end, end < start ? "fill-red" : "fill-type")}
      {months.length <= 14 &&
        months.map((m) => {
          const first = days.findIndex((d) => d.startsWith(m));
          if (first < d0) return null;
          return (
            <text key={m} x={x(first)} y={H - 2} className="fill-soft font-mono text-[9px]">
              {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m.slice(5) - 1]}
            </text>
          );
        })}
    </svg>
  );
}

/** Daily candles around one call, with its entry, target and stop drawn across. */
export function CallChart({ call, out, days }: { call: Call; out: Outcome; days: string[] }) {
  const bars: Bar[] = out.bars ?? [];
  if (!bars.length || out.entryPrice === undefined) return null;
  const W = 420,
    H = 150,
    padX = 6,
    padR = 52,
    padY = 10;
  const target = call.targets.find((t) => (call.side === "long" ? t > out.entryPrice! : t < out.entryPrice!));
  const levels = [out.entryPrice, target, call.stop].filter((v): v is number => v !== undefined);
  const lo = Math.min(...bars.map((b) => b.l), ...levels);
  const hi = Math.max(...bars.map((b) => b.h), ...levels);
  const y = (v: number) => padY + (1 - (v - lo) / (hi - lo || 1)) * (H - padY * 2 - 12);
  const step = (W - padX - padR) / bars.length;
  const line = (v: number, cls: string, text: string) => (
    <g key={text}>
      <line x1={padX} x2={W - padR} y1={y(v)} y2={y(v)} className={cls} strokeDasharray="4 3" />
      <text x={W - padR + 4} y={y(v) + 3} className={`font-mono text-[9px] ${cls.replace("stroke-", "fill-")}`}>
        {text}
      </text>
    </g>
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full max-w-md" role="img" aria-label="price chart around the call">
      {bars.map((b, i) => {
        const cx = padX + i * step + step / 2;
        const up = b.c >= b.o;
        const held = out.entryDay !== undefined && out.exitDay !== undefined && b.d >= out.entryDay && b.d <= out.exitDay;
        return (
          <g key={b.d} className={held ? (up ? "text-green" : "text-red") : "text-soft"} opacity={held ? 1 : 0.7}>
            <line x1={cx} x2={cx} y1={y(b.h)} y2={y(b.l)} stroke="currentColor" />
            <rect x={cx - Math.max(1.5, step * 0.3)} width={Math.max(3, step * 0.6)} y={y(Math.max(b.o, b.c))} height={Math.max(1, Math.abs(y(b.o) - y(b.c)))} fill="currentColor" />
            {b.d === out.entryDay && <text x={cx} y={H - 2} textAnchor="middle" className="fill-soft font-mono text-[8.5px]">{days[b.d]?.slice(5)}</text>}
          </g>
        );
      })}
      {line(out.entryPrice, "stroke-type", `in ${out.entryPrice}`)}
      {target !== undefined && line(target, "stroke-green", `tgt ${target}`)}
      {call.stop !== undefined && line(call.stop, "stroke-red", `sl ${call.stop}`)}
    </svg>
  );
}
