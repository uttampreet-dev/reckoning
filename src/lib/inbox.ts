// Hands a channel the user brought (a file, pasted text) from the page they dropped it on to the reckoning screen.
// It stays in this tab's memory and session storage; it is never sent anywhere.
import type { Channel } from "@/engine/types";

let pending: Channel | null = null;

export function stash(channel: Channel) {
  pending = channel;
  try {
    sessionStorage.setItem("inbox", JSON.stringify(channel));
  } catch {
    // too large for session storage: it still travels in memory for this navigation
  }
}

export function take(): Channel | null {
  if (pending) return pending;
  try {
    const saved = sessionStorage.getItem("inbox");
    return saved ? (JSON.parse(saved) as Channel) : null;
  } catch {
    return null;
  }
}
