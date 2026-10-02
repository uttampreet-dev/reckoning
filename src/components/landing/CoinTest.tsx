"use client";
// Exhibit C: each channel's hit rate set against the rate a directionless price would give the same calls.
import gsap from "gsap";
import data from "@/samples/landing.json";
import { percent } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import { EASE, Exhibit, Title, useScene, useWidth } from "./kit";

const field = data.field;

export function CoinTest() {
  const { t, lang } = useLang();
  const L = t.landing.coin;
  const label = lang === "hi" ? "font-body text-[12px]" : "font-mono text-[11px]";

  const [box, W] = useWidth<HTMLDivElement>(558);
  const narrow = W < 480;
  const H = narrow ? Math.round(W * 1.02) : 440,
    pad = narrow ? 48 : 50,
    bottom = 26,
    top = 16,
    right = narrow ? 10 : 16;
  const x = (v: number) => pad + v * (W - pad - right);
  const y = (v: number) => H - bottom - v * (H - bottom - top);
  const angle = (-Math.atan2(y(0) - y(1), x(1) - x(0)) * 180) / Math.PI;
  const mine = field.channels.find((c) => "sample" in c);

  const scene = useScene<HTMLDivElement>((root) => {
    const tl = gsap.timeline({ defaults: { ease: EASE }, scrollTrigger: { trigger: root, start: "top 70%" } });
    tl.from(root.querySelector("[data-diagonal]"), { scale: 0, transformOrigin: "0% 100%", duration: 0.9 })
      .from(root.querySelector("[data-below]"), { opacity: 0, duration: 0.6 }, "-=0.4")
      .from(root.querySelectorAll("[data-whisker]"), { scaleY: 0, transformOrigin: "50% 50%", duration: 0.5, stagger: 0.05 }, "-=0.3")
      .from(root.querySelectorAll("[data-dot]"), { scale: 0, transformOrigin: "50% 50%", duration: 0.6, ease: "back.out(2.4)", stagger: 0.06 }, "<")
      .from(root.querySelectorAll("[data-note]"), { opacity: 0, duration: 0.5, stagger: 0.1 }, "-=0.2");
  });

  return (
    <Exhibit id="coin" tag={L.tag}>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] items-center gap-x-20 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,600px)]">
        <div>
          <Title className="max-w-[12ch]">{L.title}</Title>
          <p data-reveal className="mt-7 max-w-[34rem] text-[18px] leading-relaxed text-type/80">
            {L.lead}
          </p>
          <p data-reveal="0.1" className="mt-7 max-w-[34rem] text-[1.45rem] font-semibold leading-snug text-red">
            {L.result(field.below, field.channels.length)}
          </p>
          <p data-reveal="0.15" className="mt-2 max-w-[34rem] text-[18px] leading-relaxed">
            {L.resultBest(field.belowOnBest)}
          </p>
          <p data-reveal="0.2" className="mt-6 max-w-[34rem] border-l-2 border-ochre pl-4 text-[15px] leading-relaxed text-type/80">
            {L.caveat}
          </p>
        </div>

        <div ref={scene} className="sheet px-3 pb-3 pt-4 sm:px-5">
          <div ref={box}>
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={L.result(field.below, field.channels.length)}>
            {[0, 0.25, 0.5, 0.75, 1].map((g) => (
              <g key={g}>
                <line x1={x(g)} x2={x(g)} y1={y(0)} y2={y(1)} className="stroke-hair" />
                <line x1={x(0)} x2={x(1)} y1={y(g)} y2={y(g)} className="stroke-hair" />
                <text x={x(g)} y={y(0) + 16} textAnchor="middle" className="fill-soft font-mono text-[10px]">
                  {percent(g)}
                </text>
                <text x={pad - 8} y={y(g) + 3} textAnchor="end" className="fill-soft font-mono text-[10px]">
                  {percent(g)}
                </text>
              </g>
            ))}
            {/* below the line a channel does worse than chance */}
            <path data-below d={`M${x(0)},${y(0)}L${x(1)},${y(1)}L${x(1)},${y(0)}Z`} className="fill-red/[0.07]" />
            <line data-diagonal x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} className="stroke-type" strokeDasharray="5 4" />
            <text data-note x={x(0.3)} y={y(0.3) - 9} transform={`rotate(${angle} ${x(0.3)} ${y(0.3) - 9})`} textAnchor="middle" className={`fill-type ${label}`}>
              {L.diagonal}
            </text>
            {field.channels.map((c, i) => {
              const tone = c.hit < c.chance ? "text-red" : "text-green";
              const me = c === mine;
              return (
                <g key={i} className={tone}>
                  <line data-whisker x1={x(c.chance)} x2={x(c.chance)} y1={y(c.best)} y2={y(c.worst)} stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
                  <circle data-dot cx={x(c.chance)} cy={y(c.hit)} r={me ? 8.5 : 6} fill="currentColor" className={me ? "stroke-type" : ""} strokeWidth={me ? 2.5 : 0} />
                </g>
              );
            })}
            {mine && (
              <text data-note x={x(mine.chance) + 15} y={y(mine.hit) + 20} className={`fill-type ${label} font-semibold`}>
                {L.above}
                <tspan x={x(mine.chance) + 15} dy="14" className="font-mono text-[11px] font-normal">
                  {percent(mine.hit)} / {percent(mine.chance)}
                </tspan>
              </text>
            )}
            <text x={13} y={y(0.5)} textAnchor="middle" transform={`rotate(-90 13 ${y(0.5)})`} className={`fill-soft ${label}`}>
              {L.yAxis}
            </text>
          </svg>
          </div>
          <p className={`mt-1 text-center text-soft ${label}`}>{L.xAxis}</p>
          <p className="mt-3 border-t border-hair pt-2 font-mono text-[10.5px] leading-relaxed text-soft">
            {L.whisker}
            <br />
            {L.foot(data.builtFrom.channelsRead, field.channels.length, data.builtFrom.minCalls)}
          </p>
        </div>
      </div>
    </Exhibit>
  );
}
