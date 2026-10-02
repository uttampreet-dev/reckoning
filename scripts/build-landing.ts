// Prepares the figures the landing page shows below the replay. Every number on that page comes from here.
// Usage: npm run landing   (after npm run samples)
//
//   call     one call from the sample channel, with the contract's daily prices from the call to its expiry
//   doubt    one call whose result depends on how the day's prices are read, under each of the three readings
//   tape     what every message of the sample channel is: a call, a profit post, a sales message, or something else
//   field    every public channel read so far (data-raw/tme/), as two numbers each: how often its targets were
//            reached, and how often a directionless price would reach the same targets. No names are written.
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { nodeLoader, openMarket } from "../src/data/node-loader";
import { reckon, type Reckoning } from "../src/engine/reckon";
import type { Register } from "../src/engine/registration";
import { toIst } from "../src/engine/time";
import type { Call, Channel, Outcome } from "../src/engine/types";

const ROOT = path.resolve(import.meta.dirname, "..");
/** a channel needs this many replayed calls with a target before its hit rate means anything */
const MIN_CALLS = 30;

const clock = (ts: string) => {
  const ist = toIst(ts);
  return `${String(Math.floor(ist.minutes / 60)).padStart(2, "0")}:${String(ist.minutes % 60).padStart(2, "0")}`;
};
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, " ").trim();
const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

function brief(o: Outcome | undefined, net: number | undefined) {
  return o ? { cls: o.cls, exit: o.exitPrice, exitDay: o.exitDay, net: net === undefined ? undefined : Math.round(net) } : undefined;
}

