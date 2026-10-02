// Shared vocabulary of the engine. Everything here is plain data so it can cross a worker boundary.

export interface Msg {
  id: number;
  /** ISO timestamp, UTC */
  ts: string;
  text: string;
  hasPhoto?: boolean;
  edited?: boolean;
  replyTo?: number;
  forwardedFrom?: string;
  views?: string;
}

export type ChannelSource = "telegram-link" | "telegram-export" | "screenshots" | "pasted" | "sample";

export interface Channel {
  source: ChannelSource;
  handle?: string;
  title: string;
  subscribers?: string;
  description?: string;
  messages: Msg[];
}

export type InstrumentKind = "equity" | "option" | "future";
export type Side = "long" | "short";
export type Horizon = "intraday" | "btst" | "swing" | "positional" | "unspecified";
export type Confidence = "high" | "medium" | "low";

export interface EntrySpec {
  /** at: a quoted price ("@ 250", "CMP 250"); above/below: a trigger level; range: "250-255"; none: no price given */
  type: "at" | "above" | "below" | "range" | "none";
  lo?: number;
  hi?: number;
}

export interface ExpiryHint {
  day?: number;
  /** 1-12 */
  month?: number;
  year?: number;
}

export interface Call {
  id: string;
  msgId: number;
  ts: string;
  kind: InstrumentKind;
  /** NSE ticker of the stock, or of the underlying for options and futures */
  symbol: string;
  strike?: number;
  optType?: "CE" | "PE";
  expiryHint?: ExpiryHint;
  side: Side;
  entry: EntrySpec;
  targets: number[];
  stop?: number;
  horizon: Horizon;
  raw: string;
  confidence: Confidence;
  /** why the confidence is what it is, in plain words */
  notes: string[];
}

export type FollowUpKind = "target-hit" | "stop-hit" | "profit" | "exit" | "loss";

export interface FollowUp {
  msgId: number;
  ts: string;
  kind: FollowUpKind;
  /** the post says a target was hit (not "almost") */
  claimsTarget?: boolean;
  /** the price the post says the contract reached ("175 TO 239") */
  quoted?: number;
  /** the call this message talks about, when it could be linked */
  callId?: string;
  raw: string;
}

export interface AccuracyClaim {
  msgId: number;
  ts: string;
  percent: number;
  raw: string;
}

export interface Bar {
  /** index into the trading calendar */
  d: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type ResultClass =
  | "target" // first target touched
  | "stop" // stop-loss touched
  | "expired" // option held to expiry and settled
  | "horizon" // neither level touched, closed at the end of the stated holding period
  | "open" // still running when the price data ends
  | "not-triggered" // the entry level never traded
  | "unverifiable"; // could not be checked; `reason` says why

/** why a call could not be checked */
export type UncheckedCode =
  | "too-recent" // inside the 30-day lag on price data
  | "before-data" // older than the price data
  | "off-exchange" // traded on an exchange the data does not cover
  | "unknown-instrument" // no such stock or contract in the data
  | "not-traded" // the contract had no trades that day
  | "price-mismatch" // the quoted price is outside what the contract traded
  | "no-entry" // intraday call with no entry price
  | "level-not-reached"; // the entry trigger never traded

export type EntryBasis = "stated" | "trigger" | "open" | "close";
export type ExitBasis = "target" | "stop" | "gap-open" | "close" | "next-open" | "settlement" | "last-price";

export interface Outcome {
  callId: string;
  cls: ResultClass;
  /** set when cls is unverifiable or not-triggered */
  reason?: string;
  code?: UncheckedCode;
  /** exact contract the call was replayed on, e.g. "NIFTY 28-Oct-2025 24500 CE" */
  contract?: string;
  /** the index the contract belongs to, when the message did not name it and prices settled it */
  underlying?: string;
  /** expiry date of the contract, for options and futures */
  expiry?: string;
  lot?: number;
  entryDay?: number;
  entryPrice?: number;
  entryBasis?: EntryBasis;
  exitDay?: number;
  exitPrice?: number;
  exitBasis?: ExitBasis;
  /** per unit, signed for the side taken */
  move?: number;
  retPct?: number;
  daysHeld?: number;
  /** false when the best and the worst reading of the daily prices give different results for this call */
  firm?: boolean;
  /** assumptions that applied to this call, shown in "how this was checked" */
  assumptions: string[];
  /** bars around the trade for the mini chart */
  bars?: Bar[];
}

/**
 * How to read what daily prices cannot settle.
 *   best   - in the channel's favour
 *   worst  - against it: only what must have happened after the message counts
 *   likely - a doubtful win counts when the channel announced it at the time; a doubtful stop-loss counts when it did not
 */
export type Reading = "best" | "worst" | "likely";
