import data from "@/samples/landing.json";

// the channel's own result posts from the replayed week, word for word
const posts = data.ticker;

/** A band of what the chat sounds like, running under the ledger that shows what happened. */
export function Ticker() {
  const run = (hidden: boolean) => (
    <div aria-hidden={hidden} className="flex shrink-0 items-center gap-10 pr-10">
      {posts.map((p, i) => (
        <span key={i} className="whitespace-nowrap">
          {p}
        </span>
      ))}
    </div>
  );
  return (
    <div className="overflow-hidden bg-night py-3 font-mono text-[12px] text-amber/90" role="marquee">
      <div className="ticker flex w-max">
        {run(false)}
        {run(true)}
      </div>
    </div>
  );
}
