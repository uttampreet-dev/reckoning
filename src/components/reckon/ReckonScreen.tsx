"use client";
// Takes a channel from wherever it came (a sample, a public link, a file, pasted text), runs the reckoning
// in a worker, and shows the machinery while it works.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Dock } from "@/components/Dock";
import type { Reckoning } from "@/engine/reckon";
import type { Channel, Msg } from "@/engine/types";
import hero from "@/samples/hero.json";
import { istDate, shortDate } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import { take } from "@/lib/inbox";
import type { WorkerReply, WorkerRequest } from "@/worker/reckon.worker";
import { Report } from "./Report";

type Phase =
  | { k: "idle" }
  | { k: "messages"; read: number; back?: string }
  | { k: "running"; stage: "prices" | "reading" | "replaying"; done: number; total: number; messages: number }
  | { k: "done"; result: Reckoning; days: string[] }
  | { k: "error"; message: string };

/** pages of about twenty messages; enough to get well past the 30 days the price data is held back */
const MAX_PAGES = 70;

export function ReckonScreen() {
  const { t, lang } = useLang();
  const R = t.report;
  const params = useSearchParams();
  const sample = params.get("sample");
  const handle = params.get("c");
  const from = params.get("from");
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const worker = useRef<Worker | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = (channel: Channel) => {
      if (cancelled) return;
      worker.current?.terminate();
      const w = new Worker(new URL("../../worker/reckon.worker.ts", import.meta.url), { type: "module" });
      worker.current = w;
      setPhase({ k: "running", stage: "prices", done: 0, total: 0, messages: channel.messages.length });
      w.onmessage = (e: MessageEvent<WorkerReply>) => {
        const m = e.data;
        if (m.type === "stage") setPhase((p) => (p.k === "running" ? { ...p, stage: m.stage } : p));
        else if (m.type === "progress") setPhase((p) => (p.k === "running" ? { ...p, stage: "replaying", done: m.done, total: m.total } : p));
        else if (m.type === "done") setPhase({ k: "done", result: m.result, days: m.days });
        else setPhase({ k: "error", message: m.message });
      };
      w.onerror = (e) => setPhase({ k: "error", message: e.message });
      w.postMessage({ channel } satisfies WorkerRequest);
    };

    (async () => {
      try {
        if (sample) {
          setPhase({ k: "messages", read: 0 });
          const res = await fetch(`/samples/${encodeURIComponent(sample)}.json`);
          if (!res.ok) throw new Error(R.failed);
          const channel = (await res.json()) as Channel;
          if (sample === hero.sample) channel.title = hero.label[lang];
          run(channel);
        } else if (handle) {
          const messages = new Map<number, Msg>();
          let before: number | undefined;
          let info: Partial<Channel> = {};
          setPhase({ k: "messages", read: 0 });
          for (let page = 0; page < MAX_PAGES && !cancelled; page++) {
            const res = await fetch(`/api/tme?channel=${encodeURIComponent(handle)}${before ? `&before=${before}` : ""}`);
            if (!res.ok) throw new Error(R.failed);
            const data = (await res.json()) as { title?: string; subscribers?: string; description?: string; messages: Msg[]; before?: number };
            if (page === 0) {
              if (!data.messages.length) throw new Error(R.previewOff);
              info = { title: data.title ?? handle, subscribers: data.subscribers, description: data.description };
            }
            for (const m of data.messages) messages.set(m.id, m);
            const oldest = data.messages[0]?.ts;
            setPhase({ k: "messages", read: messages.size, back: oldest ? shortDate(istDate(oldest), lang, true) : undefined });
            if (!data.before || !data.messages.length) break;
            before = data.before;
          }
          run({ source: "telegram-link", handle, title: info.title ?? handle, subscribers: info.subscribers, description: info.description, messages: [...messages.values()].sort((a, b) => a.id - b.id) });
        } else if (from) {
          const channel = take();
          if (channel) run(channel);
        }
      } catch (err) {
        if (!cancelled) setPhase({ k: "error", message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => {
      cancelled = true;
      worker.current?.terminate();
    };
    // the language is read once, when the run starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sample, handle, from]);

  if (phase.k === "done") {
    const { result } = phase;
    if (!result.extraction.calls.length) {
      const images = result.extraction.unread.filter((u) => u.why === "image-only").length;
      return (
        <Notice title={R.noCalls}>
          <p>{R.noCallsBody(result.channel.messages, images)}</p>
          {result.extraction.unread.length - images > 0 && <p className="mt-2">{R.unread(result.extraction.unread.length - images)}.</p>}
        </Notice>
      );
    }
    return <Report r={result} days={phase.days} />;
  }

  if (phase.k === "error") {
    return (
      <Notice title={R.failed}>
        <p className="text-red">{phase.message}</p>
        <div className="mt-8 max-w-xl">
          <Dock />
        </div>
      </Notice>
    );
  }

  if (phase.k === "idle" && !sample && !handle) {
    return (
      <Notice title={R.noSource}>
        <p>{R.noSourceBody}</p>
        <div className="mt-8 max-w-xl">
          <Dock />
        </div>
        <Link href={`/reckon?sample=${hero.sample}`} className="mt-8 inline-flex items-center gap-2 border-[1.5px] border-type px-4 py-2.5 text-[15px] font-semibold transition-colors hover:bg-type hover:text-page">
          {R.trySample} →
        </Link>
      </Notice>
    );
  }

  // ---- working: show what is being done, with the numbers so far
  const steps = [
    { key: "messages", label: R.stages.messages, detail: phase.k === "messages" ? (phase.back ? R.readSoFar(phase.read, phase.back) : "") : phase.k === "running" ? `${phase.messages.toLocaleString("en-IN")} ${R.messages}` : "" },
    { key: "prices", label: R.stages.prices, detail: "NSE · BSE" },
    { key: "replaying", label: R.stages.replaying, detail: phase.k === "running" && phase.total ? R.replayed(phase.done, phase.total) : "" },
  ];
  const at = phase.k === "messages" || phase.k === "idle" ? 0 : phase.stage === "prices" ? 1 : 2;
  const share = phase.k === "running" && phase.total ? phase.done / phase.total : 0;
  return (
    <div className="mx-auto max-w-[1440px] px-5 pb-24 pt-12 font-body sm:px-10 lg:px-[72px]">
      <ol className="max-w-2xl divide-y divide-hair border-b border-t-2 border-hair border-t-type">
        {steps.map((s, i) => (
          <li key={s.key} className={`grid grid-cols-[2.5rem_minmax(0,1fr)] items-baseline gap-2 py-4 ${i > at ? "opacity-35" : ""}`}>
            <span className="font-mono text-xs font-semibold text-red">0{i + 1}</span>
            <div>
              <div className="display flex items-baseline gap-3 text-[1.7rem] font-bold leading-tight">
                {s.label}
                {i === at && <span className="caret inline-block size-2.5 rounded-full bg-red" />}
                {i < at && <span className="font-mono text-sm font-semibold text-green">✓</span>}
              </div>
              {i <= at && s.detail && <div className="tnum mt-1 font-mono text-[12.5px] text-soft">{s.detail}</div>}
              {i === 2 && at === 2 && (
                <div className="mt-3 h-1.5 bg-hair">
                  <div className="h-full bg-red transition-[width] duration-150" style={{ width: `${share * 100}%` }} />
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1440px] px-5 pb-24 pt-12 font-body sm:px-10 lg:px-[72px]">
      <h1 className="display max-w-[16ch] text-[2.6rem] font-bold leading-[1] sm:text-[3.6rem]">{title}</h1>
      <div className="mt-5 max-w-2xl text-[18px] leading-relaxed text-type/80">{children}</div>
    </div>
  );
}
