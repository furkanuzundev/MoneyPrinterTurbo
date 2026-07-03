import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/db";
import { handleStripeEvent } from "@/lib/credits/stripe-events";
import { getStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }
  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  try {
    await handleStripeEvent(db, event);
  } catch (e) {
    // 500 dönersek Stripe yeniden dener; fulfillment idempotent olduğu için güvenli.
    console.error("stripe webhook handling failed", e);
    return NextResponse.json({ error: "Handler failure" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
