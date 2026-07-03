import type Redis from "ioredis";
import type { Db } from "@/db";
import { eq } from "drizzle-orm";
import { videoJobs } from "@/db/schema";
import { refundJob, spendCreditsForJob } from "@/lib/credits/ledger";
import { creditsForDuration } from "@/lib/credits/pricing";
import { ASPECTS, MAX_SCRIPT_WORDS, VOICES } from "./options";
import { enqueueJob } from "./queue";
import {
  DEFAULT_CAPTION_STYLE,
  engineSubtitleParams,
  sanitizeScenes,
  type Scene,
} from "./scenes";

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
  input: {
    subject: string;
    script: string;
    terms: string[];
    scenes?: unknown;
    aspect: string;
    voice: string;
    targetSeconds: number;
  },
): Promise<{ jobId: string; credits: number }> {
  const subject = input.subject.trim().slice(0, 300);
  const scenes: Scene[] = sanitizeScenes(input.scenes);
  // Sahneler varsa script her zaman voiceover'lardan türetilir (tutarlılık).
  const script =
    scenes.length > 0
      ? scenes.map((s) => s.voiceover).join(" ").trim()
      : input.script.trim();
  const terms = (input.terms ?? [])
    .map((t) => String(t).slice(0, 100))
    .filter(Boolean)
    .slice(0, 8);
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

  // Kredi ve süre otoritesi kullanıcının seçtiği hedef uzunluktur (wizard ile
  // birebir tutarlı). Geçersiz/eksik değer 60s'e düşer.
  const allowedTargets = [30, 60, 90, 180];
  const targetSeconds = allowedTargets.includes(Number(input.targetSeconds))
    ? Number(input.targetSeconds)
    : 60;
  const credits = Math.max(1, creditsForDuration(targetSeconds));

  // Kredi düşme + iş kaydı tek transaction (2a). Enqueue bunun DIŞINDA:
  // Redis düşerse iade + failed işaretleme yapılır; kredi asla havada kalmaz.
  const captionStyle = scenes.length > 0 ? DEFAULT_CAPTION_STYLE : null;
  const { jobId } = await spendCreditsForJob(db, userId, {
    subject,
    script,
    terms,
    scenes: scenes.length > 0 ? scenes : null,
    captionStyle,
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
      ...(scenes.length > 0
        ? {
            scenes: scenes.map((s) => ({
              caption: s.caption,
              voiceover: s.voiceover,
            })),
            // Stok klipleri senaryo anlatı sırasına eşle: motor bu bayrağı
            // sıralı terim üretimi + round-robin indirme + sequential concat
            // olarak yorumlar, böylece alakasız/rastgele klipler engellenir.
            match_materials_to_script: true,
            ...engineSubtitleParams(captionStyle ?? DEFAULT_CAPTION_STYLE),
          }
        : {}),
    });
  } catch (e) {
    // Önce iade, sonra terminal işaret (status.ts ile aynı ders): iade geçici
    // olarak başarısız olursa iş non-terminal kalır ve reconciliation/sync
    // yeniden deneyebilir; kredi asla terminal-failed arkasında kaybolmaz.
    await refundJob(db, jobId);
    await db
      .update(videoJobs)
      .set({
        status: "failed",
        error: "Could not queue the job. Your credits have been refunded.",
        updatedAt: new Date(),
      })
      .where(eq(videoJobs.id, jobId));
    throw e;
  }
  return { jobId, credits };
}
