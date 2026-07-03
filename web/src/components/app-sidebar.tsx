"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Home, Clapperboard, LibraryBig, Coins } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/create", label: "Create video", icon: Clapperboard },
  { href: "/dashboard/library", label: "Library", icon: LibraryBig },
  { href: "/dashboard/buy", label: "Buy credits", icon: Coins },
] as const;

function isActive(href: string, pathname: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/dashboard/library") {
    return (
      pathname.startsWith("/dashboard/library") ||
      pathname.startsWith("/dashboard/jobs") ||
      pathname.startsWith("/dashboard/videos")
    );
  }
  return pathname.startsWith(href);
}

export function AppSidebar({
  balance,
  name,
  email,
  signOutForm,
}: {
  balance: number;
  name: string;
  email: string;
  signOutForm: ReactNode;
}) {
  const pathname = usePathname();
  const initial = (name || email || "R").charAt(0).toUpperCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 px-2 py-1.5"
        >
          <span className="inline-flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] bg-caption font-display text-[19px] font-extrabold text-caption-ink">
            R
          </span>
          <span className="font-display text-xl font-extrabold tracking-[-0.02em] text-sidebar-foreground group-data-[collapsible=icon]:hidden">
            Reelate
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <div className="px-4 pb-2 pt-3 font-mono-data text-[11px] uppercase tracking-[0.1em] text-sidebar-foreground/40 group-data-[collapsible=icon]:hidden">
          Menu
        </div>
        <SidebarMenu className="gap-1 px-2">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href, pathname);
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={item.label}
                  className="rounded-[11px] px-3 py-[10px] font-semibold data-[active=true]:bg-caption data-[active=true]:text-caption-ink"
                >
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="gap-3 px-3 pb-4">
        <div className="rounded-[14px] border border-caption/20 bg-[#141209] p-3.5 group-data-[collapsible=icon]:hidden">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="font-mono-data text-[11px] uppercase tracking-[0.08em] text-muted">
              Credits
            </span>
            <span className="font-display text-xl font-extrabold text-caption">
              {balance}
            </span>
          </div>
          <Link
            href="/dashboard/buy"
            className="block rounded-[10px] bg-caption py-[9px] text-center text-[13.5px] font-bold text-caption-ink transition-opacity hover:opacity-90"
          >
            Buy more
          </Link>
        </div>
        <div className="flex items-center gap-[11px] border-t border-white/5 px-1.5 pt-3.5">
          <span className="inline-flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full border border-caption/30 bg-[#241F12] text-sm font-bold text-caption">
            {initial}
          </span>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <div className="truncate text-[13.5px] font-semibold text-sidebar-foreground">
              {name || email}
            </div>
            <div className="truncate text-xs text-sidebar-foreground/50">
              {email}
            </div>
          </div>
          <div className="flex-none group-data-[collapsible=icon]:hidden">
            {signOutForm}
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
