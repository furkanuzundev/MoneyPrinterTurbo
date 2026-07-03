"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 7.5 8 2l6 5.5M3.5 6.5V14h9V6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CreateIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="3" y="2" width="8" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 6.5 14 8l-3 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="4" height="11" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9.5" y="2.5" width="4" height="11" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function CreditsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 5.5v5M6.2 6.6c0-.9.8-1.5 1.8-1.5s1.8.6 1.8 1.4c0 1.8-3.6 1-3.6 2.8 0 .8.8 1.4 1.8 1.4s1.8-.6 1.8-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

const NAV_ITEMS: { href: string; label: string; icon: () => ReactNode }[] = [
  { href: "/dashboard", label: "Home", icon: HomeIcon },
  { href: "/dashboard/create", label: "Create video", icon: CreateIcon },
  { href: "/dashboard/library", label: "Library", icon: LibraryIcon },
  { href: "/dashboard/buy", label: "Buy credits", icon: CreditsIcon },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 overflow-x-auto lg:flex-col lg:items-stretch lg:gap-0.5 lg:overflow-visible">
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`relative flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors lg:rounded-none lg:px-4 ${
              active ? "bg-panel text-bone" : "text-muted hover:text-bone"
            }`}
          >
            {active && (
              <span className="absolute inset-y-1 left-0 hidden w-[2px] rounded-full bg-caption lg:block" />
            )}
            <item.icon />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
