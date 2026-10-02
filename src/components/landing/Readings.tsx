"use client";
// Exhibit E: a real call whose result depends on the order of prices inside one day, which a daily file does not hold.
import gsap from "gsap";
import data from "@/samples/landing.json";
import { price, shortDate, signed } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import { EASE, Exhibit, Step, Title, useScene, useWidth } from "./kit";

const d = data.doubt!;
const bar = d.bars.find((b) => b.day === d.day)!;

// two paths through the same open, high, low and close; only the order differs. The message sits at 0.3 of the day.
const AT = 0.3;
const BEFORE: [number, number][] = [[0, bar.o], [0.1, bar.o + (bar.h - bar.o) * 0.55], [0.2, bar.h], [AT, d.entry! + 1], [0.42, bar.l], [0.6, bar.o + 2], [0.8, bar.c - 7], [1, bar.c]];
const AFTER: [number, number][] = [[0, bar.o], [0.15, bar.o - 8], [AT, d.entry!], [0.4, bar.l], [0.6, bar.o + 17], [0.78, bar.h], [0.9, bar.c + 11], [1, bar.c]];

export function Readings() {
  const { t, lang, indic } = useLang();
  const L = t.landing.readings;
  const label = indic ? "font-body text-[13px]" : "font-mono text-[11.5px]";

  const lo = bar.l - 14,
    hi = bar.h + 16;
  const [box, W] = useWidth<HTMLDivElement>(520);
  const PH = W < 420 ? 240 : 290;
  const y = (v: number) => 20 + (1 - (v - lo) / (hi - lo)) * (PH - 62);

  const scene = useScene<HTMLDivElement>((root) => {
    const tl = gsap.timeline({ defaults: { ease: EASE }, scrollTrigger: { trigger: root, start: "top 70%" } });
    tl.from(root.querySelector("[data-bar]"), { scaleY: 0, transformOrigin: "50% 100%", duration: 0.7 })
      .from(root.querySelectorAll("[data-ohlc]"), { opacity: 0, x: -6, duration: 0.4, stagger: 0.08 }, "-=0.3")
      .from(root.querySelectorAll("[data-path]"), { strokeDashoffset: 1, duration: 1.5, ease: "power2.inOut", stagger: 0.35 }, "-=0.1")
      .from(root.querySelectorAll("[data-caption]"), { opacity: 0, y: 6, duration: 0.5, stagger: 0.35 }, "-=1.5")
      .from(root.querySelectorAll("[data-row]"), { opacity: 0, y: 18, duration: 0.7, stagger: 0.14 }, "-=0.6");
  });

  const panel = (pts: [number, number][], hit: boolean, caption: string) => {
    const x = (v: number) => 14 + v * (W - 28);
    const path = pts.map(([tt, v], i) => `${i ? "L" : "M"}${x(tt)},${y(v)}`).join("");
    return (
      <div ref={hit ? undefined : box} className="min-w-0">
        <svg viewBox={`0 0 ${W} ${PH}`} className="block w-full border border-type bg-sheet" role="img" aria-label={caption}>
          <line x1={0} x2={W} y1={y(d.target!)} y2={y(d.target!)} className="stroke-green" strokeDasharray="5 4" />
          <line x1={0} x2={W} y1={y(d.entry!)} y2={y(d.entry!)} className="stroke-faint" strokeDasharray="5 4" />
          <text x={W - 8} y={y(d.target!) - 6} textAnchor="end" className={`fill-green ${label}`}>
            {t.landing.oneCall.target} {price(d.target!)}
          </text>
          <text x={W - 8} y={y(d.entry!) + 14} textAnchor="end" className={`fill-soft ${label}`}>
            {t.landing.oneCall.bought} {price(d.entry!)}
          </text>
          <line x1={x(AT)} x2={x(AT)} y1={0} y2={PH - 14} className="stroke-ochre" strokeWidth="1.5" />
          <text x={x(AT) + 6} y={PH - 16} className={`fill-ochre ${label}`}>
            {L.message} {d.time}
          </text>
          <path data-path d={path} pathLength={1} strokeDasharray="1" fill="none" strokeWidth="2.6" strokeLinejoin="round" className={hit ? "stroke-green" : "stroke-red"} />
          <circle cx={x(pts.find(([, v]) => v === bar.h)![0])} cy={y(bar.h)} r="5" className={hit ? "fill-green" : "fill-red"} />
        </svg>
        <div data-caption className={`mt-2 flex items-baseline gap-2 text-[14.5px] font-medium leading-snug ${hit ? "text-green" : "text-red"}`}>
          <span className="font-mono text-[11px]">{hit ? "B" : "A"}</span>
          {caption}
        </div>
      </div>
    );
  };

  const rows = [
    { key: "best" as const, out: d.best! },
    { key: "worst" as const, out: d.worst! },
    { key: "likely" as const, out: d.likely! },
  ];
  const stampOf = (o: { cls: string; exit?: number }) => (o.cls === "expired" && (o.exit ?? 1) <= d.entry! * 0.05 ? t.replay.stamps.zero : (t.replay.stamps[o.cls as keyof typeof t.replay.stamps] ?? o.cls));

  return (
    <Exhibit id="readings" tag={L.tag}>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-x-16 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Title className="max-w-[11ch]">{L.title}</Title>
        <div className="lg:pt-3">
          <p data-reveal className="max-w-[34rem] text-[18px] leading-relaxed text-type/80">
            {L.lead(shortDate(d.day, lang), d.time, d.contract, price(d.target!))}
          </p>
          <p data-reveal="0.1" className="mt-4 max-w-[34rem] text-[1.45rem] font-semibold leading-snug">
            {L.question(d.time)}
          </p>
        </div>
      </div>

      <div ref={scene} className="mt-12 lg:mt-14">
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-x-6 gap-y-8 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,1fr)] lg:gap-x-8">
          {/* the bar the exchange publishes for the day */}
          <div className="sm:col-span-2 lg:col-span-1">
            <svg viewBox={`0 0 150 ${PH}`} width={150} height={PH} className="block" role="img" aria-label={L.bar}>
              <g data-bar className={bar.c >= bar.o ? "text-green" : "text-red"}>
                <line x1={28} x2={28} y1={y(bar.h)} y2={y(bar.l)} stroke="currentColor" strokeWidth="2" />
                <rect x={17} width={22} y={y(Math.max(bar.o, bar.c))} height={Math.abs(y(bar.o) - y(bar.c))} fill="currentColor" />
              </g>
              {(["h", "c", "o", "l"] as const).map((k) => (
                <text data-ohlc key={k} x={50} y={y(bar[k]) + 4} className={`fill-type ${label}`}>
                  {L.ohlc[k]} <tspan className="font-mono text-[12.5px] font-semibold">{price(bar[k])}</tspan>
                </text>
              ))}
            </svg>
            <Step className="mt-2">{L.bar}</Step>
          </div>
          {panel(BEFORE, false, L.pathA)}
          {panel(AFTER, true, L.pathB)}
        </div>
        <p className="mt-4 font-mono text-[10.5px] leading-relaxed text-soft">{L.illustration}</p>

        <div className="mt-10 border-t-[1.5px] border-type">
          {rows.map(({ key, out }) => {
            const win = (out.net ?? 0) > 0;
            return (
              <div data-row key={key} className={`grid items-center gap-x-6 gap-y-2 border-b border-hair py-4 md:grid-cols-[15rem_minmax(0,1fr)_auto_7rem] ${key === "likely" ? "bg-sheet md:-mx-4 md:px-4" : ""}`}>
                <div className="text-[17px] font-semibold">{L.rows[key][0]}</div>
                <div className="text-[15px] leading-snug text-type/75">{L.rows[key][1]}</div>
                <div>
                  <span className={`mark-box text-[10px] ${win ? "text-green" : "text-red"}`}>{stampOf(out)}</span>
                </div>
                <div className={`tnum font-mono text-[1.25rem] font-semibold md:text-right ${win ? "text-green" : "text-red"}`}>{signed(out.net ?? 0)}</div>
              </div>
            );
          })}
        </div>
        <p data-reveal className="mt-6 max-w-3xl text-[17px] leading-relaxed">
          {d.quotedMax !== undefined && !d.announced && <>{L.quoted(price(d.quotedMax))} </>}
          {L.close}
        </p>
      </div>
    </Exhibit>
  );
}
