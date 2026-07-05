import Link from "next/link";
import { Logo } from "@/components/logo";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#showcase", label: "Showcase" },
];

export function LandingHeader() {
  return (
    <header className="flex items-center justify-between border-b border-white/5 px-6 py-6 md:px-12 lg:px-[72px]">
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
      <div className="flex items-center gap-5">
        <Link
          href="/signin"
          className="hidden text-[15px] text-muted transition-colors hover:text-bone sm:inline-block"
        >
          Sign in
        </Link>
        <Link
          href="/signin"
          className="rounded-[11px] bg-caption px-5 py-[11px] text-[15px] font-bold text-caption-ink transition-opacity hover:opacity-90"
        >
          Start free
        </Link>
      </div>
    </header>
  );
}
