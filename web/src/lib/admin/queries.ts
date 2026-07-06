import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { creditLedger, purchases, users, videoJobs } from "@/db/schema";

export type DayValue = { day: string; value: number };
export type JobsDay = { day: string; done: number; failed: number; inProgress: number };

export type DashboardStats = {
  totals: {
    users: number;
    jobs30d: number;
    doneJobs30d: number;
    failedJobs30d: number;
    revenueCents30d: number;
    creditsSpent30d: number;
  };
  signupsByDay: DayValue[];
  revenueByDay: DayValue[];
  creditsSpentByDay: DayValue[];
  jobsByDay: JobsDay[];
};

// UTC gün anahtarı (YYYY-MM-DD). Sunucu ve Postgres UTC'de çalışır.
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function lastNDays(days: number): string[] {
  const out: string[] = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    out.push(dayKey(new Date(now - i * 86_400_000)));
  }
  return out;
}

function fillDays(days: number, rows: { day: string; value: number }[]): DayValue[] {
  const byDay = new Map(rows.map((r) => [r.day, Number(r.value)]));
  return lastNDays(days).map((day) => ({ day, value: byDay.get(day) ?? 0 }));
}

const DAY_EXPR = (col: unknown) =>
  sql<string>`to_char(date_trunc('day', ${col} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`;

