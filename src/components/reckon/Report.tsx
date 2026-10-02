"use client";
// The reckoning of one channel: the account on a slip of ledger paper, and the evidence beside it.
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import type { Reckoning } from "@/engine/reckon";
import type { CueKind } from "@/engine/promo";
import type { Call, Outcome } from "@/engine/types";
import { istDate, percent, price, rupees, shortDate, signed } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import { PauseCard } from "../PauseCard";
import { CallChart, EquityBand } from "./charts";
import { Complaint, EvidenceSheet } from "./Complaint";
import { Flags } from "./Flags";
import { Verdict, verdictOf } from "./Verdict";
import { WhatIf } from "./WhatIf";

export function Report({ r, days }: { r: Reckoning; days: string[] }) {
  const { t, lang } = useLang();
  const R = t.report;
  const L = r.ledger;
  const date = (i?: number) => (i === undefined ? "—" : shortDate(days[Math.min(i, days.length - 1)], lang, true));
  const sections = ["ledger", "whatif", "said", "selling", "patterns", "registration", "complaint", "pause", "method"] as const;
  const navLabel = { ...R.sections, whatif: R.whatIf.nav, patterns: R.flags.nav, complaint: R.complaint.nav };
  const P = t.landing.pause;
  const k = L.record;
  const f = r.followThrough;
  // the same card the landing page shows, filled with this channel's own record
  const pauseRecord = [
    ...(k.hitRateWithTarget !== null && k.chanceHitRate !== null ? [P.hit(percent(k.hitRateWithTarget), percent(k.chanceHitRate))] : []),
    ...(f.losers > 0 ? [P.admitted(f.losers, f.losersAdmitted)] : []),
    ...(r.promotion.byKind["paywalled-levels"] > 0 ? [P.noStop] : []),
    R.recordSub(k.checked, r.extraction.calls.length),
  ];

  return (
    <>
    <EvidenceSheet r={r} days={days} />
    <div className="mx-auto grid max-w-[1440px] grid-cols-[minmax(0,1fr)] gap-8 px-5 pb-24 pt-8 font-body sm:px-10 lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-12 lg:px-[72px] lg:pt-10 print:hidden">
      <Verdict r={r} />
      <aside className="min-w-0 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto lg:pb-3 lg:pr-3">
        <Slip r={r} date={date} />
      </aside>

      <div className="min-w-0">
        <nav className="sticky top-0 z-10 -mx-5 flex gap-6 overflow-x-auto border-b-2 border-type bg-page/95 px-5 py-3 font-mono text-[11.5px] font-semibold uppercase tracking-[0.14em] text-soft backdrop-blur-sm sm:mx-0 sm:px-0">
          {sections.map((s) => (
            <a key={s} href={`#${s}`} className="shrink-0 transition-colors hover:text-red">
              {navLabel[s]}
            </a>
          ))}
        </nav>

        <section className="border-b border-type py-7">
          <EquityBand main={L.curve} best={r.ledgerBest.curve} worst={r.ledgerWorst.curve} start={L.startBalance} days={days} />
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-soft">{R.bandWhy}</p>
        </section>

        <section id="ledger" className="scroll-mt-14 border-b border-type py-10">
          <h2 className="display text-[2.1rem] font-bold leading-tight sm:text-[2.5rem]">{R.ledger}</h2>
          <LedgerTable r={r} days={days} />
        </section>

        <section id="whatif" className="scroll-mt-14 border-b border-type py-10">
          <h2 className="display text-[2.1rem] font-bold leading-tight sm:text-[2.5rem]">{R.whatIf.title}</h2>
          <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-type/80">{R.whatIf.lead}</p>
          <WhatIf r={r} days={days} />
        </section>

        <section id="said" className="scroll-mt-14 border-b border-type py-10">
          <h2 className="display text-[2.1rem] font-bold leading-tight sm:text-[2.5rem]">{R.said}</h2>
          <Said r={r} days={days} />
        </section>

        <section id="selling" className="scroll-mt-14 border-b border-type py-10">
          <h2 className="display text-[2.1rem] font-bold leading-tight sm:text-[2.5rem]">{R.selling}</h2>
          <Selling r={r} />
        </section>

        <section id="patterns" className="scroll-mt-14 border-b border-type py-10">
          <h2 className="display text-[2.1rem] font-bold leading-tight sm:text-[2.5rem]">{R.flags.title}</h2>
          <Flags r={r} />
        </section>

        <section id="registration" className="scroll-mt-14 border-b border-type py-10">
          <h2 className="display text-[2.1rem] font-bold leading-tight sm:text-[2.5rem]">{R.registration}</h2>
          <Registration r={r} />
        </section>

        <section id="complaint" className="scroll-mt-14 border-b border-type py-10">
          <h2 className="display text-[2.1rem] font-bold leading-tight sm:text-[2.5rem]">{R.complaint.title}</h2>
          <Complaint r={r} days={days} />
        </section>

        <section id="pause" className="scroll-mt-14 border-b border-type py-10">
          <h2 className="display text-[2.1rem] font-bold leading-tight sm:text-[2.5rem]">{R.pause}</h2>
          <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-type/80">{P.lead}</p>
          <PauseCard id={r.channel.handle ?? r.channel.title} record={pauseRecord} className="mt-6 max-w-[30rem]" />
        </section>

        <section id="method" className="scroll-mt-14 py-10">
          <h2 className="display text-[2.1rem] font-bold leading-tight sm:text-[2.5rem]">{R.method}</h2>
          <ol className="mt-5 max-w-3xl divide-y divide-hair border-y border-hair">
            {R.methodPoints.map((p, i) => (
              <li key={i} className="grid grid-cols-[2.5rem_1fr] gap-2 py-3.5 text-[15px] leading-relaxed text-type/90">
                <span className="font-mono text-xs font-semibold text-red">0{i + 1}</span>
                {p}
              </li>
            ))}
          </ol>
          <Link href="/method" className="mt-5 inline-flex items-center gap-2 border-[1.5px] border-type px-4 py-2 font-mono text-xs transition-colors hover:bg-type hover:text-page">
            {R.methodMore} →
          </Link>
        </section>
      </div>
    </div>
    </>
  );
}

