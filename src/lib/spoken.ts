// The summary the landing page reads aloud, built in one place so the recorded audio and the page say the same words.
import hero from "@/samples/hero.json";
import type { Lang } from "./i18n";
import { say } from "./say";
import { en, hi } from "./strings";

export function heroSpoken(lang: Lang): string {
  const subscribers = Math.round(parseFloat(hero.subscribers) * (/K/i.test(hero.subscribers) ? 1000 : 1));
  const w = (n: number) => say(n, lang);
  const text = (lang === "hi" ? hi : en).replay.spoken({
    subs: w(subscribers),
    start: w(hero.start),
    stake: w(hero.stake),
    end: w(hero.final),
    days: w(hero.days),
    taken: w(hero.taken),
    zero: w(hero.worthless),
    brags: w(hero.brags),
  });
  // a sentence that opens with a number written in words still opens with a capital
  return text.replace(/(^|[.!?]\s+)([a-z])/g, (_, gap: string, letter: string) => gap + letter.toUpperCase());
}
