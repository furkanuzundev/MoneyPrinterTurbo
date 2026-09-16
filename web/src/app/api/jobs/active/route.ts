import { and, eq, notInArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { videoJobs } from "@/db/schema";
import { getRedis } from "@/lib/jobs/queue";
import { syncJobStatus } from "@/lib/jobs/status";

export const dynamic = "force-dynamic";

// Kütüphane, terminal olmayan işlerini bu uçtan yoklar: kart başına SSE açmak
// yerine tek istek, çünkü tarayıcı alan başına ~6 eşzamanlı bağlantıda tıkanır.
// Tekil iş sayfası canlı akış için /api/jobs/[id]/events kullanmayı sürdürüyor.
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(videoJobs)
    .where(
      and(
        eq(videoJobs.userId, userId),
        notInArray(videoJobs.status, ["done", "failed"]),
      ),
    );
  if (rows.length === 0) return Response.json({ jobs: [] });

  const redis = getRedis();
  const synced = await Promise.all(
    rows.map(async (row) => {
      const result = await syncJobStatus(db, redis, row.id);
      if (!result) return null; // arada silinmiş olabilir
      return {
        id: row.id,
        status: result.job.status,
        progress: result.progress,
      };
    }),
  );
  return Response.json({ jobs: synced.filter((j) => j !== null) });
}
