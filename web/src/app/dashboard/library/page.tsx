import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { videoJobs } from "@/db/schema";
import { getRedis } from "@/lib/jobs/queue";
import { syncJobStatus } from "@/lib/jobs/status";

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
      <h1 className="mb-6 text-2xl font-semibold">Library</h1>
      {refreshed.length === 0 ? (
        <p className="text-zinc-400">
          No videos yet.{" "}
          <Link href="/dashboard/create" className="underline">
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
              className="flex items-center justify-between rounded-xl border border-zinc-800 px-5 py-4 hover:border-zinc-600"
            >
              <div>
                <div className="font-medium">{job.subject}</div>
                <div className="text-sm text-zinc-400">
                  {job.targetSeconds}s · {job.aspect} · {job.credits} credits ·{" "}
                  {job.createdAt.toISOString().slice(0, 10)}
                </div>
              </div>
              <span
                className={
                  job.status === "done"
                    ? "text-green-400"
                    : job.status === "failed"
                      ? "text-red-400"
                      : "text-zinc-400"
                }
              >
                {STATUS_LABELS[job.status] ?? job.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
