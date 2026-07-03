import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { getBalance, grantWelcomeBonus } from "@/lib/credits/ledger";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/signin");
  await grantWelcomeBonus(db, userId); // idempotent: kayıt anında verilememişse telafi
  const balance = await getBalance(db, userId);
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Dashboard</h1>
      <div className="inline-block rounded-xl border border-zinc-800 px-6 py-4">
        <div className="text-sm text-zinc-400">Credits</div>
        <div className="text-3xl font-bold">{balance}</div>
      </div>
      <div className="mt-4">
        <a href="/dashboard/buy" className="text-sm underline">
          Buy credits
        </a>
      </div>
    </div>
  );
}
