// Reads tip messages. Deterministic rules only: a message becomes a call when an instrument and at least one
// price level can be read from it; anything less is reported as unread, never guessed.
import type { AccuracyClaim, Call, Confidence, EntrySpec, ExpiryHint, FollowUp, FollowUpKind, Horizon, Msg, Side } from "./types";
import type { Dictionary, Resolved } from "./symbols";
import { placeMessage } from "./time";
import { note, type Note } from "./notes";

export interface Unread {
  msgId: number;
  ts: string;
  /** image-only: the call may be inside a picture; no-instrument: levels found but no readable stock or contract */
  why: "image-only" | "no-instrument";
  raw: string;
}

export interface Extraction {
  calls: Call[];
  followUps: FollowUp[];
  claims: AccuracyClaim[];
  unread: Unread[];
  /** calls posted again unchanged on the same day; counted once */
  reposts: number;
}

// ---------------------------------------------------------------- normalising

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

const HINDI: [RegExp, string][] = [
  [/बैंक\s*निफ्टी|बैंक\s*निफ़्टी/g, " BANKNIFTY "],
  [/निफ्टी|निफ़्टी/g, " NIFTY "],
  [/सेंसेक्स/g, " SENSEX "],
  [/(\d)\s*(?:कॉल|काल)/g, "$1 CE "],
  [/(\d)\s*(?:पुट)/g, "$1 PE "],
  [/हाई\s*(?:बनाया|लगाया)/g, " HIGH MADE "],
  [/टार[्]?गेट\s*(?:हिट|पूरा|अचीव)/g, " TARGET HIT "],
  [/एंट्री(?:\s*लेवल)?/g, " ENTRY "],
  [/ख़?रीद(?:ें|ो|े|िए|ना|ी)?|ले\s*लो|बाय/g, " BUY "],
  [/बेच(?:ें|ो|े|िए|ना)?|सेल/g, " SELL "],
  [/टार[्]?गेट|लक्ष्य/g, " TGT "],
  [/स्टॉप\s*लॉस|स्टाप\s*लॉस|एस\s*एल/g, " SL "],
  [/(?:के|से)?\s*ऊपर/g, " ABOVE "],
  [/(?:के|से)?\s*नीचे/g, " BELOW "],
  [/इंट्राडे/g, " INTRADAY "],
  [/हिट/g, " HIT "],
  [/प्रॉफिट|मुनाफ़?ा/g, " PROFIT "],
];

const HINGLISH: [RegExp, string][] = [
  [/\bK[EI]?\s+(?:UPAR|UPER|OOPAR)\b|\bUPAR\b/g, " ABOVE "],
  [/\bK[EI]?\s+(?:NICHE|NEECHE|NEECHEY)\b|\bNICHE\b|\bNEECHE\b/g, " BELOW "],
  [/\bKHARID(?:O|E|EN|IYE|NA)?\b|\bLE\s?LO\b|\bLELO\b|\bBUY\s+KAR(?:O|E|EN|NA)\b/g, " BUY "],
  [/\bBECH(?:O|E|EN|DO|NA)?\b|\bSELL\s+KAR(?:O|E|EN|NA)\b/g, " SELL "],
];

