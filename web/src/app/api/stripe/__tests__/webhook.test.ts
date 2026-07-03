import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import Stripe from "stripe";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { getBalance } from "@/lib/credits/ledger";
import { handleStripeEvent } from "@/lib/credits/stripe-events";

const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST });
const db = drizzle(pool, { schema });

let userId: string;

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user", credit_ledger, purchases CASCADE`);
  const [u] = await db
    .insert(schema.users)
    .values({ email: "hook@example.com" })
    .returning();
  userId = u.id;
});
afterAll(() => pool.end());

function completedEvent(sessionId: string): Stripe.Event {
  return {
    id: `evt_${sessionId}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        payment_status: "paid",
        amount_total: 1900,
        metadata: { userId, packageKey: "creator", credits: "50" },
      },
    },
  } as unknown as Stripe.Event;
}

describe("handleStripeEvent", () => {
  it("credits on checkout.session.completed", async () => {
    await handleStripeEvent(db, completedEvent("cs_1"));
    expect(await getBalance(db, userId)).toBe(50);
  });
  it("is idempotent for duplicate events", async () => {
    await handleStripeEvent(db, completedEvent("cs_1"));
    await handleStripeEvent(db, completedEvent("cs_1"));
    expect(await getBalance(db, userId)).toBe(50);
  });
  it("ignores unpaid sessions", async () => {
    const ev = completedEvent("cs_2");
    (ev.data.object as Stripe.Checkout.Session).payment_status = "unpaid";
    await handleStripeEvent(db, ev);
    expect(await getBalance(db, userId)).toBe(0);
  });
  it("ignores unrelated event types", async () => {
    const ev = { ...completedEvent("cs_3"), type: "invoice.paid" } as Stripe.Event;
    await handleStripeEvent(db, ev);
    expect(await getBalance(db, userId)).toBe(0);
  });
  it("does not throw or credit on missing metadata (poison event)", async () => {
    const ev = completedEvent("cs_4");
    (ev.data.object as Stripe.Checkout.Session).metadata = {};
    await expect(handleStripeEvent(db, ev)).resolves.toBeUndefined();
    expect(await getBalance(db, userId)).toBe(0);
  });

  it("does not throw or credit for a nonexistent user (poison event)", async () => {
    const ev = completedEvent("cs_5");
    (ev.data.object as Stripe.Checkout.Session).metadata = {
      userId: "00000000-0000-0000-0000-000000000000",
      packageKey: "creator",
      credits: "50",
    };
    await expect(handleStripeEvent(db, ev)).resolves.toBeUndefined();
    const purchases = await db.select().from(schema.purchases);
    expect(purchases).toHaveLength(0);
  });

  it("does not credit on malformed credits metadata", async () => {
    const ev = completedEvent("cs_6");
    (ev.data.object as Stripe.Checkout.Session).metadata = {
      userId,
      packageKey: "creator",
      credits: "abc",
    };
    await expect(handleStripeEvent(db, ev)).resolves.toBeUndefined();
    expect(await getBalance(db, userId)).toBe(0);
  });
});
