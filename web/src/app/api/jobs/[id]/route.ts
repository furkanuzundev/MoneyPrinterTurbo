import { rm } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { videoJobs } from "@/db/schema";
import { enqueueSentinelKey, getRedis } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";

// Yalnız terminal işler silinir; ledger satırları denetim için kalır.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [job] = await db.select().from(videoJobs).where(eq(videoJobs.id, id));
  if (!job || job.userId !== userId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (job.status !== "done" && job.status !== "failed") {
    return Response.json(
      { error: "Job is still processing" },
      { status: 409 },
    );
  }

  const storageRoot = process.env.STORAGE_ROOT;
  if (storageRoot) {
    const taskDir = path.resolve(storageRoot, "tasks", id);
    if (taskDir.startsWith(path.resolve(storageRoot) + path.sep)) {
      await rm(taskDir, { recursive: true, force: true });
    }
  }

  await db.delete(videoJobs).where(eq(videoJobs.id, id));

  try {
    const redis = getRedis();
    await redis.del(id, enqueueSentinelKey(id));
  } catch {
    // Redis erişilemezse anahtarlar TTL/enkaz olarak kalır; silme yine başarılı.
  }

  return Response.json({ ok: true });
}
