"use client";
// Patterns in price and volume around the calls. Each one is shown with the calls it was measured on and the
// numbers behind it; there is no score.
import Link from "next/link";
import { useMemo } from "react";
import type { FlagKind } from "@/engine/detect";
import type { Reckoning } from "@/engine/reckon";
import { istDate, shortDate } from "@/lib/format";
import { useLang } from "@/lib/i18n";

const ORDER: FlagKind[] = ["pump-shape", "spike", "pre-run", "sme-board", "thin", "expiry-day"];
const SHOWN = 3;

export function Flags({ r }: { r: Reckoning }) {
  const { t, lang } = useLang();
  const F = t.report.flags;
  const calls = useMemo(() => new Map(r.extraction.calls.map((c) => [c.id, c])), [r]);
  // a stock called twice on one day is one example, not two
  const once = (kind: FlagKind) => {
    const seen = new Set<string>();
    return r.flags.filter((f) => {
      const c = calls.get(f.callId);
      const key = c ? `${c.symbol}|${c.strike ?? ""}|${c.optType ?? ""}|${istDate(c.ts)}` : f.callId;
      return f.kind === kind && !seen.has(key) && !!seen.add(key);
    });
  };
  const groups = ORDER.map((kind) => ({ kind, flags: once(kind) })).filter((g) => g.flags.length);

  return (
    <div className="mt-4 max-w-3xl">
      <p className="text-[17px] leading-relaxed text-type/80">
        {F.lead}{" "}
        <Link href="/case" className="border-b border-type pb-px font-medium text-type transition-colors hover:border-red hover:text-red">
          {t.caseFile.nav} →
        </Link>
      </p>
      {groups.length === 0 ? (
        <p className="mt-5 border-y border-hair py-4 text-[15px]">{F.none}</p>
      ) : (
        <div className="mt-5 border-t-[1.5px] border-type">
          {groups.map(({ kind, flags }) => (
            <div key={kind} data-flag={kind} className="grid gap-x-6 gap-y-2 border-b border-hair py-5 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
              <div>
                <div className="text-[18px] font-semibold leading-snug">{F.kinds[kind][0]}</div>
                <div className="tnum mt-1 font-mono text-[12px] font-semibold text-ochre">{F.calls(flags.length)}</div>
              </div>
              <div className="min-w-0">
                <p className="text-[15px] leading-snug text-type/80">{F.kinds[kind][1]}</p>
                <ul className="mt-3 space-y-2">
                  {flags.slice(0, SHOWN).map((f) => {
                    const c = calls.get(f.callId);
                    const o = r.outcomes[f.callId];
                    if (!c) return null;
                    return (
                      <li key={f.callId} className="border-l-2 border-ochre pl-3">
                        <div className="font-mono text-[12px] font-semibold">
                          {shortDate(istDate(c.ts), lang, true)} · {(o?.contract ?? `${c.symbol}${c.strike ? ` ${c.strike} ${c.optType}` : ""}`).split(" · ")[0]}
                        </div>
                        <div className="mt-0.5 text-[13.5px] leading-snug text-type/75" lang="en">
                          {f.evidence}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {flags.length > SHOWN && <div className="mt-2 font-mono text-[11px] text-soft">{F.more(flags.length - SHOWN)}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
