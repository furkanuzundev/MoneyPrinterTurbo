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
  return <Wizard balance={balance} />;
}
