import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { videoJobs } from "@/db/schema";
import { getRedis } from "@/lib/jobs/queue";
import { stageForProgress, syncJobStatus } from "@/lib/jobs/status";

export const dynamic = "force-dynamic";

const POLL_MS = 2000;
const MAX_LIFETIME_MS = 15 * 60 * 1000;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const [job] = await db.select().from(videoJobs).where(eq(videoJobs.id, id));
  if (!job || job.userId !== userId) return new Response("Not found", { status: 404 });

  const redis = getRedis();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const startedAt = Date.now();
      const send = (payload: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      try {
        while (Date.now() - startedAt < MAX_LIFETIME_MS) {
          const result = await syncJobStatus(db, redis, id);
          if (!result) break;
          send({
            status: result.job.status,
            progress: result.progress,
            stage: stageForProgress(result.progress),
            error: result.job.error,
          });
          if (result.job.status === "done" || result.job.status === "failed") break;
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
      } catch (e) {
        console.error("sse stream error", e);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
