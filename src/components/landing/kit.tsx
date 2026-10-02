"use client";
// Shared pieces of the landing page's exhibits: the section frame, the heading, and the scroll-motion hook.
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";

let registered = false;
export const EASE = "expo.out";

/**
 * Scroll motion for one section. The build function runs only when the reader has not asked for reduced motion,
 * and everything it creates is undone when the section goes away. Without it the section is simply all there.
 */
export function useScene<T extends HTMLElement>(build: (root: T) => void | (() => void), deps: unknown[] = []) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (!registered) {
      gsap.registerPlugin(ScrollTrigger);
      registered = true;
    }
    const mm = gsap.matchMedia(root);
    mm.add("(prefers-reduced-motion: no-preference)", () => build(root));
    return () => mm.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

/** A heading whose words rise in one after another when it scrolls into view. */
export function Title({ children, className = "" }: { children: string; className?: string }) {
  const { lang, indic } = useLang();
  const size = indic ? "text-[2.1rem] leading-[1.28] sm:text-[3rem] lg:text-[3.7rem]" : "text-[2.5rem] font-bold leading-[1] sm:text-[3.5rem] lg:text-[4.4rem]";
  return (
    <h2 data-title className={`display ${size} ${className}`}>
      {children.split(" ").map((w, i) => (
        <span key={i} data-w className="inline-block whitespace-pre">
          {w}{" "}
        </span>
      ))}
    </h2>
  );
}

export function Exhibit({
  id,
  tag,
  night = false,
  first = false,
  children,
}: {
  id: string;
  tag: string;
  night?: boolean;
  first?: boolean;
  children: React.ReactNode;
}) {
  const ref = useScene<HTMLElement>((root) => {
    const title = root.querySelector("[data-title]");
    if (title) gsap.from(title.querySelectorAll("[data-w]"), { yPercent: 55, opacity: 0, duration: 0.8, ease: EASE, stagger: 0.04, scrollTrigger: { trigger: title, start: "top 86%" } });
    root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
      gsap.from(el, { y: 26, opacity: 0, duration: 0.8, ease: EASE, delay: +(el.dataset.reveal || 0), scrollTrigger: { trigger: el, start: "top 90%" } });
    });
  });
  return (
    <section ref={ref} id={id} data-exhibit className={`scroll-mt-6 font-body ${night ? "bg-night text-chalk" : "text-type"}`}>
      <div className="mx-auto max-w-[1440px] px-5 sm:px-10 lg:px-[72px]">
        <div className={`py-14 sm:py-20 lg:py-28 ${night || first ? "" : "border-t-2 border-type"}`}>
          <div className={`tag ${night ? "!text-amber" : ""}`}>{tag}</div>
          {children}
        </div>
      </div>
    </section>
  );
}

/** a small mono label above a column or a figure */
export const Step = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`eyebrow font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-soft ${className}`}>{children}</div>
);

/** The width of a box in pixels, so a chart can be drawn at one unit per pixel and its labels stay readable. */
export function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
