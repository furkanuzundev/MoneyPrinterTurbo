import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="mt-auto flex flex-col items-center justify-between gap-4 border-t border-white/5 px-6 py-[34px] text-sm text-muted/80 sm:flex-row md:px-12 lg:px-[72px]">
      <span className="font-display text-lg font-extrabold text-bone">
        Reelate
      </span>
      <span className="font-mono-data text-xs">&copy; 2026 Reelate</span>
      <div className="flex gap-6">
        <Link
          href="/use-cases"
          className="transition-colors hover:text-bone"
        >
          Use cases
        </Link>
        <a href="#pricing" className="transition-colors hover:text-bone">
          Pricing
        </a>
      </div>
    </footer>
  );
}
