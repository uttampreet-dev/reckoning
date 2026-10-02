"use client";
// The interface in eight languages. English ships with the page; every other dictionary is fetched only when
// someone picks it, so a reader on a slow connection pays for one language, not eight.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { en, type Strings } from "./strings/en";

export const LANGS = [
  { code: "en", name: "English" },
  { code: "hi", name: "हिंदी" },
  { code: "mr", name: "मराठी" },
  { code: "gu", name: "ગુજરાતી" },
  { code: "pa", name: "ਪੰਜਾਬੀ" },
  { code: "bn", name: "বাংলা" },
  { code: "ta", name: "தமிழ்" },
  { code: "te", name: "తెలుగు" },
] as const;
export type Lang = (typeof LANGS)[number]["code"];
const isLang = (v: unknown): v is Lang => LANGS.some((l) => l.code === v);

const load: Record<Exclude<Lang, "en">, () => Promise<Strings>> = {
  hi: () => import("./strings/hi").then((m) => m.hi),
  mr: () => import("./strings/mr").then((m) => m.mr),
  gu: () => import("./strings/gu").then((m) => m.gu),
  pa: () => import("./strings/pa").then((m) => m.pa),
  bn: () => import("./strings/bn").then((m) => m.bn),
  ta: () => import("./strings/ta").then((m) => m.ta),
  te: () => import("./strings/te").then((m) => m.te),
};

interface Value {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Strings;
  /** any language but English: taller letters, no capitals, no letter-spacing */
  indic: boolean;
}
const Ctx = createContext<Value>({ lang: "en", setLang: () => {}, t: en, indic: false });

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // the language whose words are on screen; it changes only once its dictionary has arrived
  const [state, setState] = useState<{ lang: Lang; t: Strings }>({ lang: "en", t: en });

  const show = useCallback((l: Lang) => {
    if (l === "en") return setState({ lang: "en", t: en });
    load[l]()
      .then((t) => setState({ lang: l, t }))
      .catch(() => {});
  }, []);
  useEffect(() => {
    const saved = localStorage.getItem("lang");
    if (isLang(saved) && saved !== "en") show(saved);
  }, [show]);
  useEffect(() => {
    document.documentElement.lang = state.lang;
    document.documentElement.toggleAttribute("data-indic", state.lang !== "en");
  }, [state.lang]);
  const setLang = useCallback(
    (l: Lang) => {
      localStorage.setItem("lang", l);
      show(l);
    },
    [show],
  );
  const value = useMemo(() => ({ lang: state.lang, setLang, t: state.t, indic: state.lang !== "en" }), [state, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);
