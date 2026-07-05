import { eq } from "drizzle-orm";
import type Redis from "ioredis";
import type { Db } from "@/db";
import { videoJobs } from "@/db/schema";
import { refundJob } from "@/lib/credits/ledger";
import { enqueueSentinelKey, ENGINE_COMPLETE, ENGINE_FAILED, readEngineState, PENDING_KEY } from "./queue";

export type VideoJobRow = typeof videoJobs.$inferSelect;

// Kuyruğa yazılamadan (enqueue öncesi crash) askıda kalan işler için eşik:
// bu süreden eski + Redis'te izi olmayan queued iş terk edilmiş sayılır.
export const STUCK_QUEUED_THRESHOLD_MS = 15 * 60 * 1000;

const AVG_RENDER_SECONDS = Number(process.env.AVG_RENDER_SECONDS ?? 270);

export async function queueDepth(redis: Redis): Promise<number> {
  return redis.llen(PENDING_KEY);
}

export function estimateEtaSeconds(
  depth: number,
  workers = Number(process.env.WORKER_COUNT ?? 2),
): number {
  return Math.ceil(depth / Math.max(1, workers)) * AVG_RENDER_SECONDS + AVG_RENDER_SECONDS;
}

export { RENDER_STAGES, stageForProgress, stageIndexForProgress } from "./stages";

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
  if (!engine) {
    const isStuck =
      job.status === "queued" &&
      Date.now() - job.createdAt.getTime() > STUCK_QUEUED_THRESHOLD_MS;
    if (!isStuck) return { job, progress: 0 };
    const wasEnqueued = await redis.exists(enqueueSentinelKey(jobId));
    if (wasEnqueued) return { job, progress: 0 }; // kuyrukta bekliyor: DOKUNMA
    // Sentinel yok: harcama commit'lendi ama enqueue hiç gerçekleşmedi.
    // önce iade, sonra terminal işaret (yerleşik sıralama dersi).
    await refundJob(db, jobId);
    const [updated] = await db
      .update(videoJobs)
      .set({
        status: "failed",
        error: "The job never reached the queue. Your credits have been refunded.",
        updatedAt: new Date(),
      })
      .where(eq(videoJobs.id, jobId))
      .returning();
    return { job: updated, progress: 0 };
  }

  if (engine.state === ENGINE_COMPLETE) {
    // outputPath aynı zamanda bucket key'idir (tasks/<id>/final-1.mp4).
    // S3 backend'inde /api/videos bunu presigned URL üretmek için kullanır.
    const outputPath = `tasks/${jobId}/final-1.mp4`;
    const [updated] = await db
      .update(videoJobs)
      .set({ status: "done", outputPath, updatedAt: new Date() })
      .where(eq(videoJobs.id, jobId))
      .returning();
    return { job: updated, progress: 100 };
  }
  if (engine.state === ENGINE_FAILED) {
    // Önce iade, sonra terminal işaret: refund geçici olarak başarısız olursa
    // iş non-terminal kalır ve bir SONRAKİ sync yeniden dener (refundJob
    // idempotent + DB unique index korumalı; en-az-bir-kez güvenli).
    await refundJob(db, jobId);
    const [updated] = await db
      .update(videoJobs)
      .set({
        status: "failed",
        error: "Video generation failed. Your credits have been refunded.",
        updatedAt: new Date(),
      })
      .where(eq(videoJobs.id, jobId))
      .returning();
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
