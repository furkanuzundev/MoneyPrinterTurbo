import { auth } from "@/auth";
import { db } from "@/db";
import { getBalance } from "@/lib/credits/ledger";

export default async function DashboardPage() {
  const session = await auth();
  const balance = await getBalance(db, session!.user!.id!);
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Dashboard</h1>
      <div className="inline-block rounded-xl border border-zinc-800 px-6 py-4">
        <div className="text-sm text-zinc-400">Credits</div>
        <div className="text-3xl font-bold">{balance}</div>
      </div>
    </div>
  );
}
