import type { Metadata } from "next";
import Link from "next/link";
import { Card, buttonClasses } from "@/components/ui";
import { USE_CASES } from "@/lib/seo/use-cases";

export const metadata: Metadata = {
  title: "Use Cases — Reelate",
  description:
    "See how Reelate turns a topic into a ready-to-post short video for TikTok, Shorts, Reels, and more — one use case at a time.",
};

export default function UseCasesIndexPage() {
  return (
    <main className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link
          href="/"
          className="font-display text-xl font-bold tracking-[-0.02em] text-bone"
        >
          Reelate
        </Link>
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

      <section className="mx-auto w-full max-w-6xl px-6 pb-8 pt-8">
        <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-[-0.02em] text-bone sm:text-5xl">
          Use cases
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted sm:text-lg">
          One topic in, one ready-to-post video out. Here&rsquo;s how Reelate
          fits the format you&rsquo;re already posting to.
        </p>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-20">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {USE_CASES.map((useCase) => (
            <Link key={useCase.slug} href={`/use-cases/${useCase.slug}`}>
              <Card className="h-full transition-colors hover:border-caption">
                <h2 className="font-display text-lg font-bold tracking-[-0.02em] text-bone">
                  {useCase.title}
                </h2>
                <p className="mt-2 text-sm text-muted">{useCase.intro}</p>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <footer className="mt-auto border-t border-line px-6 py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <span className="font-display text-sm font-bold text-bone">
            Reelate
          </span>
          <span className="text-xs text-muted">&copy; Reelate</span>
        </div>
      </footer>
    </main>
  );
}
