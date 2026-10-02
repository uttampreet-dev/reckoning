"use client";
import { useLang } from "@/lib/i18n";

export function MethodPage() {
  const { t } = useLang();
  const M = t.method;
  const H2 = ({ children, id }: { children: React.ReactNode; id?: string }) => (
    <h2 id={id} className="display scroll-mt-8 text-[2.1rem] font-bold leading-tight sm:text-[2.5rem]">
      {children}
    </h2>
  );
  const Rows = ({ items }: { items: string[][] }) => (
    <dl className="mt-5 divide-y divide-hair border-b border-t-[1.5px] border-hair border-t-type">
      {items.map(([k, v], i) => (
        <div key={k} className="grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[2.5rem_13rem_minmax(0,1fr)]">
          <span className="hidden font-mono text-xs font-semibold text-red sm:block">0{i + 1}</span>
          <dt className="text-[18px] font-semibold leading-snug">{k}</dt>
          <dd className="text-[15.5px] leading-relaxed text-type/85">{v}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <div className="mx-auto grid max-w-[1440px] grid-cols-[minmax(0,1fr)] gap-x-16 gap-y-10 px-5 pb-24 pt-10 font-body sm:px-10 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:px-[72px] lg:pt-14">
      <div className="lg:sticky lg:top-8 lg:self-start">
        <div className="tag mb-4">{t.nav.method}</div>
        <h1 className="display text-[3rem] font-bold leading-[0.98] sm:text-[4.2rem]">{M.title}</h1>
        <p className="mt-6 max-w-md text-[18px] leading-relaxed text-type/80">{M.lead}</p>
      </div>
      <div className="min-w-0 space-y-14">
        <section>
          <H2>{M.rulesTitle}</H2>
          <Rows items={M.rules} />
        </section>

        <section>
          <H2>{M.readingsTitle}</H2>
          <p className="mt-3 max-w-3xl text-[15.5px] leading-relaxed text-type/85">{M.readingsBody}</p>
          <DayDiagram />
          <Rows items={M.readings} />
        </section>

        <section>
          <H2>{M.chanceTitle}</H2>
          <p className="mt-3 max-w-3xl text-[15.5px] leading-relaxed text-type/85">{M.chanceBody}</p>
        </section>

        <section>
          <H2>{M.dataTitle}</H2>
          <Rows items={M.data} />
        </section>

        <section>
          <H2 id="limits">{M.limitsTitle}</H2>
          <ul className="mt-5 divide-y divide-hair border-b border-t-[1.5px] border-hair border-t-type">
            {M.limits.map((l) => (
              <li key={l} className="grid grid-cols-[1.5rem_minmax(0,1fr)] py-3.5 text-[15.5px] leading-relaxed text-type/85">
                <span className="font-mono font-semibold text-red">×</span>
                {l}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

/** One day's bar, and two ways the same bar can have happened around a message. */
function DayDiagram() {
  // both paths open at 140, touch 150 and 85, and close at 90; only the order differs
  const W = 640,
    H = 210;
  const y = (v: number) => 20 + (1 - (v - 70) / 90) * 150;
  const path = (pts: [number, number][], x0: number) => pts.map(([t, v], i) => `${i ? "L" : "M"}${x0 + t * 200},${y(v)}`).join("");
  const early: [number, number][] = [[0, 140], [0.12, 150], [0.3, 118], [0.42, 100], [0.6, 92], [0.8, 85], [1, 90]];
  const late: [number, number][] = [[0, 140], [0.15, 110], [0.3, 85], [0.42, 100], [0.62, 128], [0.78, 150], [0.9, 110], [1, 90]];
  const Panel = ({ x0, pts, hit }: { x0: number; pts: [number, number][]; hit: boolean }) => (
    <g>
      <rect x={x0} y={20} width={200} height={150} className="fill-sheet stroke-hair" />
      <line x1={x0} x2={x0 + 200} y1={y(130)} y2={y(130)} className="stroke-green" strokeDasharray="4 3" />
      <line x1={x0} x2={x0 + 200} y1={y(100)} y2={y(100)} className="stroke-type/60" strokeDasharray="4 3" />
      <line x1={x0 + 0.42 * 200} x2={x0 + 0.42 * 200} y1={20} y2={170} className="stroke-ochre" />
      <text x={x0 + 0.42 * 200 + 4} y={32} className="fill-ochre font-mono text-[9px]">
        message
      </text>
      <path d={path(pts, x0)} fill="none" strokeWidth="1.8" className={hit ? "stroke-green" : "stroke-red"} />
      <text x={x0 + 100} y={192} textAnchor="middle" className={`font-mono text-[10px] ${hit ? "fill-green" : "fill-red"}`}>
        {hit ? "target reached after the message" : "target printed before the message"}
      </text>
    </g>
  );
  return (
    <div className="mt-6 overflow-x-auto">
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full min-w-[36rem] max-w-3xl" role="img" aria-label="The same daily bar can hide two different days">
      {/* the bar the exchange publishes */}
      <line x1={50} x2={50} y1={y(150)} y2={y(85)} className="stroke-type" strokeWidth="1.5" />
      <rect x={42} y={y(140)} width={16} height={y(90) - y(140)} className="fill-red" />
      <text x={50} y={192} textAnchor="middle" className="fill-soft font-mono text-[10px]">
        the daily bar
      </text>
      <text x={66} y={y(130) + 3} className="fill-green font-mono text-[9px]">
        target 130
      </text>
      <text x={66} y={y(100) + 3} className="fill-type/70 font-mono text-[9px]">
        entry 100
      </text>
      <Panel x0={170} pts={early} hit={false} />
      <Panel x0={410} pts={late} hit />
    </svg>
    </div>
  );
}
