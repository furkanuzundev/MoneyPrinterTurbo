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
import { CaptionChip } from "@/components/ui";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/create", label: "Create video", icon: Clapperboard },
  { href: "/dashboard/library", label: "Library", icon: LibraryBig },
  { href: "/dashboard/buy", label: "Buy credits", icon: Coins },
] as const;

function isActive(href: string, pathname: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/dashboard/library") {
    return pathname.startsWith("/dashboard/library") || pathname.startsWith("/dashboard/jobs");
  }
  return pathname.startsWith(href);
}

export function AppSidebar({
  balance,
  email,
  signOutForm,
}: {
  balance: number;
  email: string;
  signOutForm: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          href="/dashboard"
          className="flex items-center px-2 py-1 font-display text-lg font-extrabold tracking-[-0.02em] text-sidebar-foreground"
        >
          Reelate
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href, pathname);
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
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
      <SidebarFooter className="gap-3">
        <Link href="/dashboard/buy" className="w-fit hover:brightness-110">
          <CaptionChip>{balance} credits</CaptionChip>
        </Link>
        <span className="truncate px-2 text-xs text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
          {email}
        </span>
        <div className="group-data-[collapsible=icon]:hidden">{signOutForm}</div>
      </SidebarFooter>
    </Sidebar>
  );
}
