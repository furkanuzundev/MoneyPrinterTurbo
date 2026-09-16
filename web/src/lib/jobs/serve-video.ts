import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { presignedGetUrl, storageBackend } from "@/lib/storage";

// Yetki kontrolü çağıranda: kullanıcı route'u sahipliği, admin route'u admin
// oturumunu doğrular. Burası yalnızca bitmiş videoyu sunar.
export async function serveJobVideo(
  request: Request,
  job: { id: string; status: string; outputPath: string | null },
): Promise<Response> {
  if (job.status !== "done" || !job.outputPath) {
    return new Response("Video not ready", { status: 409 });
  }

  const download = new URL(request.url).searchParams.get("download") === "1";

  if (storageBackend() === "s3") {
    const url = await presignedGetUrl(job.outputPath, {
      download,
      filename: `reelate-${job.id}.mp4`,
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
    headers["Content-Disposition"] = `attachment; filename="reelate-${job.id}.mp4"`;
  }
  const nodeStream = createReadStream(filePath);
  return new Response(Readable.toWeb(nodeStream) as ReadableStream, { headers });
}
