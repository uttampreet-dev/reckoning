"use client";
// What the replayed week added up to, under the input. It is part of the page from the first paint: the replay
// beside it shows how the week went, this says what it came to.
import Link from "next/link";
import hero from "@/samples/hero.json";
import voice from "@/samples/voice.json";
import { rupees, shortDate } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import { heroSpoken } from "@/lib/spoken";
import { ListenButton } from "./ListenButton";

/** asks the replay beside this block to run again */
export const REPLAY_AGAIN = "reckoning:replay";

export function ReplaySummary() {
  const { t, lang } = useLang();
  return (
    <div className="rise font-body [--d:260ms]">
      <p className="max-w-2xl text-[15.5px] leading-relaxed text-type">
        {t.replay.summary(hero.taken, hero.worthless, hero.brags, hero.lossPosts)} <span className="font-semibold text-red">{t.replay.slPaid}</span>
      </p>
      {hero.doubtful > 0 && <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-soft">{t.replay.range(hero.doubtful, rupees(hero.finalLow), rupees(hero.finalHigh))}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 text-[15px]">
        <Link href={`/reckon?sample=${hero.sample}`} className="group flex items-center gap-2 bg-type px-5 py-2.5 font-semibold text-page transition-colors hover:bg-red">
          {t.replay.full}
          <span className="transition-transform group-hover:translate-x-1">→</span>
        </Link>
        <ListenButton text={heroSpoken(t, lang)} recorded={(voice as Record<string, { text: string; src: string }>)[lang]} />
        <button onClick={() => window.dispatchEvent(new Event(REPLAY_AGAIN))} className="cursor-pointer border-b border-type pb-px text-type transition-colors hover:border-red hover:text-red">
          ↻ {t.replay.again}
        </button>
      </div>
      <p className="mt-4 font-mono text-[10.5px] leading-relaxed text-soft">
        {t.replay.sample} · {t.replay.source(shortDate(hero.priceDataTo, lang, true))}
      </p>
    </div>
  );
}
