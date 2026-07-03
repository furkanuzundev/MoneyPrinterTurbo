import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { videoJobs } from "@/db/schema";
import { enqueueRerender, getRedis } from "@/lib/jobs/queue";
import {
  engineSubtitleParams,
  sanitizeCaptionStyle,
  sanitizeScenes,
  scriptFromScenes,
} from "@/lib/jobs/scenes";

const HOURLY_LIMIT = 10;

// Ücretsiz altyazı-yalnız yeniden render (kullanıcı kararı): kredi HARCANMAZ.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const redis = getRedis();
  const hour = Math.floor(Date.now() / 3_600_000);
  const rateKey = `reelate:ratelimit:rerender:${userId}:${hour}`;
  try {
    const count = await redis.incr(rateKey);
    if (count === 1) await redis.expire(rateKey, 3600);
    if (count > HOURLY_LIMIT) {
      return NextResponse.json(
        { error: "Too many re-renders. Please try again later." },
        { status: 429 },
      );
    }
  } catch (e) {
    // Redis yoksa limit doğrulanamaz: fail-closed.
    console.error("rerender rate limiter unavailable", e);
    return NextResponse.json(
      { error: "Re-rendering is temporarily unavailable" },
      { status: 503 },
    );
  }

  const { id } = await params;
  const [job] = await db.select().from(videoJobs).where(eq(videoJobs.id, id));
  if (!job || job.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (job.status !== "done") {
    return NextResponse.json(
      { error: "Only finished videos can be re-rendered" },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const scenes = sanitizeScenes(body.scenes);
  if (scenes.length === 0) {
    return NextResponse.json({ error: "Scenes are required" }, { status: 400 });
  }
  const captionStyle = sanitizeCaptionStyle(body.captionStyle);

  await db
    .update(videoJobs)
    .set({
      scenes,
      captionStyle,
      status: "rendering",
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(videoJobs.id, id));

  try {
    await enqueueRerender(redis, id, {
      video_subject: job.subject,
      video_script: scriptFromScenes(scenes),
      video_terms: job.terms,
      video_aspect: job.aspect,
      voice_name: job.voice,
      subtitle_enabled: true,
      scenes: scenes.map((s) => ({ caption: s.caption, voiceover: s.voiceover })),
      ...engineSubtitleParams(captionStyle),
    });
  } catch (e) {
    // Kuyruğa yazılamadı: iş done'a geri döner, eski video geçerli kalır.
    console.error("rerender enqueue failed", e);
    await db
      .update(videoJobs)
      .set({ status: "done", updatedAt: new Date() })
      .where(eq(videoJobs.id, id));
    return NextResponse.json(
      { error: "Could not queue the re-render. Your video is unchanged." },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, jobId: id });
}
