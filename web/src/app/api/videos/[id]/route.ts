import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { videoJobs } from "@/db/schema";
import { presignedGetUrl, storageBackend } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const [job] = await db.select().from(videoJobs).where(eq(videoJobs.id, id));
  if (!job || job.userId !== userId) return new Response("Not found", { status: 404 });
  if (job.status !== "done" || !job.outputPath) {
    return new Response("Video not ready", { status: 409 });
  }

  const download = new URL(request.url).searchParams.get("download") === "1";

  if (storageBackend() === "s3") {
    const url = await presignedGetUrl(job.outputPath, {
      download,
      filename: `reelate-${id}.mp4`,
    });
    return Response.redirect(url, 307);
  }

  const storageRoot = process.env.STORAGE_ROOT;
  if (!storageRoot) return new Response("Storage not configured", { status: 500 });
  const filePath = path.resolve(storageRoot, job.outputPath);
  if (!filePath.startsWith(path.resolve(storageRoot) + path.sep)) {
    return new Response("Not found", { status: 404 });
  }
  if (!existsSync(filePath)) return new Response("Not found", { status: 404 });

  const { size } = statSync(filePath);
  const headers: Record<string, string> = {
    "Content-Type": "video/mp4",
    "Content-Length": String(size),
  };
  if (download) {
    headers["Content-Disposition"] = `attachment; filename="reelate-${id}.mp4"`;
  }
  const nodeStream = createReadStream(filePath);
  return new Response(Readable.toWeb(nodeStream) as ReadableStream, { headers });
}
