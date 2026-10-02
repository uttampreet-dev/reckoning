// Counts what a channel spends its messages on: teaching, calling trades, or selling.
// Every cue keeps the message it came from, so the screen can show evidence instead of a score.
import type { Msg } from "./types";
import { normalise } from "./extract";

export type CueKind =
  | "paid-group" // premium / VIP / paid membership pitches
  | "payment" // UPI ids, payment links, account numbers
  | "contact" // "DM me", WhatsApp numbers
  | "join-link" // links into other groups and channels
  | "guarantee" // sure shot, 100%, guaranteed, jackpot
  | "profit-brag" // screenshots and rupee figures of profits
  | "urgency" // limited seats, last chance, hurry
  | "account-handling" // offers to trade the follower's account
  | "paywalled-levels"; // the stop-loss or target is withheld unless the follower pays

export interface Cue {
  kind: CueKind;
  msgId: number;
  ts: string;
  /** the words that triggered it */
  match: string;
}

const RULES: [CueKind, RegExp][] = [
  ["paid-group", /\b(?:PREMIUM|VIP|PAID)\s+(?:GROUP|CHANNEL|MEMBER(?:S|SHIP)?|SERVICE|PLAN|CALLS?|SUBSCRIPTION|JOIN)|\b(?:JOIN|TAKE|GET|BUY)\s+(?:OUR\s+)?(?:PREMIUM|VIP|PAID)\b|\bSUBSCRIPTION\s+(?:FEE|CHARGE|PLAN)|\bMEMBERSHIP\b|\bPAY\s*(?:&|AND)\s*JOIN\b|\bLIFETIME\s+(?:ACCESS|PLAN|MEMBERSHIP)/],
  ["payment", /\b[A-Z0-9._-]{3,}@(?:YBL|OKAXIS|OKHDFCBANK|OKICICI|OKSBI|PAYTM|UPI|IBL|AXL|APL|FBL|KOTAK|SBI|ICICI|HDFCBANK|AXISBANK)\b|\bUPI\s*(?:ID)?\s*[:=-]|\b(?:PHONEPE|GPAY|GOOGLE\s?PAY|PAYTM)\s+(?:NO|NUMBER|ON|TO|:)|\bRAZORPAY\.|\bRZP\.IO|\bONETAPAY\.|\bCOSMOFEED\.|\bSUPERPROFILE\.|\bGRAPHY\.|\bTOPMATE\.|\bA\/C\s*(?:NO|NUMBER)|\bIFSC\b|\bSCAN\s+(?:THE\s+)?QR/],
  ["contact", /\bDM\b|\bINBOX\b|\bPING\s+ME\b|\bMSG\s+(?:ME|ON)\b|\bMESSAGE\s+(?:ME|US|ON)\b|\bWHATSAPP\b|\bWA\.ME\b|\bCONTACT\s+(?:ME|US|ADMIN|ON)\b|\bCALL\s+(?:ME|US)\s+(?:ON|AT)\b/],
  ["join-link", /\bT\.ME\/(?:\+|JOINCHAT)|\bTELEGRAM\.ME\/|\bCHAT\.WHATSAPP\.COM\/|\bJOIN\s+(?:FAST|NOW|HERE|US|OUR|FREE|LINK)/],
  ["guarantee", /\bSURE\s?SHOT\b|\b100\s*%|\bGUARANTEED?\b|\bJACKPOT\b|\bNO\s+LOSS\b|\bZERO\s+LOSS\b|\bRISK\s?FREE\b|\bLOSS\s+RECOVER(?:Y)?\b|\bDOUBLE\s+(?:YOUR\s+)?(?:MONEY|CAPITAL)\b|\bFIXED\s+(?:PROFIT|RETURN)|\bDAILY\s+(?:PROFIT|INCOME)\s+(?:OF\s+)?\d|\bMULTIBAGGER\b|\bROCKET\b|\b\dX\s+RETURN/],
  ["profit-brag", /\b(?:PROFIT|GAIN(?:ING|ED)?|EARN(?:ED|ING)?|MADE)\s*(?:OF\s+)?(?:RS\.?\s*)?[-:]?\s*\d[\d,.]*\s*(?:K|L|LAKH|LAC|CR|\/-|\/|\+)?|\b\d[\d,.]*\s*(?:K|L|LAKH|LAC)\s+(?:PROFIT|GAIN)|\bPROFIT\s+SCREENSHOT|\bMEMBERS?\s+(?:PROFIT|EARN)/],
  ["urgency", /\bLIMITED\s+(?:SEATS?|SLOTS?|TIME|OFFER)|\bLAST\s+(?:CHANCE|DAY|FEW)|\bHURRY\b|\bOFFER\s+(?:ENDS?|VALID|CLOS)|\bONLY\s+\d+\s+(?:SEATS?|SLOTS?|MEMBERS?)|\bDON'?T\s+MISS\b|\bFAST\s+FAST\b/],
  ["paywalled-levels", /\b(?:SL|S\.L|STOP\s*LOSS|STOPLOSS|TARGETS?|TGT)\s*[:\-]*\s*(?:IS\s+|IN\s+)?(?:PAID|PREMIUM|VIP|CLICK\s+HERE)\b|\b(?:TARGET|STOP\s*LOSS|STOPLOSS)[^\n]{0,40}\bEXCLUSIVELY\s+FOR\b/],
  ["account-handling", /\bACCOUNT\s+(?:HANDLING|MANAGEMENT|HANDLE)|\bHANDL(?:E|ING)\s+YOUR\s+ACCOUNT|\bPROFIT\s+SHARING\b|\bPMS\s+SERVICE|\bWE\s+(?:WILL\s+)?TRADE\s+(?:IN|ON)\s+YOUR/],
];

export interface PromoReport {
  cues: Cue[];
  byKind: Record<CueKind, number>;
  /** messages with at least one selling cue */
  sellingMessages: number;
  /** messages with text */
  textMessages: number;
}

/** these cues ask the follower for money or contact; guarantees and brags are persuasion */
const SELLING: CueKind[] = ["paid-group", "payment", "contact", "join-link", "urgency", "account-handling", "paywalled-levels"];

export function scanPromotion(messages: Msg[]): PromoReport {
  const cues: Cue[] = [];
  const byKind = Object.fromEntries(RULES.map(([k]) => [k, 0])) as Record<CueKind, number>;
  let sellingMessages = 0,
    textMessages = 0;
  for (const m of messages) {
    if (!m.text.trim()) continue;
    textMessages++;
    // links are matched on the raw text; normalising would strip them
    const norm = normalise(m.text) + "\n" + m.text.toUpperCase();
    let selling = false;
    for (const [kind, re] of RULES) {
      const hit = norm.match(re);
      if (!hit) continue;
      cues.push({ kind, msgId: m.id, ts: m.ts, match: hit[0].trim().slice(0, 60) });
      byKind[kind]++;
      if (SELLING.includes(kind)) selling = true;
    }
    if (selling) sellingMessages++;
  }
  return { cues, byKind, sellingMessages, textMessages };
}
