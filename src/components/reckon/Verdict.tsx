"use client";
// The report's answer in a few plain sentences, before any table: what the money did, how the calls compare with
// chance, what the messages hold back, and whether the sender is registered. The same sentences can be read aloud.
// A channel that comes out ahead on paper gets no praise: the page says why that figure is not a reason to pay.
import type { Reckoning } from "@/engine/reckon";
import { percent, rupees } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import { say } from "@/lib/say";
import { ListenButton } from "../ListenButton";

type State = "behind" | "ahead" | "nothing";

export function verdictOf(r: Reckoning): State {
  const L = r.ledger;
  if (L.counts.taken === 0) return "nothing";
  return L.finalBalance > L.startBalance ? "ahead" : "behind";
}

export function Verdict({ r }: { r: Reckoning }) {
  const { t, lang } = useLang();
  const V = t.report.verdict;
  const L = r.ledger;
  const k = L.record;
  const f = r.followThrough;
  const state = verdictOf(r);
  const calls = r.extraction.calls;
  const ends = [L.finalBalance, r.ledgerBest.finalBalance, r.ledgerWorst.finalBalance];
  const lo = Math.min(...ends), hi = Math.max(...ends);
  const disputed = f.unsupported.length + f.impossible.length;
  const paywalled = r.promotion.byKind["paywalled-levels"] ?? 0;
  const noStop = calls.filter((c) => c.stop === undefined).length;
  const derivatives = calls.some((c) => c.kind !== "equity");
  const codes = Object.values(r.outcomes).map((o) => o.code);
  // the channel's own words of promise, as written
  const promised = [...new Set(r.promotion.cues.filter((c) => c.kind === "guarantee").map((c) => c.match.toLowerCase().trim()))].slice(0, 2);
  const tooRecent = codes.filter((c) => c === "too-recent").length >= codes.length / 2;

  // every sentence is built twice: with figures for the eye, and with the numbers written out for the voice
  const build = (spoken: boolean) => {
    const n = (v: number) => (spoken ? say(Math.round(v), lang) : Math.round(v).toLocaleString("en-IN"));
    const money = (v: number) => (spoken ? `${say(Math.round(v), lang)} ${V.rupees}` : rupees(v));
    const pct = (v: number) => (spoken ? `${say(Math.round(v * 100), lang)} ${V.percent}` : percent(v));
    const head = state === "behind" ? V.headBehind(money(L.startBalance), money(L.finalBalance)) : state === "ahead" ? V.headAhead : V.headNothing;
    const lines: string[] = [];
    if (state === "behind") {
      lines.push(V.stake(money(L.params.capital * L.params.stakeFraction)));
      if (L.outOfMoneyDay !== undefined) lines.push(V.broke(n(L.counts.taken)));
    }
    if (state === "ahead") {
      lines.push(`${V.aheadFigure(money(L.startBalance), money(L.finalBalance))} ${V.paper}`);
      if (Math.round(lo) !== Math.round(hi)) lines.push(V.range(money(lo), money(hi)));
    }
    if (state === "nothing") lines.push(tooRecent ? V.tooRecent : V.cannot);
    if (k.hitRateWithTarget !== null && k.chanceHitRate !== null) lines.push(V.hit(pct(k.hitRateWithTarget), pct(k.chanceHitRate)));
    if (paywalled > 0) lines.push(V.paywalled(n(Math.min(paywalled, calls.length)), Math.min(paywalled, calls.length) <= 1));
    else if (calls.length > 0 && noStop > 0) lines.push(V.noStop(n(noStop), n(calls.length)));
    if (f.losers > 0) lines.push(V.admitted(n(f.losers), n(f.losersAdmitted)));
    if (disputed > 0) lines.push(V.unsupported(n(disputed)));
    if (promised.length) lines.push(V.promise(promised.map((w) => `"${w}"`).join(", ")));
    if (r.promotion.sellingMessages > 0 && r.promotion.textMessages >= 5) lines.push(V.selling(n(r.promotion.sellingMessages), n(r.promotion.textMessages)));
    const claimed = r.registration.claimed;
    lines.push(claimed.length === 0 ? V.regNone : claimed.some((c) => c.onRegister) ? V.regOn : V.regOff);
    if (state === "ahead" && derivatives) lines.push(V.fno);
    return { head, lines };
  };
  const shown = build(false);
  const voiced = build(true);
  const tone = state === "behind" ? "text-red" : state === "ahead" ? "text-ochre" : "text-type";

  return (
    <section data-verdict={state} className="grid grid-cols-[minmax(0,1fr)] gap-x-12 gap-y-6 border-b-2 border-type pb-8 lg:col-span-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div>
        <div className="tag">{V.tag}</div>
        <h1 className={`display mt-3 text-[2.5rem] font-bold leading-[1.02] sm:text-[3.3rem] ${tone}`}>{shown.head}</h1>
        <div className="mt-5">
          <ListenButton text={[voiced.head, ...voiced.lines, V.next].join(" ")} />
        </div>
      </div>
      <div>
        <ul className="border-t-[1.5px] border-type">
          {shown.lines.map((line, i) => (
            <li key={i} className="grid grid-cols-[2.2rem_minmax(0,1fr)] items-baseline border-b border-hair py-3 text-[18px] leading-snug">
              <span className="font-mono text-[11px] font-semibold text-red">{String(i + 1).padStart(2, "0")}</span>
              {line}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[15px] leading-snug text-soft">{V.next}</p>
      </div>
    </section>
  );
}
