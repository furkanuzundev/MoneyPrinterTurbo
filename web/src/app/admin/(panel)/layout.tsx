import "@/components/admin/chart-theme.css";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/admin/session";
import { logoutAction } from "../actions";

export const metadata: Metadata = {
  title: "Reelate Admin",
  robots: { index: false, follow: false },
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/users", label: "Kullanıcılar" },
  { href: "/jobs", label: "Jobs" },
  { href: "/feedback", label: "Puanlar" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!(await verifySessionToken(token))) redirect("/login");

  return (
    <div className="min-h-screen md:flex">
      <aside className="flex items-center gap-4 border-b px-6 py-3 md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:flex-col md:items-stretch md:gap-6 md:border-b-0 md:border-r md:py-6">
        <span className="font-semibold">Reelate Admin</span>
        <nav className="flex items-center gap-4 text-sm md:flex-col md:items-stretch md:gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-muted-foreground transition-colors hover:text-foreground md:rounded-md md:px-2 md:py-1.5 md:hover:bg-muted"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <form action={logoutAction} className="ml-auto md:ml-0 md:mt-auto">
          <button
            type="submit"
            title="Çıkış"
            className="flex items-center gap-2 p-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <LogOut size={16} />
            <span className="hidden md:inline">Çıkış</span>
          </button>
        </form>
      </aside>
      <main className="mx-auto w-full max-w-6xl min-w-0 px-6 py-8">{children}</main>
    </div>
  );
}
