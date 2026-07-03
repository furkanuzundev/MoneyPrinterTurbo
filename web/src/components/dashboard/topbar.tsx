"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";

const ROUTE_LABELS: Array<[prefix: string, label: string]> = [
  ["/dashboard/create", "Create video"],
  ["/dashboard/library", "Library"],
  ["/dashboard/jobs", "Library"],
  ["/dashboard/videos", "Library"],
  ["/dashboard/buy", "Buy credits"],
  ["/dashboard", "Home"],
];

export function DashboardTopbar({ balance }: { balance: number }) {
  const pathname = usePathname();
  const label =
    ROUTE_LABELS.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? "Home";

  return (
    <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-white/5 bg-[#0A0908]/60 px-4 lg:px-8">
      <div className="flex items-center gap-2.5 text-sm">
        <SidebarTrigger className="md:hidden" />
        <span className="text-muted/70">Reelate</span>
        <span className="text-muted/40">/</span>
        <span className="font-semibold text-bone">{label}</span>
      </div>
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/buy"
          className="hidden items-center gap-[7px] rounded-full border border-caption/25 bg-[#141209] px-[13px] py-1.5 sm:inline-flex"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-caption" />
          <span className="font-mono-data text-[12.5px] font-bold text-caption">
            {balance} credits
          </span>
        </Link>
        <Link
          href="/dashboard/create"
          className="rounded-[10px] bg-caption px-4 py-[9px] text-[13.5px] font-bold text-caption-ink transition-opacity hover:opacity-90"
        >
          ＋ Create video
        </Link>
      </div>
    </header>
  );
}
