"use client";
// Two languages, one dictionary each. Hindi is written for a reader who thinks in Hindi, not translated word for word.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { en, hi, type Strings } from "./strings";

export type Lang = "en" | "hi";
const dictionaries: Record<Lang, Strings> = { en, hi };

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: Strings }>({ lang: "en", setLang: () => {}, t: en });

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    const saved = localStorage.getItem("lang");
    if (saved === "hi" || saved === "en") setLangState(saved);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem("lang", l);
  }, []);
  const value = useMemo(() => ({ lang, setLang, t: dictionaries[lang] }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);
