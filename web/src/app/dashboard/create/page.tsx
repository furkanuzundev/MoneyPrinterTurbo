import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { getBalance } from "@/lib/credits/ledger";
import { Wizard } from "./wizard";

export default async function CreatePage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/signin");
  const balance = await getBalance(db, userId);
  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-bold tracking-[-0.02em] text-bone">
        Create a video
      </h1>
      <Wizard balance={balance} />
    </div>
  );
}
