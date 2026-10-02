// Compact integer tables: every column is delta-encoded, zigzag varint packed, and the whole thing gzipped.
// A daily price series for one stock comes to a few kilobytes, so the app can run on static files alone.
import { gzipSync, gunzipSync } from "fflate";

const MAGIC = [0x52, 0x4b, 0x4e, 0x31]; // "RKN1"

function pushVarint(out: number[], n: number) {
  // n is a non-negative integer that may exceed 2^31, so no bitwise shifts on the full value
  while (n >= 0x80) {
    out.push((n % 0x80) | 0x80);
    n = Math.floor(n / 0x80);
  }
  out.push(n);
}

const zig = (n: number) => (n >= 0 ? n * 2 : -n * 2 - 1);
const zag = (n: number) => (n % 2 === 0 ? n / 2 : -(n + 1) / 2);

/** columns must all have the same length and hold integers only */
export function encodeTable(columns: ArrayLike<number>[]): Uint8Array {
  const rows = columns.length ? columns[0].length : 0;
  const out: number[] = [...MAGIC, columns.length];
  pushVarint(out, rows);
  for (const col of columns) {
    if (col.length !== rows) throw new Error("ragged table");
    let prev = 0;
    for (let i = 0; i < rows; i++) {
      const v = col[i];
      if (!Number.isInteger(v)) throw new Error(`non-integer value ${v}`);
      pushVarint(out, zig(v - prev));
      prev = v;
    }
  }
  return gzipSync(Uint8Array.from(out), { level: 9, mtime: 0 });
}

export function decodeTable(bytes: Uint8Array): number[][] {
  const raw = gunzipSync(bytes);
  for (let i = 0; i < 4; i++) if (raw[i] !== MAGIC[i]) throw new Error("not a price table");
  let p = 4;
  const read = () => {
    let n = 0,
      mul = 1,
      b: number;
    do {
      b = raw[p++];
      n += (b & 0x7f) * mul;
      mul *= 0x80;
    } while (b & 0x80);
    return n;
  };
  const ncols = raw[p++];
  const rows = read();
  const columns: number[][] = [];
  for (let c = 0; c < ncols; c++) {
    const col = new Array<number>(rows);
    let prev = 0;
    for (let i = 0; i < rows; i++) {
      prev += zag(read());
      col[i] = prev;
    }
    columns.push(col);
  }
  return columns;
}
