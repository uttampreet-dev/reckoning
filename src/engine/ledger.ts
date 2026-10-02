// Turns replayed calls into the account a follower would have ended up with.
// One rule set, stated on screen: a fixed rupee stake in every call, whole lots for F&O, and a flat cost model.
import type { Call, Outcome } from "./types";

export interface LedgerParams {
  /** money the follower starts with */
  capital: number;
  /** share of the starting capital put into each call (0.2 = one fifth) */
  stakeFraction: number;
  /** share of the starting capital that is borrowed (0 to 1) */
  borrowedFraction: number;
  /** monthly interest on the borrowed part, e.g. 0.03 for a 3%-a-month instant loan */
  loanMonthlyRate: number;
  /** count calls the reader was not sure about */
  includeLowConfidence: boolean;
}

export const DEFAULT_PARAMS: LedgerParams = {
  capital: 50_000,
  stakeFraction: 0.2,
  borrowedFraction: 0,
  loanMonthlyRate: 0.03,
  includeLowConfidence: false,
};

/** exchange margin on one futures lot, as a share of contract value */
const FUTURES_MARGIN = 0.15;

/** Brokerage, STT and exchange charges, deliberately simple. Options ₹40 + 0.15% of sale value; futures ₹40 + 0.03%;
 *  shares sold the same day ₹40 + 0.03%; shares held overnight 0.12% on each side. */
export function tradingCosts(kind: Call["kind"], buyValue: number, sellValue: number, sameDay: boolean): number {
  if (kind === "option") return 40 + sellValue * 0.0015;
  if (kind === "future") return 40 + sellValue * 0.0003;
  return sameDay ? 40 + sellValue * 0.0003 : (buyValue + sellValue) * 0.0012;
}

export type LineStatus =
  | "taken"
  | "no-funds" // the account could not pay for one lot / one share
  | "not-triggered"
  | "unverifiable"
  | "low-confidence"; // readable but not counted unless the user asks

export interface LedgerLine {
  callId: string;
  status: LineStatus;
  /** shares, or lots x lot size */
  quantity?: number;
  lots?: number;
  /** money blocked while the position was open */
  blocked?: number;
  gross?: number;
  costs?: number;
  net?: number;
  /** what the standard stake would have made on this call had the money been there; set for every replayed call */
  ifFunded?: number;
  entryDay?: number;
  exitDay?: number;
  balanceAfter?: number;
}

export interface CurvePoint {
  day: number;
  balance: number;
  callId?: string;
}

export interface Ledger {
  params: LedgerParams;
  lines: LedgerLine[];
  curve: CurvePoint[];
  startBalance: number;
  finalBalance: number;
  /** total of all net results */
  netResult: number;
  counts: {
    calls: number;
    taken: number;
    target: number;
    stop: number;
    expired: number;
    horizon: number;
    open: number;
    profitable: number;
    losing: number;
    notTriggered: number;
    unverifiable: number;
    lowConfidence: number;
    noFunds: number;
    /** taken calls whose result differs between the best and the worst reading */
    doubtful: number;
  };
  /** every call that could be replayed, whether or not the account still had money for it */
  record: CallRecord;
  /** calls that reached their target, as a share of calls taken */
  hitRate: number | null;
  /** calls that made money after costs, as a share of calls taken */
  profitableRate: number | null;
  /** rupees won per rupee lost */
  profitFactor: number | null;
  maxDrawdownPct: number;
  /** first day the account could no longer afford a call */
  outOfMoneyDay?: number;
  loan?: {
    borrowed: number;
    own: number;
    /** owed at the end, with interest */
    owed: number;
    /** first day the balance fell below what was borrowed: the follower's own money is gone */
    ownMoneyGoneDay?: number;
    /** final balance minus what is owed */
    netWorth: number;
  };
}

export interface CallRecord {
  checked: number;
  target: number;
  stop: number;
  expired: number;
  /** expired with less than a twentieth of the entry price left */
  expiredWorthless: number;
  horizon: number;
  open: number;
  profitable: number;
  /** share of checked calls that reached their target */
  hitRate: number | null;
  /**
   * The hit rate a directionless price would give these same calls: for each call with a target,
   * (entry - stop) / (target - stop), with the stop at zero when none is given. Averaged.
   */
  chanceHitRate: number | null;
  /** hit rate over the calls the chance figure is based on (those with a target) */
  hitRateWithTarget: number | null;
  /** average result per call, percent of the entry price, before costs */
  meanReturnPct: number | null;
  /** rupees won or lost if the same stake had gone into every checked call, however the account stood */
  flatNet: number;
}

