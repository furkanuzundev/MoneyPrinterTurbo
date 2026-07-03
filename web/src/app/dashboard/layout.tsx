import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { db } from "@/db";
import { getBalance } from "@/lib/credits/ledger";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const balance = await getBalance(db, session.user.id);

  return (
    <SidebarProvider>
      <AppSidebar
        balance={balance}
        email={session.user.email ?? ""}
        signOutForm={
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="w-full rounded-md border border-sidebar-border px-3 py-1.5 text-left text-xs text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              Sign out
            </button>
          </form>
        }
      />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <span className="font-display text-sm font-semibold tracking-[-0.02em] text-bone">
            Reelate
          </span>
        </header>
        <div className="mx-auto w-full max-w-5xl px-6 py-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
