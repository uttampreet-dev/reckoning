// Finds the exact exchange instrument a call refers to and replays it there.
import type { Market, Expiry } from "../data/market";
import { optionKey } from "../data/market";
import { placeMessage, prettyDate, lowerBound } from "./time";
import { replay } from "./replay";
import type { Bar, Call, Outcome, Reading, UncheckedCode } from "./types";
import { OFF_EXCHANGE } from "./aliases";
import { UNNAMED } from "./extract";

const unverifiable = (call: Call, code: UncheckedCode, reason: string): Outcome => ({ callId: call.id, cls: "unverifiable", code, reason, assumptions: [] });

/** monthly expiry = the last expiry listed in its calendar month */
function isMonthly(e: Expiry, all: Expiry[]) {
  const month = e.date.slice(0, 7);
  return !all.some((x) => x.date.slice(0, 7) === month && x.date > e.date);
}

function candidateExpiries(call: Call, list: Expiry[], onOrAfter: string): Expiry[] {
  const live = list.filter((e) => e.date >= onOrAfter);
  const hint = call.expiryHint;
  if (hint?.month) {
    const year = hint.year ?? (hint.month < +onOrAfter.slice(5, 7) - 6 ? +onOrAfter.slice(0, 4) + 1 : +onOrAfter.slice(0, 4));
    const ym = `${year}-${String(hint.month).padStart(2, "0")}`;
    const inMonth = live.filter((e) => e.date.startsWith(ym));
    if (hint.day) {
      // holidays move expiries by a day or two, so take the closest one to the date written in the message
      const want = Date.parse(`${ym}-${String(hint.day).padStart(2, "0")}`);
      const near = inMonth
        .map((e) => ({ e, gap: Math.abs(Date.parse(e.date) - want) / 864e5 }))
        .filter((x) => x.gap <= 3)
        .sort((a, b) => a.gap - b.gap);
      return near.map((x) => x.e);
    }
    return inMonth.filter((e) => isMonthly(e, list));
  }
  // nearest first; a quoted price is then used to tell a weekly from the monthly
  return live.slice(0, 4);
}

function fits(bar: Bar | undefined, call: Call) {
  if (!bar) return false;
  const e = call.entry;
  if (e.type === "none" || e.lo === undefined) return true;
  const lo = e.lo,
    hi = e.type === "range" ? (e.hi ?? e.lo) : e.lo;
  if (e.type === "above") return bar.h >= lo * 0.98 && bar.l <= lo * 1.6;
  if (e.type === "below") return bar.l <= lo * 1.02 && bar.h >= lo * 0.6;
  return hi >= bar.l * 0.98 && lo <= bar.h * 1.02;
}

export async function resolveAndReplay(call: Call, market: Market, reading: Reading = "best", announced = false): Promise<Outcome> {
  if (call.symbol !== UNNAMED) return replayNamed(call, market, reading, announced);
  // The message gives a strike and CE/PE but no index. If the quoted price fits that strike in exactly one index
  // on that day, that is the contract; otherwise the call stays unchecked.
  const fitting: Outcome[] = [];
  for (const [symbol, u] of Object.entries(market.fo)) {
    if (u.kind !== "index") continue;
    const out = await replayNamed({ ...call, symbol }, market, reading, announced);
    if (out.entryPrice !== undefined && out.entryBasis !== "open") fitting.push({ ...out, underlying: symbol });
  }
  if (fitting.length === 1 && call.entry.type !== "none") {
    fitting[0].assumptions.push(`The message does not name the index; ${fitting[0].underlying} is the only one where this strike traded at the quoted price that day.`);
    return fitting[0];
  }
  return unverifiable(
    call,
    "unknown-instrument",
    fitting.length ? "The message does not name the index, and the quoted price fits more than one." : "The message does not name the index, and no index contract with this strike traded at the quoted price that day.",
  );
}