interface OpenPosition {
  line: LedgerLine;
  exitDay: number;
  net: number;
  blocked: number;
  order: number;
}

export function buildLedger(calls: Call[], outcomes: Map<string, Outcome>, params: LedgerParams = DEFAULT_PARAMS): Ledger {
  const stake = params.capital * params.stakeFraction;
  const counts = { calls: calls.length, taken: 0, target: 0, stop: 0, expired: 0, horizon: 0, open: 0, profitable: 0, losing: 0, notTriggered: 0, unverifiable: 0, lowConfidence: 0, noFunds: 0, doubtful: 0 };
  const lines: LedgerLine[] = [];
  const queue: { call: Call; out: Outcome; line: LedgerLine }[] = [];

  for (const call of calls) {
    const out = outcomes.get(call.id);
    const line: LedgerLine = { callId: call.id, status: "unverifiable" };
    lines.push(line);
    if (!out || out.cls === "unverifiable") counts.unverifiable++;
    else if (out.cls === "not-triggered") {
      line.status = "not-triggered";
      counts.notTriggered++;
    } else if (call.confidence === "low" && !params.includeLowConfidence) {
      line.status = "low-confidence";
      counts.lowConfidence++;
    } else queue.push({ call, out, line });
  }
  queue.sort((a, b) => a.out.entryDay! - b.out.entryDay! || a.call.msgId - b.call.msgId);

  let balance = params.capital;
  let peak = balance;
  let maxDrawdownPct = 0;
  let outOfMoneyDay: number | undefined;
  let ownMoneyGoneDay: number | undefined;
  let grossWon = 0,
    grossLost = 0;
  const borrowed = params.capital * params.borrowedFraction;
  const curve: CurvePoint[] = [];
  const open: OpenPosition[] = [];

  // settles every position that closed before `day`, plus same-day closes of calls made earlier than `beforeOrder`
  const settle = (day: number, beforeOrder: number) => {
    open.sort((a, b) => a.exitDay - b.exitDay || a.order - b.order);
    for (let k = 0; k < open.length; ) {
      const p = open[k];
      if (!(p.exitDay < day || (p.exitDay === day && p.order < beforeOrder))) {
        k++;
        continue;
      }
      open.splice(k, 1);
      balance = Math.max(0, balance + p.net);
      p.line.balanceAfter = round(balance);
      curve.push({ day: p.exitDay, balance: round(balance), callId: p.line.callId });
      peak = Math.max(peak, balance);
      maxDrawdownPct = Math.max(maxDrawdownPct, peak > 0 ? ((peak - balance) / peak) * 100 : 0);
      if (borrowed > 0 && ownMoneyGoneDay === undefined && balance < borrowed) ownMoneyGoneDay = p.exitDay;
    }
  };

  // ---------- the record, call by call, as if the stake were always there
  const record: CallRecord = { checked: queue.length, target: 0, stop: 0, expired: 0, expiredWorthless: 0, horizon: 0, open: 0, profitable: 0, hitRate: null, chanceHitRate: null, hitRateWithTarget: null, meanReturnPct: null, flatNet: 0 };
  let chanceSum = 0,
    withTarget = 0,
    withTargetHit = 0,
    returnSum = 0;
  for (const { call, out, line } of queue) {
    record[out.cls as "target" | "stop" | "expired" | "horizon" | "open"]++;
    if (out.cls === "expired" && out.exitPrice! <= out.entryPrice! * 0.05) record.expiredWorthless++;
    returnSum += out.retPct ?? 0;
    const lot = call.kind === "equity" ? 1 : (out.lot ?? 1);
    const unit = (call.kind === "future" ? out.entryPrice! * FUTURES_MARGIN : out.entryPrice!) * lot;
    const quantity = Math.max(1, Math.floor(stake / unit)) * lot;
    const buy = quantity * (call.side === "long" ? out.entryPrice! : out.exitPrice!);
    const sell = quantity * (call.side === "long" ? out.exitPrice! : out.entryPrice!);
    const net = quantity * out.move! - tradingCosts(call.kind, buy, sell, out.daysHeld === 0);
    line.ifFunded = round(net);
    record.flatNet += net;
    if (net > 0) record.profitable++;

    const entry = out.entryPrice!;
    const long = call.side === "long";
    const target = call.targets.find((t) => (long ? t > entry : t < entry));
    const floor = call.stop !== undefined && (long ? call.stop < entry : call.stop > entry) ? call.stop : long ? 0 : undefined;
    if (target !== undefined && floor !== undefined) {
      chanceSum += Math.abs(entry - floor) / Math.abs(target - floor);
      withTarget++;
      if (out.cls === "target") withTargetHit++;
    }
  }
  record.flatNet = round(record.flatNet);
  if (queue.length) {
    record.hitRate = record.target / queue.length;
    record.meanReturnPct = round(returnSum / queue.length);
  }
  if (withTarget) {
    record.chanceHitRate = chanceSum / withTarget;
    record.hitRateWithTarget = withTargetHit / withTarget;
  }

  queue.forEach(({ call, out, line }, order) => {
    const entryDay = out.entryDay!;
    // same-day results of earlier calls are in hand before a later call that day
    settle(entryDay, order);
    const free = balance - open.reduce((s, p) => s + p.blocked, 0);
    const price = out.entryPrice!;
    const lot = call.kind === "equity" ? 1 : (out.lot ?? 1);
    const perUnitBlock = call.kind === "future" ? price * FUTURES_MARGIN : price;
    const unitCost = perUnitBlock * lot;
    let units = Math.max(1, Math.floor(stake / unitCost));
    while (units > 1 && units * unitCost > free) units--;
    if (unitCost > free) {
      line.status = "no-funds";
      counts.noFunds++;
      outOfMoneyDay ??= entryDay;
      return;
    }
    const quantity = units * lot;
    const exitPrice = out.exitPrice!;
    const gross = quantity * out.move!;
    const buyValue = quantity * (call.side === "long" ? price : exitPrice);
    const sellValue = quantity * (call.side === "long" ? exitPrice : price);
    const costs = tradingCosts(call.kind, buyValue, sellValue, out.daysHeld === 0);
    const net = gross - costs;

    Object.assign(line, {
      status: "taken",
      quantity,
      lots: call.kind === "equity" ? undefined : units,
      blocked: round(units * unitCost),
      gross: round(gross),
      costs: round(costs),
      net: round(net),
      entryDay,
      exitDay: out.exitDay,
    } satisfies Partial<LedgerLine>);
    counts.taken++;
    counts[out.cls as "target" | "stop" | "expired" | "horizon" | "open"]++;
    if (out.firm === false) counts.doubtful++;
    if (net > 0) {
      counts.profitable++;
      grossWon += net;
    } else {
      counts.losing++;
      grossLost -= net;
    }
    open.push({ line, exitDay: out.exitDay ?? entryDay, net, blocked: units * unitCost, order });
  });
  settle(Infinity, Infinity);

  const checked = counts.taken;
  const ledger: Ledger = {
    params,
    lines,
    curve,
    startBalance: params.capital,
    finalBalance: round(balance),
    netResult: round(balance - params.capital),
    counts,
    record,
    hitRate: checked ? counts.target / checked : null,
    profitableRate: checked ? counts.profitable / checked : null,
    profitFactor: grossLost > 0 ? grossWon / grossLost : null,
    maxDrawdownPct: round(maxDrawdownPct),
    outOfMoneyDay,
  };
  if (borrowed > 0) {
    const firstDay = queue[0]?.out.entryDay ?? 0;
    const lastDay = curve.at(-1)?.day ?? firstDay;
    // about 21 trading days to a month
    const months = Math.max(1, Math.ceil((lastDay - firstDay) / 21));
    const owed = borrowed * Math.pow(1 + params.loanMonthlyRate, months);
    ledger.loan = { borrowed, own: params.capital - borrowed, owed: round(owed), ownMoneyGoneDay, netWorth: round(balance - owed) };
  }
  return ledger;
}

const round = (n: number) => Math.round(n * 100) / 100;
