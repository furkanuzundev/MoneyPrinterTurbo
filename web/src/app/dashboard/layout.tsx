import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { auth, signOut } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { isRecentSignup } from "@/lib/analytics/signup";
import { getBalance, grantWelcomeBonus } from "@/lib/credits/ledger";
import { AppSidebar } from "@/components/app-sidebar";
import { DashboardAnalytics } from "@/components/analytics/dashboard-analytics";
import { DashboardTopbar } from "@/components/dashboard/topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  await grantWelcomeBonus(db, session.user.id); // idempotent
  const [balance, [account]] = await Promise.all([
    getBalance(db, session.user.id),
    db
      .select({ createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, session.user.id)),
  ]);

  return (
    <SidebarProvider>
      <DashboardAnalytics
        userId={session.user.id}
        isNewUser={isRecentSignup(account?.createdAt, new Date())}
      />
      <AppSidebar
        balance={balance}
        name={session.user.name ?? ""}
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
              title="Sign out"
              className="flex items-center p-1 text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground"
            >
              <LogOut size={16} />
            </button>
          </form>
        }
      />
      <SidebarInset>
        <DashboardTopbar balance={balance} />
        <div className="mx-auto w-full max-w-[1120px] px-5 py-8 lg:px-10 lg:py-10">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
