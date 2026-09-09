"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NAV_LINKS } from "./nav-links";

/**
 * lg altında masaüstü nav tamamen gizleniyordu ve yerine hiçbir şey
 * konmamıştı — telefonda Features / How it works / Pricing / Showcase'e
 * ulaşmanın yolu yoktu.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="inline-flex h-10 w-10 items-center justify-center rounded-[11px] border border-white/10 text-bone transition-colors hover:border-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-caption lg:hidden"
        aria-label="Open menu"
      >
        <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden>
          <path
            d="M0 1h18M0 6h18M0 11h18"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[280px] border-white/10 bg-[#141310] text-bone"
      >
        <SheetHeader>
          <SheetTitle className="font-display text-[19px] font-extrabold text-bone">
            Reelate
          </SheetTitle>
        </SheetHeader>
        <nav className="mt-2 flex flex-col px-4">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              // Anchor navigasyonu sheet'i unmount etmez; elle kapatılmalı.
              onClick={() => setOpen(false)}
              className="border-b border-white/5 py-3.5 text-[15.5px] text-muted transition-colors hover:text-bone"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="mt-6 flex flex-col gap-2.5 px-4">
          <Link
            href="/signin?mode=signup"
            onClick={() => setOpen(false)}
            className="rounded-[11px] bg-caption py-3 text-center text-[15px] font-bold text-caption-ink"
          >
            Start free
          </Link>
          <Link
            href="/signin"
            onClick={() => setOpen(false)}
            className="rounded-[11px] border border-white/12 py-3 text-center text-[15px] font-semibold text-bone"
          >
            Sign in
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
