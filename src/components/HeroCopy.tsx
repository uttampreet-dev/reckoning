"use client";
import { useLang } from "@/lib/i18n";

/** The headline and one line under it. Nothing else: the rest of the story is further down the page. */
export function HeroCopy() {
  const { t, lang } = useLang();
  return (
    <div>
      <h1
        className={`display rise text-type ${
          lang === "hi" ? "text-[2.9rem] leading-[1.24] sm:text-[4.2rem] lg:text-[clamp(3.6rem,5.2vw,5.4rem)]" : "text-[3.5rem] font-bold leading-[0.93] sm:text-[5rem] lg:text-[clamp(4.2rem,6.6vw,6.5rem)]"
        }`}
      >
        {t.hero.title.map(([text, accent], i) =>
          accent ? (
            <em key={i} className={`text-red ${lang === "hi" ? "not-italic" : "font-semibold italic"}`}>
              {text}
            </em>
          ) : (
            <span key={i}>{text}</span>
          ),
        )}
      </h1>
      <p className="rise mt-7 text-balance font-body text-[1.45rem] leading-snug text-type [--d:140ms] sm:text-2xl">{t.hero.lead}</p>
    </div>
  );
}
