import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { DURATION_OPTIONS, LANGUAGES } from "@/lib/jobs/options";
import { getRedis } from "@/lib/jobs/queue";
import { refineSubject } from "@/lib/script/subject";

// Script üretiminden ucuz ve daha sık basılan bir uç; kendi kovasında.
const HOURLY_LIMIT = 30;
const MIN_CHARS = 3;
const MAX_INPUT_CHARS = 500;

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const redis = getRedis();
  const hour = Math.floor(Date.now() / 3_600_000);
  const rateKey = `reelate:ratelimit:subject:${userId}:${hour}`;
  try {
    const count = await redis.incr(rateKey);
    if (count === 1) await redis.expire(rateKey, 3600);
    if (count > HOURLY_LIMIT) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      );
    }
  } catch (e) {
    // Redis yoksa limit doğrulanamaz: fail-closed (maliyet sızdırma yerine 503).
    console.error("subject rate limiter unavailable", e);
    return NextResponse.json(
      { error: "AI polish is temporarily unavailable" },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const subject = String(body.subject ?? "").trim().slice(0, MAX_INPUT_CHARS);
  const language = LANGUAGES.some((l) => l.code === body.language)
    ? String(body.language)
    : "en-US";
  const targetSeconds = (DURATION_OPTIONS as readonly number[]).includes(
    Number(body.targetSeconds),
  )
    ? Number(body.targetSeconds)
    : 60;
  if (subject.length < MIN_CHARS) {
    return NextResponse.json(
      { error: "Write a few words first" },
      { status: 400 },
    );
  }

  try {
    const refined = await refineSubject(subject, language, targetSeconds);
    return NextResponse.json({ subject: refined });
  } catch (e) {
    console.error("subject refinement failed", e);
    return NextResponse.json(
      { error: "AI polish is temporarily unavailable" },
      { status: 502 },
    );
  }
}
