"use client";
// A 24-hour pause: the channel's measured record, the reader's own reason in their own words, and a clock.
// The reason and the start time stay in this browser's storage; nothing is sent anywhere.
import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";

const DAY = 24 * 3600e3;
interface Saved {
  reason: string;
  startedAt: number;
}

const two = (n: number) => String(n).padStart(2, "0");

export function PauseCard({ id, record, className = "" }: { id: string; record: string[]; className?: string }) {
  const { t } = useLang();
  const L = t.landing.pause;
  const key = `pause:${id}`;
  const [reason, setReason] = useState("");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setSaved(JSON.parse(raw));
    } catch {
      // storage unavailable: the card still works for this visit
    }
  }, [key]);
  useEffect(() => {
    if (!saved) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [saved]);

  const start = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    const next = { reason: reason.trim(), startedAt: Date.now() };
    setSaved(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {}
  };
  const clear = () => {
    setSaved(null);
    setReason("");
    try {
      localStorage.removeItem(key);
    } catch {}
  };

  const left = saved ? Math.max(0, saved.startedAt + DAY - now) : DAY;
  const clock = `${two(Math.floor(left / 3600e3))}:${two(Math.floor((left % 3600e3) / 60e3))}:${two(Math.floor((left % 60e3) / 1000))}`;
  const over = !!saved && left === 0;

  return (
    <div className={`sheet font-body text-type ${className}`}>
      <div className="flex items-end justify-between gap-4 border-b-2 border-type px-5 pb-3 pt-4 sm:px-6">
        <div className="tag">{L.card}</div>
        <div className={`tnum font-mono text-[2rem] font-semibold leading-none tracking-tight sm:text-[2.4rem] ${saved && !over ? "text-red" : "text-type"}`} aria-live="off">
          {clock}
        </div>
      </div>
      <div className="px-5 pb-5 pt-4 sm:px-6">
        <div className="eyebrow font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-soft">{L.record}</div>
        <ul className="mt-2 divide-y divide-hair border-y border-hair text-[15px] leading-snug">
          {record.map((line) => (
            <li key={line} className="py-2">
              {line}
            </li>
          ))}
        </ul>

        {saved ? (
          <div className="mt-5">
            <div className="eyebrow font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-soft">{L.reasonLabel}</div>
            <p className="mt-2 border-l-2 border-ochre pl-3 text-[17px] leading-snug">{saved.reason}</p>
            <p className={`mt-4 text-[15px] font-medium ${over ? "text-green" : "text-type"}`} role="status">
              {over ? L.done : `${L.running} ${clock}`}
            </p>
            <button onClick={clear} className="mt-3 cursor-pointer border-b border-type pb-px text-[14px] transition-colors hover:border-red hover:text-red">
              {L.reset}
            </button>
          </div>
        ) : (
          <form onSubmit={start} className="mt-5">
            <label htmlFor={`${key}-reason`} className="eyebrow font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-soft">
              {L.reasonLabel}
            </label>
            <textarea
              id={`${key}-reason`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={400}
              placeholder={L.placeholder}
              className="mt-2 w-full resize-none border-[1.5px] border-type bg-page/60 p-3 text-[16px] leading-snug text-type outline-none placeholder:text-faint focus:border-red"
            />
            <button type="submit" disabled={!reason.trim()} className="mt-2 cursor-pointer bg-type px-5 py-2.5 text-[15px] font-semibold text-page transition-colors hover:bg-red disabled:cursor-not-allowed disabled:opacity-40">
              {L.start}
            </button>
          </form>
        )}
        <p className="mt-4 font-mono text-[10.5px] leading-relaxed text-soft">{L.saved}</p>
      </div>
    </div>
  );
}
