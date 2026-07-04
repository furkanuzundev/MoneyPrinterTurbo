import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getRedis } from "@/lib/jobs/queue";

const HOURLY_LIMIT = 60;
const BACKEND_URL = process.env.PYTHON_API_URL ?? "http://localhost:8080";

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const redis = getRedis();
  const hour = Math.floor(Date.now() / 3_600_000);
  const rateKey = `reelate:ratelimit:voicepreview:${userId}:${hour}`;
  try {
    const count = await redis.incr(rateKey);
    if (count === 1) await redis.expire(rateKey, 3600);
    if (count > HOURLY_LIMIT) {
      return NextResponse.json(
        { error: "Too many previews. Please try again later." },
        { status: 429 },
      );
    }
  } catch (e) {
    console.error("voice preview rate limiter unavailable", e);
    // Önizleme kritik değil: limiter yoksa devam et.
  }

  const body = await request.json().catch(() => ({}));
  const voiceName = String(body.voiceName ?? "").trim();
  if (!voiceName) {
    return NextResponse.json({ error: "voiceName is required" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND_URL}/api/v1/voice/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice_name: voiceName }),
    });
  } catch (e) {
    console.error("voice preview backend unreachable", e);
    return NextResponse.json(
      { error: "Preview is temporarily unavailable" },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: "Preview failed" }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
