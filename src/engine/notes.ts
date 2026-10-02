// What the engine has to say about one call: why it could not be checked, what was assumed, what was unusual about
// the message. The engine records which sentence and the figures in it; the words live in the language files, so
// the same outcome can be read in any of them.
import type { Strings } from "../lib/strings/en";

type Sentences = Strings["notes"];
export type NoteKey = keyof Sentences;
type Figures<K extends NoteKey> = Sentences[K] extends (...a: infer A extends (string | number)[]) => string ? A : [];

export interface Note {
  k: NoteKey;
  /** figures in the sentence, in order. A date travels as "2026-09-01" and is written out when the note is read. */
  a: (string | number)[];
}

export const note = <K extends NoteKey>(k: K, ...a: Figures<K>): Note => ({ k, a });

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** the note in words, from one language's sentences */
export function noteText(n: Note, sentences: Sentences, date: (ymd: string) => string): string {
  const s = sentences[n.k] as string | ((...a: (string | number)[]) => string);
  return typeof s === "string" ? s : s(...n.a.map((v) => (typeof v === "string" && DATE.test(v) ? date(v) : v)));
}
