// Pattern checks around each call. Every flag carries the numbers it was raised on; there is no composite score.
import type { Market } from "../data/market";
import { inCallTerms, seriesOf } from "./resolve";
import { lowerBound, placeMessage, toIst } from "./time";
import type { Bar, Call, FollowUp, Outcome } from "./types";

export type FlagKind =
  | "pump-shape" // jumps on heavy volume right after the call, then gives it back
  | "spike" // heavy-volume jump after the call, no reversal (yet) in the window
  | "pre-run" // price and volume had already jumped in the days before the call
  | "sme-board" // listed on the SME platform
  | "thin" // very little money changes hands in it on a normal day
  | "expiry-day"; // an option bought on its expiry day

export interface Flag {
  kind: FlagKind;
  callId: string;
  /** one sentence with the measured numbers */
  evidence: string;
  /** values behind the sentence, for the mini chart */
  stats?: Record<string, number>;
}

export const THRESHOLDS = {
  /** rise over the previous close within two trading days of the call */
  spikeGain: 0.08,
  /** volume against the median of the 20 trading days before the call */
  spikeVolume: 3,
  /** fall from the post-call peak within ten trading days */
  dumpFall: 0.15,
  /** rise over the five trading days before the call */
  preRunGain: 0.1,
  preRunVolume: 3,
  /** median daily turnover below which a stock counts as thinly traded, in rupees */
  thinTurnover: 2_500_000,
};

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const times = (x: number) => `${x >= 10 ? Math.round(x) : x.toFixed(1)}×`;

/** Shape of price and volume around day `day` for one stock. Exported so it can be measured on known cases. */
export function shapeAround(bars: Bar[], day: number) {
  const i0 = bars.findIndex((b) => b.d >= day);
  // "normal" volume needs a month of trading before the day to mean anything
  if (i0 < 21) return null;
  const base = bars.slice(Math.max(0, i0 - 25), i0 - 5);
  const baseVolume = median(base.map((b) => b.v));
  const before = bars[i0 - 1];
  const fiveAgo = bars[i0 - 6];
  const preGain = before.c / fiveAgo.c - 1;
  const preVolume = baseVolume ? Math.max(...bars.slice(i0 - 5, i0).map((b) => b.v)) / baseVolume : 0;

  const recent = median(bars.slice(Math.max(0, i0 - 20), i0).map((b) => b.v));
  const after = bars.slice(i0, i0 + 3);
  const postGain = Math.max(...after.map((b) => b.c)) / before.c - 1;
  const postVolume = recent ? Math.max(...after.map((b) => b.v)) / recent : 0;

  const window = bars.slice(i0, i0 + 6);
  let peakIdx = i0;
  window.forEach((b, k) => {
    if (b.h > bars[peakIdx].h) peakIdx = i0 + k;
  });
  const peak = bars[peakIdx].h;
  const later = bars.slice(peakIdx + 1, peakIdx + 11);
  const trough = later.length ? Math.min(...later.map((b) => b.c)) : peak;
  const fall = 1 - trough / peak;
  const fallDays = later.length ? later.findIndex((b) => b.c === trough) + 1 : 0;
  const turnover = median(bars.slice(Math.max(0, i0 - 20), i0).map((b) => b.v * b.c));
  return { preGain, preVolume, postGain, postVolume, fall, fallDays, turnover, complete: later.length >= 5 };
}

export async function detectFlags(calls: Call[], outcomes: Map<string, Outcome>, market: Market): Promise<Flag[]> {
  const flags: Flag[] = [];
  const T = THRESHOLDS;
  for (const call of calls) {
    const placed = placeMessage(call.ts, market.days);
    if (!placed) continue;
    const out = outcomes.get(call.id);

    if (call.kind === "option" && out?.entryDay !== undefined && out.expiry === market.days[out.entryDay]) {
      flags.push({
        kind: "expiry-day",
        callId: call.id,
        evidence:
          out.exitBasis === "settlement" && out.exitPrice === 0
            ? "Bought on the contract's last day; it expired at zero."
            : "Bought on the contract's last day, when an option can lose its whole value within hours.",
      });
    }
    if (call.kind !== "equity") continue;
    const info = market.symbols[call.symbol];
    const raw = info ? await market.cash(call.symbol) : null;
    if (!info || !raw) continue;

    if (info.m || info.r === "SM" || info.r === "ST") {
      flags.push({ kind: "sme-board", callId: call.id, evidence: `${call.symbol} is listed on the SME platform, where a small amount of buying moves the price.` });
    }
    const shape = shapeAround(inCallTerms(raw, info.x, placed.day).bars, placed.day);
    if (!shape) continue;

    if (shape.turnover > 0 && shape.turnover < T.thinTurnover) {
      flags.push({
        kind: "thin",
        callId: call.id,
        evidence: `About ₹${Math.round(shape.turnover / 1e5).toLocaleString("en-IN")} lakh of ${call.symbol} changed hands on a normal day before the call.`,
        stats: { turnover: shape.turnover },
      });
    }
    if (shape.preGain >= T.preRunGain && shape.preVolume >= T.preRunVolume) {
      flags.push({
        kind: "pre-run",
        callId: call.id,
        evidence: `In the five trading days before the call the price was already up ${pct(shape.preGain)} on ${times(shape.preVolume)} normal volume.`,
        stats: { gain: shape.preGain, volume: shape.preVolume },
      });
    }
    if (shape.postGain >= T.spikeGain && shape.postVolume >= T.spikeVolume) {
      if (shape.fall >= T.dumpFall) {
        flags.push({
          kind: "pump-shape",
          callId: call.id,
          evidence: `Up ${pct(shape.postGain)} within two days of the call on ${times(shape.postVolume)} normal volume, then down ${pct(shape.fall)} from the peak within ${shape.fallDays} trading days.`,
          stats: { gain: shape.postGain, volume: shape.postVolume, fall: shape.fall, fallDays: shape.fallDays },
        });
      } else {
        flags.push({
          kind: "spike",
          callId: call.id,
          evidence: `Up ${pct(shape.postGain)} within two days of the call on ${times(shape.postVolume)} normal volume.`,
          stats: { gain: shape.postGain, volume: shape.postVolume },
        });
      }
    }
  }
  return flags;
}

