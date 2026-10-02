"use client";
import Link from "next/link";
import hero from "@/samples/hero.json";
import { shortDate } from "@/lib/format";
import { LANGS, useLang, type Lang } from "@/lib/i18n";

/** The top of every page: name, three links, how fresh the prices are, and the language switch. */
export function Masthead() {
  const { t, lang, setLang } = useLang();
  return (
    <header className="mx-auto max-w-[1440px] px-5 font-body sm:px-10 lg:px-[72px] print:hidden">
      <div className="flex items-center gap-8 border-b-2 border-type pb-4 pt-5">
        <Link href="/" className="display text-[1.7rem] font-extrabold leading-none text-type" lang="en">
          Reckoning
        </Link>
        <nav className="hidden items-center gap-8 text-[15px] text-type md:flex">
          <Link href="/reckon" className="underline-offset-4 hover:underline">
            {t.nav.reckon}
          </Link>
          <Link href="/method" className="underline-offset-4 hover:underline">
            {t.nav.method}
          </Link>
          <Link href="/case" className="underline-offset-4 hover:underline">
            {t.caseFile.nav}
          </Link>
        </nav>
        <div className="ml-auto hidden font-mono text-[11.5px] text-soft xl:block">
          {t.status.prices} NSE · BSE {t.status.to} {shortDate(hero.priceDataTo, lang, true)} · {t.status.lag}
        </div>
        <label className="relative ml-auto xl:ml-0">
          <span className="sr-only">{t.nav.language}</span>
          {/* the phone's own picker: every language written in its own script */}
          <select
            id="language"
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
            // the list names eight scripts; the phone's own fonts draw them, so no script's web font is fetched until it is chosen
            style={{ fontFamily: "system-ui, sans-serif" }}
            className="cursor-pointer appearance-none border-[1.5px] border-type bg-page py-1.5 pl-3.5 pr-9 text-[15px] text-type transition-colors hover:bg-sheet focus:outline-2 focus:outline-red"
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code} lang={l.code}>
                {l.name}
              </option>
            ))}
          </select>
          <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-type">
            ▾
          </span>
        </label>
      </div>
      <div className="eyebrow flex items-center justify-between gap-6 border-b border-type py-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-soft">
        <span>{t.hero.eyebrow}</span>
        <span className="hidden lg:block">{t.hero.promise.join(" · ")}</span>
      </div>
    </header>
  );
}
