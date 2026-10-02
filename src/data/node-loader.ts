// Loader for scripts and tests: reads the price files straight from public/data/.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Market, type Loader } from "./market";

const DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "data");

export const nodeLoader: Loader = async (p) => {
  try {
    return new Uint8Array(await readFile(path.join(DATA, p)));
  } catch {
    return null;
  }
};

export const openMarket = () => Market.open(nodeLoader);
