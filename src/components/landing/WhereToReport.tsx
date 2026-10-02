"use client";
// Exhibit G: check a registration number against the copy of SEBI's register, and the three places a complaint goes.
import gsap from "gsap";
import { useRef, useState } from "react";
import type { Register } from "@/engine/registration";
import { shortDate } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import { EASE, Exhibit, Step, Title, useScene } from "./kit";

const REG_NO = /^IN[HA](?:\d{9}|IFSC\d{5})$/;
type Answer = { k: "bad" } | { k: "loading" } | { k: "error" } | { k: "found"; no: string; name: string; from: string; asOf: string } | { k: "missing"; no: string; asOf: string };

export function WhereToReport() {
  const { t, lang } = useLang();
  const L = t.landing.where;
  const [value, setValue] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const register = useRef<Register | null>(null);

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    const no = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!REG_NO.test(no)) return setAnswer({ k: "bad" });
    try {
      if (!register.current) {
        setAnswer({ k: "loading" });
        const res = await fetch("/data/sebi-register.json");
        if (!res.ok) throw new Error(String(res.status));
        register.current = (await res.json()) as Register;
      }
      const reg = register.current;
      const row = (no.startsWith("INH") ? reg.ra : reg.ia)[no];
      setAnswer(row ? { k: "found", no, name: row[0], from: row[1], asOf: reg.asOf } : { k: "missing", no, asOf: reg.asOf });
    } catch {
      setAnswer({ k: "error" });
    }
  };

  const scene = useScene<HTMLOListElement>((root) => {
    gsap.from(root.querySelectorAll("[data-route]"), { x: 60, opacity: 0, duration: 0.8, ease: EASE, stagger: 0.12, scrollTrigger: { trigger: root, start: "top 80%" } });
    gsap.from(root.querySelectorAll("[data-arrow]"), { scaleX: 0, transformOrigin: "0% 50%", duration: 0.7, ease: EASE, stagger: 0.12, delay: 0.25, scrollTrigger: { trigger: root, start: "top 80%" } });
  });

  return (
    <Exhibit id="report" tag={L.tag}>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-x-20 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div>
          <Title className="max-w-[13ch]">{L.title}</Title>
          <p data-reveal className="mt-7 max-w-[34rem] text-[18px] leading-relaxed text-type/80">
            {L.lead}
          </p>

          <form data-reveal="0.1" onSubmit={check} className="mt-9 max-w-[34rem]">
            <label htmlFor="regno">
              <Step>{L.checkLabel}</Step>
            </label>
            <div className="mt-2 flex items-stretch border-2 border-type bg-sheet focus-within:border-red">
              <input
                id="regno"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setAnswer(null);
                }}
                placeholder={L.placeholder}
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent px-4 py-3.5 font-mono text-[15px] uppercase text-type outline-none placeholder:normal-case placeholder:text-faint"
              />
              <button type="submit" className="cursor-pointer bg-type px-6 text-[15px] font-semibold text-page transition-colors hover:bg-red">
                {L.check}
              </button>
            </div>
            <div role="status" className="mt-3 min-h-[4.5rem] text-[15.5px] leading-snug">
              {answer?.k === "bad" && <p className="text-red">{L.bad}</p>}
              {answer?.k === "loading" && <p className="text-soft">{L.loading}…</p>}
              {answer?.k === "error" && <p className="text-red">{t.report.failed}</p>}
              {answer?.k === "found" && (
                <div className="border-l-2 border-green pl-3">
                  <p className="font-medium text-green">{L.found(answer.no, answer.name, answer.from)}</p>
                  <p className="mt-1 text-[14px] text-type/75">{t.report.regOnWarn}</p>
                </div>
              )}
              {answer?.k === "missing" && <p className="border-l-2 border-red pl-3 font-medium text-red">{L.notFound(answer.no)}</p>}
              {(answer?.k === "found" || answer?.k === "missing") && <p className="mt-2 font-mono text-[10.5px] text-soft">{L.asOf(shortDate(answer.asOf, lang, true))}</p>}
            </div>
          </form>
        </div>

        <ol ref={scene} className="self-end overflow-x-clip border-t-2 border-type">
          {L.routes.map(([when, where, domain, href], i) => (
            <li data-route key={domain} className="border-b-[1.5px] border-type">
              <a href={href} target="_blank" rel="noreferrer" className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-1 px-1 py-6 transition-colors hover:bg-type hover:px-5 hover:text-page sm:grid-cols-[minmax(0,0.9fr)_3.5rem_minmax(0,1.1fr)]">
                <div>
                  <div className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-soft group-hover:text-page/60">
                    0{i + 1} · {L.if}
                  </div>
                  <div className="mt-1 text-[19px] font-semibold leading-snug">{when}</div>
                </div>
                <div data-arrow aria-hidden className="relative hidden h-px bg-current sm:block">
                  <span className="absolute -right-px -top-[4px] size-[9px] rotate-45 border-r border-t border-current" />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <div className="text-[17px] leading-snug">{where}</div>
                  <div className="mt-1 font-mono text-[13px] font-semibold text-red group-hover:text-amber">{domain} ↗</div>
                </div>
              </a>
            </li>
          ))}
        </ol>
      </div>
    </Exhibit>
  );
}
