// Downloads daily bhavcopy archives into data-raw/: NSE cash, NSE F&O and BSE F&O.
// Usage: node scripts/fetch-bhavcopy.ts [from=2024-01-01] [to=today]
// Already-downloaded days and known non-trading days are skipped, so re-runs only fetch what is new.
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "data-raw");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const NSE = (dir: string, tag: string) => (ymd: string) => `https://nsearchives.nseindia.com/content/${dir}/BhavCopy_NSE_${tag}_0_0_0_${ymd}_F_0000.csv.zip`;
const SEGMENTS = [
  { dir: "cm", ext: "zip", url: NSE("cm", "CM") },
  { dir: "fo", ext: "zip", url: NSE("fo", "FO") },
  // BSE derivatives, for SENSEX and BANKEX contracts; same column layout, served as plain CSV
  { dir: "bfo", ext: "csv", url: (ymd: string) => `https://www.bseindia.com/download/Bhavcopy/Derivative/BhavCopy_BSE_FO_0_0_0_${ymd}_F_0000.CSV` },
];
const CONCURRENCY = 6;

const from = process.argv[2] ?? "2024-01-01";
const to = process.argv[3] ?? new Date().toISOString().slice(0, 10);

async function exists(p: string) {
  try {
    return (await stat(p)).size > 0;
  } catch {
    return false;
  }
}

function days(a: string, b: string) {
  const out: string[] = [];
  for (let d = new Date(a + "T00:00:00Z"); d <= new Date(b + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10).replaceAll("-", ""));
  }
  return out;
}

async function main() {
  for (const s of SEGMENTS) await mkdir(path.join(ROOT, s.dir), { recursive: true });
  const closedPath = path.join(ROOT, "closed.json");
  const closed: Record<string, true> = (await exists(closedPath)) ? JSON.parse(await readFile(closedPath, "utf8")) : {};

  const jobs: { dir: string; ext: string; url: (ymd: string) => string; ymd: string }[] = [];
  for (const ymd of days(from, to)) for (const s of SEGMENTS) jobs.push({ ...s, ymd });

  let got = 0,
    skipped = 0,
    shut = 0,
    failed = 0,
    i = 0;
  async function worker() {
    while (i < jobs.length) {
      const j = jobs[i++];
      const key = `${j.dir}/${j.ymd}`;
      const file = path.join(ROOT, j.dir, `${j.ymd}.${j.ext}`);
      if (closed[key] || (await exists(file))) {
        skipped++;
        continue;
      }
      // BSE is asked only for days the NSE cash market traded
      if (j.dir === "bfo" && !(await exists(path.join(ROOT, "cm", `${j.ymd}.zip`)))) {
        skipped++;
        continue;
      }
      let done = false;
      for (let attempt = 0; attempt < 3 && !done; attempt++) {
        try {
          const res = await fetch(j.url(j.ymd), {
            headers: { "user-agent": UA, referer: new URL(j.url(j.ymd)).origin + "/" },
            signal: AbortSignal.timeout(45_000),
          });
          if (res.status === 404) {
            closed[key] = true;
            shut++;
            done = true;
          } else if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            // a zip starts with "PK", a bhavcopy CSV with its header; anything else is an error page
            const good = j.ext === "zip" ? buf[0] === 0x50 && buf[1] === 0x4b : buf.subarray(0, 6).toString() === "TradDt";
            if (good) {
              await writeFile(file, buf);
              got++;
              done = true;
            }
          }
        } catch {}
        if (!done) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
      if (!done) {
        failed++;
        console.error("failed", key);
      }
      if ((got + shut + failed) % 100 === 0) console.log(`${i}/${jobs.length} downloaded=${got} closed=${shut} failed=${failed}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  // today's file may simply not be published yet, so never remember the last three days as closed
  const recent = new Set(days(new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10), to));
  for (const k of Object.keys(closed)) if (recent.has(k.split("/")[1])) delete closed[k];
  await writeFile(closedPath, JSON.stringify(closed));
  console.log(`done: downloaded=${got} skipped=${skipped} closed=${shut} failed=${failed}`);
}

main();
