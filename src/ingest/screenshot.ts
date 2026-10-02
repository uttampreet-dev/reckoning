// Text read from screenshots of a chat. A screenshot shows each message's time but only now and then a date
// (the pill between two days), so the day is asked for and the times are taken from the picture.
import type { Channel, Msg } from "../engine/types";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
// the pill between two days: "1 December", "December 1, 2025", "Mon, 1 Dec", "01/12/2025"
// (after a year, the reader may leave a mark or two from the pattern behind the pill)
const TAIL = "(?:\\s+\\S{1,2}){0,3}";
const DAY_FIRST = new RegExp(`^(?:[a-z]{3,9},?\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}\\.?,?(?:\\s+(\\d{4})${TAIL})?$`, "i");
const MONTH_FIRST = new RegExp(`^(?:[a-z]{3,9},?\\s+)?${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?(?:\\s+(\\d{4})${TAIL})?$`, "i");
const NUMERIC = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/;
// a message ends with its time; a channel post has a view count before it, an edited one says so
// (ticks, or a stray mark the reader makes of the bubble's corner, may follow it)
const TIME_END = /(?:^|\s)(\d{1,2}):(\d{2})(?:\s*([ap])\.?\s?m\.?)?(?:\s*\S{1,3})?\s*$/i;
const FOOTER = /^(?:edited|[^\p{L}\p{N}]+)*$/iu;

const pad = (n: number) => String(n).padStart(2, "0");
const valid = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && !isNaN(new Date(`${y}-${pad(m)}-${pad(d)}T00:00:00Z`).getTime());

/**
 * A line that is only a date. Without a year it is the latest such date not after `ref`, or, inside a run of
 * messages (`forward`), the first one not before it.
 */
function dayOf(line: string, ref: string, forward = false): string | undefined {
  const s = line.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  let d: number, m: number, y: number | undefined;
  let hit = s.match(DAY_FIRST);
  if (hit) [d, m, y] = [+hit[1], MONTHS.indexOf(hit[2].slice(0, 3).toLowerCase()) + 1, hit[3] ? +hit[3] : undefined];
  else if ((hit = s.match(MONTH_FIRST))) [d, m, y] = [+hit[2], MONTHS.indexOf(hit[1].slice(0, 3).toLowerCase()) + 1, hit[3] ? +hit[3] : undefined];
  else if ((hit = s.match(NUMERIC))) [d, m, y] = [+hit[1], +hit[2], hit[3].length === 2 ? 2000 + +hit[3] : +hit[3]];
  else return undefined;
  if (y === undefined) {
    y = +ref.slice(0, 4);
    const md = `${pad(m)}-${pad(d)}`;
    if (forward ? `${y}-${md}` < ref : `${y}-${md}` > ref) y += forward ? 1 : -1;
  }
  return valid(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : undefined;
}

/**
 * The day to offer for the messages: the first date line in the text, when messages follow it. A date line
 * with nothing under it only says the messages above are older, not when they were posted.
 */
export function guessDay(text: string, today: string): string | undefined {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const day = dayOf(lines[i], today);
    if (!day) continue;
    return lines.slice(i + 1).some((l) => !dayOf(l, today) && TIME_END.test(l)) ? day : undefined;
  }
  return undefined;
}

// what sits between a channel post's text and its time: the view count and the eye beside it, as the reader sees them
const VIEWS = /(?:^|\s+)\d[\d.,]*\s*[km]?\s+(?:[^\p{L}\p{N}\s]{1,2}|[oOQ])\s*$/iu;
const BARE_COUNT = /^\s*\d[\d.,]*\s*[km]?\s*$/i;
const ELLIPSIS = /(?:…|\.{2,})\s*\S{0,2}\s*$/;
const words = (s: string) => (s.match(/[\p{L}\p{M}]{3,}/gu) ?? []).join(" ").toLowerCase();
const MARKET = /\b(?:buy|sell|book|profit|target|tgt|exit|hit|stop|loss|call|put|update|cmp|nifty|banknifty|sensex|paid|premium|join)\b/;
const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Splits the text into messages. `day` (YYYY-MM-DD, India) dates the messages until a date line in the text
 * says otherwise; when the first date line is that same day, whatever sits above it belongs to an earlier,
 * unknown day and is left out. With no times in the text at all, blank lines separate messages, as with pasted text.
 *
 * A chat screen repeats things that are not the message: the sender's name on every bubble, the line quoted
 * above a reply, the header with the subscriber count. Those are taken out, so a quoted call is not counted twice.
 */
