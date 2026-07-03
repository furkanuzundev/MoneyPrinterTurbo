import { eq } from "drizzle-orm";
import type Redis from "ioredis";
import type { Db } from "@/db";
import { videoJobs } from "@/db/schema";
import { refundJob } from "@/lib/credits/ledger";
import { ENGINE_COMPLETE, ENGINE_FAILED, readEngineState } from "./queue";

export type VideoJobRow = typeof videoJobs.$inferSelect;

export function stageForProgress(progress: number): string {
  if (progress < 15) return "Preparing";
  if (progress < 55) return "Gathering footage";
  if (progress < 95) return "Rendering";
  return "Finishing";
}

export async function syncJobStatus(
  db: Db,
  redis: Redis,
  jobId: string,
): Promise<{ job: VideoJobRow; progress: number } | null> {
  const [job] = await db.select().from(videoJobs).where(eq(videoJobs.id, jobId));
  if (!job) return null;
  if (job.status === "done") return { job, progress: 100 };
  if (job.status === "failed") return { job, progress: 0 };

  const engine = await readEngineState(redis, jobId);
  if (!engine) return { job, progress: 0 };

  if (engine.state === ENGINE_COMPLETE) {
    const outputPath = `tasks/${jobId}/final-1.mp4`;
    const [updated] = await db
      .update(videoJobs)
      .set({ status: "done", outputPath, updatedAt: new Date() })
      .where(eq(videoJobs.id, jobId))
      .returning();
    return { job: updated, progress: 100 };
  }
  if (engine.state === ENGINE_FAILED) {
    const [updated] = await db
      .update(videoJobs)
      .set({
        status: "failed",
        error: "Video generation failed. Your credits have been refunded.",
        updatedAt: new Date(),
      })
      .where(eq(videoJobs.id, jobId))
      .returning();
    await refundJob(db, jobId); // idempotent + DB unique index korumalı
    return { job: updated, progress: 0 };
  }
  if (job.status === "queued" && engine.progress > 0) {
    const [updated] = await db
      .update(videoJobs)
      .set({ status: "rendering", updatedAt: new Date() })
      .where(eq(videoJobs.id, jobId))
      .returning();
    return { job: updated, progress: engine.progress };
  }
  return { job, progress: engine.progress };
}
