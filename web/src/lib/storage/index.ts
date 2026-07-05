import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export function storageBackend(): "s3" | "local" {
  return (process.env.STORAGE_BACKEND ?? "").trim().toLowerCase() === "s3"
    ? "s3"
    : "local";
}

let _client: S3Client | null = null;
function client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? "",
        secretAccessKey: process.env.S3_SECRET_KEY ?? "",
      },
    });
  }
  return _client;
}

function bucket(): string {
  const b = process.env.S3_BUCKET;
  if (!b) throw new Error("S3_BUCKET is not configured");
  return b;
}

export async function presignedGetUrl(
  key: string,
  opts: { download?: boolean; filename?: string; ttl?: number } = {},
): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
    ...(opts.download && {
      ResponseContentDisposition: `attachment; filename="${opts.filename ?? "video.mp4"}"`,
    }),
  });
  return getSignedUrl(client(), cmd, { expiresIn: opts.ttl ?? 900 });
}

export async function deleteTaskPrefix(taskId: string): Promise<void> {
  const prefix = `tasks/${taskId}/`;
  const listed = await client().send(
    new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix }),
  );
  const objects = (listed.Contents ?? []).map((o) => ({ Key: o.Key! }));
  if (objects.length === 0) return;
  await client().send(
    new DeleteObjectsCommand({
      Bucket: bucket(),
      Delete: { Objects: objects },
    }),
  );
}
