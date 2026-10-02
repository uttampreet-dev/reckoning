"use client";
// What a person needs to report the channel: a draft to edit and send, the call list as a file, and an evidence
// sheet that prints. Nothing is sent from here.
import { useMemo, useState } from "react";
import type { CueKind } from "@/engine/promo";
import type { Reckoning } from "@/engine/reckon";
import { callsCsv, complaintDraft, disputedPosts, isRegistered } from "@/lib/complaint";
import { istDate, percent, price, shortDate } from "@/lib/format";
import { useLang } from "@/lib/i18n";

const ROUTES = {
  mi: ["mi.sebi.gov.in", "https://mi.sebi.gov.in/"],
  cyber: ["cybercrime.gov.in", "https://cybercrime.gov.in/"],
  scores: ["scores.sebi.gov.in", "https://scores.sebi.gov.in/"],
} as const;

export function Complaint({ r, days }: { r: Reckoning; days: string[] }) {
  const { t } = useLang();
  const C = t.report.complaint;
  const registered = isRegistered(r);
  const initial = useMemo(() => complaintDraft(r, days), [r, days]);
  const [draft, setDraft] = useState(initial);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked: the text is on screen and can be selected by hand
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob(["﻿" + callsCsv(r, days)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(r.channel.handle ?? r.channel.title).replace(/[^\w-]+/g, "-").toLowerCase()}-calls.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const button = "cursor-pointer border-[1.5px] border-type px-4 py-2.5 text-[15px] font-semibold transition-colors hover:bg-type hover:text-page";
  const routes = registered ? [ROUTES.scores, ROUTES.mi] : [ROUTES.mi, ROUTES.cyber];
  return (
    <div className="mt-4 max-w-3xl">
      <p className="text-[17px] leading-relaxed text-type/80">{registered ? C.leadReg : C.leadUnreg}</p>
      <label htmlFor="complaint-draft" className="eyebrow mt-6 block font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-soft">
        {C.draftNote}
      </label>
      <textarea
        id="complaint-draft"
        lang="en"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={16}
        spellCheck={false}
        className="mt-2 w-full resize-y border-[1.5px] border-type bg-sheet p-4 font-mono text-[12.5px] leading-relaxed text-type outline-none focus:border-red"
      />
      <div className="mt-3 flex flex-wrap gap-2.5">
        <button onClick={copy} className="cursor-pointer bg-type px-4 py-2.5 text-[15px] font-semibold text-page transition-colors hover:bg-red">
          {copied ? C.copied : C.copy}
        </button>
        <button onClick={download} className={button}>
          {C.csv}
        </button>
        <button onClick={() => window.print()} className={button}>
          {C.print}
        </button>
      </div>
      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
        {routes.map(([site, href]) => (
          <a key={site} href={href} target="_blank" rel="noreferrer" className="border-b border-type pb-px font-medium transition-colors hover:border-red hover:text-red">
            {C.open(site)} ↗
          </a>
        ))}
      </div>
      <p className="mt-4 font-mono text-[10.5px] leading-relaxed text-soft">{C.note}</p>
    </div>
  );
}

/** The printed page: the report's findings as one plain document. Hidden on screen. */
export function EvidenceSheet({ r, days }: { r: Reckoning; days: string[] }) {
  const { t, lang } = useLang();
  const R = t.report;
  const C = R.complaint;
  const k = r.ledger.record;
  const p = r.promotion;
  const reg = r.registration;
  const disputed = useMemo(() => disputedPosts(r, days), [r, days]);
  const lineOf = useMemo(() => new Map(r.ledger.lines.map((l) => [l.callId, l])), [r]);
  const kinds = (Object.entries(p.byKind) as [CueKind, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const date = (i?: number) => (i === undefined ? "—" : shortDate(days[Math.min(i, days.length - 1)], lang, true));
  const today = new Date().toISOString().slice(0, 10);
  const H = ({ children }: { children: React.ReactNode }) => <h2 className="mb-1.5 mt-5 border-b border-black pb-1 text-[13px] font-bold uppercase tracking-wide">{children}</h2>;

  return (
    <div data-evidence className="hidden bg-white p-0 font-body text-[11px] leading-snug text-black print:block">
      <div className="flex items-baseline justify-between border-b-2 border-black pb-2">
        <h1 className="text-[20px] font-bold">
          {C.sheet}: {r.channel.title}
        </h1>
        <div className="font-mono text-[10px]">Reckoning</div>
      </div>
      <p className="mt-2">
        {r.channel.handle && <>t.me/{r.channel.handle} · </>}
        {r.channel.subscribers && (
          <>
            {r.channel.subscribers} {t.replay.subscribers} ·{" "}
          </>
        )}
        {r.channel.messages.toLocaleString("en-IN")} {R.messages}
        {r.channel.firstTs && r.channel.lastTs && <> · {R.period(shortDate(istDate(r.channel.firstTs), lang, true), shortDate(istDate(r.channel.lastTs), lang, true))}</>}
      </p>
      <p className="mt-1 text-[10px]">{C.generated(shortDate(today, lang, true))}</p>

      <H>{R.record}</H>
      <p>{R.recordSub(k.checked, r.extraction.calls.length)}.</p>
      <p>
        {R.classes.target}: {k.target} · {R.classes.stop}: {k.stop} · {R.classes.expired}: {k.expired - k.expiredWorthless} · {R.classes.worthless}: {k.expiredWorthless} · {R.classes.horizon}: {k.horizon + k.open}
      </p>
      {k.hitRateWithTarget !== null && k.chanceHitRate !== null && (
        <p>
          {R.hitRate}: {percent(k.hitRateWithTarget)} · {R.byChance}: {percent(k.chanceHitRate)}
        </p>
      )}

      <H>{R.registration}</H>
      {reg.claimed.length === 0 && <p>{R.regNone}</p>}
      {reg.claimed.map((c) => (
        <p key={c.regNo}>{c.onRegister ? R.regOn(c.regNo, c.registeredName ?? "") : R.regOff(c.regNo)}</p>
      ))}
      {reg.registerAsOf && <p className="text-[10px]">{R.regAsOf(shortDate(reg.registerAsOf, lang, true))}</p>}

      <H>{R.said}</H>
      {r.followThrough.winners > 0 && <p>{R.saidWinners(r.followThrough.winnersAnnounced, r.followThrough.winners)}.</p>}
      {r.followThrough.losers > 0 && <p>{R.saidLosers(r.followThrough.losersMentioned, r.followThrough.losers)}.</p>}
      {r.followThrough.losers > 0 && <p>{R.saidAdmitted(r.followThrough.losersAdmitted)}.</p>}
      {disputed.length > 0 && (
        <table className="mt-2 w-full border-collapse text-left font-mono text-[9.5px]">
          <thead>
            <tr className="border-b border-black">
              <th className="py-1 pr-2">{R.cols.date}</th>
              <th className="py-1 pr-2">{t.replay.cols.contract}</th>
              <th className="py-1 pr-2 text-right">{R.claimed}</th>
              <th className="py-1 pr-2 text-right">{R.reached}</th>
              <th className="py-1">{R.detail.message}</th>
            </tr>
          </thead>
          <tbody>
            {disputed.map((d, i) => (
              <tr key={i} className="border-b border-neutral-300 align-top">
                <td className="whitespace-nowrap py-1 pr-2">
                  {shortDate(d.date, lang, true)} {d.time}
                </td>
                <td className="py-1 pr-2">{d.contract}</td>
                <td className="py-1 pr-2 text-right">{price(d.claimed)}</td>
                <td className="py-1 pr-2 text-right">{price(d.reached)}</td>
                <td className="py-1">{d.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {kinds.length > 0 && (
        <>
          <H>{R.selling}</H>
          <p>{R.sellingSub(p.sellingMessages, p.textMessages)}.</p>
          {kinds.map(([kind, n]) => (
            <p key={kind}>
              {R.cues[kind]}: {n}
            </p>
          ))}
        </>
      )}

      <H>{R.ledger}</H>
      <table className="w-full border-collapse text-left font-mono text-[9px]">
        <thead>
          <tr className="border-b border-black">
            <th className="py-1 pr-2">{R.cols.date}</th>
            <th className="py-1 pr-2">{R.cols.call}</th>
            <th className="py-1 pr-2">{R.detail.entered}</th>
            <th className="py-1 pr-2">{R.detail.exited}</th>
            <th className="py-1">{R.cols.result}</th>
          </tr>
        </thead>
        <tbody>
          {r.extraction.calls.map((c) => {
            const o = r.outcomes[c.id];
            const replayed = lineOf.get(c.id)?.ifFunded !== undefined;
            const worthless = o.cls === "expired" && o.exitPrice !== undefined && o.entryPrice !== undefined && o.exitPrice <= o.entryPrice * 0.05;
            const result = replayed ? (worthless ? t.replay.stamps.zero : (t.replay.stamps[o.cls as keyof typeof t.replay.stamps] ?? o.cls)) : (R.codes[o.code as keyof typeof R.codes] ?? t.replay.stamps.unverifiable);
            return (
              <tr key={c.id} className="break-inside-avoid border-b border-neutral-300 align-top">
                <td className="whitespace-nowrap py-0.5 pr-2">{shortDate(istDate(c.ts), lang, true)}</td>
                <td className="py-0.5 pr-2">{(o.contract ?? `${c.symbol}${c.strike ? ` ${c.strike} ${c.optType}` : ""}`).split(" · ")[0]}</td>
                <td className="whitespace-nowrap py-0.5 pr-2">{o.entryPrice !== undefined ? `${date(o.entryDay)} · ${price(o.entryPrice)}` : "—"}</td>
                <td className="whitespace-nowrap py-0.5 pr-2">{o.exitPrice !== undefined ? `${date(o.exitDay)} · ${price(o.exitPrice)}` : "—"}</td>
                <td className="py-0.5">
                  {result}
                  {o.firm === false && ` (${R.depends})`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-[10px]">{R.paperOnly}</p>
    </div>
  );
}