// ---------------------------------------------------------------- what the channel said afterwards

export interface DisputedPost {
  callId: string;
  msgId: number;
  /** the level the post relies on: the first target, or the price it quotes */
  claimed: number;
  /** the furthest the contract actually traded in the call's favour between the call and the post */
  reached: number;
}

export interface FollowThrough {
  /** calls that made money on the best reading, and how many of those got a result post */
  winners: number;
  winnersAnnounced: number;
  /** calls that lost money on the best reading, and how many of those were ever mentioned again */
  losers: number;
  losersMentioned: number;
  /** of the losers mentioned again, how many posts admit the stop-loss or the loss */
  losersAdmitted: number;
  /** losing calls with no later message at all */
  silentLosses: string[];
  /** posts that say a target was hit although the target price had not traded by then */
  unsupported: DisputedPost[];
  /** posts that quote a price the contract never traded at */
  impossible: DisputedPost[];
}

/** a quoted or target price within this fraction of the day's extreme is taken as reached */
const SLACK = 0.01;

export async function followThrough(calls: Call[], outcomes: Map<string, Outcome>, followUps: FollowUp[], market: Market): Promise<FollowThrough> {
  const byCall = new Map<string, FollowUp[]>();
  for (const f of followUps) if (f.callId) byCall.set(f.callId, [...(byCall.get(f.callId) ?? []), f]);
  const r: FollowThrough = { winners: 0, winnersAnnounced: 0, losers: 0, losersMentioned: 0, losersAdmitted: 0, silentLosses: [], unsupported: [], impossible: [] };
  for (const call of calls) {
    const out = outcomes.get(call.id);
    if (!out || out.move === undefined || out.entryDay === undefined) continue;
    const posts = byCall.get(call.id) ?? [];
    if (out.cls !== "open") {
      if (out.move > 0) {
        r.winners++;
        if (posts.some((p) => p.kind === "target-hit" || p.kind === "profit")) r.winnersAnnounced++;
      } else {
        r.losers++;
        if (posts.length) r.losersMentioned++;
        else r.silentLosses.push(call.id);
        if (posts.some((p) => p.kind === "stop-hit")) r.losersAdmitted++;
      }
    }
    if (!posts.some((p) => p.claimsTarget || p.quoted !== undefined)) continue;
    const bars = await seriesOf(call, out, market);
    if (!bars) continue;
    const long = call.side === "long";
    for (const post of posts) {
      const until = lastDayOnOrBefore(market.days, toIst(post.ts).date);
      const span = bars.filter((b) => b.d >= out.entryDay! && b.d <= until);
      if (!span.length) continue;
      const reached = long ? Math.max(...span.map((b) => b.h)) : Math.min(...span.map((b) => b.l));
      const short = (level: number) => (long ? reached < level * (1 - SLACK) : reached > level * (1 + SLACK));
      const target = call.targets[0];
      if (post.claimsTarget && target !== undefined && short(target)) r.unsupported.push({ callId: call.id, msgId: post.msgId, claimed: target, reached });
      else if (post.quoted !== undefined && short(post.quoted) && (long ? post.quoted > out.entryPrice! : post.quoted < out.entryPrice!)) {
        r.impossible.push({ callId: call.id, msgId: post.msgId, claimed: post.quoted, reached });
      }
    }
  }
  return r;
}

function lastDayOnOrBefore(days: string[], date: string) {
  const i = lowerBound(days, date);
  return i < days.length && days[i] === date ? i : i - 1;
}
