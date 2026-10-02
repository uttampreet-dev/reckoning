// Turns a reckoning into the things a person needs to report a channel: a draft they can edit and send,
// and the list of calls as a file. Everything stated comes from the report; nothing is concluded for the reader.
import type { Reckoning } from "@/engine/reckon";
import { istDate, istTime, price } from "./format";

const day = (ymd: string) => {
  const [y, m, d] = ymd.split("-");
  return `${+d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m - 1]} ${y}`;
};

export function isRegistered(r: Reckoning) {
  return r.registration.claimed.some((c) => c.onRegister);
}

/** the disputed result posts, most recent call last, with what was said and what traded */
export function disputedPosts(r: Reckoning, days: string[]) {
  const calls = new Map(r.extraction.calls.map((c) => [c.id, c]));
  const posts = new Map(r.extraction.followUps.map((p) => [p.msgId, p]));
  return [...r.followThrough.unsupported.map((d) => ({ ...d, kind: "target" as const })), ...r.followThrough.impossible.map((d) => ({ ...d, kind: "price" as const }))]
    .map((d) => {
      const call = calls.get(d.callId);
      const post = posts.get(d.msgId);
      const out = r.outcomes[d.callId];
      if (!call || !post) return null;
      return { kind: d.kind, date: istDate(post.ts), time: istTime(post.ts), contract: (out?.contract ?? call.symbol).split(" · ")[0], claimed: d.claimed, reached: d.reached, text: post.raw.replace(/\s+/g, " ").trim().slice(0, 140), callDay: out?.entryDay !== undefined ? days[out.entryDay] : istDate(call.ts) };
    })
    .filter((d): d is NonNullable<typeof d> => !!d)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function complaintDraft(r: Reckoning, days: string[]): string {
  const k = r.ledger.record;
  const p = r.promotion;
  const reg = r.registration;
  const registered = reg.claimed.find((c) => c.onRegister);
  const offRegister = reg.claimed.filter((c) => c.onRegister === false);
  const where = r.channel.handle ? `t.me/${r.channel.handle}` : r.channel.source === "telegram-export" ? "Telegram (exported chat)" : "chat messages I hold";
  const disputed = disputedPosts(r, days);
  const lines: string[] = [];

  lines.push(registered ? `Subject: Buy and sell calls on a Telegram channel showing SEBI registration ${registered.regNo}` : "Subject: Buy and sell calls from a channel with no SEBI registration", "");
  lines.push(
    registered
      ? `I wish to bring to SEBI's notice a channel that gives buy and sell calls on securities and shows the registration number ${registered.regNo}, which SEBI's register lists as "${registered.registeredName}". I ask SEBI to confirm whether this channel is operated by that registered entity.`
      : "I wish to bring to SEBI's notice a channel that gives buy and sell calls on securities with entry prices and targets, and shows no SEBI registration as a Research Analyst or Investment Adviser.",
    "",
  );

  lines.push("THE CHANNEL");
  lines.push(`Name: ${r.channel.title}`);
  lines.push(`Where: ${where}${r.channel.subscribers ? ` (${r.channel.subscribers} subscribers)` : ""}`);
  if (r.channel.firstTs && r.channel.lastTs) lines.push(`Messages examined: ${r.channel.messages.toLocaleString("en-IN")}, from ${day(istDate(r.channel.firstTs))} to ${day(istDate(r.channel.lastTs))}`);
  lines.push(`Buy and sell calls found: ${r.extraction.calls.length}`, "");

  lines.push("REGISTRATION");
  if (registered) lines.push(`The channel shows ${registered.regNo}. SEBI's register (copy of ${day(reg.registerAsOf ?? "")}) lists it as "${registered.registeredName}".`);
  for (const c of offRegister) lines.push(`The channel shows ${c.regNo}. This number is not on SEBI's register (copy of ${day(reg.registerAsOf ?? "")}).`);
  if (!reg.claimed.length) lines.push(reg.mentionsWithoutNumber ? "The channel says it is SEBI registered but shows no registration number." : "No SEBI registration number appears in the channel's description or in any message examined.");
  lines.push("");

  const cue = (kind: keyof typeof p.byKind, label: string) => (p.byKind[kind] > 0 ? `- ${label}: ${p.byKind[kind]} message${p.byKind[kind] === 1 ? "" : "s"}${example(kind)}` : null);
  const example = (kind: keyof typeof p.byKind) => {
    const m = p.cues.find((c) => c.kind === kind)?.match;
    return m ? ` (for example: "${m.toLowerCase()}")` : "";
  };
  const selling = [
    cue("paid-group", "Paid or premium group offered"),
    cue("payment", "Payment links or UPI ids"),
    cue("paywalled-levels", "Stop-loss or target withheld unless the follower pays"),
    cue("account-handling", "Offers to trade the follower's account"),
    cue("guarantee", "Guarantee or sure-shot wording"),
    cue("contact", "Requests to message or call privately"),
  ].filter((l): l is string => !!l);
  if (selling.length) lines.push("WHAT THE MESSAGES ASK FOR", `${p.sellingMessages.toLocaleString("en-IN")} of ${p.textMessages.toLocaleString("en-IN")} messages ask for payment or contact.`, ...selling, "");

  if (k.checked > 0) {
    lines.push("WHAT THE EXCHANGE PRICES SHOW");
    lines.push(`${k.checked} of the ${r.extraction.calls.length} calls could be checked against NSE and BSE daily prices.`);
    lines.push(`${k.target} reached the stated target. ${k.stop} hit the stated stop-loss. ${k.expired} expired, ${k.expiredWorthless} of them at zero.`);
    if (r.followThrough.losers > 0) lines.push(`${r.followThrough.losers} calls lost money. Messages in the channel that acknowledge a loss or a stop-loss: ${r.followThrough.losersAdmitted}.`);
    if (r.claimedAccuracy !== undefined) lines.push(`The channel's own claim: ${r.claimedAccuracy}% accuracy.`);
    lines.push("");
  }

  if (disputed.length) {
    lines.push("RESULT POSTS THE PRICES DO NOT SUPPORT");
    lines.push(`${disputed.length} messages state a target or a price that the contract had not traded at by then.`);
    lines.push("Where a message names no expiry, the nearest expiry in which the quoted entry price actually traded was used. Examples:");
    for (const d of disputed.slice(0, 5)) lines.push(`- ${day(d.date)}, ${d.time} IST, ${d.contract}: the message says ${price(d.claimed)}; the furthest the contract had traded was ${price(d.reached)}. Message: "${d.text}"`);
    lines.push("");
  }

  lines.push("MY OWN LOSS", "[Write here: the amount you paid or lost, the dates, and how you paid. Delete this section if it does not apply.]", "");
  lines.push("ATTACHED", "- The list of calls with dates, exchange prices and results", "- My screenshots of the messages", "");
  lines.push("The figures above were worked out from the channel's messages and the exchanges' daily price files. Daily prices do not show the order of prices within a day; results that depend on that order are marked in the attached list.");
  return lines.join("\n");
}

const cell = (v: string | number | undefined) => {
  const s = v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** every call with what was read from it and what the exchange prices show */
export function callsCsv(r: Reckoning, days: string[]): string {
  const lineOf = new Map(r.ledger.lines.map((l) => [l.callId, l]));
  const head = ["date", "time_ist", "message", "contract", "side", "entry", "target", "stop_loss", "entered_on", "entry_price", "exited_on", "exit_price", "result", "depends_on_reading", "note"];
  const rows = r.extraction.calls.map((c) => {
    const o = r.outcomes[c.id];
    const l = lineOf.get(c.id);
    const d = (i?: number) => (i === undefined ? "" : days[Math.min(i, days.length - 1)]);
    const entry = c.entry.type === "none" ? "" : c.entry.type === "range" ? `${c.entry.lo}-${c.entry.hi}` : `${c.entry.type} ${c.entry.lo}`;
    return [
      istDate(c.ts),
      istTime(c.ts),
      c.raw.replace(/\s+/g, " ").trim().slice(0, 200),
      (o?.contract ?? `${c.symbol}${c.strike ? ` ${c.strike} ${c.optType}` : ""}`).split(" · ")[0],
      c.side === "long" ? "buy" : "sell",
      entry,
      c.targets.join(" / "),
      c.stop ?? "",
      d(o?.entryDay),
      o?.entryPrice ?? "",
      d(o?.exitDay),
      o?.exitPrice ?? "",
      l?.ifFunded !== undefined ? o.cls : (o?.code ?? l?.status ?? ""),
      o?.firm === false ? "yes" : "",
      o?.reason ?? "",
    ]
      .map(cell)
      .join(",");
  });
  return [head.join(","), ...rows].join("\n");
}