/** Upper-cased, emoji-free text with Hindi and Hinglish trade words mapped to their English forms. */
export function normalise(text: string): string {
  let s = text.normalize("NFKC");
  s = s.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
  for (const [re, to] of HINDI) s = s.replace(re, to);
  s = s.toUpperCase();
  for (const [re, to] of HINGLISH) s = s.replace(re, to);
  s = s
    // "BANKNIFTY (56800) PE" and broker shorthand "NSECALL NIFTY 29SEP2026 23250"
    .replace(/\(\s*(\d+(?:\.\d+)?)\s*\)/g, " $1 ")
    .replace(/\bNSE(CALL|PUT)\s+([A-Z&-]+)\s+(\S+)\s+(\d+(?:\.\d+)?)/g, (_, cp, name, date, strike) => `${name} ${date} ${strike} ${cp === "CALL" ? "CE" : "PE"}`)
    // "don't buy, only watch" is a fig leaf, not an instruction to read
    .replace(/\b(?:DON'?T|DO\s+NOT|NOT\s+A)\s+BUY\b/g, " ")
    .replace(/₹|\bRS\.?(?=\s*\d)|\bINR\b/g, " ")
    .replace(/\/-/g, " ")
    // 24,500 and 1,24,500 are one number; 120,150,180 is a list
    .replace(/\b(\d{1,2}),(\d{2}),(\d{3})\b/g, "$1$2$3")
    .replace(/\b(\d{1,2}),(\d{3})\b(?!,\d)/g, "$1$2")
    // amounts of money and multiples are not price levels: 50K, 2 LAKH, 3X
    .replace(/(?<![\d.])\d+(?:\.\d+)?\s*(?:K|LAKHS?|LACS?|CR|CRORES?|X+)\b/g, " ")
    // list markers: "TGT 1)975 2)935"
    .replace(/(?<![\d.])[1-4]\)/g, " ")
    .replace(/[^A-Z0-9\n .,/\-+@%&:=>#$'()]/g, " ")
    .replace(/[ \t]+/g, " ");
  return s;
}

// ---------------------------------------------------------------- patterns

const NUM = "\\d+(?:\\.\\d+)?";
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MONTH = "(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUNE?|JULY?|AUG(?:UST)?|SEPT?(?:EMBER)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)";
/** a number that is a count or a date, not a price */
const NOT_PRICE = `(?!\\s*(?:ST|ND|RD|TH|SHARES?|LOTS?|QTY|QUANTITY|DAYS?|WEEKS?|MONTHS?|MINS?|MINUTES?|HRS?|EMA|SMA|DMA|TF|PTS?|POINTS?|${MONTH.slice(1, -1)})\\b)(?!\\s*%)`;

const OPTION = new RegExp(`(?<![\\d.])(${NUM})\\s*(?:STRIKE\\s*)?(CE|PE|CALLS?|PUTS?)\\b`, "g");
// "long" and "short" are everyday words ("after a long time", "short term"); they count only as "LONG:" / "GO LONG"
const ACTION = /\b(BUY|BOUGHT|BUYING|SELL|SOLD|ACCUMULATE)\b|\b(?:GO\s+)?(?:LONG|SHORT)\b(?=\s*[:#]|\s+(?:IN|ON)\b)|\bGO\s+(?:LONG|SHORT)\b|\bSHORT\b(?=\s+[A-Z&]+\s+(?:BELOW|ABOVE|AT|@|CMP|FUT|\d))/;
const ACTION_ALL = new RegExp(ACTION.source, "g");
const SHORT_SIDE = /\b(?:SELL|SOLD)\b|\bSHORT\b(?!\s*(?:TERM|SIDE|COVERING|TIME|STRANGLE|STRADDLE))/;

const RESULT =
  /\b(?:TARGETS?|TGT|TG)\s*(?:[123]|1ST|2ND|3RD|FIRST|SECOND|THIRD|FINAL|ALL|BOTH)?\s*(?:FULL\s+|ALMOST\s+)?(?:HITS?|DONE|ACHIEVED|ACHIVED|COMPLETED?|GIVEN|REACHED)\b|\b(?:HITS?|ACHIEVED|ACHIVED|OVERACHIEVED|OVERACHIVED)\b|\bBOOK(?:ED|ING)?\s+(?:FULL\s+|PARTIAL\s+|PART\s+|YOUR\s+|SOME\s+|HALF\s+)?PROFITS?\b|\bPROFITS?\s+BOOK(?:ED)?\b|\bBOOKED\b|\bHIGH\s+MADE\b|\bMADE\s+(?:A\s+|NEW\s+)?(?:LIFETIME\s+)?(?:HIGH|LOW)\b|\b\d+\s*(?:POINTS?|PTS)\s*(?:PROFIT|GAIN|UP|DONE|MOVE)|\bDOUBLED?\b|\bREACHED\s+ALL\b|\bTODAY\s+\d+(?:\.\d+)?\s*%\s*\+?\s*UP\b|\bPROFITS?\b/;
const STOPPED =
  /\b(?:SL|STOP\s*LOSS|STOPLOSS)\s*(?:HITS?|TRIGGERED|TRIGGER|DONE)\b|\bSTOPPED\s+OUT\b|\bSTOP\s+OUT\b|\bEXIT\s+(?:WITH|IN|AT)\s+(?:SMALL\s+)?LOSS\b|\bLOSS\s+BOOK(?:ED)?\b|\bBOOK(?:ED)?\s+LOSS\b/;
const ALMOST = /\b(?:ALMOST|NEAR(?:LY)?|ABOUT\s+TO|CLOSE\s+TO)\b/;
const EXITED = /\bEXIT\b|\bSQUARE\s*OFF\b|\bCLOSE\s+(?:THE\s+)?POSITION\b|\bCOST\s+TO\s+COST\b|\bEXIT\s+AT\s+COST\b/;
/** a status line in front of a repeated call: "Stopped out..... Buy X @ ..", "Book part profit @ .. Buy X .." */
const LEADING_STATUS = /^\W*(?:STOPPED\s+OUT|STOP\s+OUT|SL\s+HIT|BOOK\s+(?:PART\s+|FULL\s+|PARTIAL\s+)?PROFIT|TARGETS?\s+(?:ACHIEVED|HIT|DONE)|EXIT\b|UPDATE\b|INTRADAY\s+UPDATE\b)/;
/** "CMP PRICE 220 · 40 POINT": a running price posted after a call, with the points it is up */
const RUNNING = new RegExp(`\\bCMP(?:\\s+PRICE)?\\W{0,6}(${NUM})\\W{1,8}${NUM}\\W{0,3}(?:POINTS?|PTS)\\b`);
/** "19 TO 68", "450 TO 809": a price move reported after the fact */
const MOVE = new RegExp(`(?<![\\d.])(${NUM})\\s*(?:TO|>+|-+>)\\s*(${NUM})(?![\\d.])`);

const TARGET_KEY = "(?:TARGETS?|TGTS?|TRGT|TRG|TG|TP|T[123]|CAN\\s+TOUCH|MAY\\s+TOUCH)";
const SOFT_TARGET_KEY = "(?:VIEW|EXPECTING|EXPECTED|RESISTANCE|UPSIDE)";
const STOP_KEY = "(?:STOP\\s*LOSS|STOPLOSS|S\\.L\\.?|S/L|CBSL|SL)";
const SOFT_STOP_KEY = "(?:SUPPORT)";
const LEVEL_START = new RegExp(`\\b(?:${TARGET_KEY}|${STOP_KEY})\\b`);
const SOFT_LEVEL_START = new RegExp(`\\b(?:${TARGET_KEY}|${STOP_KEY}|${SOFT_TARGET_KEY}|${SOFT_STOP_KEY})\\b`);

const FILLER = new Set([
  "BUY", "BOUGHT", "BUYING", "SELL", "SOLD", "SHORT", "LONG", "ACCUMULATE", "ADD", "MORE", "FRESH", "NEW", "TRADE", "CALL", "CALLS", "ALERT",
  "OPTION", "OPTIONS", "STOCK", "STOCKS", "INTRADAY", "INTRA", "DAY", "TODAY", "TODAYS", "EXPIRY", "WEEKLY", "MONTHLY", "FUT", "FUTURE",
  "FUTURES", "CASH", "EQ", "EQUITY", "NSE", "HERO", "ZERO", "JACKPOT", "RISKY", "SAFE", "TRADERS", "ONLY", "LOOKS", "GOOD", "ABOVE", "BELOW",
  "NEAR", "AT", "CMP", "LTP", "NOW", "IN", "ON", "THE", "A", "FOR", "OF", "BTST", "STBT", "SWING", "POSITIONAL", "INDEX", "SPOT", "STRIKE",
  "PRICE", "SURE", "SHOT", "BIG", "SPECIAL", "FREE", "PAID", "VIP", "MEMBERS", "QUICK", "FAST", "MOMENTUM", "SCALP", "SCALPING", "NAME",
  "SCRIP", "SCRIPT", "SYMBOL", "TIP", "TIPS", "RECOMMENDATION", "DELIVERY", "SHORTTERM", "TERM", "HOLD", "AGAIN", "ONE", "LOT", "LOTS", "QTY",
  "HIGH", "RISK", "LOW", "TARGET", "TGT", "SL", "ENTRY", "RANGE", "BETWEEN", "AROUND", "AND", "OR", "TO", "ST", "ND", "RD", "TH", "EXP", "CE",
  "PE", "PUT", "PUTS", "IS", "LTD", "LIMITED", "SHARES", "SHARE", "WATCH", "LOOKING", "CAN", "MAY", "TOUCH", "WITH", "VOLUME", "INDIA",
  ...MONTHS,
]);

/** word tokens, including tickers that start with a digit (63MOONS, 360ONE) */
const DATE_TOKEN = new RegExp(`^\\d{1,2}(?:ST|ND|RD|TH)?(?:${MONTH.slice(1, -1)})?\\d{0,4}$`);
const words = (s: string) => (s.match(/(?:[A-Z&][A-Z0-9&]*|\d+[A-Z][A-Z0-9&]*)(?:-[A-Z]+)?/g) ?? []).filter((w) => !DATE_TOKEN.test(w));

// ---------------------------------------------------------------- one segment -> one call

type Draft = Omit<Call, "id" | "msgId" | "ts" | "raw">;

function nameEndingAt(tokens: string[], dict: Dictionary, day: number): Resolved | null {
  // first with every word (HERO MOTO is a name), then with filler words removed (HERO ZERO NIFTY is not)
  for (const list of [tokens, tokens.filter((t) => !FILLER.has(t) || dict.index(t))]) {
    for (let n = Math.min(3, list.length); n >= 1; n--) {
      const tail = list.slice(-n);
      if (n === 1 && FILLER.has(tail[0]) && !dict.index(tail[0])) continue;
      const r = dict.resolve(tail, day);
      if (r && r.words === n) return r;
    }
  }
  return null;
}

function nameStartingAt(tokens: string[], dict: Dictionary, day: number, strict: boolean): Resolved | null {
  let i = 0;
  while (i < tokens.length && FILLER.has(tokens[i]) && !dict.index(tokens[i])) i++;
  if (i >= tokens.length) return null;
  return dict.resolve(tokens.slice(i, i + 3), day, strict) ?? (strict ? null : dict.near(tokens.slice(i, i + 3)));
}

function numbersIn(s: string): number[] {
  return (s.match(new RegExp(NUM, "g")) ?? []).map(Number);
}

interface Found {
  resolved: Resolved;
  strike?: number;
  optType?: "CE" | "PE";
  /** text after the instrument, where entry and levels live */
  rest: string;
  /** text around the instrument, for the expiry hint */
  phrase: string;
  notes: Note[];
  doubt?: Confidence;
  /** where in the message the name was found */
  how?: "option" | "label" | "action" | "tag" | "scan";
}

/** an option whose message gives strike and type but never names the index; resolved against prices later */
export const UNNAMED = "?";

function findInstrument(seg: string, dict: Dictionary, day: number): Found | null {
  const notes: Note[] = [];
  const options = [...seg.matchAll(OPTION)];
  for (const m of options) {
    const before = seg.slice(Math.max(0, m.index! - 60), m.index!);
    const sameLine = before.slice(before.lastIndexOf("\n") + 1);
    let r = nameEndingAt(words(sameLine), dict, day) ?? nameEndingAt(words(before), dict, day);
    let doubt: Confidence | undefined;
    if (!r) {
      // a misspelt name right before the strike: accept the one F&O underlying it is a letter away from
      const last = words(sameLine).filter((t) => !FILLER.has(t)).at(-1);
      r = last ? dict.nearUnderlying(last) : null;
      if (r) {
        notes.push(note("readAs", last!, r.symbol));
        doubt = "medium";
      }
    }
    if (!r) continue;
    const distinct = new Set(options.map((o) => `${+o[1]}${o[2][0]}`));
    if (distinct.size > 1) {
      notes.push(note("firstContract"));
      doubt = "low";
    }
    return {
      resolved: r,
      strike: +m[1],
      optType: m[2][0] === "C" ? "CE" : "PE",
      rest: seg.slice(m.index! + m[0].length),
      phrase: seg.slice(Math.max(0, m.index! - 40), m.index! + m[0].length + 22),
      notes,
      doubt,
      how: "option",
    };
  }

  const named = findNamed(seg, dict, day);
  if (named && options.length) {
    // "#ADANIENSOL … keeping in watchlist 1300 CE … CMP 49": the contract belongs to the stock named above it
    const m = options[0];
    const distinct = new Set(options.map((o) => `${+o[1]}${o[2][0]}`));
    if (distinct.size === 1 && named.resolved.symbol !== UNNAMED) {
      return { ...named, strike: +m[1], optType: m[2][0] === "C" ? "CE" : "PE", rest: seg.slice(m.index! + m[0].length), how: "option" };
    }
  }
  if (!named && options.length && ACTION.test(seg) && +options[0][1] >= 5000) {
    // "BUY SEP 57100 PE @ 405": channels that trade one index stop naming it
    const m = options[0];
    return {
      resolved: { symbol: UNNAMED, kind: "index", via: "name", words: 0 },
      strike: +m[1],
      optType: m[2][0] === "C" ? "CE" : "PE",
      rest: seg.slice(m.index! + m[0].length),
      phrase: seg.slice(Math.max(0, m.index! - 40), m.index! + m[0].length + 22),
      notes: [note("indexUnnamed")],
      doubt: "medium",
      how: "option",
    };
  }
  return named;
}

/** the instrument a message names outside of an option pattern */
function findNamed(seg: string, dict: Dictionary, day: number): Found | null {
  const notes: Note[] = [];
  // "STOCK NAME = TVS MOTORS", "SCRIP: RELIANCE"
  const label = seg.match(/\b(?:STOCK|SCRIPT?|SCRIP|SYMBOL)\s*(?:NAME)?\s*[:=]\s*([^\n]+)/);
  if (label) {
    const r = nameStartingAt(words(label[1]), dict, day, false);
    if (r) return { resolved: r, rest: seg.slice(label.index! + label[0].length), phrase: label[0], notes, how: "label" };
  }

  for (const act of seg.matchAll(ACTION_ALL)) {
    const at = act.index!;
    const after = seg.slice(at + act[0].length);
    const lineStart = seg.lastIndexOf("\n", at) + 1;
    const sameLineBefore = seg.slice(lineStart, at);
    const previousLine = seg.slice(0, lineStart).trimEnd().split("\n").at(-1) ?? "";
    const r =
      nameStartingAt(words(after.split("\n")[0]), dict, day, false) ??
      nameEndingAt(words(sameLineBefore), dict, day) ??
      nameStartingAt(words(previousLine), dict, day, false);
    if (r) return { resolved: r, rest: after, phrase: seg.slice(Math.max(0, at - 40), at + 60), notes, how: "action" };
  }

  const tag = seg.match(/[#$]([A-Z&0-9][A-Z0-9&-]+)/);
  if (tag) {
    const r = dict.resolve([tag[1]], day) ?? dict.near([tag[1]]);
    if (r) return { resolved: r, rest: seg.slice(tag.index! + tag[0].length), phrase: tag[0], notes, how: "tag" };
  }

  // a name near the start of the message, e.g. "TATASTEEL CMP 142 TGT 150 SL 138"
  const firstLine = seg.trim().split("\n")[0];
  const toks = words(firstLine);
  for (let i = 0; i < Math.min(toks.length, 8); i++) {
    const r = nameStartingAt(toks.slice(i), dict, day, true);
    if (r) {
      const where = seg.indexOf(toks[i]);
      return { resolved: r, rest: seg.slice(where + toks[i].length), phrase: firstLine, notes, how: "scan" };
    }
  }
  return null;
}

/** `nameOnly` returns whatever instrument the text names, even when it carries no price levels (used for result posts). */
function parseSegment(seg: string, dict: Dictionary, day: number, nameOnly = false, inherited?: Found): Draft | null {
  const found = inherited ?? findInstrument(seg, dict, day);
  if (!found) return null;
  const { resolved, strike, optType, rest, phrase } = found;
  const notes = [...found.notes];
  let confidence: Confidence = found.doubt ?? "high";
  const lower = (to: Confidence) => {
    if (to === "low" || confidence === "high") confidence = to;
  };
  const hasAction = ACTION.test(seg);

  // soft level words (support / resistance / view) count only in a message that says buy or sell, names a contract,
  // or is headed as a trade
  const soft = hasAction || strike !== undefined || /\b(?:TRADE|IDEA|RECOMMENDATION|INTRADAY|BTST|SWING|POSITIONAL|DELIVERY)\b/.test(seg);
  const levelStart = soft ? SOFT_LEVEL_START : LEVEL_START;
  const levelAt = rest.search(levelStart);
  const front = levelAt >= 0 ? rest.slice(0, levelAt) : rest;
  const head = seg.slice(0, seg.length - rest.length + (levelAt >= 0 ? levelAt : Math.min(rest.length, 80)));

  // ----- kind
  const saysFuture = /\bFUT\b|\bFUTURES?\b/.test(head) && !/\bCASH\b/.test(head);
  const kind: Call["kind"] = strike !== undefined ? "option" : saysFuture || resolved.kind === "index" ? "future" : "equity";
  if (resolved.via === "name" && resolved.words === 1) {
    notes.push(note("partName"));
    lower("medium");
  }

  // ----- side and horizon
  let side: Side = SHORT_SIDE.test(head) && !/\b(?:BUY|BOUGHT|LONG)\b/.test(head) ? "short" : "long";
  let horizon: Horizon = "unspecified";
  if (/\bSTBT\b/.test(head)) {
    horizon = "btst";
    side = "short";
  } else if (/\bBTST\b/.test(seg)) horizon = "btst";
  else if (/\bINTRA\s?DAY\b|\bSCALP|\bHERO\s*(?:OR\s*)?ZERO\b|\bZERO\s*(?:TO\s*)?HERO\b|\bEXPIRY\s+(?:SPECIAL|TRADE|DAY|JACKPOT)\b/.test(seg)) horizon = "intraday";
  else if (/\bPOSITIONAL\b|\bPOSTIONAL\b|\bLONG\s?TERM\b|\bDELIVERY\b|\bMULTIBAGGER\b|\b\d+\s*(?:-\s*\d+\s*)?(?:WEEKS?|MONTHS?)\b/.test(seg)) horizon = "positional";
  else if (/\bSWING\b|\bSHORT\s?TERM\b|\b\d+\s*(?:-\s*\d+\s*)?DAYS?\b/.test(seg)) horizon = "swing";

  // ----- expiry hint
  let expiryHint: ExpiryHint | undefined;
  if (kind !== "equity") {
    const dayMonth = new RegExp(`(?<![\\d.])(\\d{1,2})\\s*(?:ST|ND|RD|TH)?[\\s.-]*${MONTH}`);
    const dm = phrase.match(dayMonth) ?? seg.match(dayMonth);
    const md = phrase.match(new RegExp(`\\b${MONTH}\\s*(\\d{1,2})\\b(?!\\d)`));
    const mo =
      phrase.match(new RegExp(`\\b${MONTH}\\b`)) ??
      seg.match(new RegExp(`\\b${MONTH}\\s+(?:EXPIRY|EXP|SERIES|CONTRACT)\\b`)) ??
      seg.match(new RegExp(`\\b(?:EXPIRY|EXP|MONTHLY)\\s*[:=-]?\\s*${MONTH}\\b`));
    if (dm && +dm[1] >= 1 && +dm[1] <= 31) expiryHint = { day: +dm[1], month: MONTHS.indexOf(dm[2].slice(0, 3)) + 1 };
    // "SEPT26" written together is September 2026, not the 26th
    else if (md && +md[2] >= 1 && +md[2] <= 31 && +md[2] !== strike && !(/[A-Z]\d/.test(md[0]) && +md[2] >= 24 && +md[2] <= 29)) {
      expiryHint = { day: +md[2], month: MONTHS.indexOf(md[1].slice(0, 3)) + 1 };
    }
    else if (mo && mo[1] !== "MAY") expiryHint = { month: MONTHS.indexOf(mo[1].slice(0, 3)) + 1 };
  }

  // ----- entry
  let entry: EntrySpec = { type: "none" };
  const range = (a: string, b?: string): EntrySpec => {
    const x = +a;
    if (b === undefined) return { type: "at", lo: x };
    let y = +b;
    // "130-40" is shorthand for 130-140
    const whole = a.split(".")[0];
    if (y < x && b.length < whole.length) {
      const full = +(whole.slice(0, whole.length - b.length) + b);
      if (full > x && full <= x * 1.35) y = full;
    }
    const lo = Math.min(x, y),
      hi = Math.max(x, y);
    // a buying zone, written either way round ("100-80"); anything wider is not a zone
    return y !== x && hi <= lo * 1.35 ? { type: "range", lo, hi } : { type: "at", lo: x };
  };
  const sep = "\\s*(?:OF|IS)?\\s*[@:=-]?\\s*";
  const span = `(${NUM})${NOT_PRICE}(?:\\s*(?:-+|TO|/|&|AND)\\s*(${NUM}))?`;
  const above = front.match(new RegExp(`\\b(?:ABOVE|ABV|OVER|CROSS(?:ES|ING)?)${sep}${span}`)) ?? front.match(new RegExp(`(?<![\\d.])(${NUM})\\s*ABOVE\\b`));
  const below = front.match(new RegExp(`\\b(?:BELOW|BLW|UNDER)${sep}${span}`)) ?? front.match(new RegExp(`(?<![\\d.])(${NUM})\\s*BELOW\\b`));
  const at = front.match(new RegExp(`(?:@|\\b(?:AT|NEAR|NR|AROUND|ENTRY|RANGE|BETWEEN|PRICE|ZONE|LEVEL)\\b)\\s*(?:PRICE|RANGE|ZONE|LEVEL)?${sep}${span}`));
  const cmp = front.match(new RegExp(`\\b(?:CMP|LTP)${sep}${span}`));
  const bare = front.match(new RegExp(`(?<![A-Z0-9.])${span}(?![A-Z0-9])`));
  if (above) entry = { type: "above", lo: +above[1] };
  else if (below) entry = { type: "below", lo: +below[1] };
  else if (at) entry = range(at[1], at[2]);
  else if (cmp) entry = range(cmp[1], cmp[2]);
  else if (bare) entry = range(bare[1], bare[2]);
  const ref = entry.type === "range" ? ((entry.lo ?? 0) + (entry.hi ?? 0)) / 2 : entry.lo;

  // ----- targets and stop
  const dir = side === "long" ? 1 : -1;
  /** a level given as points or percent away from the entry */
  const relative = (n: number, tail: string, towards: number): number | null | undefined => {
    if (/^\s*(?:POINTS?|PTS?)\b/.test(tail)) return ref !== undefined ? ref + towards * n : null;
    if (/^\s*(?:-\s*\d+(?:\.\d+)?\s*)?%/.test(tail)) return ref !== undefined ? ref * (1 + (towards * n) / 100) : null;
    return undefined; // an absolute price
  };
  const targets: number[] = [];
  const tKeys = soft ? `(?:${TARGET_KEY}|${SOFT_TARGET_KEY})` : TARGET_KEY;
  // "TARGET 1: 300" and "TGT 2 350" carry an index; "TRG 360/460" does not
  const tgtRe = new RegExp(`\\b${tKeys}\\s*(?:[123]\\s*[:=)\\-]\\s*|[123]\\s+(?=\\d))?(?:PRICE)?[\\s:=>.\\-]*((?:${NUM}\\+*\\s*(?:[/,&\\-]+|\\bTO\\b|\\bAND\\b)?\\s*){1,8})`, "g");
  for (const m of rest.matchAll(tgtRe)) {
    const tail = rest.slice(m.index! + m[0].length);
    for (const n of numbersIn(m[1])) {
      const rel = relative(n, tail, dir);
      if (rel === undefined) targets.push(n);
      else if (rel !== null) targets.push(Math.round(rel * 100) / 100);
    }
  }
  if (!targets.length && entry.lo !== undefined) {
    // "BUY X 3540 CE ABOVE 147 TO 160-180-210 SL 120": the levels after TO are the targets
    const to = front.match(new RegExp(`\\b(?:ABOVE|BELOW|AT|@|CMP)\\s*${NUM}\\s*(?:TO|FOR)\\s+((?:${NUM}\\+*\\s*[/,\\-]?\\s*){2,6})`));
    if (to) targets.push(...numbersIn(to[1]));
  }
  let stop: number | undefined;
  const sKeys = soft ? `(?:${STOP_KEY}|${SOFT_STOP_KEY})` : STOP_KEY;
  const sl = rest.match(new RegExp(`\\b${sKeys}\\s*(?:PRICE|LEVEL)?\\s*[:=>.\\-@]*\\s*(?:AT|BELOW|ABOVE|NEAR|OF|IS|JUST)?\\s*[:=-]?\\s*(${NUM})`));
  if (sl) {
    const rel = relative(+sl[1], rest.slice(sl.index! + sl[0].length), -dir);
    stop = rel === undefined ? +sl[1] : rel === null ? undefined : Math.round(rel * 100) / 100;
    if (stop === 0) {
      stop = undefined;
      notes.push(note("stopZero"));
    }
  }

  const uniq = [...new Set(targets)].filter((t) => t > 0 && t !== strike);
  uniq.sort((a, b) => (side === "long" ? a - b : b - a));

  // ----- is this a call at all?
  if (!nameOnly) {
    const levels = uniq.length > 0 || stop !== undefined;
    if (entry.type === "none" && !levels && !(kind === "option" && hasAction)) return null;
    // without the word buy or sell, a stock needs a price and a level; an index level needs a level too
    if (kind === "equity" && !hasAction && !(entry.type !== "none" && levels)) return null;
    if (kind === "future" && resolved.kind === "index" && !(found.how === "action" && (levels || (saysFuture && ref !== undefined)))) return null;
    // a name picked from a hashtag or from running text needs both a price and a level to count
    if (kind !== "option" && (found.how === "tag" || found.how === "scan") && !(entry.type !== "none" && levels)) return null;
    // market commentary and news digests run long; a call is short
    if (kind !== "option" && seg.length > 600) return null;
    // an index "price" in the tens or hundreds is an option premium whose contract was not named
    if (kind === "future" && resolved.kind === "index" && ref !== undefined && ref < 1000) return null;
  }

  // ----- confidence
  if (!hasAction && kind !== "option") {
    notes.push(note("noAction"));
    lower("medium");
  }
  if (entry.type === "none") {
    notes.push(note("noEntry"));
    lower("medium");
  }
  if (!uniq.length && stop === undefined) {
    notes.push(note("noLevels"));
    lower("medium");
  }
  if (ref !== undefined) {
    if (uniq.length && dir * (uniq[0] - ref) <= 0) {
      notes.push(note("targetWrongSide"));
      lower("low");
    }
    if (stop !== undefined && dir * (ref - stop) <= 0) {
      notes.push(note("stopWrongSide"));
      lower("low");
    }
  }

  return { kind, symbol: resolved.symbol, strike, optType, expiryHint, side, entry, targets: uniq, stop, horizon, confidence, notes };
}

// ---------------------------------------------------------------- messages -> everything

function classifyFollowUp(norm: string): FollowUpKind | null {
  if (STOPPED.test(norm)) return "stop-hit";
  if (RESULT.test(norm)) return /\bPROFIT|\bBOOK/.test(norm) && !/\b(?:HITS?|DONE|ACHIEVED|ACHIVED|GIVEN)\b/.test(norm) ? "profit" : "target-hit";
  if (EXITED.test(norm)) return "exit";
  return null;
}

const CLAIM_A = new RegExp(`(\\d{2,3}(?:\\.\\d+)?)\\s*%\\s*(?:\\+\\s*)?(?:ACCURACY|ACCURATE|SUCCESS|WIN|STRIKE\\s*RATE|SURE|GUARANTEE)`);
const CLAIM_B = new RegExp(`(?:ACCURACY|SUCCESS\\s*RATE|WIN\\s*RATE|STRIKE\\s*RATE|ACCURATE)[^\\d\\n]{0,20}(\\d{2,3}(?:\\.\\d+)?)\\s*%`);
const STOP_LEVEL = new RegExp(`\\b${STOP_KEY}\\s*(?:PRICE|LEVEL)?\\s*[:=>.\\-@]*\\s*(?:AT|BELOW|NEAR|OF|IS)?\\s*[:=-]?\\s*${NUM}`);
const TARGET_LEVEL = new RegExp(`\\b${TARGET_KEY}\\s*[123]?\\s*[:=>.\\-]*\\s*${NUM}`);
const DIVIDER = /\n\s*[-_=—]{4,}[^\n]*\n|\n\s*(?:DISCLAIMER|DISC\b|NOTE\s*:)/;

const sameCall = (a: Draft, b: Draft) =>
  a.symbol === b.symbol &&
  a.strike === b.strike &&
  a.optType === b.optType &&
  a.side === b.side &&
  a.entry.lo === b.entry.lo &&
  a.entry.hi === b.entry.hi &&
  a.stop === b.stop &&
  a.targets.join() === b.targets.join();

export function extract(messages: Msg[], dict: Dictionary, days: string[]): Extraction {
  const out: Extraction = { calls: [], followUps: [], claims: [], unread: [], reposts: 0 };
  const sorted = [...messages].sort((a, b) => a.ts.localeCompare(b.ts) || a.id - b.id);
  /** the instrument named by each message, for replies and split posts that give levels without repeating the name */
  const namedBy = new Map<number, Found>();
  let previous: { id: number; t: number } | undefined;

  for (const msg of sorted) {
    if (!msg.text.trim()) {
      if (msg.hasPhoto) out.unread.push({ msgId: msg.id, ts: msg.ts, why: "image-only", raw: "" });
      continue;
    }
    // "Channel pinned «…»" repeats an earlier message
    if (/ pinned «| pinned a /.test(msg.text.slice(0, 80))) continue;
    const whole = normalise(msg.text);
    // what follows a divider line is a disclaimer or an alternative set of levels
    const cut = whole.search(DIVIDER);
    const norm = cut > 20 ? whole.slice(0, cut) : whole;
    const day = placeMessage(msg.ts, days)?.day ?? days.length - 1;
    const t = Date.parse(msg.ts);
    const before = previous;
    previous = { id: msg.id, t };

    const claim = whole.match(CLAIM_A) ?? whole.match(CLAIM_B);
    if (claim && +claim[1] >= 50 && +claim[1] <= 100) out.claims.push({ msgId: msg.id, ts: msg.ts, percent: +claim[1], raw: msg.text });

    const hasStop = STOP_LEVEL.test(norm);
    const hasTarget = TARGET_LEVEL.test(norm);
    let followKind = classifyFollowUp(norm);
    const move = norm.match(MOVE);
    // "TCS 2140 PE 19 TO 68": a move reported after the fact, with no levels to act on
    if (!followKind && move && !hasStop && !hasTarget && !ACTION.test(norm) && Math.abs(+move[2] / +move[1] - 1) >= 0.025) followKind = "profit";
    const running = !hasStop && !hasTarget && !ACTION.test(norm) ? norm.match(RUNNING) : null;
    if (!followKind && running) followKind = "profit";
    // a result post has no stop-loss of its own, unless it opens with the status and then repeats the call
    if (followKind && (!hasStop || LEADING_STATUS.test(norm))) {
      const found = parseSegment(norm.replace(RESULT, " ").replace(STOPPED, " ").replace(RUNNING, " "), dict, day, true);
      out.followUps.push({
        msgId: msg.id,
        ts: msg.ts,
        kind: followKind,
        raw: msg.text,
        ...(followKind === "target-hit" && !ALMOST.test(norm) ? { claimsTarget: true } : {}),
        ...(move ? { quoted: +move[2] } : running ? { quoted: +running[1] } : {}),
        ...(found ? { callId: linkKey(found) } : {}),
      });
      continue;
    }

    const named = findInstrument(norm, dict, day);
    if (named) namedBy.set(msg.id, named);

    // one message may carry several calls: one per contract named, or one per paragraph
    const parts = byContract(norm) ?? norm.split(/\n\s*\n/).filter((b) => b.trim());
    const perPart = parts.length > 1 ? parts.map((b) => parseSegment(b, dict, day)).filter((d): d is Draft => !!d) : [];
    let drafts = perPart.length > 1 ? perPart : [parseSegment(norm, dict, day)].filter((d): d is Draft => !!d);

    if (!drafts.length && !named && (hasStop || hasTarget)) {
      // levels without a name: the instrument is in the message this one replies to, or in the one posted just before it
      const source = (msg.replyTo !== undefined ? namedBy.get(msg.replyTo) : undefined) ?? (before && t - before.t <= 15 * 60_000 ? namedBy.get(before.id) : undefined);
      if (source) {
        const d = parseSegment(norm, dict, day, false, { ...source, rest: norm, notes: [note("fromEarlier")], doubt: "medium" });
        if (d) drafts = [d];
      }
    }

    if (!drafts.length) {
      const looksLikeCall = norm.length <= 600 && ((hasStop && ACTION.test(norm)) || (!!norm.match(OPTION) && (hasStop || hasTarget || ACTION.test(norm))));
      if (looksLikeCall) out.unread.push({ msgId: msg.id, ts: msg.ts, why: "no-instrument", raw: msg.text });
      continue;
    }
    drafts.forEach((draft, k) => {
      // the same call, word for word, posted again the same day is a reminder; on a later day it is a fresh call
      const again = out.calls.findLast((c) => t - Date.parse(c.ts) <= 18 * 3600e3 && sameCall(c, draft));
      if (again) {
        out.reposts++;
        return;
      }
      const notes = [...draft.notes];
      if (msg.edited) notes.push(note("edited"));
      out.calls.push({ ...draft, notes, id: drafts.length > 1 ? `${msg.id}.${k + 1}` : `${msg.id}`, msgId: msg.id, ts: msg.ts, raw: msg.text });
    });
  }

  linkFollowUps(out, sorted);
  return out;
}

/** Splits a message at every line that names a new option contract; null when it names fewer than two. */
function byContract(norm: string): string[] | null {
  const starts: number[] = [];
  const seen = new Set<string>();
  for (const m of norm.matchAll(OPTION)) {
    const key = `${+m[1]}${m[2][0]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    starts.push(norm.lastIndexOf("\n", m.index!) + 1);
  }
  const lines = [...new Set(starts)];
  if (lines.length < 2) return null;
  return lines.map((at, i) => (i === 0 ? norm.slice(0, lines[1]) : norm.slice(at, lines[i + 1] ?? norm.length)));
}

/** temporary key used to tie a result post to the call it talks about */
function linkKey(c: Pick<Call, "symbol" | "strike" | "optType">) {
  return `?${c.symbol}|${c.strike ?? ""}|${c.optType ?? ""}`;
}

function linkFollowUps(out: Extraction, sorted: Msg[]) {
  const byMsg = new Map<number, Call[]>();
  for (const c of out.calls) byMsg.set(c.msgId, [...(byMsg.get(c.msgId) ?? []), c]);
  const replyOf = new Map(sorted.map((m) => [m.id, m.replyTo]));
  const DAY = 864e5;

  for (const f of out.followUps) {
    const t = Date.parse(f.ts);
    const named = f.callId?.startsWith("?") ? f.callId.slice(1).split("|") : null;
    const same = (c: Call) =>
      !named ||
      ((c.symbol === named[0] || ((c.symbol === UNNAMED || named[0] === UNNAMED) && !!named[1])) &&
        (!named[1] || (String(c.strike ?? "") === named[1] && (c.optType ?? "") === named[2])));
    const earlier = out.calls.filter((c) => Date.parse(c.ts) <= t);

    // 1. a reply to the call's own message; 2. the latest call on the instrument the post names;
    // 3. a bare "target hit" with no name refers to the latest call, if that was within a day
    const reply = replyOf.get(f.msgId);
    let hit = reply !== undefined ? byMsg.get(reply)?.find(same) : undefined;
    if (!hit && named) hit = earlier.filter((c) => t - Date.parse(c.ts) <= 15 * DAY).findLast(same);
    if (!hit && !named && reply === undefined) {
      const last = earlier.at(-1);
      if (last && t - Date.parse(last.ts) <= DAY) hit = last;
    }
    if (hit) f.callId = hit.id;
    else delete f.callId;
  }
}
