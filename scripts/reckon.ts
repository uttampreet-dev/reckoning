// Command-line reckoning of one channel.
// Usage: npm run reckon -- <t.me handle | result.json | whatsapp.txt> [--pages 40] [--all] [--json out.json]
//   a handle is read through Telegram's public preview and cached under data-raw/tme/
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { openMarket, nodeLoader } from "../src/data/node-loader";
import { reckon } from "../src/engine/reckon";
import type { Register } from "../src/engine/registration";
import { prettyDate, toIst } from "../src/engine/time";
import type { Channel, Msg } from "../src/engine/types";
import { channelHandle, fetchPreviewPage } from "../src/ingest/preview-fetch";
import { parsePasted, parseTelegramExport } from "../src/ingest/telegram";

const ROOT = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? "true") : undefined;
};
const input = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--pages" && args[args.indexOf(a) - 1] !== "--json");

export async function loadChannel(handle: string, pages: number): Promise<Channel> {
  const cache = path.join(ROOT, "data-raw", "tme", `${handle}.json`);
  let channel: Channel;
  try {
    channel = JSON.parse(await readFile(cache, "utf8"));
  } catch {
    channel = { source: "telegram-link", handle, title: handle, messages: [] };
  }
  const have = new Map<number, Msg>(channel.messages.map((m) => [m.id, m]));
  let before: number | undefined;
  for (let p = 0; p < pages; p++) {
    const page = await fetchPreviewPage(handle, before);
    if (!page.messages.length) break;
    if (p === 0) Object.assign(channel, { title: page.title ?? handle, subscribers: page.subscribers, description: page.description });
    const fresh = page.messages.filter((m) => !have.has(m.id));
    for (const m of page.messages) have.set(m.id, m);
    process.stderr.write(`\rread ${have.size} messages, back to ${page.messages[0].ts.slice(0, 10)}   `);
    // once a page brings nothing new we have joined the cached part; jump to its oldest message
    before = fresh.length ? page.before : Math.min(...have.keys());
    if (!before) break;
    await new Promise((r) => setTimeout(r, 600));
  }
  process.stderr.write("\n");
  channel.messages = [...have.values()].sort((a, b) => a.id - b.id);
  await mkdir(path.dirname(cache), { recursive: true });
  await writeFile(cache, JSON.stringify(channel));
  return channel;
}

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

