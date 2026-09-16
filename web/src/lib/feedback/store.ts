import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { videoFeedback } from "@/db/schema";
import type { VideoJobRow } from "@/lib/jobs/status";
import type { FeedbackInput, FeedbackTag } from "./rating";

export type SavedFeedback = {
  rating: number;
  tags: FeedbackTag[];
  comment: string | null;
};

export async function getFeedback(db: Db, jobId: string): Promise<SavedFeedback | null> {
  const [row] = await db
    .select({
      rating: videoFeedback.rating,
      tags: videoFeedback.tags,
      comment: videoFeedback.comment,
    })
    .from(videoFeedback)
    .where(eq(videoFeedback.jobId, jobId));
  return row ?? null;
}

/** Video başına tek puan: tekrar gönderim satırı günceller. */
export async function upsertFeedback(
  db: Db,
  job: VideoJobRow,
  input: FeedbackInput,
): Promise<SavedFeedback> {
  const [row] = await db
    .insert(videoFeedback)
    .values({
      jobId: job.id,
      userId: job.userId,
      ...input,
      snapshot: {
        subject: job.subject,
        aspect: job.aspect,
        voice: job.voice,
        targetSeconds: job.targetSeconds,
        hasScenes: (job.scenes?.length ?? 0) > 0,
      },
    })
    .onConflictDoUpdate({
      target: videoFeedback.jobId,
      set: {
        rating: input.rating,
        tags: input.tags,
        comment: input.comment,
        source: input.source,
        updatedAt: sql`now()`,
      },
    })
    .returning({
      rating: videoFeedback.rating,
      tags: videoFeedback.tags,
      comment: videoFeedback.comment,
    });
  return row;
}
