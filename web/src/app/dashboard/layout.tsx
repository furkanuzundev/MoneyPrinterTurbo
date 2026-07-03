import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { db } from "@/db";
import { getBalance } from "@/lib/credits/ledger";
import { CaptionChip } from "@/components/ui";
import { SidebarNav } from "@/components/sidebar-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const balance = await getBalance(db, session.user.id);
  return (
    <div className="min-h-screen bg-ink text-bone">
      <div className="fixed inset-x-0 top-0 z-10 flex items-center gap-4 border-b border-line bg-ink px-4 py-3 lg:bottom-0 lg:left-0 lg:right-auto lg:top-0 lg:w-[230px] lg:flex-col lg:items-stretch lg:justify-between lg:gap-0 lg:border-b-0 lg:border-r lg:px-4 lg:py-6">
        <div className="flex items-center gap-4 lg:flex-col lg:items-stretch lg:gap-6">
          <Link
            href="/dashboard"
            className="shrink-0 font-display text-lg font-extrabold tracking-[-0.02em]"
          >
            Reelate
          </Link>
          <div className="min-w-0 flex-1 lg:flex-none">
            <SidebarNav />
          </div>
        </div>
        <div className="hidden lg:mt-auto lg:flex lg:flex-col lg:gap-3 lg:border-t lg:border-line lg:pt-4">
          <Link href="/dashboard/buy" className="hover:brightness-110">
            <CaptionChip>{balance} credits</CaptionChip>
          </Link>
          <span className="truncate text-xs text-muted">{session.user.email}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="w-full rounded-md border border-line px-3 py-1.5 text-left text-xs text-muted transition-colors hover:bg-elevated hover:text-bone"
            >
              Sign out
            </button>
          </form>
        </div>
        <div className="shrink-0 lg:hidden">
          <Link href="/dashboard/buy" className="hover:brightness-110">
            <CaptionChip>{balance} credits</CaptionChip>
          </Link>
        </div>
      </div>
      <main className="pt-16 lg:pl-[230px] lg:pt-0">
        <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
