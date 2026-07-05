import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CaptionChip, buttonClasses } from "@/components/ui";
import { USE_CASES, getUseCase, getRelatedUseCases } from "@/lib/seo/use-cases";
import "../../landing.css";

const TIMELINE_STEPS = [
  { n: "01", title: "Topic", body: "You type one sentence." },
  { n: "02", title: "Script", body: "AI writes 30–180s of voiceover." },
  { n: "03", title: "Footage", body: "Stock clips matched to every line." },
  { n: "04", title: "Post-ready", body: "Captions burned in, MP4 download." },
];

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return USE_CASES.map((useCase) => ({ slug: useCase.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const useCase = getUseCase(slug);
  if (!useCase) return {};

  return {
    title: `${useCase.title} — Reelate`,
    description: useCase.intro,
    openGraph: {
      title: `${useCase.title} — Reelate`,
      description: useCase.intro,
    },
  };
}

export default async function UseCasePage({ params }: PageProps) {
  const { slug } = await params;
  const useCase = getUseCase(slug);
  if (!useCase) notFound();

  const related = getRelatedUseCases(slug, 4);

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

      {/* Hero */}
      <section className="mx-auto flex w-full max-w-3xl flex-col items-start gap-6 px-6 pb-14 pt-8">
        <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-[-0.02em] text-bone sm:text-5xl">
          {useCase.h1}
        </h1>
        <p className="max-w-2xl text-base text-muted sm:text-lg">
          {useCase.intro}
        </p>
        <Link
          href="/signin"
          className={buttonClasses("primary", "px-6 py-3 text-base")}
        >
          Start free &mdash; 5 videos on us
        </Link>
      </section>

      {/* Compact timeline */}
      <section className="border-y border-line bg-panel/40 px-6 py-10">
        <div className="mx-auto w-full max-w-3xl">
          <ol className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {TIMELINE_STEPS.map((step) => (
              <li key={step.n} className="flex flex-col gap-2">
                <span className="font-mono-data text-xs text-caption">
                  {step.n}
                </span>
                <span className="font-display text-sm font-bold text-bone">
                  {step.title}
                </span>
                <span className="text-xs text-muted">{step.body}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Bullets */}
      <section className="mx-auto w-full max-w-3xl px-6 py-14">
        <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-bone">
          Why Reelate works for this
        </h2>
        <ul className="mt-6 flex flex-col gap-4">
          {useCase.bullets.map((bullet) => (
            <li key={bullet}>
              <Card className="text-sm text-bone">{bullet}</Card>
            </li>
          ))}
        </ul>
      </section>

      {/* Example topics */}
      <section className="mx-auto w-full max-w-3xl px-6 pb-14">
        <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-bone">
          Example topics to try
        </h2>
        <div className="mt-6 flex flex-col items-start gap-3">
          {useCase.exampleTopics.map((topic) => (
            <CaptionChip key={topic}>{topic}</CaptionChip>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-line px-6 py-16">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-start gap-4">
          <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-bone">
            Type a topic. Post a video.
          </h2>
          <Link
            href="/signin"
            className={buttonClasses("primary", "px-6 py-3 text-base")}
          >
            Start free &mdash; 5 videos on us
          </Link>
        </div>
      </section>

      {/* More use cases */}
      <section className="mx-auto w-full max-w-3xl px-6 pb-20">
        <h2 className="font-display text-lg font-bold tracking-[-0.02em] text-bone">
          More use cases
        </h2>
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {related.map((item) => (
            <li key={item.slug}>
              <Link
                href={`/use-cases/${item.slug}`}
                className="text-sm text-muted transition-colors hover:text-bone"
              >
                {item.title}
              </Link>
            </li>
          ))}
        </ul>
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
