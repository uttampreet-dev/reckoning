// Indian market time. The exchange runs on IST (UTC+5:30, no daylight saving), 09:15 to 15:30.
const IST_OFFSET_MIN = 330;

export interface IstStamp {
  /** YYYY-MM-DD in IST */
  date: string;
  /** minutes since midnight IST */
  minutes: number;
}

export function toIst(iso: string): IstStamp {
  const t = new Date(iso).getTime() + IST_OFFSET_MIN * 60_000;
  const d = new Date(t);
  return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

export const MARKET_OPEN = 9 * 60 + 15;
export const MARKET_CLOSE = 15 * 60 + 30;

export type Session = "before-open" | "in-session" | "after-close" | "closed-day";

/** Where a message falls relative to the trading session, and the first trading day it could act on. */
export function placeMessage(iso: string, days: string[]): { session: Session; day: number; minutesIn?: number } | null {
  const { date, minutes } = toIst(iso);
  let i = lowerBound(days, date);
  if (i >= days.length) return null;
  if (days[i] !== date) return { session: "closed-day", day: i };
  if (minutes < MARKET_OPEN) return { session: "before-open", day: i };
  if (minutes < MARKET_CLOSE) return { session: "in-session", day: i, minutesIn: minutes - MARKET_OPEN };
  i += 1;
  return i < days.length ? { session: "after-close", day: i } : null;
}

/** first index whose value is >= x */
export function lowerBound(sorted: string[], x: string): number {
  let lo = 0,
    hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2025-10-28" -> "28-Oct-2025" */
export const prettyDate = (ymd: string) => `${ymd.slice(8, 10)}-${MONTHS[+ymd.slice(5, 7) - 1]}-${ymd.slice(0, 4)}`;
