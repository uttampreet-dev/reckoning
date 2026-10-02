// Prepares the sample channels that ship with the app.
// Usage: npm run samples
//
// Each sample is a real public channel, read through Telegram's public preview (npm run reckon -- <handle> caches it
// under data-raw/tme/). data-raw/samples.json lists them: [{ id, handle, label: { en, hi }, names: [...] }]. Before anything is written to public/, the channel's name, handles, links, phone numbers
// and payment ids are removed from every message: the samples show how a channel behaves, not who runs it.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { nodeLoader, openMarket } from "../src/data/node-loader";
import { reckon } from "../src/engine/reckon";
import type { Register } from "../src/engine/registration";
import { toIst } from "../src/engine/time";
import type { Channel } from "../src/engine/types";

const ROOT = path.resolve(import.meta.dirname, "..");

interface SampleSpec {
  id: string;
  /** cache file name under data-raw/tme/ */
  handle: string;
  label: { en: string; hi: string };
  /** words that identify the channel, removed from its messages */
  names: string[];
  /** keep messages from this date on (the public preview goes back only so far) */
  from?: string;
}

/** which channels become samples, and the words to remove from each, are kept outside the repository */
const SPECS = path.join(ROOT, "data-raw", "samples.json");

function scrub(text: string, names: string[]): string {
  let s = text;
  for (const n of names) s = s.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "[channel name]");
  return s
    .replace(/https?:\/\/t\.me\/(?:\+|joinchat\/)\S+/gi, "t.me/+[link removed]")
    .replace(/https?:\/\/(?:wa\.me|api\.whatsapp\.com)\S*/gi, "wa.me/[number removed]")
    .replace(/https?:\/\/chat\.whatsapp\.com\/\S+/gi, "chat.whatsapp.com/[link removed]")
    .replace(/https?:\/\/\S+/gi, "[link removed]")
    .replace(/\b(?:www\.)\S+/gi, "[link removed]")
    .replace(/\b[\w.-]{3,}@(ybl|okaxis|okhdfcbank|okicici|oksbi|paytm|upi|ibl|axl|apl)\b/gi, "[id removed]@$1")
    .replace(/@[A-Za-z][A-Za-z0-9_]{3,}/g, "@[handle removed]")
    .replace(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g, "[number removed]");
}

const short = (ymd: string) => `${+ymd.slice(8, 10)} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+ymd.slice(5, 7) - 1]}`;

async function main() {
  const market = await openMarket();
  const regBytes = await nodeLoader("sebi-register.json");
  const register: Register | null = regBytes ? JSON.parse(new TextDecoder().decode(regBytes)) : null;
  await mkdir(path.join(ROOT, "public", "samples"), { recursive: true });
  await mkdir(path.join(ROOT, "src", "samples"), { recursive: true });
  const index: unknown[] = [];
  const SAMPLES: SampleSpec[] = JSON.parse(await readFile(SPECS, "utf8"));

  for (const spec of SAMPLES) {
    const raw: Channel = JSON.parse(await readFile(path.join(ROOT, "data-raw", "tme", `${spec.handle}.json`), "utf8"));
    const channel: Channel = {
      source: "sample",
      title: spec.label.en,
      subscribers: raw.subscribers,
      messages: raw.messages
        .filter((m) => !spec.from || m.ts >= spec.from)
        .map((m) => ({ ...m, text: scrub(m.text, spec.names), ...(m.forwardedFrom ? { forwardedFrom: "[removed]" } : {}) })),
    };
    await writeFile(path.join(ROOT, "public", "samples", `${spec.id}.json`), JSON.stringify(channel));

    const r = await reckon(channel, market, register);
    const L = r.ledger;
    index.push({
      id: spec.id,
      label: spec.label,
      subscribers: raw.subscribers,
      messages: channel.messages.length,
      from: r.channel.firstTs?.slice(0, 10),
      to: r.channel.lastTs?.slice(0, 10),
      calls: r.extraction.calls.length,
    });
    console.log(`${spec.id}: ${channel.messages.length} messages, ${r.extraction.calls.length} calls, checked ${L.record.checked}, account ₹${L.startBalance} → ₹${L.finalBalance}`);

    if (spec === SAMPLES[0]) await writeFile(path.join(ROOT, "src", "samples", "hero.json"), JSON.stringify(heroScript(spec, channel, r, market.days), null, 1));
  }
  await writeFile(path.join(ROOT, "public", "samples", "index.json"), JSON.stringify(index));
}

