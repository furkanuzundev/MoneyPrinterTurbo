import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getRedis } from "@/lib/jobs/queue";
import { MailerNotConfiguredError, sendFeedbackMail } from "@/lib/feedback/mailer";
import { buildFeedbackEmail, parseFeedback } from "@/lib/feedback/message";

// Gelen kutusunu spam'den korur; gerçek bir kullanıcı saatte 5'i nadiren aşar.
const HOURLY_LIMIT = 5;
const UNAVAILABLE = "Feedback is temporarily unavailable. Please try again later.";

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = parseFeedback(await request.json().catch(() => ({})));
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const redis = getRedis();
  const hour = Math.floor(Date.now() / 3_600_000);
  const rateKey = `reelate:ratelimit:feedback:${userId}:${hour}`;
  try {
    const count = await redis.incr(rateKey);
    if (count === 1) await redis.expire(rateKey, 3600);
    if (count > HOURLY_LIMIT) {
      return NextResponse.json(
        { error: "You've sent a lot of feedback this hour. Please try again later." },
        { status: 429 },
      );
    }
  } catch (e) {
    console.error("feedback rate limiter unavailable", e);
    return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
  }

  const mail = buildFeedbackEmail({
    feedback: parsed.value,
    user: {
      id: userId,
      name: session.user?.name ?? "",
      email: session.user?.email ?? "",
    },
    to: process.env.FEEDBACK_TO?.trim() || "info@reelate.org",
    now: new Date(),
  });

  try {
    await sendFeedbackMail(mail);
  } catch (e) {
    if (e instanceof MailerNotConfiguredError) {
      console.error("feedback mailer not configured:", e.message);
      return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
    }
    console.error("feedback mail failed", e);
    return NextResponse.json({ error: UNAVAILABLE }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
