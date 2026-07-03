import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { getBalance, grantWelcomeBonus } from "@/lib/credits/ledger";
import { Card, MonoStat, buttonClasses } from "@/components/ui";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/signin");
  await grantWelcomeBonus(db, userId); // idempotent: kayıt anında verilememişse telafi
  const balance = await getBalance(db, userId);
  return (
    <div>
      <h1 className="mb-4 font-display text-2xl font-bold tracking-[-0.02em] text-bone">
        Dashboard
      </h1>
      <a
        href="/dashboard/create"
        className={buttonClasses("primary", "mb-6 inline-block")}
      >
        Create a video
      </a>
      <Card className="inline-block px-6 py-4">
        <MonoStat label="Credits" value={balance} />
      </Card>
      <div className="mt-4">
        <a href="/dashboard/buy" className="text-sm text-muted underline hover:text-bone">
          Buy credits
        </a>
      </div>
    </div>
  );
}
