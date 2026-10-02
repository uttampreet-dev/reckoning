// Numbers as they are spoken in India, for anything that is read aloud. A speech voice given "50000" may say
// "five zero zero zero zero" or count in millions; given the words it has no choice to make.
import type { Lang } from "./i18n";

const EN_ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

// Hindi has its own word for every number up to ninety-nine
const HI = [
  "शून्य", "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ",
  "दस", "ग्यारह", "बारह", "तेरह", "चौदह", "पंद्रह", "सोलह", "सत्रह", "अठारह", "उन्नीस",
  "बीस", "इक्कीस", "बाईस", "तेईस", "चौबीस", "पच्चीस", "छब्बीस", "सत्ताईस", "अट्ठाईस", "उनतीस",
  "तीस", "इकतीस", "बत्तीस", "तैंतीस", "चौंतीस", "पैंतीस", "छत्तीस", "सैंतीस", "अड़तीस", "उनतालीस",
  "चालीस", "इकतालीस", "बयालीस", "तैंतालीस", "चौवालीस", "पैंतालीस", "छियालीस", "सैंतालीस", "अड़तालीस", "उनचास",
  "पचास", "इक्यावन", "बावन", "तिरपन", "चौवन", "पचपन", "छप्पन", "सत्तावन", "अट्ठावन", "उनसठ",
  "साठ", "इकसठ", "बासठ", "तिरसठ", "चौंसठ", "पैंसठ", "छियासठ", "सड़सठ", "अड़सठ", "उनहत्तर",
  "सत्तर", "इकहत्तर", "बहत्तर", "तिहत्तर", "चौहत्तर", "पचहत्तर", "छिहत्तर", "सतहत्तर", "अठहत्तर", "उनासी",
  "अस्सी", "इक्यासी", "बयासी", "तिरासी", "चौरासी", "पचासी", "छियासी", "सत्तासी", "अट्ठासी", "नवासी",
  "नब्बे", "इक्यानवे", "बानवे", "तिरानवे", "चौरानवे", "पंचानवे", "छियानवे", "सत्तानवे", "अट्ठानवे", "निन्यानवे",
];

const enBelowHundred = (n: number) => (n < 20 ? EN_ONES[n] : EN_TENS[Math.floor(n / 10)] + (n % 10 ? `-${EN_ONES[n % 10]}` : ""));

/** crore, lakh, thousand, hundred, and what is left: the Indian grouping */
function groups(n: number) {
  return { crore: Math.floor(n / 1e7), lakh: Math.floor((n % 1e7) / 1e5), thousand: Math.floor((n % 1e5) / 1e3), hundred: Math.floor((n % 1e3) / 100), rest: n % 100 };
}

/** 8435 -> "eight thousand four hundred and thirty-five" / "आठ हज़ार चार सौ पैंतीस" */
export function say(value: number, lang: Lang = "en"): string {
  const n = Math.round(Math.abs(value));
  const minus = value < 0 && n > 0;
  let words: string;
  if (lang === "hi") {
    if (n < 100) words = HI[n];
    else {
      const g = groups(n);
      // above 99 crore the crores are themselves spoken as a full number
      const part = (k: number, unit: string) => (k ? `${k < 100 ? HI[k] : say(k, "hi")} ${unit}` : "");
      words = [part(g.crore, "करोड़"), part(g.lakh, "लाख"), part(g.thousand, "हज़ार"), part(g.hundred, "सौ"), g.rest ? HI[g.rest] : ""].filter(Boolean).join(" ");
    }
    return minus ? `ऋण ${words}` : words;
  }
  if (n < 100) words = enBelowHundred(n);
  else {
    const g = groups(n);
    const part = (k: number, unit: string) => (k ? `${k < 100 ? enBelowHundred(k) : say(k, "en")} ${unit}` : "");
    const big = [part(g.crore, "crore"), part(g.lakh, "lakh"), part(g.thousand, "thousand"), part(g.hundred, "hundred")].filter(Boolean).join(" ");
    words = g.rest ? `${big} and ${enBelowHundred(g.rest)}` : big;
  }
  return minus ? `minus ${words}` : words;
}
