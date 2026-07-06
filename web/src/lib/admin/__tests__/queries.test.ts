import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import {
  getDashboardStats,
  getUserDetail,
  listJobs,
  listUsers,
} from "../queries";

const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST });
const db = drizzle(pool, { schema });

const JOB_BASE = {
  subject: "morning habits",
  script: "drink water",
  terms: ["morning"],
  scenes: null,
  captionStyle: null,
  aspect: "9:16",
  voice: "en-US-JennyNeural-Female",
  targetSeconds: 60,
  credits: 2,
} as const;

let aliceId: string;
let bobId: string;

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE "user", credit_ledger, video_jobs, purchases CASCADE`,
  );
  const [alice] = await db
    .insert(schema.users)
    .values({ email: "alice@example.com", name: "Alice" })
    .returning();
  const [bob] = await db
    .insert(schema.users)
    .values({ email: "bob@example.com", name: "Bob" })
    .returning();
  aliceId = alice.id;
  bobId = bob.id;
  await db.insert(schema.creditLedger).values([
    { userId: aliceId, delta: 5, kind: "welcome_bonus" },
    { userId: aliceId, delta: 10, kind: "purchase" },
    { userId: aliceId, delta: -2, kind: "spend" },
    { userId: bobId, delta: 5, kind: "welcome_bonus" },
  ]);
  const jobRows: (typeof schema.videoJobs.$inferInsert)[] = [
    { ...JOB_BASE, terms: [...JOB_BASE.terms], userId: aliceId, status: "done", error: null },
    { ...JOB_BASE, terms: [...JOB_BASE.terms], userId: aliceId, status: "failed", error: "boom" },
    { ...JOB_BASE, terms: [...JOB_BASE.terms], userId: bobId, status: "rendering", error: null },
  ];
  await db.insert(schema.videoJobs).values(jobRows);
  await db.insert(schema.purchases).values([
    {
      userId: aliceId,
      packageKey: "starter",
      credits: 10,
      amountCents: 500,
      status: "completed",
      stripeSessionId: "cs_1",
    },
    {
      userId: aliceId,
      packageKey: "creator",
      credits: 50,
      amountCents: 1900,
      status: "pending",
      stripeSessionId: "cs_2",
    },
  ]);
});

afterAll(() => pool.end());

describe("getDashboardStats", () => {
  it("computes totals over the window", async () => {
    const stats = await getDashboardStats(db, 30);
    expect(stats.totals.users).toBe(2);
    expect(stats.totals.jobs30d).toBe(3);
    expect(stats.totals.doneJobs30d).toBe(1);
    expect(stats.totals.failedJobs30d).toBe(1);
    expect(stats.totals.revenueCents30d).toBe(500); // yalnızca completed
    expect(stats.totals.creditsSpent30d).toBe(2);
  });
  it("returns gap-filled daily series, oldest first", async () => {
    const stats = await getDashboardStats(db, 7);
    expect(stats.signupsByDay).toHaveLength(7);
    expect(stats.revenueByDay).toHaveLength(7);
    expect(stats.creditsSpentByDay).toHaveLength(7);
    expect(stats.jobsByDay).toHaveLength(7);
    const today = stats.signupsByDay[6];
    expect(today.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(today.value).toBe(2);
    expect(stats.signupsByDay[0].value).toBe(0);
    const jobsToday = stats.jobsByDay[6];
    expect(jobsToday).toMatchObject({ done: 1, failed: 1, inProgress: 1 });
  });
});

describe("listUsers", () => {
  it("returns rows with aggregates, newest first", async () => {
    const { rows, total } = await listUsers(db, {});
    expect(total).toBe(2);
    expect(rows).toHaveLength(2);
    const alice = rows.find((r) => r.email === "alice@example.com")!;
    expect(alice.balance).toBe(13);
    expect(alice.jobCount).toBe(2);
    expect(alice.paidCents).toBe(500);
    const bob = rows.find((r) => r.email === "bob@example.com")!;
    expect(bob.balance).toBe(5);
    expect(bob.jobCount).toBe(1);
    expect(bob.paidCents).toBe(0);
  });
  it("filters by email substring, case-insensitive", async () => {
    const { rows, total } = await listUsers(db, { q: "ALICE" });
    expect(total).toBe(1);
    expect(rows[0].email).toBe("alice@example.com");
  });
  it("paginates", async () => {
    const page1 = await listUsers(db, { page: 1, pageSize: 1 });
    const page2 = await listUsers(db, { page: 2, pageSize: 1 });
    expect(page1.rows).toHaveLength(1);
    expect(page2.rows).toHaveLength(1);
    expect(page1.rows[0].id).not.toBe(page2.rows[0].id);
    expect(page1.total).toBe(2);
  });
});

describe("getUserDetail", () => {
  it("returns profile with ledger, jobs and purchases", async () => {
    const detail = await getUserDetail(db, aliceId);
    expect(detail).not.toBeNull();
    expect(detail!.user.email).toBe("alice@example.com");
    expect(detail!.user.balance).toBe(13);
    expect(detail!.ledger).toHaveLength(3);
    expect(detail!.jobs).toHaveLength(2);
    expect(detail!.purchases).toHaveLength(2);
  });
  it("returns null for an unknown user", async () => {
    expect(await getUserDetail(db, crypto.randomUUID())).toBeNull();
  });
});

describe("listJobs", () => {
  it("lists jobs with user email, newest first", async () => {
    const jobs = await listJobs(db, {});
    expect(jobs).toHaveLength(3);
    expect(jobs.every((j) => j.userEmail)).toBe(true);
  });
  it("filters by status", async () => {
    const failed = await listJobs(db, { status: "failed" });
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toBe("boom");
  });
});
