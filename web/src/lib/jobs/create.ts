import type Redis from "ioredis";
import type { Db } from "@/db";
import { eq } from "drizzle-orm";
import { videoJobs } from "@/db/schema";
import { refundJob, spendCreditsForJob } from "@/lib/credits/ledger";
import { creditsForDuration, estimateDurationSeconds } from "@/lib/credits/pricing";
import { ASPECTS, MAX_SCRIPT_WORDS, VOICES } from "./options";
import { enqueueJob } from "./queue";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export async function createVideoJob(
  db: Db,
  redis: Redis,
  userId: string,
  input: { subject: string; script: string; terms: string[]; aspect: string; voice: string },
): Promise<{ jobId: string; credits: number }> {
  const subject = input.subject.trim().slice(0, 300);
  const script = input.script.trim();
  const terms = (input.terms ?? []).map(String).filter(Boolean).slice(0, 8);
  if (!subject) throw new ValidationError("Subject is required");
  if (!script) throw new ValidationError("Script is required");
  const words = script.split(/\s+/).length;
  if (words > MAX_SCRIPT_WORDS) throw new ValidationError("Script is too long");
  if (terms.length === 0) throw new ValidationError("Search terms are required");
  if (!ASPECTS.includes(input.aspect as (typeof ASPECTS)[number])) {
    throw new ValidationError("Invalid aspect ratio");
  }
  if (!VOICES.some((v) => v.id === input.voice)) {
    throw new ValidationError("Invalid voice");
  }

  const targetSeconds = estimateDurationSeconds(script);
  const credits = Math.max(1, creditsForDuration(targetSeconds));

  // Kredi düşme + iş kaydı tek transaction (2a). Enqueue bunun DIŞINDA:
  // Redis düşerse iade + failed işaretleme yapılır; kredi asla havada kalmaz.
  const { jobId } = await spendCreditsForJob(db, userId, {
    subject,
    script,
    terms,
    aspect: input.aspect,
    voice: input.voice,
    targetSeconds,
    credits,
  });

  try {
    await enqueueJob(redis, jobId, {
      video_subject: subject,
      video_script: script,
      video_terms: terms,
      video_aspect: input.aspect,
      voice_name: input.voice,
      subtitle_enabled: true,
    });
  } catch (e) {
    await db
      .update(videoJobs)
      .set({
        status: "failed",
        error: "Could not queue the job. Your credits have been refunded.",
        updatedAt: new Date(),
      })
      .where(eq(videoJobs.id, jobId));
    await refundJob(db, jobId);
    throw e;
  }
  return { jobId, credits };
}
