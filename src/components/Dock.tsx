"use client";
// Where a channel comes in: a public link, an export file, screenshots, or pasted messages.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import { stash } from "@/lib/inbox";
import { channelHandle } from "@/ingest/preview-fetch";
import { guessDay, parseScreenshotText } from "@/ingest/screenshot";
import { parsePasted, parseTelegramExport } from "@/ingest/telegram";

export function Dock({ id = "channel" }: { id?: string }) {
  const { t } = useLang();
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const exportInput = useRef<HTMLInputElement>(null);
  const chatInput = useRef<HTMLInputElement>(null);
  const shotInput = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState<{ at: number; of: number; share: number } | null>(null);
  const [shot, setShot] = useState<{ text: string; day: string } | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const handle = channelHandle(value);
    if (!handle) return setError(t.hero.badLink);
    router.push(`/reckon?c=${handle}`);
  };

  const open = async (file: File | undefined, kind: "export" | "chat") => {
    if (!file) return;
    try {
      const text = await file.text();
      stash(kind === "export" ? parseTelegramExport(JSON.parse(text)) : { ...parsePasted(text), title: file.name.replace(/\.txt$/i, "") });
      router.push("/reckon?from=file");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // screenshots are read here, in the browser; the text is shown for correction before anything is reckoned
  const read = async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    setShot(null);
    try {
      const { readScreenshots } = await import("@/lib/ocr");
      setReading({ at: 0, of: files.length, share: 0 });
      const text = await readScreenshots([...files], (at, of, share) => setReading({ at, of, share }));
      if (!text.trim()) return setError(t.hero.shot.none);
      const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
      setShot({ text, day: guessDay(text, today) ?? "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReading(null);
      if (shotInput.current) shotInput.current.value = "";
    }
  };

  const link = "cursor-pointer justify-self-start border-b border-type pb-px text-left text-type transition-colors hover:border-red hover:text-red";
  return (
    <div className="font-body">
      <form onSubmit={submit} className="flex items-stretch border-2 border-type bg-sheet focus-within:border-red">
        <label htmlFor={id} className="flex items-center pl-4 font-mono text-[15px] text-soft">
          t.me/
        </label>
        <input
          id={id}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError("");
          }}
          placeholder={t.hero.placeholder}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent px-1.5 py-4 font-mono text-[15px] text-type outline-none placeholder:text-faint"
        />
        <button type="submit" className="group flex cursor-pointer items-center gap-2 bg-type px-5 text-base font-semibold text-page transition-colors hover:bg-red sm:px-7">
          {t.hero.go}
          <span className="transition-transform group-hover:translate-x-1">→</span>
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red">
          {error}
        </p>
      )}

      {/* the four ways in sit two by two beside the label, at every width */}
      <div className="mt-4 grid grid-cols-[auto_minmax(0,max-content)_minmax(0,max-content)] items-baseline justify-start gap-x-4 gap-y-2 text-[15px] sm:gap-x-6">
        <span className="row-span-2 max-w-[6rem] font-mono text-[11px] uppercase leading-[1.6] tracking-[0.16em] text-soft">{t.hero.or}</span>
        <button onClick={() => exportInput.current?.click()} className={link}>
          {t.hero.sources.export}
        </button>
        <button onClick={() => chatInput.current?.click()} className={link}>
          {t.hero.sources.whatsapp}
        </button>
        <button onClick={() => shotInput.current?.click()} className={link}>
          {t.hero.sources.shots}
        </button>
        <button onClick={() => setPasting((p) => !p)} className={link}>
          {t.hero.sources.paste}
        </button>
        <input ref={exportInput} type="file" accept=".json,application/json" hidden onChange={(e) => open(e.target.files?.[0], "export")} />
        <input ref={chatInput} type="file" accept=".txt,text/plain" hidden onChange={(e) => open(e.target.files?.[0], "chat")} />
        <input ref={shotInput} type="file" accept="image/*" multiple hidden onChange={(e) => read(e.target.files)} />
      </div>

      {reading && (
        <div className="mt-3" role="status">
          <div className="font-mono text-[12.5px] text-soft">{t.hero.shot.reading(Math.min(reading.at + 1, reading.of), reading.of)}</div>
          <div className="mt-2 h-1.5 bg-hair">
            <div className="h-full bg-red transition-[width] duration-150" style={{ width: `${((reading.at + reading.share) / reading.of) * 100}%` }} />
          </div>
        </div>
      )}

      {shot && (
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!shot.text.trim()) return;
            if (!shot.day) return setError(t.hero.shot.dayMissing);
            stash(parseScreenshotText(shot.text, shot.day));
            router.push("/reckon?from=shots");
          }}
        >
          <p className="text-[15px] text-type">{t.hero.shot.read}</p>
          <textarea
            id={`${id}-shot`}
            aria-label={t.hero.sources.shots}
            value={shot.text}
            onChange={(e) => setShot({ ...shot, text: e.target.value })}
            rows={8}
            className="mt-2 w-full resize-y border-2 border-type bg-sheet p-3 font-mono text-sm text-type outline-none focus:border-red"
          />
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <label htmlFor={`${id}-day`} className="font-mono text-[11px] uppercase tracking-[0.16em] text-soft">
              {t.hero.shot.day}
            </label>
            <input
              id={`${id}-day`}
              type="date"
              value={shot.day}
              max={new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)}
              onChange={(e) => {
                setShot({ ...shot, day: e.target.value });
                setError("");
              }}
              className="border-2 border-type bg-sheet px-2 py-1.5 font-mono text-sm text-type outline-none focus:border-red"
            />
            <button className="cursor-pointer bg-type px-5 py-2.5 text-[15px] font-semibold text-page transition-colors hover:bg-red">{t.hero.go} →</button>
          </div>
          <p className="mt-2 font-mono text-[11px] leading-relaxed text-soft">{t.hero.shot.local}</p>
        </form>
      )}

      {pasting && (
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!pasted.trim()) return;
            stash(parsePasted(pasted));
            router.push("/reckon?from=paste");
          }}
        >
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={5}
            autoFocus
            className="w-full resize-y border-2 border-type bg-sheet p-3 font-mono text-sm text-type outline-none focus:border-red"
            placeholder={"BUY NIFTY 24500 CE ABOVE 120\nTGT 150/180 SL 95"}
          />
          <button className="mt-2 cursor-pointer bg-type px-5 py-2.5 text-[15px] font-semibold text-page transition-colors hover:bg-red">{t.hero.go} →</button>
        </form>
      )}
    </div>
  );
}
