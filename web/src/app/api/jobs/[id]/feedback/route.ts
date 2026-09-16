import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { videoJobs } from "@/db/schema";
import { parseFeedbackInput } from "@/lib/feedback/rating";
import { getFeedback, upsertFeedback } from "@/lib/feedback/store";

export const dynamic = "force-dynamic";

async function ownedJob(id: string) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const [job] = await db.select().from(videoJobs).where(eq(videoJobs.id, id));
  if (!job || job.userId !== userId) {
    return { error: Response.json({ error: "Not found" }, { status: 404 }) };
  }
  return { job };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { job, error } = await ownedJob(id);
  if (error) return error;
  return Response.json({ feedback: await getFeedback(db, job.id) });
}

// Video başına tek puan; aynı istek tekrar edilirse satır güncellenir.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { job, error } = await ownedJob(id);
  if (error) return error;
  if (job.status !== "done") {
    return Response.json(
      { error: "Only finished videos can be rated" },
      { status: 409 },
    );
  }

  const parsed = parseFeedbackInput(await request.json().catch(() => null));
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const feedback = await upsertFeedback(db, job, parsed.value);
  return Response.json({ feedback });
}