export function parseScreenshotText(text: string, day: string): Channel {
  const found: { day: string | null; minutes: number; lines: string[] }[] = [];
  let current: string | null = day;
  let minutes = 9 * 60 + 15; // until a time is read: the market's open, so order is kept and the day is the stated one
  let lines: string[] = [];
  let timed = false;
  let subscribers: string | undefined;
  const close = (at: number) => {
    const kept = lines.filter((l) => l.trim());
    lines = [];
    if (!kept.length) return;
    minutes = at;
    found.push({ day: current, minutes: at, lines: kept });
  };

  const all = text.split(/\r?\n/);
  const counted = all.some((l) => {
    const t = l.match(TIME_END);
    return !!t && VIEWS.test(l.slice(0, t.index));
  });
  const firstDate = all.map((l) => dayOf(l, day, true)).find(Boolean);
  if (firstDate === day) current = null;
  for (const raw of all) {
    const line = raw.trimEnd();
    const date = dayOf(line, current ?? day, true);
    if (date) {
      close(minutes + 1);
      current = date;
      continue;
    }
    const subs = line.match(/([\d.,]+\s*[km]?)\s+(?:subscribers?|members?)\b/i);
    if (subs) {
      subscribers = subs[1].replace(/\s+/g, "");
      lines = []; // the channel's name sits above its subscriber count: neither is a message
      continue;
    }
    const t = line.match(TIME_END);
    if (t && +t[1] < 24 && +t[2] < 60) {
      let hour = +t[1];
      if (t[3]) {
        const pm = /p/i.test(t[3]);
        if (pm && hour < 12) hour += 12;
        if (!pm && hour === 12) hour = 0;
      }
      const before = line.slice(0, t.index).replace(VIEWS, "").trimEnd();
      // where the screen shows view counts, a lone number beside the time is one whose eye was not read
      if (!FOOTER.test(before) && !(counted && BARE_COUNT.test(before))) lines.push(before);
      timed = true;
      close(hour * 60 + +t[2]);
      continue;
    }
    lines.push(line);
  }
  if (timed) close(minutes + 1);
  else {
    // no times were read: fall back to blank lines between messages
    const blocks = lines.join("\n").split(/\n\s*\n/);
    lines = [];
    for (const b of blocks) {
      lines = b.split("\n");
      close(minutes + 1);
    }
  }

  // the sender's name: the same words, with no figure in them, above the text of three or more bubbles
  const names = new Map<string, number>();
  for (const f of found) {
    const here = new Set(f.lines.slice(0, -1).filter((l) => !/\d/.test(l)).map(words).filter((w) => w && !MARKET.test(w)));
    for (const w of here) names.set(w, (names.get(w) ?? 0) + 1);
  }
  const sender = [...names].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1])[0]?.[0];
  // not part of any message: the sender's name, and marks with neither a word nor a figure in them
  const noise = (l: string) => !/\d/.test(l) && (words(l) === "" || words(l) === sender);

  const messages: Msg[] = [];
  const seen = new Set<string>();
  const said: { id: number; key: string }[] = [];
  /** the earlier message a quoted line comes from; the reader may put a stray mark or two in front of the quote */
  const quoted = (line: string) => {
    const key = squash(line.replace(ELLIPSIS, ""));
    for (let skip = 0; skip <= 4 && key.length - skip >= 12; skip++) {
      const from = said.findLast((m) => m.key.startsWith(key.slice(skip)));
      if (from) return from.id;
    }
    return undefined;
  };
  for (const f of found) {
    if (!f.day) continue;
    let replyTo: number | undefined;
    const kept = f.lines.filter((l) => !noise(l));
    const own = kept.filter((l, i) => {
      if (i === kept.length - 1) return true;
      // a reply shows the start of the message it answers: cut short with dots, or word for word
      const from = quoted(l);
      if (from) replyTo ??= from;
      return !from && !ELLIPSIS.test(l);
    });
    const body = own.join("\n").trim();
    if (!body) continue;
    // two screenshots that overlap show the same message twice
    const mark = `${f.day} ${f.minutes} ${replyTo ?? ""} ${squash(body)}`;
    if (seen.has(mark)) continue;
    seen.add(mark);
    const id = messages.length + 1;
    said.push({ id, key: squash(body) });
    messages.push({ id, ts: new Date(`${f.day}T${pad(Math.floor(f.minutes / 60))}:${pad(f.minutes % 60)}:00+05:30`).toISOString(), text: body, ...(replyTo ? { replyTo } : {}) });
  }
  return { source: "screenshots", title: "Screenshots", ...(subscribers ? { subscribers } : {}), messages };
}
