import Link from "next/link";
import { db } from "@/db";
import { getPackages } from "@/lib/credits/packages";
import { Card, CaptionChip, MonoStat, buttonClasses } from "@/components/ui";
import "./landing.css";

const TIMELINE_STEPS = [
  {
    n: "01",
    title: "Topic",
    body: "You type one sentence.",
  },
  {
    n: "02",
    title: "Script",
    body: "AI writes 30–180s of voiceover.",
  },
  {
    n: "03",
    title: "Footage",
    body: "Stock clips matched to every line.",
  },
  {
    n: "04",
    title: "Post-ready",
    body: "Captions burned in, MP4 download.",
  },
];

const HERO_CAPTIONS = [
  "there's a trick nobody tells you",
  "it takes about five minutes",
  "type a topic. post a video.",
];

export default async function Home() {
  const packages = await getPackages(db);

  return (
    <main className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-xl font-bold tracking-[-0.02em] text-bone">
          Reelate
        </span>
        <nav className="flex items-center gap-3">
          <Link
            href="/signin"
            className="hidden text-sm font-medium text-muted transition-colors hover:text-bone sm:inline-block"
          >
            Sign in
          </Link>
          <Link href="/signin" className={buttonClasses("primary")}>
            Start free
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-12 px-6 pb-20 pt-8 lg:flex-row lg:items-center lg:gap-16 lg:pb-28 lg:pt-16">
        <div className="flex w-full flex-col items-start gap-6 lg:max-w-xl">
          <h1 className="font-display text-5xl font-extrabold leading-[1.02] tracking-[-0.02em] text-bone sm:text-6xl lg:text-[72px]">
            Type a topic.
            <br />
            Post a{" "}
            <CaptionChip className="align-baseline text-3xl sm:text-4xl lg:text-6xl">
              video
            </CaptionChip>
            .
          </h1>
          <p className="max-w-md text-base text-muted sm:text-lg">
            Reelate writes the script, voices it, cuts stock footage, and burns
            in captions &mdash; a ready-to-post short in about five minutes.
          </p>
          <div className="flex flex-col items-start gap-3">
            <Link
              href="/signin"
              className={buttonClasses("primary", "px-6 py-3 text-base")}
            >
              Start free &mdash; 2 videos on us
            </Link>
            <span className="font-mono-data text-xs text-muted">
              ~5 min per video &middot; no camera, no editing
            </span>
          </div>
        </div>

        <div className="flex w-full justify-center lg:w-auto lg:flex-shrink-0">
          <HeroPreviewCard />
        </div>
      </section>

      {/* Timeline strip */}
      <section className="border-y border-line bg-panel/40 px-6 py-16">
        <div className="mx-auto w-full max-w-6xl">
          <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-bone sm:text-3xl">
            From idea to posted in four cuts
          </h2>
          <div className="relative mt-10">
            <div
              className="pointer-events-none absolute left-0 right-0 top-5 hidden h-px bg-line sm:block"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute left-0 top-5 hidden h-2 w-2 -translate-y-1/2 rounded-full bg-caption shadow-[0_0_0_3px_rgba(255,216,77,0.25)] sm:block"
              aria-hidden="true"
            />
            <ol className="relative grid grid-cols-1 gap-8 sm:grid-cols-4 sm:gap-6">
              {TIMELINE_STEPS.map((step) => (
                <li key={step.n} className="flex flex-col gap-3">
                  <span className="font-mono-data text-sm text-caption">
                    {step.n}
                  </span>
                  <div className="flex flex-col gap-1">
                    <span className="font-display text-lg font-bold text-bone">
                      {step.title}
                    </span>
                    <span className="text-sm text-muted">{step.body}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Proof bar */}
      <section className="mx-auto w-full max-w-6xl px-6 py-14">
        <div className="flex flex-wrap items-start justify-center gap-10 sm:justify-between">
          <MonoStat label="typical render time" value="~5 min" />
          <MonoStat label="output format" value="720p vertical" />
          <MonoStat label="on signup" value="2 free credits" />
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-line px-6 py-20">
        <div className="mx-auto w-full max-w-6xl">
          <h2 className="text-center font-display text-2xl font-bold tracking-[-0.02em] text-bone sm:text-3xl">
            Simple, pay-as-you-go pricing
          </h2>
          <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-3">
            {packages.map((pkg) => {
              const perVideo = pkg.amountCents / 100 / pkg.credits;
              return (
                <Card
                  key={pkg.key}
                  className={pkg.featured ? "relative border-caption" : "relative"}
                >
                  {pkg.featured && (
                    <CaptionChip className="absolute -top-3 left-6">
                      Most popular
                    </CaptionChip>
                  )}
                  <div className="text-sm font-semibold text-bone">
                    {pkg.label}
                  </div>
                  <div className="mt-3 font-mono-data text-4xl text-bone">
                    ${(pkg.amountCents / 100).toFixed(0)}
                  </div>
                  <div className="mt-2 text-sm text-muted">
                    {pkg.credits} credits &middot; ~{pkg.credits} short videos
                  </div>
                  <div className="mt-1 font-mono-data text-xs text-muted">
                    &asymp; ${perVideo.toFixed(2)} per video
                  </div>
                  <Link
                    href="/signin"
                    className={buttonClasses("primary", "mt-6 w-full")}
                  >
                    Get {pkg.label}
                  </Link>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-line px-6 py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <span className="font-display text-sm font-bold text-bone">
            Reelate
          </span>
          <span className="text-xs text-muted">&copy; Reelate</span>
          <Link
            href="/use-cases"
            className="text-xs text-muted transition-colors hover:text-bone"
          >
            Use cases
          </Link>
        </div>
      </footer>
    </main>
  );
}

function HeroPreviewCard() {
  return (
    <div
      className="relative aspect-[9/16] w-full max-w-[280px] overflow-hidden rounded-2xl border border-line bg-panel"
      role="img"
      aria-label="Preview of a Reelate short video with captions appearing over stock footage"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-ink/40 via-transparent to-ink/70" />

      <div className="absolute left-4 top-4 flex items-center gap-2">
        <span className="heroRec h-1.5 w-1.5 rounded-full bg-caption" />
        <span className="font-mono-data text-[10px] tracking-widest text-bone/80">
          REC 00:04
        </span>
      </div>

      <div className="absolute inset-x-4 bottom-14 flex min-h-[4.5rem] flex-col justify-end gap-2">
        {HERO_CAPTIONS.map((line, i) => (
          <span
            key={line}
            data-slot={i + 1}
            className="heroCaption -rotate-1 self-start rounded-md bg-caption px-2 py-0.5 text-sm font-bold text-ink"
          >
            {line}
          </span>
        ))}
      </div>

      <div className="absolute inset-x-4 bottom-5 h-1 overflow-hidden rounded-full bg-line">
        <div className="heroProgress h-full rounded-full bg-caption" />
      </div>
    </div>
  );
}
