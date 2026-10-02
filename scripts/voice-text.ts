// Writes the words the landing page reads aloud, so the recording script (scripts/voice.py) speaks exactly them.
// Usage: npm run voice
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { heroSpoken } from "../src/lib/spoken";

const ROOT = path.resolve(import.meta.dirname, "..");
await mkdir(path.join(ROOT, "data-raw", "voice"), { recursive: true });
const text = { en: heroSpoken("en"), hi: heroSpoken("hi") };
await writeFile(path.join(ROOT, "data-raw", "voice", "text.json"), JSON.stringify(text, null, 1));
console.log(`en ${text.en.length} characters, hi ${text.hi.length} characters`);