/** The opening stretch of a channel, up to the call the account could no longer pay for: what the landing page replays. */
function heroScript(spec: SampleSpec, channel: Channel, r: Awaited<ReturnType<typeof reckon>>, days: string[]) {
  const L = r.ledger;
  const lineOf = new Map(L.lines.map((l) => [l.callId, l]));
  const callsByMsg = new Map(r.extraction.calls.map((c) => [c.msgId, c]));
  const bragIds = new Set(r.extraction.followUps.map((f) => f.msgId));
  const firstCall = r.extraction.calls[0];
  const broke = r.extraction.calls.find((c) => lineOf.get(c.id)?.status === "no-funds");
  const sorted = [...channel.messages].sort((a, b) => a.id - b.id);
  const startAt = sorted.findIndex((m) => m.id === firstCall.msgId);
  const endAt = broke ? sorted.findIndex((m) => m.id === broke.msgId) : Math.min(sorted.length - 1, startAt + 60);

  const events: unknown[] = [];
  let quiet = 0;
  let brags = 0;
  let balance = L.startBalance;
  let peak = balance;
  for (const m of sorted.slice(startAt, endAt + 1)) {
    if (!m.text.trim()) continue;
    const ist = toIst(m.ts);
    const time = `${short(ist.date)} · ${String(Math.floor(ist.minutes / 60)).padStart(2, "0")}:${String(ist.minutes % 60).padStart(2, "0")}`;
    const call = callsByMsg.get(m.id);
    if (!call) {
      if (bragIds.has(m.id)) brags++;
      // the chat is mostly profit posts; two in a row are enough to show it
      if (++quiet > 2) continue;
      events.push({ id: m.id, time, kind: bragIds.has(m.id) ? "brag" : "other", text: m.text.replace(/\s*\n\s*/g, " ").slice(0, 96) });
      continue;
    }
    quiet = 0;
    const out = r.outcomes[call.id];
    const line = lineOf.get(call.id)!;
    if (line.net !== undefined) balance += line.net;
    peak = Math.max(peak, balance);
    events.push({
      id: m.id,
      time,
      kind: "call",
      text: m.text.replace(/\s*\n\s*/g, " ").slice(0, 96),
      row: {
        date: short(ist.date),
        contract: `${call.symbol} ${call.strike} ${call.optType}`,
        expiry: out.expiry ? short(out.expiry) : undefined,
        entry: out.entryPrice,
        exit: out.exitPrice,
        exitDate: out.exitDay !== undefined ? short(days[Math.min(out.exitDay, days.length - 1)]) : undefined,
        cls: out.cls,
        status: line.status,
        worthless: out.cls === "expired" && out.exitPrice !== undefined && out.entryPrice !== undefined && out.exitPrice <= out.entryPrice * 0.05,
        lots: line.lots,
        net: line.net,
        // false when the best and worst readings of the daily prices disagree about this call
        firm: out.firm !== false,
        balance: Math.round(balance),
      },
    });
  }
  // the same stretch under the other two readings, so the page can say how far the figure could move
  // every call posted up to the end of the last day counts: on another reading the account may still afford a call
  // that the main reading could not pay for
  const lastTs = `${toIst(broke ? broke.ts : firstCall.ts).date}T18:30:00.000Z`;
  const inWindow = new Set(r.extraction.calls.filter((c) => c.ts >= firstCall.ts && c.ts <= lastTs).map((c) => c.id));
  const windowEnd = (ledger: typeof L) => Math.round(ledger.lines.reduce((sum, l) => (inWindow.has(l.callId) && l.status === "taken" ? sum + (l.net ?? 0) : sum), ledger.startBalance));
  const ends = [windowEnd(r.ledgerBest), windowEnd(r.ledgerWorst), windowEnd(L)];

  const taken = events.filter((e) => (e as { row?: { status: string } }).row?.status === "taken") as { row: { cls: string; worthless: boolean; firm: boolean } }[];
  const firstDay = toIst(firstCall.ts).date;
  const lastDay = broke ? toIst(broke.ts).date : firstDay;
  return {
    sample: spec.id,
    label: spec.label,
    subscribers: channel.subscribers,
    start: L.startBalance,
    stake: L.params.capital * L.params.stakeFraction,
    final: Math.round(balance),
    finalLow: Math.max(0, Math.min(...ends)),
    finalHigh: Math.max(...ends),
    peak: Math.round(peak),
    days: Math.round((Date.parse(lastDay) - Date.parse(firstDay)) / 864e5),
    firstDay,
    lastDay,
    taken: taken.length,
    worthless: taken.filter((e) => e.row.worthless).length,
    doubtful: taken.filter((e) => !e.row.firm).length,
    brags,
    lossPosts: r.extraction.followUps.filter((f) => f.kind === "stop-hit" && f.ts >= firstCall.ts && (!broke || f.ts <= broke.ts)).length,
    totals: { calls: r.extraction.calls.length, checked: L.record.checked, target: L.record.target, expired: L.record.expired, worthless: L.record.expiredWorthless },
    priceDataTo: r.coverage.to,
    events,
  };
}

main();
