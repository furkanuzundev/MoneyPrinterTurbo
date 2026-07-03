import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import Redis from "ioredis";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { getBalance, grantWelcomeBonus, InsufficientCreditsError } from "@/lib/credits/ledger";
import { createVideoJob, ValidationError } from "../create";
import { PENDING_KEY } from "../queue";

const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST });
const db = drizzle(pool, { schema });
const redis = new Redis("redis://localhost:6379/15");

let userId: string;

const INPUT = {
  subject: "morning habits",
  script: Array(75).fill("word").join(" "), // 75 kelime -> 30 sn -> 1 kredi
  terms: ["morning", "coffee"],
  aspect: "9:16",
  voice: "en-US-JennyNeural-Female",
};

beforeEach(async () => {
  await redis.flushdb();
  await db.execute(sql`TRUNCATE "user", credit_ledger, video_jobs CASCADE`);
  const [u] = await db.insert(schema.users).values({ email: "c@example.com" }).returning();
  userId = u.id;
  await grantWelcomeBonus(db, userId); // 2 kredi
});
afterAll(async () => {
  await redis.quit();
  await pool.end();
});

describe("createVideoJob", () => {
  it("spends credits and enqueues a worker-compatible job", async () => {
    const { jobId, credits } = await createVideoJob(db, redis, userId, INPUT);
    expect(credits).toBe(1);
    expect(await getBalance(db, userId)).toBe(1);
    const raw = await redis.rpop(PENDING_KEY);
    const payload = JSON.parse(raw!);
    expect(payload.task_id).toBe(jobId);
    expect(payload.params.video_script).toBe(INPUT.script);
    expect(payload.params.voice_name).toBe(INPUT.voice);
    expect(payload.params.subtitle_enabled).toBe(true);
  });
  it("enables script-ordered material matching for scene jobs", async () => {
    const { jobId } = await createVideoJob(db, redis, userId, {
      ...INPUT,
      script: "",
      scenes: [
        { caption: "Hazırlık!", voiceover: "Malzemeleri hazırlıyoruz." },
        { caption: "Karıştır!", voiceover: "Karıştırıyoruz." },
      ],
    });
    const payload = JSON.parse((await redis.rpop(PENDING_KEY))!);
    expect(payload.task_id).toBe(jobId);
    expect(payload.params.match_materials_to_script).toBe(true);
  });
  it("prices longer scripts higher", async () => {
    const { credits } = await createVideoJob(db, redis, userId, {
      ...INPUT,
      script: Array(150).fill("word").join(" "), // 60 sn -> 2 kredi
    });
    expect(credits).toBe(2);
  });
  it("rejects invalid voice and aspect", async () => {
    await expect(
      createVideoJob(db, redis, userId, { ...INPUT, voice: "evil-voice" }),
    ).rejects.toThrow(ValidationError);
    await expect(
      createVideoJob(db, redis, userId, { ...INPUT, aspect: "4:5" }),
    ).rejects.toThrow(ValidationError);
    expect(await getBalance(db, userId)).toBe(2); // hiç kredi düşmedi
  });
  it("rejects empty or oversized scripts", async () => {
    await expect(
      createVideoJob(db, redis, userId, { ...INPUT, script: "  " }),
    ).rejects.toThrow(ValidationError);
    await expect(
      createVideoJob(db, redis, userId, {
        ...INPUT,
        script: Array(1300).fill("word").join(" "),
      }),
    ).rejects.toThrow(ValidationError);
  });
  it("throws InsufficientCreditsError without touching the queue", async () => {
    const expensive = Array(600).fill("word").join(" "); // 240 sn -> 8 kredi > 2
    await expect(
      createVideoJob(db, redis, userId, { ...INPUT, script: expensive }),
    ).rejects.toThrow(InsufficientCreditsError);
    expect(await redis.llen(PENDING_KEY)).toBe(0);
  });
  it("refunds and marks failed when enqueue fails", async () => {
    const brokenRedis = {
      multi: () => ({
        lpush: () => ({
          set: () => ({
            exec: () => Promise.reject(new Error("redis down")),
          }),
        }),
      }),
    } as unknown as Redis;
    await expect(
      createVideoJob(db, brokenRedis, userId, INPUT),
    ).rejects.toThrow("redis down");
    expect(await getBalance(db, userId)).toBe(2); // iade edildi
    const [job] = await db.select().from(schema.videoJobs);
    expect(job.status).toBe("failed");
  });
  it("does not mark the job terminal if the refund itself fails", async () => {
    const ledger = await import("@/lib/credits/ledger");
    const spy = vi
      .spyOn(ledger, "refundJob")
      .mockRejectedValueOnce(new Error("transient refund error"));
    const brokenRedis = {
      multi: () => ({
        lpush: () => ({
          set: () => ({
            exec: () => Promise.reject(new Error("redis down")),
          }),
        }),
      }),
    } as unknown as Redis;
    await expect(
      createVideoJob(db, brokenRedis, userId, INPUT),
    ).rejects.toThrow("transient refund error");
    spy.mockRestore();
    const [job] = await db.select().from(schema.videoJobs);
    expect(job.status).toBe("queued"); // terminal DEĞİL: iade denenebilir kalır
  });
});
