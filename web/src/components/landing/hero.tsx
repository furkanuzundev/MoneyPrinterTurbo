import Link from "next/link";
import { HeroPhone } from "./hero-phone";
import { WatchDemoButton } from "./watch-demo-button";

export function Hero() {
  return (
    <section className="grid items-center gap-14 px-6 pb-16 pt-14 md:px-12 lg:grid-cols-[1.05fr_0.95fr] lg:px-[72px] lg:pb-[72px] lg:pt-[84px]">
      <div>
        <div className="mb-[30px] inline-flex items-center gap-[9px] rounded-full border border-caption/25 px-3 py-1.5 font-mono-data text-[12.5px] uppercase tracking-[0.08em] text-caption-dim">
          <span className="inline-block h-[7px] w-[7px] rounded-full bg-caption" />
          AI short-video studio
        </div>
        <h1 className="mb-[26px] font-display text-5xl font-extrabold leading-[0.98] tracking-[-0.03em] text-bone sm:text-6xl lg:text-[76px]">
          Type a topic.
          <br />
          Post a{" "}
          <span className="rounded-[10px] bg-caption px-3 text-caption-ink [box-decoration-break:clone]">
            video
          </span>
          .
        </h1>
        <p className="mb-[34px] max-w-[460px] text-lg leading-[1.55] text-muted sm:text-[19px]">
          Reelate writes the script, voices it, cuts matching stock footage and
          burns in captions &mdash; a ready-to-post short in about five
          minutes. No camera. No editing.
        </p>
        <div className="mb-5 flex flex-wrap items-center gap-4">
          <Link
            href="/signin"
            className="rounded-[13px] bg-caption px-[26px] py-[15px] text-base font-bold text-caption-ink transition-opacity hover:opacity-90"
          >
            Start free &mdash; 2 videos on us
          </Link>
          <WatchDemoButton />
        </div>
        <p className="font-mono-data text-[13px] text-muted/70">
          ~5 min per video &middot; no credit card required
        </p>
      </div>
      <HeroPhone />
    </section>
  );
}
