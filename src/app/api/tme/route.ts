// One page of a public Telegram channel, read through Telegram's own web preview.
// The browser cannot fetch t.me directly (no CORS), so this route does it and returns the parsed messages.
// Nothing is stored: the page is fetched, parsed and passed back.
import { channelHandle, fetchPreviewPage } from "@/ingest/preview-fetch";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const handle = channelHandle(url.searchParams.get("channel") ?? "");
  const before = Number(url.searchParams.get("before")) || undefined;
  if (!handle) return Response.json({ error: "not-a-channel" }, { status: 400 });

  // Telegram occasionally answers with an empty page; one empty answer is not the end of the history
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const page = await fetchPreviewPage(handle, before);
      if (page.messages.length || attempt === 2) {
        return Response.json({ handle, ...page }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } });
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  return Response.json({ error: "telegram-unreachable", detail: lastError }, { status: 502 });
}
