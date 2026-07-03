import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { videoJobs } from "@/db/schema";
import { getRedis } from "@/lib/jobs/queue";
import { syncJobStatus } from "@/lib/jobs/status";
import { CaptionChip } from "@/components/ui";

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  script: "Preparing",
  downloading: "Gathering footage",
  rendering: "Rendering",
  done: "Ready",
  failed: "Failed",
};

export default async function LibraryPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/signin");

  const jobs = await db
    .select()
    .from(videoJobs)
    .where(eq(videoJobs.userId, userId))
    .orderBy(desc(videoJobs.createdAt));

  // Aktif işleri Redis'ten tazele (sync-on-read; terminal olanlara dokunmaz)
  const redis = getRedis();
  const refreshed = await Promise.all(
    jobs.map(async (job) =>
      job.status === "done" || job.status === "failed"
        ? job
        : ((await syncJobStatus(db, redis, job.id))?.job ?? job),
    ),
  );

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-bold tracking-[-0.02em] text-bone">
        Library
      </h1>
      {refreshed.length === 0 ? (
        <p className="text-muted">
          No videos yet.{" "}
          <Link href="/dashboard/create" className="text-bone underline">
            Create your first one
          </Link>
          .
        </p>
      ) : (
        <div className="max-w-3xl space-y-3">
          {refreshed.map((job) => (
            <Link
              key={job.id}
              href={`/dashboard/jobs/${job.id}`}
              className="flex items-center justify-between rounded-xl border border-line px-5 py-4 hover:border-muted"
            >
              <div>
                <div className="font-medium text-bone">{job.subject}</div>
                <div className="text-sm text-muted">
                  {job.targetSeconds}s · {job.aspect} · {job.credits} credits ·{" "}
                  {job.createdAt.toISOString().slice(0, 10)}
                </div>
              </div>
              {job.status === "done" ? (
                <CaptionChip>{STATUS_LABELS[job.status]}</CaptionChip>
              ) : job.status === "failed" ? (
                <span className="text-red-400">
                  {STATUS_LABELS[job.status] ?? job.status}
                </span>
              ) : (
                <span className="text-muted">
                  {STATUS_LABELS[job.status] ?? job.status}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
