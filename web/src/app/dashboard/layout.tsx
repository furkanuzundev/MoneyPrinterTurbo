import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { db } from "@/db";
import { getBalance } from "@/lib/credits/ledger";
import { CaptionChip } from "@/components/ui";

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
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <span className="font-display text-lg font-extrabold tracking-[-0.02em]">
          Reelate
        </span>
        <nav className="flex items-center gap-4 text-sm text-muted">
          <a href="/dashboard/create" className="hover:text-bone">Create video</a>
          <a href="/dashboard/library" className="hover:text-bone">Library</a>
          <a href="/dashboard/buy" className="hover:text-bone">Buy credits</a>
        </nav>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted">{session.user.email}</span>
          <a href="/dashboard/buy" className="hover:brightness-110">
            <CaptionChip>{balance} credits</CaptionChip>
          </a>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button type="submit" className="text-muted hover:text-bone">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
