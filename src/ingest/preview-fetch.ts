// Fetches a public Telegram channel through its web preview (https://t.me/s/<channel>), a page of about
// twenty messages at a time. Only channels that have the preview switched on can be read this way.
import { parsePreviewPage, type PreviewPage } from "./telegram";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** Accepts "@name", "t.me/name", "https://t.me/s/name" and returns the bare handle, or null if it is not one. */
export function channelHandle(input: string): string | null {
  const m = input.trim().match(/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(?:s\/)?([A-Za-z][A-Za-z0-9_]{3,31})\/?(?:\?.*)?$|^@?([A-Za-z][A-Za-z0-9_]{3,31})$/);
  return m ? (m[1] ?? m[2]) : null;
}

export async function fetchPreviewPage(handle: string, before?: number): Promise<PreviewPage> {
  if (!channelHandle(handle)) throw new Error("not a channel handle");
  const url = `https://t.me/s/${handle}${before ? `?before=${before}` : ""}`;
  const res = await fetch(url, { headers: { "user-agent": UA, "accept-language": "en" }, redirect: "manual" });
  // a channel without a public preview redirects to its t.me/<name> landing page
  if (res.status >= 300 && res.status < 400) return { messages: [] };
  if (!res.ok) throw new Error(`Telegram answered HTTP ${res.status}`);
  return parsePreviewPage(await res.text());
}
