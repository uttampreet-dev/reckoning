import { describe, expect, it } from "vitest";
import { decodeTable, encodeTable } from "../src/data/codec";
import { openMarket } from "../src/data/node-loader";
import { placeMessage } from "../src/engine/time";
import { parsePasted, parsePreviewPage, parseTelegramExport, parseWhatsAppExport } from "../src/ingest/telegram";
import { channelHandle } from "../src/ingest/preview-fetch";

describe("price tables", () => {
  it("round-trips integers, including volumes above 2^32 and negative deltas", () => {
    const cols = [
      [0, 1, 2, 5, 9],
      [245050, 244900, 251000, 100, 100],
      [5_000_000_000, 16_376_789, 0, 4_294_967_296, 7],
    ];
    expect(decodeTable(encodeTable(cols))).toEqual(cols);
  });

  it("serves the exchange's own numbers", async () => {
    const m = await openMarket();
    // RELIANCE on 25 Oct 2024, the last day before its 1:1 bonus (NSE bhavcopy: 2687.00 / 2688.70 / 2644.00 / 2655.70)
    const day = m.days.indexOf("2024-10-25");
    const bars = await m.cash("RELIANCE");
    expect(bars!.find((b) => b.d === day)).toMatchObject({ o: 2687, h: 2688.7, l: 2644, c: 2655.7 });
    expect(m.symbols.RELIANCE.x).toEqual([[m.days.indexOf("2024-10-28"), 0.5]]);
    expect(m.fo.NIFTY.kind).toBe("index");
    expect(m.fo.SENSEX.expiries.length).toBeGreaterThan(50);
  });

  it("never serves a close outside the day's traded range", async () => {
    // on expiry day BSE's file carries the index level in the option's close column (77,928.15 for this contract)
    const m = await openMarket();
    const chain = await m.options("SENSEX", "2026-07-30");
    const bar = chain!.get("77800CE")!.find((b) => b.d === m.days.indexOf("2026-07-30"))!;
    expect(bar).toMatchObject({ o: 127.85, h: 184, l: 2.2, c: 123.85 });
    for (const bars of chain!.values()) for (const b of bars) expect(b.c >= b.l && b.c <= b.h).toBe(true);
  });

  it("keeps the newest price day at least 30 days behind the build", async () => {
    const m = await openMarket();
    expect(m.meta.lagDays).toBe(30);
    expect((Date.parse(m.meta.built) - Date.parse(m.meta.to)) / 864e5).toBeGreaterThanOrEqual(30);
  });
});

describe("market time", () => {
  const days = ["2026-08-10", "2026-08-11", "2026-08-12"];
  it("places a message against the session in IST", () => {
    expect(placeMessage("2026-08-11T03:47:00Z", days)).toEqual({ session: "in-session", day: 1, minutesIn: 2 });
    expect(placeMessage("2026-08-11T03:00:00Z", days)).toEqual({ session: "before-open", day: 1 });
    expect(placeMessage("2026-08-11T10:30:00Z", days)).toEqual({ session: "after-close", day: 2 });
    expect(placeMessage("2026-08-12T10:30:00Z", days)).toBeNull();
  });
});

describe("message sources", () => {
  it("parses Telegram's public preview page", () => {
    const html = `<div class="tgme_channel_info_header_title"><span dir="auto">Demo</span></div>
      <span class="counter_value">1.2K</span> <span class="counter_type">subscribers</span>
      <a href="/s/demo?before=41" class="tme_messages_more js-messages_more" data-before="41"></a>
      <div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message" data-post="demo/41">
        <div class="tgme_widget_message_text js-message_text" dir="auto">BUY NIFTY 24500 CE<br/>ABOVE 120 &amp; SL 100 <i class="emoji"><b>🔥</b></i></div>
        <span class="tgme_widget_message_views">3.1K</span><span class="tgme_widget_message_meta">edited &nbsp;<a class="tgme_widget_message_date" href="https://t.me/demo/41"><time datetime="2026-08-11T03:47:17+00:00" class="time">03:47</time></a></span></div></div>
      <div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message" data-post="demo/42">
        <a class="tgme_widget_message_reply" href="https://t.me/demo/41"><div class="tgme_widget_message_metatext js-message_reply_text">BUY NIFTY</div></a>
        <a class="tgme_widget_message_photo_wrap" href="https://t.me/demo/42"></a>
        <span class="tgme_widget_message_meta"><a class="tgme_widget_message_date" href="https://t.me/demo/42"><time datetime="2026-08-11T04:10:00+00:00" class="time">04:10</time></a></span></div></div>`;
    const page = parsePreviewPage(html);
    expect(page).toMatchObject({ title: "Demo", subscribers: "1.2K", before: 41 });
    expect(page.messages[0]).toMatchObject({ id: 41, text: "BUY NIFTY 24500 CE\nABOVE 120 & SL 100 🔥", edited: true, ts: "2026-08-11T03:47:17.000Z", views: "3.1K" });
    expect(page.messages[1]).toMatchObject({ id: 42, text: "", hasPhoto: true, replyTo: 41 });
  });

  it("parses a Telegram Desktop export, with rich text and unix times", () => {
    const ch = parseTelegramExport({
      name: "Demo",
      messages: [
        { id: 1, type: "service", date: "2026-08-11T09:00:00" },
        { id: 2, type: "message", date: "2026-08-11T09:17:00", date_unixtime: "1786506420", text: ["BUY ", { type: "bold", text: "NIFTY" }, " 24500 CE"], reply_to_message_id: 1 },
        { id: 3, type: "message", date: "2026-08-11T09:20:00", text: "", photo: "photos/1.jpg" },
      ],
    });
    expect(ch.messages).toHaveLength(2);
    expect(ch.messages[0]).toMatchObject({ id: 2, text: "BUY NIFTY 24500 CE", replyTo: 1, ts: new Date(1786506420000).toISOString() });
    expect(ch.messages[1]).toMatchObject({ hasPhoto: true, ts: "2026-08-11T03:50:00.000Z" });
    expect(() => parseTelegramExport({ foo: 1 })).toThrow();
  });

  it("parses WhatsApp exports from Android and iPhone", () => {
    const android = "12/08/26, 9:20 am - Guru: BUY NIFTY 24500 CE\nABOVE 120\n12/08/26, 9:45 am - Guru: <Media omitted>";
    const a = parseWhatsAppExport(android);
    expect(a.messages[0]).toMatchObject({ text: "BUY NIFTY 24500 CE\nABOVE 120", ts: "2026-08-12T03:50:00.000Z" });
    expect(a.messages[1]).toMatchObject({ text: "", hasPhoto: true });
    const iphone = "[12/08/26, 3:05:11 PM] Guru: TARGET HIT\n[12/08/26, 3:06:00 PM] Guru: SL 100";
    expect(parseWhatsAppExport(iphone).messages[0].ts).toBe("2026-08-12T09:35:11.000Z");
    expect(parsePasted(android).messages).toHaveLength(2);
    expect(parsePasted("BUY TCS CMP 3000\n\nSELL INFY BELOW 1500").messages).toHaveLength(2);
  });

  it("accepts channel links and handles, and nothing else", () => {
    expect(channelHandle("https://t.me/s/some_channel")).toBe("some_channel");
    expect(channelHandle("t.me/some_channel")).toBe("some_channel");
    expect(channelHandle("@some_channel")).toBe("some_channel");
    expect(channelHandle("https://evil.example/s/x")).toBeNull();
    expect(channelHandle("t.me/+AbCdEf123")).toBeNull();
  });
});
