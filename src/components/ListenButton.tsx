"use client";
// Reads a result aloud in the page's language. A recorded clip is played when one exists for exactly these words;
// otherwise the browser's own speech voice reads them. Nothing is sent anywhere either way.
// With no clip and no browser voice for the language, the button does not appear.
import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";

export interface Recorded {
  /** the words the clip speaks; it is used only while the page would say the same */
  text: string;
  src: string;
}

export function ListenButton({ text, recorded }: { text: string; recorded?: Recorded }) {
  const { t, lang } = useLang();
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const clip = recorded?.src && recorded.text === text ? recorded.src : null;

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      const want = lang;
      // an Indian voice when there is one, any voice of the language otherwise
      setVoice(voices.find((v) => v.lang === `${want}-IN`) ?? voices.find((v) => v.lang.startsWith(want)) ?? null);
    };
    pick();
    window.speechSynthesis.addEventListener("voiceschanged", pick);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", pick);
      window.speechSynthesis.cancel();
    };
  }, [lang]);

  // a change of language or of words stops whatever is playing
  useEffect(() => {
    return () => {
      audio.current?.pause();
      audio.current = null;
      setSpeaking(false);
    };
  }, [clip, text]);

  if (!clip && !voice) return null;
  const stop = () => {
    audio.current?.pause();
    if (audio.current) audio.current.currentTime = 0;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  };
  const speak = () => {
    if (!voice) return;
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 0.95;
    u.onend = u.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  };
  const toggle = () => {
    if (speaking) return stop();
    if (!clip) return speak();
    const a = (audio.current ??= new Audio(clip));
    a.onended = () => setSpeaking(false);
    setSpeaking(true);
    // if the clip cannot be played, the browser voice takes over
    a.play().catch(() => {
      setSpeaking(false);
      speak();
    });
  };
  return (
    <button onClick={toggle} aria-pressed={speaking} data-voice={clip ? "recorded" : "browser"} className="flex cursor-pointer items-center gap-2 border-[1.5px] border-type px-4 py-2 font-semibold text-type transition-colors hover:bg-type hover:text-page">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 6v4h2.5l3.5 3V3L5 6H2.5z" fill="currentColor" stroke="none" />
        {speaking ? <path d="M11 5.5v5M13.5 5.5v5" /> : <path d="M11 5.8a3 3 0 010 4.4M12.8 4a5.5 5.5 0 010 8" />}
      </svg>
      {speaking ? t.replay.stopListening : t.replay.listen}
    </button>
  );
}
