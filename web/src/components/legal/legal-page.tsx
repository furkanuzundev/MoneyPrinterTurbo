import Link from "next/link";
import type { ReactNode } from "react";

export function LegalPage({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-ink px-6 py-12 text-bone">
      <div className="mx-auto w-full max-w-2xl">
        <Link
          href="/"
          className="font-display text-lg font-extrabold tracking-[-0.02em] text-bone"
        >
          Reelate
        </Link>
        <h1 className="mb-2 mt-10 font-display text-4xl font-extrabold tracking-[-0.02em]">
          {title}
        </h1>
        <p className="mb-10 font-mono-data text-xs text-muted/70">
          Last updated: {lastUpdated}
        </p>
        <div className="space-y-8 text-[15px] leading-relaxed text-muted [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-bone">
          {children}
        </div>
      </div>
    </main>
  );
}
