"use client";
// Exhibit D: every message of the sample channel as one square, in the order posted, coloured by what it is.
import gsap from "gsap";
import { useEffect, useRef } from "react";
import data from "@/samples/landing.json";
import { useLang } from "@/lib/i18n";
import { Exhibit, Title, useScene } from "./kit";

const tape = data.tape;
type Kind = "call" | "profit" | "selling" | "loss" | "other";
const KIND: Record<string, Kind> = { c: "call", p: "profit", s: "selling", l: "loss", o: "other", i: "other" };
const COLOUR: Record<Kind, string> = { call: "#e9e4d6", profit: "#e8b54a", selling: "#ff7a5c", loss: "#4fc79d", other: "#5b625f" };
const ORDER: Kind[] = ["call", "profit", "selling", "loss"];
const kinds = [...tape.order].map((ch) => KIND[ch] ?? "other");
const inr = (n: number) => n.toLocaleString("en-IN");

export function ChatTape() {
  const { t } = useLang();
  const L = t.landing.chat;
  const canvas = useRef<HTMLCanvasElement>(null);
  const shown = useRef(kinds.length);
  const counters = useRef<Partial<Record<Kind, HTMLElement | null>>>({});

  // squares up to `shown.current` are filled; the rest are outlines waiting their turn
  const draw = () => {
    const el = canvas.current;
    if (!el) return;
    const width = el.clientWidth;
    const pitch = width < 520 ? 9 : width < 900 ? 13 : 17;
    const gap = pitch < 12 ? 2 : 3;
    const cols = Math.max(1, Math.floor((width + gap) / pitch));
    const rows = Math.ceil(kinds.length / cols);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const height = rows * pitch - gap;
    if (el.width !== Math.round(width * dpr) || el.height !== Math.round(height * dpr)) {
      el.width = Math.round(width * dpr);
      el.height = Math.round(height * dpr);
      el.style.height = `${height}px`;
    }
    const g = el.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    const n = Math.round(shown.current);
    const tally: Record<Kind, number> = { call: 0, profit: 0, selling: 0, loss: 0, other: 0 };
    for (let i = 0; i < kinds.length; i++) {
      const cx = (i % cols) * pitch,
        cy = Math.floor(i / cols) * pitch,
        size = pitch - gap;
      if (i < n) {
        tally[kinds[i]]++;
        g.fillStyle = COLOUR[kinds[i]];
        g.fillRect(cx, cy, size, size);
      } else {
        g.fillStyle = "rgba(255,255,255,0.05)";
        g.fillRect(cx, cy, size, size);
      }
    }
    for (const k of ORDER) {
      const out = counters.current[k];
      if (out) out.textContent = inr(tally[k]);
    }
  };

  useEffect(() => {
    draw();
    const el = canvas.current;
    if (!el) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the tape fills as the section is scrolled through
  const scene = useScene<HTMLDivElement>((root) => {
    shown.current = 0;
    draw();
    gsap.to(shown, { current: kinds.length, ease: "none", onUpdate: draw, scrollTrigger: { trigger: root, start: "top 78%", end: "bottom 62%", scrub: 0.5 } });
    gsap.from(root.querySelectorAll("[data-line] [data-fill]"), { scaleX: 0, transformOrigin: "0% 50%", duration: 1, ease: "expo.out", stagger: 0.12, scrollTrigger: { trigger: root.querySelector("[data-lines]"), start: "top 88%" } });
    return () => {
      shown.current = kinds.length;
      draw();
    };
  });

  const lines: { text: string; a: number; b: number; tone: string }[] = [
    { text: L.won(tape.winnersAnnounced, tape.winners), a: tape.winnersAnnounced, b: tape.winners, tone: "bg-amber" },
    { text: L.lost(tape.losersAdmitted, tape.losers), a: tape.losersAdmitted, b: tape.losers, tone: "bg-[#4fc79d]" },
    { text: L.stop(tape.noStop, tape.calls), a: tape.noStop, b: tape.calls, tone: "bg-[#ff7a5c]" },
  ];

  return (
    <Exhibit id="chat" tag={L.tag} night>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] items-end gap-x-16 gap-y-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Title className="max-w-[14ch] text-chalk">{L.title(inr(tape.messages))}</Title>
        <p data-reveal className="max-w-md text-[18px] leading-relaxed text-chalk/70 lg:pb-2">
          {L.lead}
        </p>
      </div>

      <div ref={scene} className="mt-12">
        <dl className="flex flex-wrap gap-x-10 gap-y-4">
          {ORDER.map((k) => (
            <div key={k} className={`flex items-baseline gap-3 ${k === "loss" ? "border border-[#4fc79d]/70 px-3 py-1.5" : "py-1.5"}`}>
              <span className="size-3 shrink-0 translate-y-px" style={{ background: COLOUR[k] }} />
              <dd
                ref={(el) => {
                  counters.current[k] = el;
                }}
                className="tnum font-mono text-[1.7rem] font-semibold leading-none"
                style={{ color: COLOUR[k] }}
              >
                {inr(tape.counts[k])}
              </dd>
              <dt className="text-[15px] text-chalk/75">{L.kinds[k]}</dt>
            </div>
          ))}
        </dl>
        <canvas ref={canvas} className="mt-6 block w-full" role="img" aria-label={L.lead} />

        <div data-lines className="mt-12 grid grid-cols-[minmax(0,1fr)] gap-x-12 gap-y-6 border-t border-white/15 pt-8 md:grid-cols-3">
          {lines.map((l) => (
            <div key={l.text} data-line>
              <div className="h-1.5 bg-white/10">
                <div data-fill className={`h-full ${l.tone}`} style={{ width: `${l.b ? Math.max(l.a / l.b, 0.004) * 100 : 0}%` }} />
              </div>
              <p className="mt-3 text-[17px] leading-snug text-chalk/90">{l.text}</p>
            </div>
          ))}
        </div>
      </div>
    </Exhibit>
  );
}
