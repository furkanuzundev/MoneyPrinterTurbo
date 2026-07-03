import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import Redis from "ioredis";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { getBalance, grantWelcomeBonus, spendCreditsForJob } from "@/lib/credits/ledger";
import { enqueueJob } from "../queue";
import { stageForProgress, syncJobStatus } from "../status";

const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST });
const db = drizzle(pool, { schema });
const redis = new Redis("redis://localhost:6379/15");

let userId: string;
let jobId: string;

beforeEach(async () => {
  await redis.flushdb();
  await db.execute(sql`TRUNCATE "user", credit_ledger, video_jobs CASCADE`);
  const [u] = await db.insert(schema.users).values({ email: "s@example.com" }).returning();
  userId = u.id;
  await grantWelcomeBonus(db, userId);
  const spent = await spendCreditsForJob(db, userId, {
    subject: "s",
    script: "drink water",
    terms: ["a"],
    aspect: "9:16",
    voice: "en-US-JennyNeural-Female",
    targetSeconds: 30,
    credits: 1,
  });
  jobId = spent.jobId;
});
afterAll(async () => {
  await redis.quit();
  await pool.end();
});

describe("syncJobStatus", () => {
  it("returns null for unknown job", async () => {
    expect(await syncJobStatus(db, redis, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
  it("keeps queued when engine has not started", async () => {
    const result = await syncJobStatus(db, redis, jobId);
    expect(result!.job.status).toBe("queued");
    expect(result!.progress).toBe(0);
  });
  it("promotes to rendering with progress", async () => {
    await redis.hset(jobId, { state: "4", progress: "42" });
    const result = await syncJobStatus(db, redis, jobId);
    expect(result!.job.status).toBe("rendering");
    expect(result!.progress).toBe(42);
  });
  it("marks done with deterministic output path", async () => {
    await redis.hset(jobId, { state: "1", progress: "100" });
    const result = await syncJobStatus(db, redis, jobId);
    expect(result!.job.status).toBe("done");
    expect(result!.job.outputPath).toBe(`tasks/${jobId}/final-1.mp4`);
    expect(result!.progress).toBe(100);
  });
  it("marks failed and refunds exactly once", async () => {
    await redis.hset(jobId, { state: "-1", progress: "0" });
    await syncJobStatus(db, redis, jobId);
    expect(await getBalance(db, userId)).toBe(2); // 2 bonus - 1 spend + 1 refund
    await syncJobStatus(db, redis, jobId); // ikinci senkron çift iade yapmamalı
    expect(await getBalance(db, userId)).toBe(2);
    const [job] = await db.select().from(schema.videoJobs);
    expect(job.status).toBe("failed");
  });
  it("retries the refund on next sync if refund fails transiently", async () => {
    await redis.hset(jobId, { state: "-1", progress: "0" });
    const ledger = await import("@/lib/credits/ledger");
    const original = ledger.refundJob;
    const spy = vi
      .spyOn(ledger, "refundJob")
      .mockRejectedValueOnce(new Error("transient db error"));
    await expect(syncJobStatus(db, redis, jobId)).rejects.toThrow("transient");
    // iş terminal OLMAMALI: bir sonraki sync iadeyi tamamlayabilmeli
    const [jobAfterError] = await db.select().from(schema.videoJobs);
    expect(jobAfterError.status).not.toBe("failed");
    spy.mockRestore();
    const result = await syncJobStatus(db, redis, jobId);
    expect(result!.job.status).toBe("failed");
    expect(await getBalance(db, userId)).toBe(2); // iade gerçekleşti
    void original;
  });
  it("does not touch redis for already-terminal jobs", async () => {
    await redis.hset(jobId, { state: "1", progress: "100" });
    await syncJobStatus(db, redis, jobId);
    await redis.del(jobId); // worker state'i uçtu
    const result = await syncJobStatus(db, redis, jobId);
    expect(result!.job.status).toBe("done"); // Postgres artık kaynak
  });
  it("reconciles a stuck queued job with no engine state (refund + failed)", async () => {
    // işi eşikten eski göster
    await db
      .update(schema.videoJobs)
      .set({ createdAt: new Date(Date.now() - 16 * 60 * 1000) })
      .where(eq(schema.videoJobs.id, jobId));
    const result = await syncJobStatus(db, redis, jobId);
    expect(result!.job.status).toBe("failed");
    expect(await getBalance(db, userId)).toBe(2); // iade edildi
  });

  it("leaves a fresh queued job alone", async () => {
    const result = await syncJobStatus(db, redis, jobId);
    expect(result!.job.status).toBe("queued");
    expect(await getBalance(db, userId)).toBe(1); // iade YOK
  });

  it("does not reconcile an old job that IS in the queue (backlog)", async () => {
    await enqueueJob(redis, jobId, {
      video_subject: "s",
      video_script: "drink water",
      video_terms: ["a"],
      video_aspect: "9:16",
      voice_name: "en-US-JennyNeural-Female",
      subtitle_enabled: true,
    });
    await db
      .update(schema.videoJobs)
      .set({ createdAt: new Date(Date.now() - 16 * 60 * 1000) })
      .where(eq(schema.videoJobs.id, jobId));
    const result = await syncJobStatus(db, redis, jobId);
    expect(result!.job.status).toBe("queued"); // iade YOK, iş kuyrukta
    expect(await getBalance(db, userId)).toBe(1);
  });
});

describe("stageForProgress", () => {
  it("maps ranges to labels", () => {
    expect(stageForProgress(5)).toBe("Preparing");
    expect(stageForProgress(30)).toBe("Gathering footage");
    expect(stageForProgress(80)).toBe("Rendering");
    expect(stageForProgress(97)).toBe("Finishing");
  });
});
