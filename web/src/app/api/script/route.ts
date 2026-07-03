import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getRedis } from "@/lib/jobs/queue";
import { generateScenesAndTerms } from "@/lib/script/generate";

const HOURLY_LIMIT = 20;

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const redis = getRedis();
  const hour = Math.floor(Date.now() / 3_600_000);
  const rateKey = `reelate:ratelimit:script:${userId}:${hour}`;
  try {
    const count = await redis.incr(rateKey);
    if (count === 1) await redis.expire(rateKey, 3600);
    if (count > HOURLY_LIMIT) {
      return NextResponse.json(
        { error: "Too many script requests. Please try again later." },
        { status: 429 },
      );
    }
  } catch (e) {
    // Redis yoksa limit doğrulanamaz: fail-closed (maliyet sızdırma yerine 503).
    console.error("script rate limiter unavailable", e);
    return NextResponse.json(
      { error: "Script generation is temporarily unavailable" },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const subject = String(body.subject ?? "").trim().slice(0, 300);
  const language = ["en", "tr"].includes(body.language) ? body.language : "en";
  const targetSeconds = [30, 60, 90, 180].includes(Number(body.targetSeconds))
    ? Number(body.targetSeconds)
    : 60;
  if (!subject) return NextResponse.json({ error: "Subject is required" }, { status: 400 });

  try {
    const result = await generateScenesAndTerms(subject, language, targetSeconds);
    return NextResponse.json(result);
  } catch (e) {
    console.error("script generation failed", e);
    return NextResponse.json(
      { error: "Script generation is temporarily unavailable" },
      { status: 502 },
    );
  }
}
