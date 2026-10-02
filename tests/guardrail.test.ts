// The product looks backward only. Nothing it prints may tell anyone what to do with a stock, promise a return,
// or forecast a price. This reads every line of interface text and fails on wording that would.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { complaintDraft } from "../src/lib/complaint";

const source = readFileSync(new URL("../src/lib/strings.ts", import.meta.url), "utf8");
// labels for what a channel's own messages say ("Guarantees and sure shots") describe others' wording, not ours
const ours = source.replace(/cues: \{[\s\S]*?\n {4}\},/g, "");

const BANNED: [string, RegExp][] = [
  ["tells the reader to trade", /\b(?:you should|we recommend|we suggest|it is time to|best time to|must)\s+(?:buy|sell|hold|invest|exit|book)\b/i],
  ["forecasts a price", /\b(?:will|is going to|is likely to|expected to)\s+(?:rise|fall|go up|go down|rally|crash|double|hit|reach|touch)\b/i],
  ["rates an instrument", /\b(?:strong buy|strong sell|good buy|buy rating|sell rating|price target of|our target|multibagger|undervalued|overvalued)\b/i],
  ["promises a return", /\b(?:guaranteed|assured|risk-free|sure-shot)\s+(?:returns?|profits?|income)\b/i],
  ["promotes a broker or product", /\b(?:open (?:an|a demat) account|sign up with|use code|referral|affiliate)\b/i],
  ["asks for money or codes", /\b(?:subscribe for ₹|pay ₹|premium plan|enter (?:the )?otp|share (?:your )?otp)\b/i],
  ["हिंदी: ख़रीदने या बेचने को कहता है", /(?:ज़रूर|अभी|तुरंत)\s+(?:ख़रीद|बेच)|ख़रीद लीजिए|बेच दीजिए|निवेश कीजिए/],
  ["हिंदी: भाव का अनुमान", /(?:भाव|शेयर)\s+(?:बढ़ेगा|गिरेगा|चढ़ेगा)|पक्का मुनाफ़ा|गारंटीड रिटर्न/],
];

describe("guardrails", () => {
  it.each(BANNED)("no interface text %s", (_, pattern) => {
    const hit = ours.split("\n").find((line) => pattern.test(line));
    expect(hit, hit).toBeUndefined();
  });

  it("the complaint draft states facts and leaves the conclusion to the reader", () => {
    const empty = { calls: [], followUps: [], claims: [], unread: [], reposts: 0 };
    const record = { checked: 0, target: 0, stop: 0, expired: 0, expiredWorthless: 0, horizon: 0, open: 0, profitable: 0, hitRate: null, chanceHitRate: null, hitRateWithTarget: null, meanReturnPct: null, flatNet: 0 };
    const draft = complaintDraft(
      {
        channel: { source: "pasted", title: "Test", messages: 0 },
        extraction: empty,
        outcomes: {},
        ledger: { record, lines: [] },
        followThrough: { winners: 0, winnersAnnounced: 0, losers: 0, losersMentioned: 0, losersAdmitted: 0, silentLosses: [], unsupported: [], impossible: [] },
        promotion: { cues: [], byKind: {}, sellingMessages: 0, textMessages: 0 },
        registration: { claimed: [], mentionsWithoutNumber: false },
      } as never,
      [],
    );
    expect(draft).toMatch(/no SEBI registration/i);
    expect(draft).not.toMatch(/\b(?:fraud|scam|cheat|criminal|illegal|guilty)\b/i);
  });
});
