import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { videoJobs } from "@/db/schema";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/admin/session";
import { serveJobVideo } from "@/lib/jobs/serve-video";

export const dynamic = "force-dynamic";

// admin.reelate.org/videos/<id> → middleware rewrite ile buraya gelir.
// Sahiplik kontrolü yok: admin herkesin videosunu izleyebilir.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Middleware'e ek olarak burada da doğrula (panel sayfalarıyla aynı kural).
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!(await verifySessionToken(token))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;
  const [job] = await db.select().from(videoJobs).where(eq(videoJobs.id, id));
  if (!job) return new Response("Not found", { status: 404 });
  return serveJobVideo(request, job);
}
