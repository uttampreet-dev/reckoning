"use client";
// Where a channel comes in: a public link, an export file, or pasted messages.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import { stash } from "@/lib/inbox";
import { channelHandle } from "@/ingest/preview-fetch";
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

  const link = "cursor-pointer border-b border-type pb-px text-type transition-colors hover:border-red hover:text-red";
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

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[15px]">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-soft">{t.hero.or}</span>
        <button onClick={() => exportInput.current?.click()} className={link}>
          {t.hero.sources.export}
        </button>
        <button onClick={() => chatInput.current?.click()} className={link}>
          {t.hero.sources.whatsapp}
        </button>
        <button onClick={() => setPasting((p) => !p)} className={link}>
          {t.hero.sources.paste}
        </button>
        <input ref={exportInput} type="file" accept=".json,application/json" hidden onChange={(e) => open(e.target.files?.[0], "export")} />
        <input ref={chatInput} type="file" accept=".txt,text/plain" hidden onChange={(e) => open(e.target.files?.[0], "chat")} />
      </div>

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
