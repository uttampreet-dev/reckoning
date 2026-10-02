// Readers for the ways a channel can arrive: Telegram's public preview page, a Telegram Desktop export,
// a WhatsApp chat export, or plain pasted text. All of them produce the same Msg list.
import type { Channel, Msg } from "../engine/types";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|blockquote|pre)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export interface PreviewPage {
  title?: string;
  subscribers?: string;
  description?: string;
  messages: Msg[];
  /** id to pass as ?before= for the next older page, if there is one */
  before?: number;
}

/** Parses one page of https://t.me/s/<channel>. Returns no messages when the channel has previews turned off. */
export function parsePreviewPage(html: string): PreviewPage {
  const pick = (re: RegExp) => {
    const m = html.match(re);
    return m ? htmlToText(m[1]) : undefined;
  };
  const page: PreviewPage = {
    title: pick(/tgme_channel_info_header_title[^>]*>([\s\S]*?)<\/div>/),
    subscribers: pick(/<span class="counter_value">([^<]*)<\/span>\s*<span class="counter_type">subscribers?/),
    description: pick(/tgme_channel_info_description[^>]*>([\s\S]*?)<\/div>/),
    messages: [],
  };
  const more = html.match(/class="tme_messages_more[^"]*"[^>]*data-before="(\d+)"/) ?? html.match(/data-before="(\d+)"/);
  if (more) page.before = +more[1];

  const parts = html.split(/<div class="tgme_widget_message_wrap/).slice(1);
  for (const part of parts) {
    const id = part.match(/data-post="[^"\/]+\/(\d+)"/);
    const times = [...part.matchAll(/<time[^>]*datetime="([^"]+)"/g)];
    if (!id || !times.length) continue;
    // "Channel pinned a message" and similar notices are not messages
    if (/^[^>]*service_message/.test(part)) continue;
    const text = part.match(/<div class="tgme_widget_message_text js-message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const reply = part.match(/class="tgme_widget_message_reply[^"]*"[^>]*href="[^"]*\/(\d+)"/);
    const fwd = part.match(/tgme_widget_message_forwarded_from_name[^>]*>([\s\S]*?)<\/(?:a|span)>/);
    const views = part.match(/tgme_widget_message_views">([^<]*)</);
    const meta = part.match(/class="tgme_widget_message_meta">([\s\S]*?)<a /);
    page.messages.push({
      id: +id[1],
      ts: new Date(times[times.length - 1][1]).toISOString(),
      text: text ? htmlToText(text[1]) : "",
      ...(/(tgme_widget_message_photo_wrap|tgme_widget_message_video|tgme_widget_message_document)/.test(part) ? { hasPhoto: true } : {}),
      ...(meta && /edited/.test(meta[1]) ? { edited: true } : {}),
      ...(reply ? { replyTo: +reply[1] } : {}),
      ...(fwd ? { forwardedFrom: htmlToText(fwd[1]) } : {}),
      ...(views ? { views: views[1] } : {}),
    });
  }
  return page;
}

/** Telegram Desktop: Export chat history -> JSON -> result.json */
export function parseTelegramExport(json: unknown): Channel {
  const j = json as { name?: string; messages?: unknown[] };
  if (!j || !Array.isArray(j.messages)) throw new Error("This is not a Telegram export: no messages list found.");
  const messages: Msg[] = [];
  for (const raw of j.messages as Record<string, unknown>[]) {
    if (raw.type !== "message") continue;
    const text = flattenText(raw.text);
    const ts = raw.date_unixtime
      ? new Date(+(raw.date_unixtime as string) * 1000).toISOString()
      : // exports without a unix time carry the exporter's local clock; assume India
        new Date(`${raw.date}+05:30`).toISOString();
    messages.push({
      id: raw.id as number,
      ts,
      text,
      ...(raw.photo || raw.file ? { hasPhoto: true } : {}),
      ...(raw.edited ? { edited: true } : {}),
      ...(raw.reply_to_message_id ? { replyTo: raw.reply_to_message_id as number } : {}),
      ...(raw.forwarded_from ? { forwardedFrom: String(raw.forwarded_from) } : {}),
    });
  }
  return { source: "telegram-export", title: j.name ?? "Telegram export", messages };
}

function flattenText(t: unknown): string {
  if (typeof t === "string") return t;
  if (Array.isArray(t)) return t.map((x) => (typeof x === "string" ? x : ((x as { text?: string })?.text ?? ""))).join("");
  return "";
}

// WhatsApp "Export chat" text, both common layouts:
//   12/09/25, 9:20 am - Name: text            (Android)
//   [12/09/25, 9:20:11 AM] Name: text         (iPhone)
const WA_LINE = /^‎?\[?(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?\s?m\.?)?\]?\s*(?:-\s*)?([^:]{1,60}?):\s([\s\S]*)$/i;

export function looksLikeWhatsApp(text: string) {
  return text.split("\n").slice(0, 40).filter((l) => WA_LINE.test(l)).length >= 2;
}

export function parseWhatsAppExport(text: string): Channel {
  const messages: Msg[] = [];
  let id = 0;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(WA_LINE);
    if (m) {
      const [, dd, mm, yy, hh, min, ss, ampm, , body] = m;
      let hour = +hh;
      if (ampm) {
        const pm = /p/i.test(ampm);
        if (pm && hour < 12) hour += 12;
        if (!pm && hour === 12) hour = 0;
      }
      const year = yy.length === 2 ? 2000 + +yy : +yy;
      const iso = `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${String(hour).padStart(2, "0")}:${min}:${ss ?? "00"}+05:30`;
      const ts = new Date(iso);
      if (isNaN(ts.getTime())) continue;
      const omitted = /<Media omitted>|image omitted|\.(jpg|png|webp) \(file attached\)/i.test(body);
      messages.push({ id: ++id, ts: ts.toISOString(), text: omitted ? "" : body.trim(), ...(omitted ? { hasPhoto: true } : {}) });
    } else if (messages.length && line.trim()) {
      messages[messages.length - 1].text += "\n" + line;
    }
  }
  return { source: "telegram-export", title: "WhatsApp chat", messages };
}

/** Pasted text with no timestamps: blank lines separate messages, all dated `at`. */
export function parsePasted(text: string, at: Date = new Date()): Channel {
  if (looksLikeWhatsApp(text)) return { ...parseWhatsAppExport(text), source: "pasted" };
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  return {
    source: "pasted",
    title: "Pasted messages",
    messages: blocks.map((b, i) => ({ id: i + 1, ts: at.toISOString(), text: b })),
  };
}
