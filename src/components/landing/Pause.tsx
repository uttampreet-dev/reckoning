"use client";
// Exhibit F: the pause card, with the sample channel's record on it.
import gsap from "gsap";
import data from "@/samples/landing.json";
import { percent } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import { PauseCard } from "../PauseCard";
import { Exhibit, Step, Title, useScene } from "./kit";

const tape = data.tape;

export function Pause() {
  const { t } = useLang();
  const L = t.landing.pause;
  const record = [L.hit(percent(tape.hit ?? 0), percent(tape.chance ?? 0)), L.admitted(tape.losers, tape.losersAdmitted), ...(tape.paywalled > 0 ? [L.noStop] : [])];

  // the card tips up towards the reader as it is scrolled to
  const scene = useScene<HTMLDivElement>((root) => {
    gsap.fromTo(
      root.querySelector("[data-card]"),
      { rotateX: 22, rotateZ: -5, y: 60, opacity: 0.4 },
      { rotateX: 0, rotateZ: -1, y: 0, opacity: 1, ease: "none", scrollTrigger: { trigger: root, start: "top 92%", end: "top 38%", scrub: 0.6 } },
    );
  });

  return (
    <Exhibit id="pause" tag={L.tag}>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] items-center gap-x-20 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
        <div>
          <Title className="max-w-[15ch]">{L.title}</Title>
          <p data-reveal className="mt-7 max-w-[34rem] text-[18px] leading-relaxed text-type/80">
            {L.lead}
          </p>
          <Step className="mt-10">{L.lookFor}</Step>
          <ol className="mt-3 max-w-[34rem] border-t-[1.5px] border-type">
            {L.questions.map((q, i) => (
              <li data-reveal={i * 0.08} key={q} className="grid grid-cols-[2.4rem_minmax(0,1fr)] items-baseline border-b border-hair py-3.5 text-[18px] leading-snug">
                <span className="font-mono text-[12px] font-semibold text-red">0{i + 1}</span>
                {q}
              </li>
            ))}
          </ol>
        </div>
        <div ref={scene} className="[perspective:1100px]">
          <div data-card className="origin-bottom will-change-transform">
            <PauseCard id="sample" record={record} />
          </div>
        </div>
      </div>
    </Exhibit>
  );
}
