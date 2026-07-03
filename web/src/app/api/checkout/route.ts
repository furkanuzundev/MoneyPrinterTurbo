import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { buildCheckoutParams } from "@/lib/credits/checkout";
import { getPackage } from "@/lib/credits/packages";
import { getStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const pkg = await getPackage(db, String(body.packageKey ?? ""));
  if (!pkg) {
    return NextResponse.json({ error: "Unknown package" }, { status: 400 });
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const taxEnabled = process.env.STRIPE_TAX_ENABLED === "true";
  try {
    const checkout = await getStripe().checkout.sessions.create(
      buildCheckoutParams(pkg, userId, appUrl, taxEnabled),
    );
    return NextResponse.json({ url: checkout.url });
  } catch (e) {
    console.error("stripe checkout session creation failed", e);
    return NextResponse.json(
      { error: "Payment service is temporarily unavailable" },
      { status: 502 },
    );
  }
}
