// Replays one call on daily price bars. Pure functions: bars in, outcome out.
//
// A daily bar gives the open, high, low and close but not the order they happened in. On the day a call is
// posted, the high or low may have printed before the message. So each call is replayed under two readings:
//
//   best  - every doubtful touch is read in the channel's favour (a target that traded that day counts as hit)
//   worst - a level counts only if it must have traded after the entry
//
// A level must have traded after the entry when the day closed beyond it, or when it lies outside everything that
// can have printed before the entry (for a message posted in the first minutes of the session, that is the
// open and the quoted price). From the next day on, the whole bar is after the entry and only one doubt is left:
// a bar that touched both target and stop.
import type { Bar, Call, EntryBasis, ExitBasis, Outcome, Reading, ResultClass } from "./types";
import type { Session } from "./time";

/** a quoted price may sit this far outside the day's traded range and still be accepted (stale quotes, tick rounding) */
const TOLERANCE = 0.02;
/** a trigger level ("buy above 250") stays live for this many trading days after the call */
const TRIGGER_DAYS = 3;
/** a message this soon after the open is treated as posted at the open */
const EARLY_MINUTES = 15;
const EPS = 0.003;
const HORIZON_DAYS = { swing: 10, positional: 60 } as const;

export interface ReplayInput {
  call: Call;
  /** bars of the resolved instrument, oldest first */
  bars: Bar[];
  /** first trading day the call could act on, and where the message fell relative to the session */
  day: number;
  session: Session;
  /** minutes between the opening bell and the message, for in-session messages */
  minutesIn?: number;
  /** last day index of the price data */
  lastDay: number;
  /** for options and futures: day index of expiry, and the settlement value there */
  expiryDay?: number;
  settlement?: number;
  reading?: Reading;
  /** the channel posted a target-hit or profit message about this call (used by the "likely" reading) */
  announced?: boolean;
}

type Core = Omit<Outcome, "callId" | "assumptions" | "bars">;

/** what can have printed before the entry on the entry bar */
interface Before {
  high: number;
  low: number;
}

