import Link from "next/link";
import { db } from "@/db";
import {
  DEFAULT_PACKAGES,
  getPackages,
  type CreditPackage,
} from "@/lib/credits/packages";
import { Card, CaptionChip, buttonClasses } from "@/components/ui";
import "./landing.css";

export default async function Home() {
  // Landing statik prerender edilir; Docker build ortamında DB yoktur.
  // Fiyat GÖSTERİMİ için varsayılanlara düşmek güvenlidir — gerçek ücret
  // her zaman checkout anında sunucuda DB'den doğrulanır.
  let packages: CreditPackage[];
  try {
    packages = await getPackages(db);
  } catch {
    packages = DEFAULT_PACKAGES;
  }

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
                  className={
                    pkg.featured
                      ? "flex flex-col border-caption"
                      : "flex flex-col"
                  }
                >
                  <div className="mb-2 h-6">
                    {pkg.featured && <CaptionChip>Most popular</CaptionChip>}
                  </div>
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
                    className={buttonClasses("primary", "mt-auto pt-2 w-full")}
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
    <div className="relative aspect-[9/16] w-[210px] overflow-hidden rounded-2xl border border-line bg-panel sm:w-[235px]">
      {/* Gerçek Reelate çıktısı: 12 sn'lik sessiz döngü (366 KB) */}
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src="/hero-demo.mp4"
        poster="/hero-demo-poster.jpg"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="A short video generated by Reelate, with AI voiceover captions burned in"
      />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink/30 via-transparent to-transparent" />

      <div className="absolute left-4 top-4 flex items-center gap-2">
        <span className="heroRec h-1.5 w-1.5 rounded-full bg-caption" />
        <span className="font-mono-data text-[10px] tracking-widest text-bone/90">
          MADE WITH REELATE
        </span>
      </div>
    </div>
  );
}
