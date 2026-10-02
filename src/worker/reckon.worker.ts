/// <reference lib="webworker" />
// Runs the reckoning off the main thread. Price files are fetched from this site's own /data folder;
// the channel's messages never leave the browser.
import { Market } from "@/data/market";
import { reckon, type Reckoning } from "@/engine/reckon";
import type { LedgerParams } from "@/engine/ledger";
import type { Register } from "@/engine/registration";
import type { Channel } from "@/engine/types";

export type WorkerRequest = { channel: Channel; params?: LedgerParams };
export type WorkerReply =
  | { type: "stage"; stage: "prices" | "reading" | "replaying" }
  | { type: "progress"; done: number; total: number }
  | { type: "done"; result: Reckoning; days: string[] }
  | { type: "error"; message: string };

let market: Promise<Market> | undefined;
let register: Promise<Register | null> | undefined;

const load = async (path: string) => {
  const res = await fetch(`/data/${path}`);
  return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
};
const post = (m: WorkerReply) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  try {
    post({ type: "stage", stage: "prices" });
    market ??= Market.open(load);
    register ??= load("sebi-register.json").then((b) => (b ? (JSON.parse(new TextDecoder().decode(b)) as Register) : null));
    const [m, reg] = await Promise.all([market, register]);
    post({ type: "stage", stage: "replaying" });
    let last = 0;
    const result = await reckon(e.data.channel, m, reg, e.data.params, (done, total) => {
      const now = Date.now();
      if (now - last > 60 || done === total) {
        last = now;
        post({ type: "progress", done, total });
      }
    });
    // price bars for every call would make the message heavy; keep them only for calls that were replayed
    post({ type: "done", result, days: m.days });
  } catch (err) {
    market = undefined;
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
