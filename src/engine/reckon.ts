// The whole reckoning of one channel: read the messages, replay every call, add up the account,
// and collect the evidence around it. Runs the same in a browser worker and in Node.
import type { Market } from "../data/market";
import { detectFlags, followThrough, type Flag, type FollowThrough } from "./detect";
import { extract, type Extraction } from "./extract";
import { buildLedger, DEFAULT_PARAMS, type Ledger, type LedgerParams } from "./ledger";
import { scanPromotion, type PromoReport } from "./promo";
import { checkRegistration, type Register, type RegistrationReport } from "./registration";
import { resolveAndReplay } from "./resolve";
import { Dictionary } from "./symbols";
import type { Channel, Outcome } from "./types";

export interface Reckoning {
  channel: {
    source: Channel["source"];
    title: string;
    handle?: string;
    subscribers?: string;
    description?: string;
    messages: number;
    firstTs?: string;
    lastTs?: string;
  };
  coverage: { from: string; to: string; lagDays: number };
  extraction: Extraction;
  /** results under the likely reading: the headline */
  outcomes: Record<string, Outcome>;
  /** results under the best and worst readings, only for calls where they differ from the likely one */
  outcomesBest: Record<string, Outcome>;
  outcomesWorst: Record<string, Outcome>;
  /** the account under the likely reading, and the two bounds it cannot fall outside of */
  ledger: Ledger;
  ledgerBest: Ledger;
  ledgerWorst: Ledger;
  flags: Flag[];
  followThrough: FollowThrough;
  promotion: PromoReport;
  registration: RegistrationReport;
  /** highest accuracy the channel claimed in its own messages */
  claimedAccuracy?: number;
}

const dictionaries = new WeakMap<Market, Dictionary>();
export function dictionaryOf(market: Market) {
  let d = dictionaries.get(market);
  if (!d) dictionaries.set(market, (d = new Dictionary(market.symbols, market.fo)));
  return d;
}

export async function reckon(
  channel: Channel,
  market: Market,
  register: Register | null,
  params: LedgerParams = DEFAULT_PARAMS,
  onProgress?: (done: number, total: number, outcome: Outcome) => void,
): Promise<Reckoning> {
  const extraction = extract(channel.messages, dictionaryOf(market), market.days);
  // A call counts as announced when a later post says its target was hit, or quotes a price at or past the first target.
  const callById = new Map(extraction.calls.map((c) => [c.id, c]));
  const announced = new Set<string>();
  for (const f of extraction.followUps) {
    const call = f.callId ? callById.get(f.callId) : undefined;
    if (!call) continue;
    const t1 = call.targets[0];
    const past = f.quoted !== undefined && t1 !== undefined && (call.side === "long" ? f.quoted >= t1 * 0.99 : f.quoted <= t1 * 1.01);
    if (past || (f.claimsTarget && f.quoted === undefined)) announced.add(call.id);
  }
  const outcomes = new Map<string, Outcome>();
  const best = new Map<string, Outcome>();
  const worst = new Map<string, Outcome>();
  const same = (a: Outcome, b: Outcome) => a.cls === b.cls && a.exitPrice === b.exitPrice && a.entryPrice === b.entryPrice && a.exitDay === b.exitDay;
  let done = 0;
  for (const call of extraction.calls) {
    const likely = await resolveAndReplay(call, market, "likely", announced.has(call.id));
    const hi = await resolveAndReplay(call, market, "best");
    const lo = await resolveAndReplay(call, market, "worst");
    if (hi.entryPrice !== undefined || lo.entryPrice !== undefined) likely.firm = same(hi, lo);
    outcomes.set(call.id, likely);
    best.set(call.id, hi);
    worst.set(call.id, lo);
    onProgress?.(++done, extraction.calls.length, likely);
  }
  const differing = (m: Map<string, Outcome>) => Object.fromEntries([...m].filter(([id, o]) => !same(o, outcomes.get(id)!)));
  const times = channel.messages.map((m) => m.ts).sort();
  return {
    channel: {
      source: channel.source,
      title: channel.title,
      handle: channel.handle,
      subscribers: channel.subscribers,
      description: channel.description,
      messages: channel.messages.length,
      firstTs: times[0],
      lastTs: times.at(-1),
    },
    coverage: { from: market.meta.from, to: market.meta.to, lagDays: market.meta.lagDays },
    extraction,
    outcomes: Object.fromEntries(outcomes),
    outcomesBest: differing(best),
    outcomesWorst: differing(worst),
    ledger: buildLedger(extraction.calls, outcomes, params),
    ledgerBest: buildLedger(extraction.calls, best, params),
    ledgerWorst: buildLedger(extraction.calls, worst, params),
    flags: await detectFlags(extraction.calls, outcomes, market),
    followThrough: await followThrough(extraction.calls, outcomes, extraction.followUps, market),
    promotion: scanPromotion(channel.messages),
    registration: checkRegistration(channel, register),
    claimedAccuracy: extraction.claims.length ? Math.max(...extraction.claims.map((c) => c.percent)) : undefined,
  };
}
