import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, videoJobs } from "@/db/schema";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminJobVideoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const [job] = await db
    .select({
      id: videoJobs.id,
      subject: videoJobs.subject,
      status: videoJobs.status,
      aspect: videoJobs.aspect,
      createdAt: videoJobs.createdAt,
      userId: videoJobs.userId,
      userEmail: users.email,
    })
    .from(videoJobs)
    .leftJoin(users, eq(videoJobs.userId, users.id))
    .where(eq(videoJobs.id, id));
  if (!job) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Link href="/jobs" className="text-sm text-muted-foreground hover:underline">
        ← Jobs
      </Link>
      <div>
        <h1 className="text-xl font-semibold">{job.subject}</h1>
        <p className="text-sm text-muted-foreground">
          <Link href={`/users/${job.userId}`} className="hover:underline">
            {job.userEmail ?? job.userId}
          </Link>{" "}
          · {job.createdAt.toISOString().replace("T", " ").slice(0, 16)} ·{" "}
          <Badge variant={job.status === "failed" ? "destructive" : "secondary"}>{job.status}</Badge>
        </p>
      </div>
      {job.status === "done" ? (
        <video
          src={`/videos/${job.id}`}
          controls
          preload="metadata"
          className={`rounded-lg border bg-black ${job.aspect === "16:9" ? "w-full max-w-3xl" : "max-h-[75vh] w-auto self-start"}`}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Video henüz hazır değil.</p>
      )}
    </div>
  );
}
