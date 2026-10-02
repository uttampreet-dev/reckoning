"use client";
// The way back to the input, and the footer.
import Link from "next/link";
import hero from "@/samples/hero.json";
import { shortDate } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import { Dock } from "../Dock";
import { Exhibit, Title } from "./kit";

export function Closing() {
  const { t, lang } = useLang();
  const L = t.landing.closing;
  return (
    <>
      <Exhibit id="bring" tag={t.nav.reckon}>
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)] items-end gap-x-20 gap-y-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <Title className="max-w-[14ch]">{L.title}</Title>
          <div data-reveal className="lg:pb-3">
            <Dock id="channel-again" />
            <p className="mt-5 font-mono text-[10.5px] uppercase leading-relaxed tracking-[0.14em] text-soft">{t.hero.promise.join(" · ")}</p>
          </div>
        </div>
      </Exhibit>

      <footer className="bg-night font-body text-chalk">
        <div className="mx-auto grid max-w-[1440px] gap-x-16 gap-y-8 px-5 py-12 sm:px-10 md:grid-cols-[minmax(0,1fr)_auto] lg:px-[72px]">
          <div>
            <div className="display text-[1.7rem] font-extrabold leading-none" lang="en">
              Reckoning
            </div>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-chalk/75">{L.foot}</p>
            <p className="mt-3 font-mono text-[11px] leading-relaxed text-chalk/50">
              {L.sources} {t.status.prices} {t.status.to} {shortDate(hero.priceDataTo, lang, true)} · {t.status.lag}
            </p>
          </div>
          <nav className="flex flex-col gap-2 text-[15px] md:items-end">
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
        </div>
      </footer>
    </>
  );
}
