import type Stripe from "stripe";
import type { Db } from "@/db";
import { fulfillPurchase } from "@/lib/credits/purchases";

export async function handleStripeEvent(db: Db, event: Stripe.Event) {
  if (event.type !== "checkout.session.completed") return;
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") return;
  const { userId, packageKey, credits } = session.metadata ?? {};
  if (!userId || !packageKey || !credits) {
    throw new Error(`checkout session ${session.id} missing fulfillment metadata`);
  }
  await fulfillPurchase(db, {
    userId,
    stripeSessionId: session.id,
    packageKey,
    credits: Number(credits),
    amountCents: session.amount_total ?? 0,
  });
}