async function replayNamed(call: Call, market: Market, reading: Reading, announced: boolean): Promise<Outcome> {
  const days = market.days;
  const placed = placeMessage(call.ts, days);
  if (!placed) {
    return unverifiable(
      call,
      "too-recent",
      `Too recent to check. Price data for investor education carries a ${market.meta.lagDays}-day lag, so prices are available up to ${prettyDate(market.meta.to)}.`,
    );
  }
  if (call.ts.slice(0, 10) < market.meta.from) {
    return unverifiable(call, "before-data", `The call is dated before the price data starts (${prettyDate(market.meta.from)}).`);
  }
  if (OFF_EXCHANGE[call.symbol] && !market.fo[call.symbol]) {
    return unverifiable(call, "off-exchange", `${call.symbol} trades on ${OFF_EXCHANGE[call.symbol]}, which this price data does not cover.`);
  }
  const lastDay = days.length - 1;
  const base = { call, day: placed.day, session: placed.session, minutesIn: placed.minutesIn, lastDay, reading, announced };

  if (call.kind === "equity") {
    const info = market.symbols[call.symbol];
    const bars = info ? await market.cash(call.symbol) : null;
    if (!info || !bars) return unverifiable(call, "unknown-instrument", `${call.symbol} is not a stock in the NSE cash market data.`);
    const restated = inCallTerms(bars, info.x, placed.day);
    const out = replay({ ...base, bars: restated.bars });
    if (restated.changed) out.assumptions.push("A split or bonus took effect after the call; later prices are restated in the call's terms.");
    return { ...out, contract: `${call.symbol} · ${info.n}`, lot: 1 };
  }

  const u = market.fo[call.symbol];
  if (!u) return unverifiable(call, "unknown-instrument", `${call.symbol} has no futures or options on NSE in the data.`);
  const today = days[placed.day];

  if (call.kind === "future") {
    const exp = candidateExpiries(call, u.expiries.filter((e) => e.hasFutures), today)[0];
    const all = exp ? await market.futures(call.symbol) : null;
    const bars = all?.get(exp!.date);
    if (!exp || !bars) return unverifiable(call, "unknown-instrument", `No ${call.symbol} futures contract found for that date.`);
    const out = replay({ ...base, bars, expiryDay: dayIndexOf(days, exp.date) });
    if (u.kind === "index" && call.strike === undefined) out.assumptions.push("An index level cannot be bought; replayed on the near-month future.");
    return { ...out, contract: `${call.symbol} ${prettyDate(exp.date)} FUT`, expiry: exp.date, lot: exp.lot };
  }

  // option
  if (call.strike === undefined || !call.optType) return unverifiable(call, "unknown-instrument", "The message does not give a strike and CE/PE.");
  if (u.kind === "stock" && today < market.meta.stockOptionsFrom) {
    return unverifiable(call, "before-data", `Stock option prices are included from ${prettyDate(market.meta.stockOptionsFrom)} only.`);
  }
  const key = optionKey(call.strike, call.optType);
  const candidates = candidateExpiries(call, u.expiries.filter((e) => e.hasOptions), today);
  if (!candidates.length) return unverifiable(call, "unknown-instrument", `No ${call.symbol} option expiry found for that date.`);

  let chosen: { exp: Expiry; bars: Bar[] } | undefined;
  let fallback: { exp: Expiry; bars: Bar[] } | undefined;
  for (const exp of candidates) {
    const chain = await market.options(call.symbol, exp.date);
    const bars = chain?.get(key);
    if (!bars) continue;
    fallback ??= { exp, bars };
    if (fits(bars.find((b) => b.d === placed.day), call)) {
      chosen = { exp, bars };
      break;
    }
  }
  const pick = chosen ?? fallback;
  if (!pick) {
    return unverifiable(call, "not-traded", `${call.symbol} ${call.strike} ${call.optType} did not trade in any expiry near the call date.`);
  }
  const expiryDay = dayIndexOf(days, pick.exp.date);
  let settlement: number | undefined;
  const spot = (await market.spot(call.symbol))?.get(expiryDay);
  if (spot !== undefined) settlement = Math.max(0, call.optType === "CE" ? spot - call.strike : call.strike - spot);
  const out = replay({ ...base, bars: pick.bars, expiryDay, settlement });
  if (chosen && chosen.exp !== candidates[0] && !call.expiryHint?.month) {
    out.assumptions.push("The quoted price does not fit the nearest expiry; the next expiry that it fits was used.");
  } else if (!call.expiryHint?.month) {
    out.assumptions.push("No expiry in the message; the nearest expiry on or after the call date was used.");
  }
  if (out.exitBasis === "settlement") out.assumptions.push("Held to expiry: settled at the option's value against the underlying's closing level.");
  return { ...out, contract: `${call.symbol} ${prettyDate(pick.exp.date)} ${call.strike} ${call.optType}`, expiry: pick.exp.date, lot: pick.exp.lot };
}

/** Day index of an expiry. One that falls after the price data ends gets an index past the last day, so the call reads as still open. */
function dayIndexOf(days: string[], date: string): number {
  const i = lowerBound(days, date);
  if (i < days.length) return i;
  const beyond = (Date.parse(date) - Date.parse(days[days.length - 1])) / 864e5;
  return days.length - 1 + Math.max(1, Math.round((beyond * 5) / 7));
}

/** Restates bars after a split or bonus so the whole series is on the price scale of the day the call was made. */
export function inCallTerms(bars: Bar[], events: [number, number][] | undefined, callDay: number): { bars: Bar[]; changed: boolean } {
  const later = (events ?? []).filter(([day]) => day > callDay);
  if (!later.length) return { bars, changed: false };
  let changed = false;
  const out = bars.map((b) => {
    let k = 1;
    for (const [day, factor] of later) if (b.d >= day) k *= factor;
    if (k === 1) return b;
    changed = true;
    return { d: b.d, o: b.o / k, h: b.h / k, l: b.l / k, c: b.c / k, v: Math.round(b.v * k) };
  });
  return { bars: out, changed };
}

/** The price series a replayed call was checked against, for looking at what happened after it. */
export async function seriesOf(call: Call, out: Outcome, market: Market): Promise<Bar[] | null> {
  if (out.entryDay === undefined) return null;
  const symbol = out.underlying ?? call.symbol;
  if (call.kind === "equity") {
    const bars = await market.cash(symbol);
    return bars ? inCallTerms(bars, market.symbols[symbol]?.x, out.entryDay).bars : null;
  }
  if (!out.expiry) return null;
  if (call.kind === "future") return (await market.futures(symbol))?.get(out.expiry) ?? null;
  if (call.strike === undefined || !call.optType) return null;
  return (await market.options(symbol, out.expiry))?.get(optionKey(call.strike, call.optType)) ?? null;
}
