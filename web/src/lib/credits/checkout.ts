import type Stripe from "stripe";
import type { GaIds } from "@/lib/analytics/ga-ids";
import type { CreditPackage } from "./packages";

export function buildCheckoutParams(
  pkg: CreditPackage,
  userId: string,
  appUrl: string,
  taxEnabled: boolean,
  ga: GaIds = {},
): Stripe.Checkout.SessionCreateParams {
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: pkg.amountCents,
          product_data: { name: `${pkg.label} — ${pkg.credits} credits` },
        },
      },
    ],
    metadata: {
      source: "reelate",
      userId,
      packageKey: pkg.key,
      credits: String(pkg.credits),
      // Webhook'taki server-side GA purchase'ı tarayıcı oturumuna bağlar.
      ...(ga.clientId && { ga_client_id: ga.clientId }),
      ...(ga.sessionId && { ga_session_id: ga.sessionId }),
    },
    success_url: `${appUrl}/dashboard/buy/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/dashboard/buy`,
  };
  if (taxEnabled) params.automatic_tax = { enabled: true };
  return params;
}
