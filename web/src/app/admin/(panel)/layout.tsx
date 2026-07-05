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
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!(await verifySessionToken(token))) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <span className="font-semibold">Reelate Admin</span>
          <nav className="flex items-center gap-4 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <form action={logoutAction} className="ml-auto">
            <button
              type="submit"
              title="Çıkış"
              className="flex items-center p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <LogOut size={16} />
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
