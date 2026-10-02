// Numbers and dates the way they are written in India.
import type { Lang } from "./i18n";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** ₹1,23,456 */
export const rupees = (n: number) => `${n < 0 ? "−" : ""}₹${inr.format(Math.abs(Math.round(n)))}`;
/** +₹4,057 / −₹13,165 */
export const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}₹${inr.format(Math.abs(Math.round(n)))}`;
/** a price with up to two decimals */
export const price = (n: number) => inr2.format(n);
export const percent = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;

const MONTHS: Record<Lang, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  hi: ["जन", "फ़र", "मार्च", "अप्रै", "मई", "जून", "जुला", "अग", "सित", "अक्टू", "नव", "दिस"],
  mr: ["जाने", "फेब्रु", "मार्च", "एप्रि", "मे", "जून", "जुलै", "ऑग", "सप्टें", "ऑक्टो", "नोव्हें", "डिसें"],
  gu: ["જાન્યુ", "ફેબ્રુ", "માર્ચ", "એપ્રિલ", "મે", "જૂન", "જુલાઈ", "ઑગ", "સપ્ટે", "ઑક્ટો", "નવે", "ડિસે"],
  pa: ["ਜਨ", "ਫ਼ਰ", "ਮਾਰਚ", "ਅਪ੍ਰੈ", "ਮਈ", "ਜੂਨ", "ਜੁਲਾ", "ਅਗ", "ਸਤੰ", "ਅਕਤੂ", "ਨਵੰ", "ਦਸੰ"],
  bn: ["জানু", "ফেব্রু", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টে", "অক্টো", "নভে", "ডিসে"],
  ta: ["ஜன", "பிப்", "மார்", "ஏப்", "மே", "ஜூன்", "ஜூலை", "ஆக", "செப்", "அக்", "நவ", "டிச"],
  te: ["జన", "ఫిబ్ర", "మార్చి", "ఏప్రి", "మే", "జూన్", "జూలై", "ఆగ", "సెప్టెం", "అక్టో", "నవం", "డిసెం"],
};

/** "2025-10-31" -> "31 Oct" (or "31 Oct 2025") */
export function shortDate(ymd: string, lang: Lang = "en", withYear = false) {
  const [y, m, d] = ymd.split("-");
  return `${+d} ${MONTHS[lang][+m - 1]}${withYear ? ` ${y}` : ""}`;
}

/** message time in IST, "09:59" */
export function istTime(iso: string) {
  const t = new Date(new Date(iso).getTime() + 330 * 60_000);
  return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
}
export function istDate(iso: string) {
  return new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10);
}
