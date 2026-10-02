// Copies SEBI's public register of Research Analysts and Investment Advisers into public/data/sebi-register.json.
// Usage: npm run data:register
// Source: "Recognised Intermediaries" on sebi.gov.in. The register changes daily, so the copy carries its date
// and the app always shows that date next to a lookup result.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";

const ROOT = path.resolve(import.meta.dirname, "..");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
// intmId 14 = Research Analysts, 13 = Investment Advisers
const EXPORT = (id: number) => `https://www.sebi.gov.in/sebiweb/other/IntmExportAction.do?intmId=${id}`;

type Row = [name: string, validFrom: string, validTo: string];

async function download(id: number, saveAs: string): Promise<Record<string, Row>> {
  const res = await fetch(EXPORT(id), { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`SEBI export ${id}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(saveAs, buf);
  const sheet = Object.values(XLSX.read(buf).Sheets)[0];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
  // a title row and a grouping row sit above the real header
  const head = rows.findIndex((r) => r.some((c) => /registration\s*no/i.test(String(c))));
  if (head < 0) throw new Error("register export: header row not found");
  const col = (re: RegExp) => rows[head].findIndex((c) => re.test(String(c)));
  const [iName, iReg, iFrom, iTo] = [col(/^name$/i), col(/registration\s*no/i), col(/^from$/i), col(/^to$/i)];
  const out: Record<string, Row> = {};
  for (const r of rows.slice(head + 1)) {
    const regNo = String(r[iReg]).trim().toUpperCase();
    if (!/^IN[HA]/.test(regNo)) continue;
    out[regNo] = [String(r[iName]).trim(), String(r[iFrom]).trim(), String(r[iTo]).trim()];
  }
  return out;
}

async function main() {
  const raw = path.join(ROOT, "data-raw", "sebi");
  await mkdir(raw, { recursive: true });
  const ra = await download(14, path.join(raw, "ra_export.xls"));
  const ia = await download(13, path.join(raw, "ia_export.xls"));
  const asOf = new Date().toISOString().slice(0, 10);
  await writeFile(path.join(ROOT, "public", "data", "sebi-register.json"), JSON.stringify({ asOf, ra, ia }));
  console.log(`register as of ${asOf}: ${Object.keys(ra).length} research analysts, ${Object.keys(ia).length} investment advisers`);
}

main();