async function main() {
  if (!input) {
    console.error("usage: npm run reckon -- <t.me handle | result.json | messages.txt> [--pages 40] [--all] [--json out.json]");
    process.exit(1);
  }
  let channel: Channel;
  if (input.endsWith(".json")) channel = parseTelegramExport(JSON.parse(await readFile(input, "utf8")));
  else if (input.endsWith(".txt")) channel = parsePasted(await readFile(input, "utf8"));
  else {
    const handle = channelHandle(input);
    if (!handle) throw new Error(`not a channel handle or file: ${input}`);
    channel = await loadChannel(handle, +(flag("pages") ?? 40));
  }

  const market = await openMarket();
  const regBytes = await nodeLoader("sebi-register.json");
  const register: Register | null = regBytes ? JSON.parse(new TextDecoder().decode(regBytes)) : null;
  const r = await reckon(channel, market, register);
  if (flag("json")) await writeFile(flag("json")!, JSON.stringify(r));

  const day = (i?: number) => (i === undefined ? "—" : prettyDate(market.days[Math.min(i, market.days.length - 1)]));
  const L = r.ledger;
  console.log(`\n${r.channel.title}${r.channel.subscribers ? ` · ${r.channel.subscribers} subscribers` : ""}`);
  console.log(`${r.channel.messages} messages, ${r.channel.firstTs?.slice(0, 10)} to ${r.channel.lastTs?.slice(0, 10)} · prices ${r.coverage.from} to ${r.coverage.to} (${r.coverage.lagDays}-day lag)`);
  console.log(`calls read: ${r.extraction.calls.length} · result posts: ${r.extraction.followUps.length} · image-only: ${r.extraction.unread.filter((u) => u.why === "image-only").length} · unreadable calls: ${r.extraction.unread.filter((u) => u.why === "no-instrument").length}`);

  const codes: Record<string, number> = {};
  for (const o of Object.values(r.outcomes)) if (o.code) codes[o.code] = (codes[o.code] ?? 0) + 1;
  console.log(`not checked: ${JSON.stringify(codes)}`);

  console.log("\n  date         instrument                              side  entry     exit      result          net");
  const shown = flag("all") ? r.extraction.calls : r.extraction.calls.filter((c) => r.outcomes[c.id].entryPrice !== undefined);
  for (const c of shown) {
    const o = r.outcomes[c.id];
    const line = L.lines.find((l) => l.callId === c.id)!;
    const when = toIst(c.ts);
    const name = (o.contract ?? `${c.symbol}${c.strike ? ` ${c.strike} ${c.optType}` : ""}`).split(" · ")[0];
    console.log(
      `  ${when.date}   ${name.padEnd(38).slice(0, 38)}  ${c.side === "long" ? "buy " : "sell"}  ${String(o.entryPrice ?? "—").padEnd(8)}  ${String(o.exitPrice ?? "—").padEnd(8)}  ${(o.cls + (o.firm === false ? "*" : "")).padEnd(14)}  ${line.net !== undefined ? rupees(line.net) : line.status}${o.code ? ` (${o.code})` : ""}`,
    );
  }

  const line = (name: string, x: typeof L) =>
    `${name.padEnd(7)} ${rupees(x.startBalance)} → ${rupees(x.finalBalance).padEnd(11)} taken ${x.counts.taken} · target ${x.counts.target} · stop ${x.counts.stop} · expired ${x.counts.expired} · horizon ${x.counts.horizon} · hit rate ${x.hitRate === null ? "—" : Math.round(x.hitRate * 100) + "%"} · no funds ${x.counts.noFunds}`;
  const rec = (name: string, x: typeof L) => {
    const k = x.record;
    const pc = (n: number | null) => (n === null ? "—" : Math.round(n * 100) + "%");
    return `${name.padEnd(7)} checked ${k.checked} · target ${k.target} · stop ${k.stop} · expired ${k.expired} (worthless ${k.expiredWorthless}) · horizon ${k.horizon} · hit rate ${pc(k.hitRate)} · by chance ${pc(k.chanceHitRate)} (same calls ${pc(k.hitRateWithTarget)}) · mean ${k.meanReturnPct}% · flat stake ${rupees(k.flatNet)}`;
  };
  console.log(`\nRECORD    every call that could be replayed, ${rupees(L.params.capital * L.params.stakeFraction)} in each`);
  console.log(rec("likely", L));
  console.log(rec("best", r.ledgerBest));
  console.log(rec("worst", r.ledgerWorst));
  console.log(`\nACCOUNT   (* = result depends on the reading)`);
  console.log(line("likely", L));
  console.log(line("best", r.ledgerBest));
  console.log(line("worst", r.ledgerWorst));
  console.log(`taken ${L.counts.taken} · target ${L.counts.target} · stop ${L.counts.stop} · expired ${L.counts.expired} · held to horizon ${L.counts.horizon} · open ${L.counts.open}`);
  console.log(`hit rate ${L.hitRate === null ? "—" : Math.round(L.hitRate * 100) + "%"} · profitable ${L.profitableRate === null ? "—" : Math.round(L.profitableRate * 100) + "%"} · profit factor ${L.profitFactor?.toFixed(2) ?? "—"} · max drawdown ${L.maxDrawdownPct}%${L.outOfMoneyDay !== undefined ? ` · out of money on ${day(L.outOfMoneyDay)}` : ""}`);
  console.log(`not triggered ${L.counts.notTriggered} · unverifiable ${L.counts.unverifiable} · low confidence ${L.counts.lowConfidence} · could not afford ${L.counts.noFunds} · result depends on reading ${L.counts.doubtful}`);
  if (r.claimedAccuracy) console.log(`channel's own claim: ${r.claimedAccuracy}% accuracy`);
  const f = r.followThrough;
  console.log(`follow-through: winners announced ${f.winnersAnnounced}/${f.winners} · losers mentioned again ${f.losersMentioned}/${f.losers} (admitted ${f.losersAdmitted}) · "target hit" posts where the target had not traded: ${f.unsupported.length} · posts quoting a price that never traded: ${f.impossible.length}`);
  const kinds: Record<string, number> = {};
  for (const x of r.flags) kinds[x.kind] = (kinds[x.kind] ?? 0) + 1;
  console.log(`flags: ${JSON.stringify(kinds)}`);
  console.log(`promotion: ${r.promotion.sellingMessages} of ${r.promotion.textMessages} messages sell something · ${JSON.stringify(r.promotion.byKind)}`);
  for (const c of r.registration.claimed) {
    console.log(`registration ${c.regNo}: ${c.onRegister ? `on SEBI's register as "${c.registeredName}" (register copied ${r.registration.registerAsOf})` : c.onRegister === false ? "NOT on SEBI's register" : "register not loaded"}`);
  }
  if (!r.registration.claimed.length) console.log("registration: no SEBI registration number shown");
}

main();