export function replay(input: ReplayInput): Outcome {
  const { call, bars } = input;
  // which doubtful touches count: wins (best, or likely when the channel announced one) and/or losses
  const reading = input.reading ?? "best";
  const best = reading === "best" || (reading === "likely" && !!input.announced);
  const assumptions: string[] = [];
  const done = (o: Core, around?: [number, number]): Outcome => ({
    callId: call.id,
    assumptions,
    ...o,
    ...(around ? { bars: bars.slice(Math.max(0, around[0] - 6), around[1] + 7) } : {}),
  });

  const dir = call.side === "long" ? 1 : -1;
  const first = bars.findIndex((b) => b.d >= input.day);
  if (first < 0 || bars[first].d > input.day) {
    // nothing printed on the day the call could first be acted on
    const later = first >= 0 && bars[first].d - input.day <= 2;
    if (!later) return done({ cls: "unverifiable", code: "not-traded", reason: "This contract did not trade on the day of the call, so there is no price to check it against." });
    assumptions.push("No trades on the day of the call; replayed from the next day it traded.");
  }
  const live = input.session === "in-session" && bars[first].d === input.day; // message landed inside this bar
  const early = live && (input.minutesIn ?? Infinity) <= EARLY_MINUTES;

  // Did price reach `level` after the entry on bar `b`? "maybe" says the level traded that day; "sure" says it
  // must have traded after the entry. `up` is the side of the entry the level lies on.
  const reached = (b: Bar, level: number, up: boolean, before: Before | null) => {
    const maybe = up ? b.h >= level : b.l <= level;
    if (!before) return { maybe, sure: maybe };
    const closedBeyond = up ? b.c >= level : b.c <= level;
    const outside = up ? level > before.high * (1 + EPS) : level < before.low * (1 - EPS);
    return { maybe, sure: closedBeyond || (maybe && outside) };
  };

  // ---------- entry ----------
  const e = call.entry;
  const quoted = e.type === "range" ? ((e.lo ?? 0) + (e.hi ?? 0)) / 2 : e.lo;
  const breakout = (call.side === "long" && e.type === "above") || (call.side === "short" && e.type === "below");
  let i = first;
  let entryPrice: number;
  let basis: EntryBasis;
  let scanFrom: number;
  let before: Before | null = null; // null = the whole entry bar is after the entry

  if (e.type === "none" || quoted === undefined) {
    if (live) {
      if (call.horizon === "intraday") {
        return done({ cls: "unverifiable", code: "no-entry", reason: "The message gives no entry price. An intraday call without one cannot be placed on daily prices." });
      }
      entryPrice = bars[i].c;
      basis = "close";
      scanFrom = i + 1;
      assumptions.push("No entry price in the message; entered at that day's closing price.");
    } else {
      entryPrice = bars[i].o;
      basis = "open";
      scanFrom = i;
      assumptions.push("No entry price in the message; entered at the next opening price.");
    }
  } else if (breakout) {
    // the level has to trade, after the message, for the call to start
    let found = -1;
    const window = call.horizon === "intraday" ? 1 : TRIGGER_DAYS;
    for (let k = i; k < bars.length && k < i + window; k++) {
      const b = bars[k];
      let touched: boolean;
      if (k === first && live) {
        // on the message bar the level may have traded only before the message
        const r = reached(b, quoted, dir > 0, early ? { high: b.o, low: b.o } : { high: b.h, low: b.l });
        touched = best ? r.maybe : r.sure;
      } else touched = dir > 0 ? b.h >= quoted : b.l <= quoted;
      if (touched) {
        found = k;
        break;
      }
    }
    if (found < 0) {
      return done(
        { cls: "not-triggered", code: "level-not-reached", reason: `The entry level ${fmt(quoted)} did not trade within ${window === 1 ? "the day" : `${window} trading days`} of the call.` },
        [i, i],
      );
    }
    i = found;
    const b = bars[i];
    const onMessageBar = i === first && live;
    const openedBeyond = !onMessageBar && (dir > 0 ? b.o > quoted : b.o < quoted);
    entryPrice = openedBeyond ? b.o : clamp(quoted, b);
    basis = "trigger";
    scanFrom = i;
    if (openedBeyond) assumptions.push("Price opened past the entry level; entered at the open.");
    else {
      // Until the trigger, price sat on the near side of the level. On the message bar, what printed before the
      // message is unknown unless the message came at the open. How far price went the other way is never known.
      const near = onMessageBar ? (early ? (dir > 0 ? Math.max(b.o, entryPrice) : Math.min(b.o, entryPrice)) : null) : entryPrice;
      before = dir > 0 ? { high: near ?? b.h, low: b.l } : { high: b.h, low: near ?? b.l };
    }
  } else {
    const lo = e.type === "range" ? (e.lo ?? quoted) : quoted;
    const hi = e.type === "range" ? (e.hi ?? quoted) : quoted;
    const bar = bars[i];
    const traded = hi >= bar.l * (1 - TOLERANCE) && lo <= bar.h * (1 + TOLERANCE);
    if (traded) {
      entryPrice = clamp(quoted, bar);
      basis = "stated";
      scanFrom = i;
      // a quoted price is the market price when the message went out; early in the session only the open came before it
      before = early ? { high: Math.max(bar.o, entryPrice), low: Math.min(bar.o, entryPrice) } : { high: bar.h, low: bar.l };
    } else if (!live) {
      entryPrice = bar.o;
      basis = "open";
      scanFrom = i;
      assumptions.push(`The quoted price ${fmt(quoted)} did not trade the next day; entered at the open.`);
    } else {
      return done(
        {
          cls: "unverifiable",
          code: "price-mismatch",
          reason: `The quoted price ${fmt(quoted)} is outside what this contract traded that day (${fmt(bar.l)} to ${fmt(bar.h)}). The message may refer to a different contract.`,
        },
        [i, i],
      );
    }
  }
  if (!(entryPrice > 0)) return done({ cls: "unverifiable", code: "not-traded", reason: "No usable entry price on that day." });

  // ---------- levels ----------
  const target = call.targets.find((t) => dir * (t - entryPrice) > 0);
  let stop = call.stop;
  if (call.targets.length && target === undefined) assumptions.push("Stated target is not beyond the entry price; ignored.");
  if (stop !== undefined && dir * (entryPrice - stop) <= 0) {
    assumptions.push("Stated stop-loss is not on the losing side of the entry price; ignored.");
    stop = undefined;
  }
  if (call.targets.length > 1 && target !== undefined) assumptions.push("First target counts as the exit.");

  // ---------- horizon ----------
  const derivative = call.kind !== "equity";
  let lastHold: number; // last bar day on which the position may still be open
  let horizon = call.horizon;
  if (horizon === "unspecified" && !derivative) {
    horizon = "swing";
    assumptions.push(`No holding period stated; closed after ${HORIZON_DAYS.swing} trading days if neither level is touched.`);
  }
  const entryDay = bars[i].d;
  if (horizon === "intraday") lastHold = entryDay;
  else if (horizon === "btst") lastHold = entryDay + 1;
  else if (horizon === "swing") lastHold = entryDay + HORIZON_DAYS.swing;
  else if (horizon === "positional") lastHold = entryDay + HORIZON_DAYS.positional;
  else lastHold = input.expiryDay ?? entryDay + HORIZON_DAYS.swing;
  if (input.expiryDay !== undefined) lastHold = Math.min(lastHold, input.expiryDay);
  if (horizon === "unspecified" && derivative) assumptions.push("No holding period stated; held until a level is touched or the contract expires.");

  const finish = (cls: ResultClass, exitIdx: number, exitPrice: number, exitBasis: ExitBasis): Outcome => {
    const move = dir * (exitPrice - entryPrice);
    const exitDay = exitIdx >= 0 ? bars[exitIdx].d : (input.expiryDay ?? entryDay);
    return done(
      {
        cls,
        entryDay,
        entryPrice: round(entryPrice),
        entryBasis: basis,
        exitDay,
        exitPrice: round(exitPrice),
        exitBasis,
        move: round(move),
        retPct: round((move / entryPrice) * 100),
        daysHeld: exitDay - entryDay,
      },
      [i, exitIdx >= 0 ? exitIdx : bars.length - 1],
    );
  };

  // ---------- exit scan ----------
  for (let k = scanFrom; k < bars.length; k++) {
    const b = bars[k];
    if (b.d > lastHold) break;
    const later = k > i;

    if (horizon === "btst" && later) {
      // sold at the next open, whatever it is
      const cls: ResultClass = target !== undefined && dir * (b.o - target) >= 0 ? "target" : stop !== undefined && dir * (b.o - stop) <= 0 ? "stop" : "horizon";
      return finish(cls, k, b.o, "next-open");
    }
    if (later) {
      // a gap through a level fills at the open, not at the level
      if (stop !== undefined && dir * (b.o - stop) <= 0) return finish("stop", k, b.o, "gap-open");
      if (target !== undefined && dir * (b.o - target) >= 0) return finish("target", k, b.o, "gap-open");
    }
    const prior = later ? null : before;
    const t = target !== undefined ? reached(b, target, dir > 0, prior) : { maybe: false, sure: false };
    const s = stop !== undefined ? reached(b, stop, dir < 0, prior) : { maybe: false, sure: false };
    // best: a target that traded counts, a stop only if it must have come after the entry. worst: the reverse.
    const hitT = best ? t.maybe : t.sure;
    const hitS = best ? s.sure : s.maybe;
    if (hitT && hitS) {
      assumptions.push("Target and stop-loss both traded on the same day; daily prices cannot show which came first.");
      return best ? finish("target", k, target!, "target") : finish("stop", k, stop!, "stop");
    }
    if (hitT) {
      if (!t.sure) assumptions.push("The target price traded that day; daily prices cannot show whether that was before or after the message. Read in the channel's favour.");
      return finish("target", k, target!, "target");
    }
    if (hitS) {
      if (!s.sure) assumptions.push("The stop-loss price traded that day; daily prices cannot show whether that was before or after the message. Read against the channel.");
      return finish("stop", k, stop!, "stop");
    }

    if (b.d === lastHold) {
      if (input.expiryDay !== undefined && b.d === input.expiryDay) {
        return finish("expired", k, input.settlement ?? b.c, "settlement");
      }
      return finish("horizon", k, b.c, "close");
    }
  }

  // ran out of bars before the holding period ended
  const lastBar = bars[Math.max(i, lastIndexUpTo(bars, lastHold))];
  if (input.expiryDay !== undefined && lastHold === input.expiryDay && input.expiryDay <= input.lastDay) {
    if (input.settlement !== undefined) {
      assumptions.push("The contract stopped trading before expiry; settled at its expiry value.");
      return finish("expired", -1, input.settlement, "settlement");
    }
    assumptions.push("The contract stopped trading before expiry; closed at its last traded price.");
    return finish("expired", bars.indexOf(lastBar), lastBar.c, "last-price");
  }
  if (lastHold > input.lastDay) {
    assumptions.push("Still running when the price data ends; valued at the last closing price.");
    return finish("open", bars.indexOf(lastBar), lastBar.c, "last-price");
  }
  assumptions.push("No trades on the last day of the holding period; closed at the last traded price.");
  return finish("horizon", bars.indexOf(lastBar), lastBar.c, "last-price");
}

function lastIndexUpTo(bars: Bar[], day: number) {
  let k = bars.length - 1;
  while (k > 0 && bars[k].d > day) k--;
  return k;
}

const clamp = (p: number, b: Bar) => Math.min(Math.max(p, b.l), b.h);
const round = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => `₹${round(n).toLocaleString("en-IN")}`;