async function main() {
  const market = await openMarket();
  const days = market.days;
  const regBytes = await nodeLoader("sebi-register.json");
  const register: Register | null = regBytes ? JSON.parse(new TextDecoder().decode(regBytes)) : null;
  const hero = JSON.parse(await readFile(path.join(ROOT, "src", "samples", "hero.json"), "utf8"));
  // which cached channel the sample was made from (kept outside the repository, see build-samples.ts)
  const specs: { id: string; handle: string }[] = JSON.parse(await readFile(path.join(ROOT, "data-raw", "samples.json"), "utf8"));
  const sampleHandle = specs.find((x) => x.id === hero.sample)?.handle;

  // ---- the sample channel
  const sample: Channel = JSON.parse(await readFile(path.join(ROOT, "public", "samples", `${hero.sample}.json`), "utf8"));
  const r = await reckon(sample, market, register);
  const lineOf = new Map(r.ledger.lines.map((l) => [l.callId, l]));
  const inHero = new Set<number>(hero.events.filter((e: { row?: unknown }) => e.row).map((e: { id: number }) => e.id));
  const heroCalls = r.extraction.calls.filter((c) => inHero.has(c.msgId));
  const worthless = (o: Outcome) => o.cls === "expired" && o.exitPrice !== undefined && o.entryPrice !== undefined && o.exitPrice <= o.entryPrice * 0.05;

  const series = (c: Call, o: Outcome) => {
    const bars = (o.bars ?? []).filter((b) => b.d >= o.entryDay! - 2 && b.d <= o.exitDay!);
    return bars.map((b) => ({ day: days[b.d], o: b.o, h: b.h, l: b.l, c: b.c, held: b.d >= o.entryDay! }));
  };
  const describe = (c: Call) => {
    const o = r.outcomes[c.id];
    const l = lineOf.get(c.id)!;
    return {
      text: oneLine(c.raw).slice(0, 120),
      day: toIst(c.ts).date,
      time: clock(c.ts),
      contract: `${c.symbol} ${c.strike} ${c.optType}`,
      expiry: o.expiry,
      entry: o.entryPrice,
      target: c.targets[0],
      stop: c.stop,
      lots: l.lots,
      quantity: l.quantity,
      exit: o.exitPrice,
      exitDay: o.exitDay !== undefined ? days[Math.min(o.exitDay, days.length - 1)] : undefined,
      costs: l.costs === undefined ? undefined : Math.round(l.costs),
      net: l.net === undefined ? undefined : Math.round(l.net),
      high: Math.max(...(o.bars ?? []).filter((b) => b.d >= o.entryDay! && b.d <= o.exitDay!).map((b) => b.h)),
      bars: series(c, o),
    };
  };

  // the plainest total loss of the opening week: a call every reading agrees on
  const firmLoss = heroCalls.filter((c) => r.outcomes[c.id].firm !== false && worthless(r.outcomes[c.id]) && lineOf.get(c.id)!.status === "taken").at(-1);
  if (!firmLoss) throw new Error("no settled total loss in the hero window");

  // a call the readings disagree on
  const netOf = (ledger: Reckoning["ledger"], id: string) => ledger.lines.find((l) => l.callId === id)?.ifFunded;
  const doubtful = heroCalls.find((c) => lineOf.get(c.id)!.status === "taken" && Math.round(netOf(r.ledgerBest, c.id) ?? 0) !== Math.round(netOf(r.ledgerWorst, c.id) ?? 0));
  const doubt = doubtful && {
    ...describe(doubtful),
    announced: r.extraction.followUps.some((f) => f.callId === doubtful.id && (f.claimsTarget || f.kind === "target-hit")),
    // the highest price the channel itself quoted for this call afterwards
    quotedMax: Math.max(0, ...r.extraction.followUps.filter((f) => f.callId === doubtful.id && f.quoted !== undefined).map((f) => f.quoted!)) || undefined,
    quotedPosts: r.extraction.followUps.filter((f) => f.callId === doubtful.id).length,
    likely: brief(r.outcomes[doubtful.id], netOf(r.ledger, doubtful.id)),
    best: brief(r.outcomesBest[doubtful.id] ?? r.outcomes[doubtful.id], netOf(r.ledgerBest, doubtful.id)),
    worst: brief(r.outcomesWorst[doubtful.id] ?? r.outcomes[doubtful.id], netOf(r.ledgerWorst, doubtful.id)),
  };

  // ---- what each message is
  const callMsgs = new Set(r.extraction.calls.map((c) => c.msgId));
  const resultMsgs = new Set(r.extraction.followUps.map((f) => f.msgId));
  const lossMsgs = new Set(r.extraction.followUps.filter((f) => f.kind === "stop-hit" || f.kind === "loss").map((f) => f.msgId));
  const selling = new Set(r.promotion.cues.filter((c) => !["guarantee", "profit-brag"].includes(c.kind)).map((c) => c.msgId));
  const bragging = new Set(r.promotion.cues.filter((c) => c.kind === "profit-brag" || c.kind === "guarantee").map((c) => c.msgId));
  const LETTER = { call: "c", profit: "p", loss: "l", selling: "s", other: "o", picture: "i" } as const;
  let tape = "";
  const counts = { call: 0, profit: 0, loss: 0, selling: 0, other: 0, picture: 0 };
  for (const m of [...sample.messages].sort((a, b) => a.id - b.id)) {
    // one letter per message, in the order they were posted
    let k: keyof typeof counts;
    if (callMsgs.has(m.id)) k = "call";
    else if (lossMsgs.has(m.id)) k = "loss";
    else if (resultMsgs.has(m.id) || bragging.has(m.id)) k = "profit";
    else if (selling.has(m.id)) k = "selling";
    else if (!m.text.trim()) k = "picture";
    else k = "other";
    counts[k]++;
    tape += LETTER[k];
  }
  const f = r.followThrough;
  const paywalled = r.promotion.byKind["paywalled-levels"];
  const noStop = r.extraction.calls.filter((c) => c.stop === undefined).length;

  // ---- the field
  const field: { chance: number; hit: number; best: number; worst: number; calls: number; sample?: true }[] = [];
  const dir = path.join(ROOT, "data-raw", "tme");
  let read = 0;
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".json")).sort()) {
    const channel: Channel = JSON.parse(await readFile(path.join(dir, file), "utf8"));
    const x = await reckon(channel, market, register);
    read++;
    const k = x.ledger.record;
    const withTarget = (ledger: Reckoning["ledger"]) => ledger.record.hitRateWithTarget;
    const n = x.extraction.calls.filter((c) => c.targets.length && x.ledger.lines.find((l) => l.callId === c.id)?.ifFunded !== undefined).length;
    process.stderr.write(`${file.replace(".json", "").padEnd(36)} calls ${String(x.extraction.calls.length).padStart(4)} checked ${String(k.checked).padStart(4)} with target ${String(n).padStart(4)} hit ${k.hitRateWithTarget?.toFixed(2)} coin ${k.chanceHitRate?.toFixed(2)}\n`);
    if (n < MIN_CALLS || k.hitRateWithTarget === null || k.chanceHitRate === null) continue;
    const rates = [withTarget(x.ledgerBest) ?? k.hitRateWithTarget, withTarget(x.ledgerWorst) ?? k.hitRateWithTarget, k.hitRateWithTarget];
    field.push({
      chance: round(k.chanceHitRate),
      hit: round(k.hitRateWithTarget),
      best: round(Math.max(...rates)),
      worst: round(Math.min(...rates)),
      calls: n,
      ...(file === `${sampleHandle}.json` ? { sample: true as const } : {}),
    });
  }
  field.sort((a, b) => a.chance - b.chance);

  // the channel's own result posts from the replayed week, word for word
  const weekEnd = `${hero.lastDay}T23:59:59Z`;
  const ticker = [...new Set(r.extraction.followUps.filter((p) => p.ts >= heroCalls[0].ts && p.ts <= weekEnd).map((p) => oneLine(p.raw).replace(/\s+/g, " ")))].slice(0, 18);

  const out = {
    ticker,
    builtFrom: { priceDataTo: r.coverage.to, minCalls: MIN_CALLS, channelsRead: read },
    call: describe(firmLoss),
    doubt,
    tape: {
      order: tape,
      counts,
      messages: sample.messages.length,
      calls: r.extraction.calls.length,
      noStop,
      paywalled,
      sellingMessages: r.promotion.sellingMessages,
      winners: f.winners,
      winnersAnnounced: f.winnersAnnounced,
      losers: f.losers,
      losersMentioned: f.losersMentioned,
      losersAdmitted: f.losersAdmitted,
      checked: r.ledger.record.checked,
      hit: r.ledger.record.hitRateWithTarget,
      chance: r.ledger.record.chanceHitRate,
    },
    field: {
      channels: field,
      below: field.filter((c) => c.hit < c.chance).length,
      belowOnBest: field.filter((c) => c.best < c.chance).length,
    },
  };
  await writeFile(path.join(ROOT, "src", "samples", "landing.json"), JSON.stringify(out, null, 1));
  console.log(`call: ${out.call.contract} ${out.call.day} entry ${out.call.entry} → ${out.call.exit}, net ${out.call.net}, ${out.call.bars.length} bars`);
  if (doubt) console.log(`doubt: ${doubt.contract} ${doubt.day}: best ${doubt.best?.cls} ${doubt.best?.net}, worst ${doubt.worst?.cls} ${doubt.worst?.net}, likely ${doubt.likely?.cls} ${doubt.likely?.net}, announced ${doubt.announced}`);
  console.log(`tape: ${JSON.stringify(counts)} of ${sample.messages.length}; no stop ${noStop}/${r.extraction.calls.length}; paywalled ${paywalled}; winners ${f.winnersAnnounced}/${f.winners}, losers mentioned ${f.losersMentioned}/${f.losers}, admitted ${f.losersAdmitted}`);
  console.log(`field: ${field.length} of ${read} channels have ${MIN_CALLS}+ replayed calls with a target; ${out.field.below} below the coin, ${out.field.belowOnBest} below it even on the best reading`);
}

main();
