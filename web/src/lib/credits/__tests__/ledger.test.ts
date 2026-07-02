import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import {
  getBalance,
  grantWelcomeBonus,
  InsufficientCreditsError,
  refundJob,
  spendCreditsForJob,
} from "../ledger";

const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST });
const db = drizzle(pool, { schema });

const JOB = {
  subject: "morning habits",
  script: "drink water move your body write one goal",
  terms: ["morning", "coffee"],
  aspect: "9:16",
  voice: "en-US-JennyNeural-Female",
  targetSeconds: 60,
  credits: 2,
};

let userId: string;

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user", credit_ledger, video_jobs CASCADE`);
  const [u] = await db
    .insert(schema.users)
    .values({ email: "t@example.com" })
    .returning();
  userId = u.id;
});

afterAll(() => pool.end());

describe("grantWelcomeBonus", () => {
  it("grants 2 credits once", async () => {
    expect(await grantWelcomeBonus(db, userId)).toBe(true);
    expect(await getBalance(db, userId)).toBe(2);
  });
  it("is idempotent", async () => {
    await grantWelcomeBonus(db, userId);
    expect(await grantWelcomeBonus(db, userId)).toBe(false);
    expect(await getBalance(db, userId)).toBe(2);
  });
});

describe("spendCreditsForJob", () => {
  it("creates job and ledger row atomically", async () => {
    await grantWelcomeBonus(db, userId);
    const { jobId } = await spendCreditsForJob(db, userId, JOB);
    expect(jobId).toBeTruthy();
    expect(await getBalance(db, userId)).toBe(0);
    const jobs = await db.select().from(schema.videoJobs);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("queued");
    expect(jobs[0].credits).toBe(2);
  });
  it("rejects insufficient balance and writes nothing", async () => {
    await expect(spendCreditsForJob(db, userId, JOB)).rejects.toThrow(
      InsufficientCreditsError,
    );
    expect(await getBalance(db, userId)).toBe(0);
    expect(await db.select().from(schema.videoJobs)).toHaveLength(0);
  });
  it("prevents double-spend under concurrency", async () => {
    await grantWelcomeBonus(db, userId); // 2 kredi, her iş 2 kredi
    const results = await Promise.allSettled([
      spendCreditsForJob(db, userId, JOB),
      spendCreditsForJob(db, userId, JOB),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);
    expect(await getBalance(db, userId)).toBe(0);
  });
});

describe("refundJob", () => {
  it("refunds a spent job once", async () => {
    await grantWelcomeBonus(db, userId);
    const { jobId } = await spendCreditsForJob(db, userId, JOB);
    expect(await refundJob(db, jobId)).toBe(true);
    expect(await getBalance(db, userId)).toBe(2);
    expect(await refundJob(db, jobId)).toBe(false); // idempotent
    expect(await getBalance(db, userId)).toBe(2);
  });
  it("returns false for unknown job", async () => {
    expect(await refundJob(db, "00000000-0000-0000-0000-000000000000")).toBe(false);
  });
});
