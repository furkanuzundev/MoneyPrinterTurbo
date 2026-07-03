import type Stripe from "stripe";
import type { CreditPackage } from "./packages";

export function buildCheckoutParams(
  pkg: CreditPackage,
  userId: string,
  appUrl: string,
  taxEnabled: boolean,
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
      userId,
      packageKey: pkg.key,
      credits: String(pkg.credits),
    },
    success_url: `${appUrl}/dashboard/buy/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/dashboard/buy`,
  };
  if (taxEnabled) params.automatic_tax = { enabled: true };
  return params;
}
