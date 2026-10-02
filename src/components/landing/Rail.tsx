"use client";
// The index at the left edge of wide screens: which exhibit is on screen, and a way to jump between them.
import { ScrollTrigger } from "gsap/ScrollTrigger";
import gsap from "gsap";
import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";

const STOPS = ["ledger", "one-call", "coin", "chat", "readings", "pause", "report"];
const MARKS = ["A", "B", "C", "D", "E", "F", "G"];

export function Rail() {
  const { t, lang } = useLang();
  const [at, setAt] = useState(0);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const triggers = STOPS.map((id, i) => {
      const el = document.getElementById(id);
      return el && ScrollTrigger.create({ trigger: el, start: "top 55%", end: "bottom 55%", onToggle: (self) => self.isActive && setAt(i) });
    });
    return () => triggers.forEach((tr) => tr && tr.kill());
  }, []);

  // a change of language changes every section's height
  useEffect(() => {
    const timer = setTimeout(() => ScrollTrigger.refresh(), 80);
    return () => clearTimeout(timer);
  }, [lang]);

  return (
    <nav aria-label={t.landing.scroll} className="fixed left-0 top-1/2 z-40 hidden -translate-y-1/2 flex-col text-white mix-blend-difference min-[1360px]:flex">
      {STOPS.map((id, i) => (
        <a key={id} href={`#${id}`} title={t.landing.rail[i]} aria-current={at === i} className="group flex h-8 w-[52px] items-center gap-2 pl-4 font-mono text-[11px] font-semibold">
          <span className={`h-px bg-white transition-all duration-300 ${at === i ? "w-4" : "w-1.5 opacity-50 group-hover:w-3 group-hover:opacity-100"}`} />
          <span className={`transition-opacity duration-300 ${at === i ? "opacity-100" : "opacity-45 group-hover:opacity-100"}`}>{MARKS[i]}</span>
        </a>
      ))}
    </nav>
  );
}
