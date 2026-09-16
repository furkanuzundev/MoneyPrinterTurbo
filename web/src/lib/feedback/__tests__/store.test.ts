import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { getFeedback, upsertFeedback } from "../store";

const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST });
const db = drizzle(pool, { schema });

const JOB = {
  subject: "morning habits",
  script: "drink water",
  terms: ["morning"],
  scenes: [{ tag: "hook", caption: "Wake up", voiceover: "Wake up" }],
  captionStyle: null,
  aspect: "9:16",
  voice: "en-US-JennyNeural-Female",
  targetSeconds: 45,
  credits: 2,
  status: "done" as const,
};

let userId: string;
let job: typeof schema.videoJobs.$inferSelect;

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user", video_jobs, video_feedback CASCADE`);
  const [user] = await db
    .insert(schema.users)
    .values({ email: "alice@example.com" })
    .returning();
  userId = user.id;
  [job] = await db
    .insert(schema.videoJobs)
    .values({ ...JOB, userId })
    .returning();
});

afterAll(() => pool.end());

describe("feedback store", () => {
  it("returns null before the video is rated", async () => {
    expect(await getFeedback(db, job.id)).toBeNull();
  });

  it("saves a rating with a snapshot of the video", async () => {
    await upsertFeedback(db, job, {
      rating: 2,
      tags: ["voice"],
      comment: "robotic",
      source: "done_screen",
    });
    expect(await getFeedback(db, job.id)).toEqual({
      rating: 2,
      tags: ["voice"],
      comment: "robotic",
    });
    const [row] = await db.select().from(schema.videoFeedback);
    expect(row.userId).toBe(userId);
    expect(row.source).toBe("done_screen");
    expect(row.snapshot).toEqual({
      subject: "morning habits",
      aspect: "9:16",
      voice: "en-US-JennyNeural-Female",
      targetSeconds: 45,
      hasScenes: true,
    });
  });

  it("updates the single rating instead of adding another", async () => {
    await upsertFeedback(db, job, { rating: 2, tags: ["voice"], comment: null, source: "done_screen" });
    await upsertFeedback(db, job, { rating: 5, tags: [], comment: "better now", source: "library" });
    const rows = await db.select().from(schema.videoFeedback);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rating: 5, tags: [], comment: "better now", source: "library" });
    expect(rows[0].updatedAt.getTime()).toBeGreaterThanOrEqual(rows[0].createdAt.getTime());
  });

  it("keeps the rating when the video is deleted", async () => {
    await upsertFeedback(db, job, { rating: 1, tags: ["visuals"], comment: null, source: "library" });
    await db.delete(schema.videoJobs).where(eq(schema.videoJobs.id, job.id));
    const rows = await db.select().from(schema.videoFeedback);
    expect(rows).toHaveLength(1);
    expect(rows[0].jobId).toBeNull();
    expect(rows[0].snapshot.subject).toBe("morning habits");
  });

  it("rejects out-of-range ratings at the database level", async () => {
    await expect(
      db.insert(schema.videoFeedback).values({
        jobId: job.id,
        userId,
        rating: 6,
        source: "library",
        snapshot: { subject: "x", aspect: "9:16", voice: "v", targetSeconds: 30, hasScenes: false },
      }),
    ).rejects.toThrow();
  });
});
