import { Dock } from "@/components/Dock";
import { HeroCopy } from "@/components/HeroCopy";
import { ChatTape } from "@/components/landing/ChatTape";
import { Closing } from "@/components/landing/Closing";
import { CoinTest } from "@/components/landing/CoinTest";
import { OneCall } from "@/components/landing/OneCall";
import { Pause } from "@/components/landing/Pause";
import { Rail } from "@/components/landing/Rail";
import { Readings } from "@/components/landing/Readings";
import { ScrollCue } from "@/components/landing/ScrollCue";
import { Ticker } from "@/components/landing/Ticker";
import { WhereToReport } from "@/components/landing/WhereToReport";
import { Masthead } from "@/components/Masthead";
import { Replay } from "@/components/Replay";
import { ReplaySummary } from "@/components/ReplaySummary";

export default function Home() {
  return (
    <div className="min-h-dvh bg-page text-type">
      <Masthead />
      <Rail />
      <main>
        {/* wide: headline and input on the left, the replay on the right, its summary under the input.
            narrow: headline, input, replay, summary, in that order. */}
        <section id="ledger" className="mx-auto grid max-w-[1440px] scroll-mt-6 grid-cols-[minmax(0,1fr)] gap-x-14 gap-y-10 px-5 pb-16 pt-10 sm:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)] lg:px-[72px] lg:pt-16">
          <div className="min-w-0">
            <HeroCopy />
            <div className="mt-9 max-w-[35rem]">
              <Dock />
            </div>
          </div>
          <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <Replay />
          </div>
          <div id="replay-summary" className="min-w-0 max-w-[35rem] lg:col-start-1 lg:row-start-2 lg:self-end">
            <ReplaySummary />
          </div>
          <ScrollCue />
        </section>
        <Ticker />
        <OneCall />
        <CoinTest />
        <ChatTape />
        <Readings />
        <Pause />
        <WhereToReport />
        <Closing />
      </main>
    </div>
  );
}
