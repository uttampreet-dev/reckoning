"use client";
// Exhibit B: one message, the contract's daily prices after it, and what the account was left with.
import gsap from "gsap";
import { useRef } from "react";
import data from "@/samples/landing.json";
import { price, rupees, shortDate, signed } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import { EASE, Exhibit, Step, Title, useScene, useWidth } from "./kit";

const call = data.call;

/** the parts of a call the reader picks out of the message */
export function Marked({ text }: { text: string }) {
  const re = /(\b(?:BANKNIFTY|NIFTY|SENSEX)\s+\d+\s*(?:CE|PE)\b)|(\bSL\s+PAID\b)|(\bTGT\s+[\d+]+)|(\bAt\s+\d+\s*-\s*\d+)/gi;
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    out.push(text.slice(last, m.index));
    out.push(
      <span key={m.index} className={m[2] ? "text-[#ff7a5c] underline underline-offset-4" : "text-amber"}>
        {m[0]}
      </span>,
    );
    last = m.index! + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

export function OneCall() {
  const { t, lang } = useLang();
  const L = t.landing.oneCall;
  const total = useRef<HTMLDivElement>(null);

  const scene = useScene<HTMLDivElement>((root) => {
    const figure = { v: 0 };
    const tl = gsap.timeline({ defaults: { ease: EASE }, scrollTrigger: { trigger: root, start: "top 72%" } });
    tl.from(root.querySelector("[data-bubble]"), { y: 18, opacity: 0, scale: 0.96, duration: 0.6 })
      .from(root.querySelectorAll("[data-level]"), { scaleX: 0, transformOrigin: "0% 50%", duration: 0.7, stagger: 0.08 }, "-=0.2")
      .from(root.querySelectorAll("[data-candle]"), { scaleY: 0, opacity: 0, transformOrigin: "50% 100%", duration: 0.5, stagger: 0.22 }, "-=0.3")
      .to(
        figure,
        {
          v: call.net,
          duration: 1.2,
          ease: "power2.out",
          onUpdate: () => {
            if (total.current) total.current.textContent = signed(figure.v);
          },
        },
        "-=0.5",
      )
      .from(root.querySelectorAll("[data-after]"), { y: 12, opacity: 0, duration: 0.6, stagger: 0.1 }, "-=0.6");
  });

  // ---- the chart
  const [box, W] = useWidth<HTMLDivElement>(460);
  const H = 250,
    padL = 6,
    padR = 92,
    padT = 14,
    padB = 26;
  const max = Math.max(call.target ?? 0, ...call.bars.map((b) => b.h)) * 1.13;
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const step = (W - padL - padR) / call.bars.length;
  const first = call.bars.findIndex((b) => b.held);
  const level = (v: number, cls: string, text: string) => (
    <g key={text}>
      <line data-level x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} className={`stroke-current ${cls}`} strokeDasharray="5 4" />
      <text x={W - padR + 7} y={y(v) + 4} className={`fill-current font-mono text-[11px] ${cls}`}>
        {text}
      </text>
    </g>
  );

  return (
    <Exhibit id="one-call" tag={L.tag}>
      <Title className="mt-4 max-w-[17ch]">{L.title}</Title>
      <div ref={scene} className="mt-12 grid grid-cols-[minmax(0,1fr)] gap-x-11 gap-y-12 lg:mt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="border-t-[1.5px] border-type pt-4">
          <Step>{L.step1(shortDate(call.day, lang), call.time)}</Step>
          <div data-bubble className="mt-5 rounded-2xl rounded-bl-sm bg-night px-5 py-4 font-mono text-[15px] leading-relaxed text-chalk shadow-[0_18px_30px_-16px_rgb(0_0_0/0.5)]">
            <Marked text={call.text} />
            <div className="mt-1 text-right text-[10.5px] text-white/35">{call.time}</div>
          </div>
          <p data-after className="mt-5 text-[17px] leading-snug">
            {L.note1}
          </p>
        </div>

        <div className="border-t-[1.5px] border-type pt-4">
          <Step>{L.step2}</Step>
          <div ref={box} className="mt-3">
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={L.step2}>
            {call.target !== undefined && level(call.target, "text-green", `${L.target} ${price(call.target)}`)}
            {level(call.entry!, "text-type", `${L.bought} ${price(call.entry!)}`)}
            {level(0, "text-red", `${L.expiry} 0`)}
            {first > 0 && (
              <text x={Math.max(padL + first * step - 6, 88)} y={padT - 2} textAnchor="end" className="fill-soft font-mono text-[9.5px]">
                {L.before}
              </text>
            )}
            {first > 0 && <line x1={padL + first * step} x2={padL + first * step} y1={padT - 6} y2={H - padB} className="stroke-ochre" strokeWidth="1" />}
            {call.bars.map((b, i) => {
              const cx = padL + i * step + step / 2;
              const tone = b.held ? (b.c >= b.o ? "text-green" : "text-red") : "text-faint";
              return (
                <g key={b.day}>
                  <g data-candle className={tone}>
                    <line x1={cx} x2={cx} y1={y(b.h)} y2={y(b.l)} stroke="currentColor" strokeWidth="1.5" />
                    <rect x={cx - step * 0.28} width={step * 0.56} y={y(Math.max(b.o, b.c))} height={Math.max(2, Math.abs(y(b.o) - y(b.c)))} fill="currentColor" />
                  </g>
                  <text x={cx} y={H - 8} textAnchor="middle" className="fill-soft font-mono text-[10px]">
                    {shortDate(b.day, lang)}
                  </text>
                </g>
              );
            })}
          </svg>
          </div>
        </div>

        <div className="border-t-[1.5px] border-type pt-4">
          <Step>{L.step3(shortDate(call.exitDay!, lang))}</Step>
          <div ref={total} className="tnum mt-4 font-mono text-[3rem] font-semibold leading-none tracking-tight text-red sm:text-[3.6rem] lg:text-[clamp(2.6rem,4vw,3.6rem)]">
            {signed(call.net!)}
          </div>
          <p data-after className="mt-5 text-[17px] leading-snug">
            {L.note3(price(call.entry!), price(call.target!))}
          </p>
          <p data-after className="mt-3 font-mono text-[11.5px] leading-relaxed text-soft">
            {L.sum(call.quantity!, price(call.entry!), rupees(call.costs!))}
          </p>
        </div>
      </div>
    </Exhibit>
  );
}
