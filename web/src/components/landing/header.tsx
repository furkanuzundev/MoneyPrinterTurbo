import Link from "next/link";
import { Logo } from "@/components/logo";
import { MobileNav } from "./mobile-nav";
import { NAV_LINKS } from "./nav-links";

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 flex items-center justify-between border-b border-white/5 bg-ink/85 px-6 py-4 backdrop-blur-md md:px-12 md:py-5 lg:px-[72px]">
      <div className="flex items-center gap-11">
        <Link href="/" aria-label="Reelate home">
          <Logo
            markClassName="h-7 w-7"
            wordmarkClassName="text-[22px] text-bone"
          />
        </Link>
        <nav className="hidden gap-[30px] text-[15px] text-muted lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-bone"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-3 sm:gap-5">
        <Link
          href="/signin"
          className="text-[15px] text-muted transition-colors hover:text-bone"
        >
          Sign in
        </Link>
        <Link
          href="/signin?mode=signup"
          className="rounded-[11px] bg-caption px-4 py-[11px] text-[15px] font-bold text-caption-ink transition-opacity hover:opacity-90 sm:px-5"
        >
          Start free
        </Link>
        <MobileNav />
      </div>
    </header>
  );
}
