import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { creditLedger, videoJobs } from "@/db/schema";
import { WELCOME_BONUS_CREDITS } from "./pricing";

export class InsufficientCreditsError extends Error {
  constructor() {
    super("Insufficient credits");
    this.name = "InsufficientCreditsError";
  }
}

export async function getBalance(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ balance: sql<number>`coalesce(sum(${creditLedger.delta}), 0)::int` })
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId));
  return row.balance;
}

export async function grantWelcomeBonus(db: Db, userId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Kullanıcı satırını kilitle: aynı kullanıcı için eşzamanlı bonus/harcama serileşir.
    await tx.execute(sql`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`);
    const existing = await tx
      .select({ id: creditLedger.id })
      .from(creditLedger)
      .where(
        and(eq(creditLedger.userId, userId), eq(creditLedger.kind, "welcome_bonus")),
      );
    if (existing.length > 0) return false;
    await tx.insert(creditLedger).values({
      userId,
      delta: WELCOME_BONUS_CREDITS,
      kind: "welcome_bonus",
    });
    return true;
  });
}

export async function spendCreditsForJob(
  db: Db,
  userId: string,
  job: {
    subject: string;
    script: string;
    terms: string[];
    scenes: { tag: string; caption: string; voiceover: string }[] | null;
    captionStyle: {
      size: "sm" | "md" | "lg";
      position: "top" | "center" | "bottom";
      color: "yellow" | "white" | "none";
    } | null;
    aspect: string;
    voice: string;
    targetSeconds: number;
    credits: number;
  },
): Promise<{ jobId: string }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`);
    const [row] = await tx
      .select({ balance: sql<number>`coalesce(sum(${creditLedger.delta}), 0)::int` })
      .from(creditLedger)
      .where(eq(creditLedger.userId, userId));
    if (row.balance < job.credits) throw new InsufficientCreditsError();
    const [created] = await tx
      .insert(videoJobs)
      .values({
        userId,
        subject: job.subject,
        script: job.script,
        terms: job.terms,
        scenes: job.scenes,
        captionStyle: job.captionStyle,
        aspect: job.aspect,
        voice: job.voice,
        targetSeconds: job.targetSeconds,
        credits: job.credits,
      })
      .returning({ id: videoJobs.id });
    await tx.insert(creditLedger).values({
      userId,
      delta: -job.credits,
      kind: "spend",
      jobId: created.id,
    });
    return { jobId: created.id };
  });
}

export async function refundJob(db: Db, jobId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [spend] = await tx
      .select({ userId: creditLedger.userId, delta: creditLedger.delta })
      .from(creditLedger)
      .where(and(eq(creditLedger.jobId, jobId), eq(creditLedger.kind, "spend")));
    if (!spend) return false;
    await tx.execute(
      sql`SELECT id FROM "user" WHERE id = ${spend.userId} FOR UPDATE`,
    );
    const [refund] = await tx
      .select({ id: creditLedger.id })
      .from(creditLedger)
      .where(and(eq(creditLedger.jobId, jobId), eq(creditLedger.kind, "refund")));
    if (refund) return false;
    await tx.insert(creditLedger).values({
      userId: spend.userId,
      delta: -spend.delta, // spend negatifti; iade pozitif
      kind: "refund",
      jobId,
    });
    return true;
  });
}
