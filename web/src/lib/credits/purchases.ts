import type { Db } from "@/db";
import { creditLedger, purchases } from "@/db/schema";

export async function fulfillPurchase(
  db: Db,
  input: {
    userId: string;
    stripeSessionId: string;
    packageKey: string;
    credits: number;
    amountCents: number;
  },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    // stripe_session_id UNIQUE: çakışmada satır dönmez -> daha önce işlenmiş.
    const inserted = await tx
      .insert(purchases)
      .values({
        userId: input.userId,
        stripeSessionId: input.stripeSessionId,
        packageKey: input.packageKey,
        credits: input.credits,
        amountCents: input.amountCents,
        status: "completed",
      })
      .onConflictDoNothing({ target: purchases.stripeSessionId })
      .returning({ id: purchases.id });
    if (inserted.length === 0) return false;
    await tx.insert(creditLedger).values({
      userId: input.userId,
      delta: input.credits,
      kind: "purchase",
      purchaseId: String(inserted[0].id),
    });
    return true;
  });
}
