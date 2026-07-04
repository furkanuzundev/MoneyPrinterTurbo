import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { InsufficientCreditsError } from "@/lib/credits/ledger";
import { createVideoJob, ValidationError } from "@/lib/jobs/create";
import { getRedis } from "@/lib/jobs/queue";

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    const result = await createVideoJob(db, getRedis(), userId, {
      subject: String(body.subject ?? ""),
      script: String(body.script ?? ""),
      terms: Array.isArray(body.terms) ? body.terms : [],
      scenes: body.scenes,
      aspect: String(body.aspect ?? ""),
      voice: String(body.voice ?? ""),
      targetSeconds: Number(body.targetSeconds ?? 60),
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { error: "Not enough credits", code: "INSUFFICIENT_CREDITS" },
        { status: 402 },
      );
    }
    console.error("job creation failed", e);
    return NextResponse.json(
      { error: "Could not start the job. Any spent credits were refunded." },
      { status: 503 },
    );
  }
}
