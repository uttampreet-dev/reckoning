"use client";
// The landing page's centrepiece: a real channel's opening week, replayed. Messages arrive in the chat, each call
// lifts out and lands on the ledger sheet, and the exchange's prices mark what became of it.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import hero from "@/samples/hero.json";
import { price, rupees, signed } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import { REPLAY_AGAIN } from "./ReplaySummary";

type Row = {
  date: string;
  contract: string;
  expiry?: string;
  entry?: number;
  exit?: number;
  cls: string;
  status: string;
  worthless: boolean;
  firm: boolean;
  net?: number;
  balance: number;
};
type Event = { id: number; time: string; kind: "call" | "brag" | "other"; text: string; row?: Row };
const EVENTS = hero.events as Event[];

/** how far a call has got: its message is up (0), its row has landed (1), the result is marked (2) */
type Stage = 0 | 1 | 2;

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// the sheet sizes its own columns: three on a phone, four on a tablet, five when there is room
const COLS = "grid-cols-[2.9rem_minmax(0,1fr)_5.4rem] @[27rem]:grid-cols-[3rem_minmax(0,1fr)_8.2rem_4.8rem] @[35rem]:grid-cols-[3rem_minmax(8.8rem,1fr)_6.2rem_8.2rem_4.8rem]";

export function Replay() {
  const { t } = useLang();
  const [shown, setShown] = useState(0); // events on screen
  const [stage, setStage] = useState<Record<number, Stage>>({});
  const [done, setDone] = useState(false);
  const [run, setRun] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const chat = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const flyer = useRef<HTMLDivElement>(null);
  // the summary under the input can ask for the week to be replayed
  useEffect(() => {
    const again = () => setRun((n) => n + 1);
    window.addEventListener(REPLAY_AGAIN, again);
    return () => window.removeEventListener(REPLAY_AGAIN, again);
  }, []);

  // ---- the timeline
  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) => new Promise<void>((r) => timers.push(setTimeout(r, ms)));

    if (reduced()) {
      setShown(EVENTS.length);
      setStage(Object.fromEntries(EVENTS.filter((e) => e.row).map((e) => [e.id, 2 as Stage])));
      setDone(true);
      return;
    }

    setShown(0);
    setStage({});
    setDone(false);
    (async () => {
      // start when the stage is on screen
      await new Promise<void>((resolve) => {
        const el = root.current;
        if (!el) return resolve();
        const io = new IntersectionObserver(
          ([entry]) => {
            if (entry.isIntersecting) {
              io.disconnect();
              resolve();
            }
          },
          { threshold: 0.15 },
        );
        io.observe(el);
      });
      await wait(500);
      for (let i = 0; i < EVENTS.length && !cancelled; i++) {
        const ev = EVENTS[i];
        setShown(i + 1);
        if (!ev.row) {
          await wait(ev.kind === "brag" ? 330 : 420);
          continue;
        }
        await wait(520);
        if (cancelled) return;
        fly(ev.id);
        await wait(380);
        setStage((s) => ({ ...s, [ev.id]: 1 }));
        await wait(560);
        setStage((s) => ({ ...s, [ev.id]: 2 }));
        await wait(ev.row.status === "taken" ? 620 : 420);
      }
      if (!cancelled) {
        await wait(350);
        setDone(true);
      }
    })();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  // a chip leaves the message and travels to where its ledger row is about to appear
  const fly = useCallback((id: number) => {
    const from = chat.current?.querySelector<HTMLElement>(`[data-msg="${id}"]`);
    const to = sheet.current?.querySelector<HTMLElement>("[data-landing]");
    const chip = flyer.current;
    if (!from || !to || !chip) return;
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    chip.textContent = EVENTS.find((e) => e.id === id)?.row?.contract ?? "";
    chip.animate(
      [
        { transform: `translate(${a.left + 12}px, ${a.top + 6}px)`, opacity: 0 },
        { opacity: 1, offset: 0.15 },
        { transform: `translate(${b.left + 56}px, ${b.top + 8}px)`, opacity: 1, offset: 0.9 },
        { transform: `translate(${b.left + 56}px, ${b.top + 8}px)`, opacity: 0 },
      ],
      { duration: 460, easing: "cubic-bezier(0.5, 0, 0.2, 1)" },
    );
  }, []);

  // keep the newest message and the newest row in view
  useEffect(() => {
    chat.current?.scrollTo({ top: chat.current.scrollHeight, behavior: reduced() ? "auto" : "smooth" });
  }, [shown]);
  const rows = useMemo(() => EVENTS.slice(0, shown).filter((e) => e.row && (stage[e.id] ?? 0) >= 1), [shown, stage]);
  useEffect(() => {
    const body = sheet.current?.querySelector<HTMLElement>("[data-rows]");
    body?.scrollTo({ top: body.scrollHeight, behavior: reduced() ? "auto" : "smooth" });
  }, [rows.length]);

  const settled = rows.filter((e) => stage[e.id] === 2);
  const balance = settled.length ? settled[settled.length - 1].row!.balance : hero.start;
  const curve = [hero.start, ...settled.filter((e) => e.row!.status === "taken").map((e) => e.row!.balance)];

  return (
    <div ref={root} data-replay className="relative min-w-0 select-none font-body" aria-label={t.replay.sample}>
      <div ref={flyer} aria-hidden className="pointer-events-none fixed left-0 top-0 z-50 bg-amber px-2 py-1 font-mono text-[11px] font-semibold text-night opacity-0 shadow-lg" />

      <div className="relative flex flex-col-reverse lg:block lg:pb-10 lg:pl-14">
        {/* ---------------- the ledger sheet ---------------- */}
        <div ref={sheet} className="sheet relative px-4 pb-4 pt-4 sm:px-6 sm:pt-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-4 border-b-2 border-type pb-2.5">
            <div className="min-w-0">
              <div className="tag">{t.replay.exhibit}</div>
              <div className="mt-1 font-mono text-[10.5px] leading-snug text-soft">{t.replay.exhibitSub(hero.subscribers)}</div>
            </div>
            <Counter value={balance} className={`tnum font-mono text-[1.8rem] font-semibold leading-none tracking-tight sm:text-[2.3rem] ${balance < hero.start ? "text-red" : "text-type"}`} />
          </div>

          <div className="@container">
            <div className={`grid ${COLS} gap-x-2 py-2 font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-soft`}>
              <span>{t.replay.cols.date}</span>
              <span>{t.replay.cols.contract}</span>
              <span className="hidden @[35rem]:block">
                {t.replay.cols.in} → {t.replay.cols.out}
              </span>
              <span className="hidden @[27rem]:block">{t.replay.cols.result}</span>
              <span className="text-right">{t.replay.cols.net}</span>
            </div>
            <div data-rows className="h-[calc(2.4rem*6)] overflow-hidden lg:h-[calc(2.4rem*8)]">
              {rows.map((e) => (
                <LedgerRow key={e.id} row={e.row!} settled={stage[e.id] === 2} />
              ))}
              <div data-landing className="h-[2.4rem]" />
            </div>
          </div>

          {/* the account, call by call; on wide screens the phone sits over the left of this strip */}
          <div className="mt-2 border-t border-type pt-2 lg:min-h-[9.5rem] lg:pl-[46%]">
            <Curve points={curve} start={hero.start} peakLabel={t.replay.peak} />
          </div>

          {done && (
            <div className="slip-in mt-3 bg-red px-5 py-3.5 text-sheet shadow-[5px_5px_0_var(--color-type)] [--turn:1deg] lg:absolute lg:-right-5 lg:bottom-[-2.4rem] lg:z-20 lg:mt-0 lg:[--turn:3deg]">
              <div className="tnum whitespace-nowrap font-mono text-[1.4rem] font-semibold leading-none tracking-tight sm:text-[1.7rem]">
                {rupees(hero.start)} → {rupees(hero.final)}
              </div>
              <div className="mt-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em]">
                {t.replay.inDays(hero.days)} · {t.replay.verdictA}
              </div>
            </div>
          )}
        </div>

        {/* ---------------- the chat ---------------- */}
        <div className="relative z-10 mb-4 overflow-hidden rounded-2xl bg-night text-chalk shadow-[0_24px_40px_-18px_rgb(0_0_0/0.55)] lg:absolute lg:bottom-0 lg:left-0 lg:mb-0 lg:w-[19rem] lg:-rotate-3">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5 font-mono text-[10.5px] text-white/50">
            <span className="h-2 w-14 rounded-full bg-white/15" />
            <span>
              · {hero.subscribers} {t.replay.subscribers}
            </span>
            <span className="ml-auto flex items-center gap-1.5 uppercase tracking-widest text-amber">
              <span className={`size-1.5 rounded-full bg-amber ${done ? "" : "caret"}`} />
              {t.replay.reading}
            </span>
          </div>
          <div ref={chat} className="flex h-[10.5rem] flex-col gap-2 overflow-hidden px-2.5 py-2.5 [mask-image:linear-gradient(to_bottom,transparent,black_24%)] lg:h-[13rem]">
            <div className="mt-auto" />
            {EVENTS.slice(0, shown).map((e) => (
              <Message key={e.id} ev={e} read={(stage[e.id] ?? 0) >= 1} />
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}

// ---------------------------------------------------------------- pieces

/** highlights the parts of a call the reader picked out */
function marked(text: string) {
  const re = /(\b(?:BANKNIFTY|NIFTY|SENSEX)\s+\d+\s*(?:CE|PE)\b)|(\bSL\s+PAID\b)|(\bTGT\s+[\d+]+)|(\bAt\s+\d+\s*-\s*\d+)/gi;
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    out.push(text.slice(last, m.index));
    out.push(
      <span key={m.index} className={m[2] ? "text-[#ff7a5c] underline underline-offset-2" : "text-amber"}>
        {m[0]}
      </span>,
    );
    last = m.index! + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

function Message({ ev, read }: { ev: Event; read: boolean }) {
  const call = ev.kind === "call";
  return (
    <div data-msg={ev.id} className={`rise max-w-[96%] shrink-0 rounded-xl rounded-bl-sm px-3 py-2 ${call ? "bg-night-2" : "bg-night-2/50"}`}>
      <div className={`font-mono text-[11px] leading-snug ${call ? "text-chalk" : "text-white/45"}`}>{call && read ? marked(ev.text) : ev.text}</div>
      <div className="mt-0.5 text-right font-mono text-[9px] text-white/30">{ev.time}</div>
    </div>
  );
}

function LedgerRow({ row, settled }: { row: Row; settled: boolean }) {
  const { t } = useLang();
  const s = t.replay.stamps;
  const unchecked = row.status === "unverifiable" || row.status === "not-triggered";
  const broke = row.status === "no-funds";
  const label = broke ? s["no-funds"] : unchecked ? s[row.status as "unverifiable"] : !row.firm ? t.replay.dependsShort : row.worthless ? s.zero : (s[row.cls as keyof typeof s] ?? row.cls);
  const money = broke || row.worthless || (row.net ?? 0) < 0 ? "text-red" : unchecked ? "text-ochre" : "text-green";
  const tone = unchecked || !row.firm ? "text-ochre" : money;
  const mark = (extra: string) => <span className={`mark-box mark-in ${extra} ${tone}`}>{label}</span>;
  return (
    <div className={`rise grid h-[2.4rem] ${COLS} items-center gap-x-2 border-t border-hair font-mono text-[11.5px] sm:text-xs`}>
      <span className="text-soft">{row.date}</span>
      <span className="truncate font-medium text-type">{row.contract}</span>
      <span className="tnum hidden whitespace-nowrap text-type @[35rem]:block">
        {row.entry !== undefined && !broke ? price(row.entry) : "—"}
        <span className="text-faint"> → </span>
        {settled && (row.exit !== undefined && !broke ? price(row.exit) : "—")}
      </span>
      <span className="hidden @[27rem]:block">{settled && mark("text-[9px]")}</span>
      <span className={`tnum text-right font-semibold ${money}`}>
        {settled && row.net !== undefined && signed(row.net)}
        {settled && row.net === undefined && (
          <>
            <span className="@[27rem]:hidden">{mark("text-[8px]")}</span>
            <span className="hidden text-soft @[27rem]:inline">—</span>
          </>
        )}
      </span>
    </div>
  );
}

/** a number that counts to its new value */
function Counter({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduced()) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 520);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(a + (value - a) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <div className={className}>{rupees(shown)}</div>;
}

/** the account, call by call */
function Curve({ points, start, peakLabel }: { points: number[]; start: number; peakLabel: string }) {
  const W = 320,
    H = 96,
    pad = 4;
  // headroom above the highest point for its label
  const max = Math.max(start * 1.25, ...points) * 1.2;
  const total = Math.max(9, points.length - 1);
  const x = (i: number) => pad + (i / total) * (W - pad * 2 - 34);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  // steps: the balance holds until the next call settles
  const d = points.map((v, i) => (i === 0 ? `M${x(0)},${y(v)}` : `H${x(i)}V${y(v)}`)).join("");
  const peak = Math.max(...points);
  const peakAt = points.indexOf(peak);
  const last = points[points.length - 1];
  const down = last < start;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`${rupees(start)} → ${rupees(last)}`}>
      <line x1={pad} x2={W - pad} y1={y(start)} y2={y(start)} className="stroke-faint" strokeDasharray="2 4" />
      <text x={W - pad} y={y(start) - 4} textAnchor="end" className="fill-soft font-mono text-[8.5px]">
        {rupees(start)}
      </text>
      <path d={`${d}V${H - pad}H${x(0)}Z`} className={down ? "fill-red/10" : "fill-green/10"} />
      <path d={d} fill="none" strokeWidth="1.8" strokeLinejoin="round" className={down ? "stroke-red" : "stroke-type"} />
      {peakAt > 0 && peak > start && (
        <g>
          <circle cx={x(peakAt)} cy={y(peak)} r="2.6" className="fill-green" />
          <text x={x(peakAt)} y={y(peak) - 6} textAnchor="middle" className="fill-green font-mono text-[8.5px]">
            {peakLabel} {rupees(peak)}
          </text>
        </g>
      )}
      {points.length > 1 && <circle cx={x(points.length - 1)} cy={y(last)} r="3.2" className={down ? "fill-red" : "fill-type"} />}
    </svg>
  );
}