// ---------------------------------------------------------------- the slip

function Slip({ r, date }: { r: Reckoning; date: (i?: number) => string }) {
  const { t, lang } = useLang();
  const R = t.report;
  const L = r.ledger;
  const k = L.record;
  const stake = rupees(L.params.capital * L.params.stakeFraction);
  const lost = L.finalBalance < L.startBalance;
  const best = Math.max(L.finalBalance, r.ledgerBest.finalBalance, r.ledgerWorst.finalBalance);
  const worst = Math.min(L.finalBalance, r.ledgerBest.finalBalance, r.ledgerWorst.finalBalance);
  const other = k.expired - k.expiredWorthless;
  const parts = [
    { key: "target", n: k.target, cls: "bg-green" },
    { key: "horizon", n: k.horizon + k.open, cls: "bg-faint" },
    { key: "stop", n: k.stop, cls: "bg-red/60" },
    { key: "expired", n: other, cls: "bg-red/80" },
    { key: "worthless", n: k.expiredWorthless, cls: "bg-red" },
  ] as const;

  return (
    <div className="sheet px-5 pb-6 pt-5 sm:px-6">
      <div>
        <div className="tag mb-2">{t.replay.exhibit}</div>
        <div className="display text-[1.55rem] font-bold leading-tight">{r.channel.title}</div>
        <div className="mt-1 font-mono text-[11px] leading-relaxed text-soft">
          {r.channel.subscribers && (
            <>
              {r.channel.subscribers} {t.replay.subscribers} ·{" "}
            </>
          )}
          {r.channel.messages.toLocaleString("en-IN")} {R.messages}
          {r.channel.firstTs && r.channel.lastTs && (
            <>
              <br />
              {R.period(shortDate(istDate(r.channel.firstTs), lang, true), shortDate(istDate(r.channel.lastTs), lang, true))}
            </>
          )}
        </div>

        <Label className="mt-6">{R.account}</Label>
        {verdictOf(r) === "nothing" ? (
          <div className="mt-1 text-[15px] font-semibold leading-snug">{R.verdict.noReplay}</div>
        ) : (
          <>
            <div className={`tnum mt-1 font-mono text-[1.7rem] font-semibold leading-none ${lost ? "text-red" : "text-type"}`}>
              <span className="text-type/60">{rupees(L.startBalance)} →</span> {rupees(L.finalBalance)}
            </div>
            <div className="mt-2 font-mono text-[11px] leading-relaxed text-soft">
              {R.accountRule(stake)}
              <br />
              {L.outOfMoneyDay !== undefined ? <span className="font-semibold text-red">{R.ranOut(date(L.outOfMoneyDay), L.counts.taken)}</span> : R.afterCalls(L.counts.taken)}
            </div>
            {best !== worst && (
              <div className="mt-3 border-l-2 border-ochre pl-3 font-mono text-[11px] leading-relaxed text-type/80">
                {R.band} <b className="tnum">{rupees(worst)}</b> {R.bandWorst} <b className="tnum">{rupees(best)}</b>
              </div>
            )}

          </>
        )}
        <Label className="mt-7">{R.record}</Label>
        <div className="mt-1 font-mono text-[11px] text-soft">{R.recordSub(k.checked, r.extraction.calls.length)}</div>
        {k.checked > 0 && (
          <>
            <div className="mt-3 flex h-3 overflow-hidden rounded-[2px]">
              {parts.map((p) => p.n > 0 && <span key={p.key} className={p.cls} style={{ width: `${(p.n / k.checked) * 100}%` }} />)}
            </div>
            <dl className="mt-2.5 space-y-1 font-mono text-[11.5px]">
              {parts.map(
                (p) =>
                  p.n > 0 && (
                    <div key={p.key} className="flex items-center gap-2">
                      <span className={`size-2 shrink-0 rounded-[1px] ${p.cls}`} />
                      <dt className="flex-1">{R.classes[p.key]}</dt>
                      <dd className="tnum font-semibold">{p.n}</dd>
                    </div>
                  ),
              )}
            </dl>

            {k.hitRateWithTarget !== null && k.chanceHitRate !== null && (
              <div className="mt-5">
                <Meter label={R.hitRate} value={k.hitRateWithTarget} tone={k.hitRateWithTarget < k.chanceHitRate ? "bg-red" : "bg-type"} />
                <Meter label={R.byChance} value={k.chanceHitRate} tone="bg-faint" />
                <p className="mt-2 text-[12.5px] leading-snug text-type/75">{R.byChanceWhy}</p>
              </div>
            )}

            <div className="mt-5 flex items-end justify-between gap-3 border-t border-type pt-3">
              <div>
                <div className="text-[13px] font-medium leading-tight">{R.flat}</div>
                <div className="mt-0.5 font-mono text-[10.5px] text-soft">{R.flatSub(k.checked, stake)}</div>
              </div>
              <div className={`tnum whitespace-nowrap font-mono text-lg font-semibold ${k.flatNet < 0 ? "text-red" : "text-type"}`}>{signed(k.flatNet)}</div>
            </div>
          </>
        )}

        <p className="mt-6 border-t border-type pt-3 text-[12.5px] leading-snug text-type/75">{R.paperOnly}</p>
      </div>
    </div>
  );
}

