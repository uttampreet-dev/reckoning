"use client";
import { useLang } from "@/lib/i18n";

/** the line under the replay that says the page goes on */
export function ScrollCue() {
  const { t } = useLang();
  return (
    <a href="#one-call" className="group mt-6 flex items-center gap-3 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-soft transition-colors hover:text-red lg:col-span-2 lg:mt-10">
      <span aria-hidden className="h-px w-10 bg-current transition-all group-hover:w-16" />
      {t.landing.scroll}
      <span aria-hidden className="cue-drop">
        ↓
      </span>
    </a>
  );
}
