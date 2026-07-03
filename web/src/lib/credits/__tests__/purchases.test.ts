import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { getBalance } from "../ledger";
import { fulfillPurchase } from "../purchases";

const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST });
const db = drizzle(pool, { schema });

let userId: string;

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user", credit_ledger, purchases CASCADE`);
  const [u] = await db
    .insert(schema.users)
    .values({ email: "buyer@example.com" })
    .returning();
  userId = u.id;
});
afterAll(() => pool.end());

const INPUT = {
  stripeSessionId: "cs_test_123",
  packageKey: "creator",
  credits: 50,
  amountCents: 1900,
};

describe("fulfillPurchase", () => {
  it("credits the user once", async () => {
    expect(await fulfillPurchase(db, { userId, ...INPUT })).toBe(true);
    expect(await getBalance(db, userId)).toBe(50);
    const rows = await db.select().from(schema.purchases);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("completed");
  });
  it("is idempotent for the same session id", async () => {
    await fulfillPurchase(db, { userId, ...INPUT });
    expect(await fulfillPurchase(db, { userId, ...INPUT })).toBe(false);
    expect(await getBalance(db, userId)).toBe(50);
    expect(await db.select().from(schema.creditLedger)).toHaveLength(1);
  });
  it("survives concurrent duplicate webhooks", async () => {
    const results = await Promise.allSettled([
      fulfillPurchase(db, { userId, ...INPUT }),
      fulfillPurchase(db, { userId, ...INPUT }),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const credited = results.filter(
      (r) => r.status === "fulfilled" && r.value === true,
    );
    expect(credited).toHaveLength(1);
    expect(await getBalance(db, userId)).toBe(50);
  });
});