const Label = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`font-mono text-[10.5px] font-semibold uppercase tracking-[0.2em] text-soft ${className}`}>{children}</div>
);

function Meter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-2 font-mono text-[11.5px]">
      <div>
        <div>{label}</div>
        <div className="mt-1 h-1.5 bg-hair">
          <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, value * 100)}%` }} />
        </div>
      </div>
      <div className="tnum self-end text-right text-sm font-semibold">{percent(value)}</div>
    </div>
  );
}

// ---------------------------------------------------------------- the ledger

type Filter = "all" | "target" | "lost" | "doubtful" | "unchecked";

function LedgerTable({ r, days }: { r: Reckoning; days: string[] }) {
  const { t, lang } = useLang();
  const R = t.report;
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(40);
  const [open, setOpen] = useState<string | null>(null);
  const lineOf = useMemo(() => new Map(r.ledger.lines.map((l) => [l.callId, l])), [r]);

  const match = (c: Call, f: Filter) => {
    const o = r.outcomes[c.id];
    const replayed = lineOf.get(c.id)!.ifFunded !== undefined;
    if (f === "all") return true;
    if (f === "unchecked") return !replayed;
    if (f === "target") return replayed && o.cls === "target";
    if (f === "lost") return replayed && (o.move ?? 0) < 0;
    return o.firm === false;
  };
  const rows = useMemo(() => r.extraction.calls.filter((c) => match(c, filter)), [r, filter, lineOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = (f: Filter) => r.extraction.calls.filter((c) => match(c, f)).length;
  // the account after each call, in the order the calls were posted
  const running = useMemo(() => {
    const m = new Map<string, number>();
    let balance = r.ledger.startBalance;
    for (const c of r.extraction.calls) {
      const l = lineOf.get(c.id)!;
      if (l.status === "taken") {
        balance = Math.max(0, balance + (l.net ?? 0));
        m.set(c.id, balance);
      }
    }
    return m;
  }, [r, lineOf]);

  const codes: Record<string, number> = {};
  for (const o of Object.values(r.outcomes)) if (o.code) codes[o.code] = (codes[o.code] ?? 0) + 1;
  if (r.ledger.counts.lowConfidence) codes["low-confidence"] = r.ledger.counts.lowConfidence;
  const images = r.extraction.unread.filter((u) => u.why === "image-only").length;
  const unread = r.extraction.unread.length - images;

  const cols = "grid-cols-[3.4rem_minmax(0,1fr)_5.4rem] sm:grid-cols-[4.6rem_minmax(0,1.4fr)_7.4rem_minmax(0,1fr)_5.2rem_5.6rem]";
  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-2 font-mono text-[11.5px]">
        {(["all", "target", "lost", "doubtful", "unchecked"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => {
              setFilter(f);
              setLimit(40);
            }}
            className={`cursor-pointer border-[1.5px] px-2.5 py-1.5 transition-colors ${filter === f ? "border-type bg-type text-page" : "border-type/30 text-type/75 hover:border-type hover:text-type"}`}
          >
            {R.filters[f]} <span className="tnum opacity-70">{count(f)}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 border-[1.5px] border-type bg-sheet">
        <div className={`grid ${cols} gap-x-3 border-b-[1.5px] border-type px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-soft sm:px-4`}>
          <span>{R.cols.date}</span>
          <span>{R.cols.call}</span>
          <span className="hidden sm:block">{R.cols.inOut}</span>
          <span className="hidden sm:block">{R.cols.result}</span>
          <span className="text-right">{R.cols.net}</span>
          <span className="hidden text-right sm:block">{R.cols.balance}</span>
        </div>
        {rows.slice(0, limit).map((c) => {
          const o = r.outcomes[c.id];
          const l = lineOf.get(c.id)!;
          const taken = l.status === "taken";
          const replayed = l.ifFunded !== undefined;
          const worthless = o.cls === "expired" && o.exitPrice !== undefined && o.entryPrice !== undefined && o.exitPrice <= o.entryPrice * 0.05;
          const stamp = replayed
            ? worthless
              ? t.replay.stamps.zero
              : (t.replay.stamps[o.cls as keyof typeof t.replay.stamps] ?? o.cls)
            : l.status === "low-confidence"
              ? R.codes["low-confidence"].split(",")[0]
              : t.replay.stamps[l.status as "unverifiable" | "not-triggered"];
          const tone = !replayed ? "text-ochre" : (l.ifFunded ?? 0) < 0 ? "text-red" : "text-green";
          const name = (o.contract ?? `${c.symbol}${c.strike ? ` ${c.strike} ${c.optType}` : ""}`).split(" · ")[0];
          return (
            <Fragment key={c.id}>
              <button
                onClick={() => setOpen(open === c.id ? null : c.id)}
                aria-expanded={open === c.id}
                className={`grid w-full cursor-pointer ${cols} items-center gap-x-3 border-b border-hair px-3 py-2.5 text-left font-mono text-[12px] transition-colors hover:bg-page sm:px-4 ${open === c.id ? "bg-page" : ""}`}
              >
                <span className="text-soft">{shortDate(istDate(c.ts), lang)}</span>
                <span className="min-w-0">
                  <span className="block truncate text-type">{name}</span>
                  <span className={`mt-0.5 block text-[10px] uppercase tracking-wider sm:hidden ${tone}`}>{stamp}</span>
                </span>
                <span className="tnum hidden whitespace-nowrap text-type/85 sm:block">
                  {o.entryPrice !== undefined ? price(o.entryPrice) : "—"} <span className="text-soft">→</span> {o.exitPrice !== undefined ? price(o.exitPrice) : "—"}
                </span>
                <span className={`hidden text-[10.5px] uppercase tracking-wider sm:block ${tone}`}>
                  {stamp}
                  {o.firm === false && <span className="ml-1.5 normal-case tracking-normal text-ochre">· {R.depends}</span>}
                </span>
                {/* a call the account could not pay for still shows what the stake would have made, in brackets */}
                <span className={`tnum text-right ${taken ? `font-semibold ${tone}` : "text-soft"}`}>{taken ? signed(l.net!) : replayed ? `(${signed(l.ifFunded!)})` : "—"}</span>
                <span className="tnum hidden text-right text-soft sm:block">{taken ? rupees(running.get(c.id)!) : l.status === "no-funds" ? <span className="text-[10px] uppercase tracking-wider text-red">{t.replay.stamps["no-funds"]}</span> : ""}</span>
              </button>
              {open === c.id && <Detail call={c} out={o} r={r} days={days} quantity={l.quantity} lots={l.lots} costs={l.costs} />}
            </Fragment>
          );
        })}
      </div>
      {rows.length > limit && (
        <button onClick={() => setLimit((n) => n + 100)} className="mt-4 cursor-pointer border-[1.5px] border-type px-4 py-2 font-mono text-xs text-type transition-colors hover:bg-type hover:text-page">
          {R.showMore(Math.min(100, rows.length - limit))}
        </button>
      )}

      {(Object.keys(codes).length > 0 || unread > 0 || images > 0) && (
        <div className="mt-8 max-w-3xl">
          <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-ochre">{R.unchecked}</h3>
          <dl className="mt-3 divide-y divide-hair border-y border-hair font-mono text-[12.5px] text-type/85">
            {Object.entries(codes)
              .sort((a, b) => b[1] - a[1])
              .map(([code, n]) => (
                <div key={code} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3 py-2">
                  <dd className="tnum text-right font-semibold">{n}</dd>
                  <dt>{R.codes[code as keyof typeof R.codes] ?? code}</dt>
                </div>
              ))}
            {unread > 0 && (
              <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3 py-2">
                <dd className="tnum text-right font-semibold">{unread}</dd>
                <dt>{R.unread(unread).replace(/^\d+\s*/, "")}</dt>
              </div>
            )}
            {images > 0 && (
              <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3 py-2">
                <dd className="tnum text-right font-semibold">{images}</dd>
                <dt>{R.images(images).replace(/^\d+\s*/, "")}</dt>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}

function Detail({ call, out, r, days, quantity, lots, costs }: { call: Call; out: Outcome; r: Reckoning; days: string[]; quantity?: number; lots?: number; costs?: number }) {
  const { t, lang } = useLang();
  const D = t.report.detail;
  const date = (i?: number) => (i === undefined ? "—" : shortDate(days[Math.min(i, days.length - 1)], lang, true));
  const alt = (o: Outcome | undefined, label: string) =>
    o && (
      <div className="flex gap-2">
        <dt className="text-soft">{label}:</dt>
        <dd>
          {o.entryPrice !== undefined ? `${price(o.entryPrice)} → ${price(o.exitPrice!)} · ${t.replay.stamps[o.cls as keyof typeof t.replay.stamps] ?? o.cls}` : (t.report.codes[o.code as keyof typeof t.report.codes] ?? o.cls)}
        </dd>
      </div>
    );
  return (
    <div className="grid gap-6 border-b border-hair bg-page px-3 py-5 sm:px-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="min-w-0">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-soft">{D.message}</div>
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-xl rounded-bl-sm bg-night p-3.5 font-mono text-[12px] leading-relaxed text-chalk">{call.raw}</pre>
        {call.notes.length > 0 && (
          <ul className="mt-3 space-y-1 text-[13px] text-ochre">
            {call.notes.map((n, i) => (
              <li key={i}>· {n}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="min-w-0">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-soft">{D.checked}</div>
        {out.reason && <p className="mt-2 text-[14px] leading-relaxed text-type/90">{out.reason}</p>}
        {out.entryPrice !== undefined && (
          <dl className="mt-2 space-y-1 font-mono text-[12px] text-type/90">
            <div className="flex gap-2">
              <dt className="text-soft">{D.contract}:</dt>
              <dd>{out.contract}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-soft">{D.entered}:</dt>
              <dd>
                {date(out.entryDay)} · {price(out.entryPrice)} {D.basis[out.entryBasis!]}
                {quantity !== undefined && <> · {lots ? D.lots(lots, quantity) : D.shares(quantity)}</>}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-soft">{D.exited}:</dt>
              <dd>
                {date(out.exitDay)} · {price(out.exitPrice!)} {D.exitBasis[out.exitBasis!]}
                {costs !== undefined && (
                  <>
                    {" "}
                    · {D.costs} {rupees(costs)}
                  </>
                )}
              </dd>
            </div>
          </dl>
        )}
        {out.assumptions.length > 0 && (
          <ul className="mt-3 space-y-1 text-[13px] leading-snug text-soft">
            {out.assumptions.map((a, i) => (
              <li key={i}>· {a}</li>
            ))}
          </ul>
        )}
        {(r.outcomesBest[call.id] || r.outcomesWorst[call.id]) && (
          <div className="mt-3 border-l-2 border-ochre pl-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ochre">{D.other}</div>
            <dl className="mt-1 space-y-0.5 font-mono text-[12px] text-type/90">
              {alt(r.outcomesBest[call.id], D.best)}
              {alt(r.outcomesWorst[call.id], D.worst)}
            </dl>
          </div>
        )}
        <div className="mt-4">
          <CallChart call={call} out={out} days={days} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- what it said afterwards

function Said({ r, days }: { r: Reckoning; days: string[] }) {
  const { t } = useLang();
  const R = t.report;
  const f = r.followThrough;
  const calls = useMemo(() => new Map(r.extraction.calls.map((c) => [c.id, c])), [r]);
  const posts = useMemo(() => new Map(r.extraction.followUps.map((p) => [p.msgId, p])), [r]);
  const Line = ({ a, b, text, bad }: { a: number; b: number; text: string; bad: boolean }) => (
    <div className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-4 py-3.5">
      <div className="text-[15px] text-type/90">{text}</div>
      <div className="h-2 bg-hair">{b > 0 && <div className={`h-full ${bad ? "bg-red" : "bg-green"}`} style={{ width: `${(a / b) * 100}%` }} />}</div>
    </div>
  );
  const disputed = [...f.unsupported.map((d) => ({ ...d, kind: "unsupported" as const })), ...f.impossible.map((d) => ({ ...d, kind: "impossible" as const }))];
  return (
    <div className="mt-4 max-w-3xl">
      <div className="divide-y divide-hair border-y border-hair">
        {f.winners > 0 && <Line a={f.winnersAnnounced} b={f.winners} text={R.saidWinners(f.winnersAnnounced, f.winners)} bad={false} />}
        {f.losers > 0 && <Line a={f.losersMentioned} b={f.losers} text={R.saidLosers(f.losersMentioned, f.losers)} bad />}
        {f.losers > 0 && <div className={`py-3.5 text-[15px] ${f.losersAdmitted === 0 ? "text-red" : "text-type/90"}`}>{R.saidAdmitted(f.losersAdmitted)}</div>}
        {r.claimedAccuracy !== undefined && <div className="py-3.5 text-[15px] text-type/90">{R.saidClaim(r.claimedAccuracy)}</div>}
        {f.unsupported.length > 0 && <div className="py-3.5 text-[15px] text-red">{R.saidUnsupported(f.unsupported.length)}</div>}
        {f.impossible.length > 0 && <div className="py-3.5 text-[15px] text-red">{R.saidImpossible(f.impossible.length)}</div>}
      </div>
      {disputed.slice(0, 6).map((d) => {
        const call = calls.get(d.callId);
        const post = posts.get(d.msgId);
        const out = r.outcomes[d.callId];
        if (!call || !post) return null;
        return (
          <div key={`${d.kind}-${d.msgId}`} className="mt-4 grid gap-3 border border-hair bg-sheet p-4 sm:grid-cols-2">
            <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-type/85">{post.raw.slice(0, 220)}</pre>
            <dl className="space-y-1 font-mono text-[12px]">
              <div className="text-soft">{out.contract}</div>
              <div className="flex justify-between gap-3">
                <dt className="text-soft">{R.claimed}</dt>
                <dd className="tnum text-red">{price(d.claimed)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-soft">{R.reached}</dt>
                <dd className="tnum text-type">{price(d.reached)}</dd>
              </div>
              <div className="text-soft">{days[out.entryDay ?? 0]}</div>
            </dl>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- selling

function Selling({ r }: { r: Reckoning }) {
  const { t } = useLang();
  const R = t.report;
  const p = r.promotion;
  const kinds = (Object.entries(p.byKind) as [CueKind, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const top = Math.max(1, ...kinds.map(([, n]) => n));
  return (
    <div className="mt-4 max-w-3xl">
      <p className="text-lg text-type/90">{R.sellingSub(p.sellingMessages, p.textMessages)}</p>
      <div className="mt-4 divide-y divide-hair border-y border-hair">
        {kinds.map(([kind, n]) => {
          const example = p.cues.find((c) => c.kind === kind)?.match;
          return (
            <div key={kind} className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-x-4 py-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_3rem]">
              <div className="min-w-0">
                <div className="text-[15px] text-type/90">{R.cues[kind]}</div>
                {example && <div className="mt-0.5 truncate font-mono text-[11px] text-soft">“{example.toLowerCase()}”</div>}
              </div>
              <div className="hidden h-2 bg-hair sm:block">
                <div className="h-full bg-ochre" style={{ width: `${(n / top) * 100}%` }} />
              </div>
              <div className="tnum text-right font-mono text-sm font-semibold">{n}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- registration

function Registration({ r }: { r: Reckoning }) {
  const { t, lang } = useLang();
  const R = t.report;
  const reg = r.registration;
  const registered = reg.claimed.some((c) => c.onRegister);
  return (
    <div className="mt-4 max-w-3xl space-y-3 text-[15px] leading-relaxed">
      {reg.claimed.length === 0 && <p className="text-type/90">{R.regNone}</p>}
      {reg.claimed.map((c) => (
        <div key={c.regNo} className={`border-l-2 pl-4 ${c.onRegister ? "border-green" : "border-red"}`}>
          <p className={c.onRegister ? "text-type" : "text-red"}>{c.onRegister ? R.regOn(c.regNo, c.registeredName ?? "") : R.regOff(c.regNo)}</p>
          {c.onRegister && <p className="mt-1 text-sm text-soft">{R.regOnWarn}</p>}
        </div>
      ))}
      <p className="border-t border-hair pt-3 text-sm text-soft">{registered ? R.routeReg : R.routeUnreg}</p>
      {reg.registerAsOf && <p className="font-mono text-[11px] text-soft">{R.regAsOf(shortDate(reg.registerAsOf, lang, true))}</p>}
    </div>
  );
}
