import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import type { Db } from "@/db";
import { users } from "@/db/schema";
import { fulfillPurchase } from "@/lib/credits/purchases";

/**
 * checkout.session.completed işleyicisi.
 *
 * Kalıcı olarak bozuk event'ler (eksik/bozuk metadata, silinmiş kullanıcı)
 * throw ETMEZ: throw 500'e, 500 Stripe'ın ~3 gün retry döngüsüne dönüşür ve
 * hata kalıcıysa döngü asla düzelmez. Bunun yerine PAID-BUT-UNFULFILLED
 * damgasıyla loglanır ve normal dönülür (operatör müdahalesi gerekir).
 * Geçici hatalar (DB bağlantısı vb.) throw etmeye devam eder -> 500 -> retry.
 *
 * Not: credits, checkout anındaki metadata'dan gelir (bilinçli: müşteri
 * gördüğü paketi alır; paket konfigürasyonu sonradan değişse bile).
 */
export async function handleStripeEvent(db: Db, event: Stripe.Event) {
  if (event.type !== "checkout.session.completed") return;
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") return;

  const { userId, packageKey, credits: creditsRaw } = session.metadata ?? {};
  const credits = Number(creditsRaw);
  if (!userId || !packageKey || !Number.isInteger(credits) || credits <= 0) {
    console.error(
      `PAID-BUT-UNFULFILLED: checkout session ${session.id} has invalid fulfillment metadata`,
      session.metadata,
    );
    return;
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) {
    console.error(
      `PAID-BUT-UNFULFILLED: checkout session ${session.id} references missing user ${userId}`,
    );
    return;
  }

  const credited = await fulfillPurchase(db, {
    userId,
    stripeSessionId: session.id,
    packageKey,
    credits,
    amountCents: session.amount_total ?? 0,
  });
  console.log(
    credited
      ? `stripe webhook: credited ${credits} credits to ${userId} (session ${session.id})`
      : `stripe webhook: duplicate delivery for session ${session.id}, no-op`,
  );
}