export async function getDashboardStats(db: Db, days = 30): Promise<DashboardStats> {
  const since = sql`now() - make_interval(days => ${days})`;

  const totalsResult = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM "user") AS users,
      (SELECT count(*)::int FROM video_jobs WHERE created_at >= ${since}) AS jobs30d,
      (SELECT count(*)::int FROM video_jobs WHERE status = 'done' AND created_at >= ${since}) AS done_jobs30d,
      (SELECT count(*)::int FROM video_jobs WHERE status = 'failed' AND created_at >= ${since}) AS failed_jobs30d,
      (SELECT coalesce(sum(amount_cents), 0)::int FROM purchases WHERE status = 'completed' AND created_at >= ${since}) AS revenue_cents30d,
      (SELECT coalesce(sum(-delta), 0)::int FROM credit_ledger WHERE kind = 'spend' AND created_at >= ${since}) AS credits_spent30d
  `);
  const totalsRow = totalsResult.rows[0] as Record<string, number>;
  const totals = {
    users: Number(totalsRow.users),
    jobs30d: Number(totalsRow.jobs30d),
    doneJobs30d: Number(totalsRow.done_jobs30d),
    failedJobs30d: Number(totalsRow.failed_jobs30d),
    revenueCents30d: Number(totalsRow.revenue_cents30d),
    creditsSpent30d: Number(totalsRow.credits_spent30d),
  };

  const signups = await db
    .select({ day: DAY_EXPR(users.createdAt), value: sql<number>`count(*)::int` })
    .from(users)
    .where(sql`${users.createdAt} >= ${since}`)
    .groupBy(sql`1`);

  const revenue = await db
    .select({ day: DAY_EXPR(purchases.createdAt), value: sql<number>`sum(amount_cents)::int` })
    .from(purchases)
    .where(sql`${purchases.status} = 'completed' AND ${purchases.createdAt} >= ${since}`)
    .groupBy(sql`1`);

  const spent = await db
    .select({ day: DAY_EXPR(creditLedger.createdAt), value: sql<number>`sum(-delta)::int` })
    .from(creditLedger)
    .where(sql`${creditLedger.kind} = 'spend' AND ${creditLedger.createdAt} >= ${since}`)
    .groupBy(sql`1`);

  const jobsRaw = await db
    .select({
      day: DAY_EXPR(videoJobs.createdAt),
      done: sql<number>`count(*) FILTER (WHERE status = 'done')::int`,
      failed: sql<number>`count(*) FILTER (WHERE status = 'failed')::int`,
      inProgress: sql<number>`count(*) FILTER (WHERE status NOT IN ('done', 'failed'))::int`,
    })
    .from(videoJobs)
    .where(sql`${videoJobs.createdAt} >= ${since}`)
    .groupBy(sql`1`);

  const jobsMap = new Map(jobsRaw.map((r) => [r.day, r]));
  const jobsByDay = lastNDays(days).map((day) => {
    const r = jobsMap.get(day);
    return {
      day,
      done: r?.done ?? 0,
      failed: r?.failed ?? 0,
      inProgress: r?.inProgress ?? 0,
    };
  });

  return {
    totals,
    signupsByDay: fillDays(days, signups),
    revenueByDay: fillDays(days, revenue),
    creditsSpentByDay: fillDays(days, spent),
    jobsByDay,
  };
}

export type AdminUserRow = {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: Date;
  balance: number;
  jobCount: number;
  paidCents: number;
};

const USER_AGGREGATES = {
  balance: sql<number>`coalesce((SELECT sum(delta)::int FROM credit_ledger l WHERE l.user_id = "user".id), 0)`,
  jobCount: sql<number>`coalesce((SELECT count(*)::int FROM video_jobs j WHERE j.user_id = "user".id), 0)`,
  paidCents: sql<number>`coalesce((SELECT sum(amount_cents)::int FROM purchases p WHERE p.user_id = "user".id AND p.status = 'completed'), 0)`,
};

export async function listUsers(
  db: Db,
  opts: { q?: string; page?: number; pageSize?: number },
): Promise<{ rows: AdminUserRow[]; total: number }> {
  const q = opts.q?.trim() ?? "";
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const where = q
    ? sql`${users.email} ILIKE ${"%" + q + "%"}`
    : sql`true`;

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
      ...USER_AGGREGATES,
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(users)
    .where(where);

  return { rows, total };
}

export type AdminUserDetail = {
  user: AdminUserRow;
  ledger: { id: number; delta: number; kind: string; note: string | null; createdAt: Date }[];
  jobs: { id: string; subject: string; status: string; credits: number; error: string | null; createdAt: Date }[];
  purchases: { id: number; packageKey: string; credits: number; amountCents: number; status: string; createdAt: Date }[];
};

export async function getUserDetail(
  db: Db,
  userId: string,
): Promise<AdminUserDetail | null> {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
      ...USER_AGGREGATES,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) return null;

  const ledger = await db
    .select({
      id: creditLedger.id,
      delta: creditLedger.delta,
      kind: creditLedger.kind,
      note: creditLedger.note,
      createdAt: creditLedger.createdAt,
    })
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))
    .orderBy(desc(creditLedger.createdAt), desc(creditLedger.id))
    .limit(50);

  const jobs = await db
    .select({
      id: videoJobs.id,
      subject: videoJobs.subject,
      status: videoJobs.status,
      credits: videoJobs.credits,
      error: videoJobs.error,
      createdAt: videoJobs.createdAt,
    })
    .from(videoJobs)
    .where(eq(videoJobs.userId, userId))
    .orderBy(desc(videoJobs.createdAt))
    .limit(50);

  const userPurchases = await db
    .select({
      id: purchases.id,
      packageKey: purchases.packageKey,
      credits: purchases.credits,
      amountCents: purchases.amountCents,
      status: purchases.status,
      createdAt: purchases.createdAt,
    })
    .from(purchases)
    .where(eq(purchases.userId, userId))
    .orderBy(desc(purchases.createdAt))
    .limit(50);

  return { user, ledger, jobs, purchases: userPurchases };
}

export type AdminJobRow = {
  id: string;
  userEmail: string | null;
  subject: string;
  status: string;
  credits: number;
  targetSeconds: number;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function listJobs(
  db: Db,
  opts: { status?: string; limit?: number },
): Promise<AdminJobRow[]> {
  const limit = Math.min(500, Math.max(1, opts.limit ?? 100));
  const where = opts.status ? eq(videoJobs.status, opts.status as never) : sql`true`;
  return db
    .select({
      id: videoJobs.id,
      userEmail: users.email,
      subject: videoJobs.subject,
      status: videoJobs.status,
      credits: videoJobs.credits,
      targetSeconds: videoJobs.targetSeconds,
      error: videoJobs.error,
      createdAt: videoJobs.createdAt,
      updatedAt: videoJobs.updatedAt,
    })
    .from(videoJobs)
    .leftJoin(users, eq(videoJobs.userId, users.id))
    .where(where)
    .orderBy(desc(videoJobs.createdAt))
    .limit(limit);
}
