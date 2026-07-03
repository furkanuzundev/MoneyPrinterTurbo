import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { videoJobs } from "@/db/schema";
import { getRedis } from "@/lib/jobs/queue";
import { syncJobStatus } from "@/lib/jobs/status";
import { JobRow } from "@/components/job-row";

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
        <div className="flex flex-col items-center gap-4 rounded-xl bg-panel px-6 py-16 text-center">
          <svg width="64" height="114" viewBox="0 0 64 114" fill="none" aria-hidden="true">
            <rect
              x="1.5"
              y="1.5"
              width="61"
              height="111"
              rx="10"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-line"
            />
          </svg>
          <div>
            <p className="font-display font-bold text-bone">No videos yet</p>
            <p className="mt-1 text-sm text-muted">
              Your generated videos will show up here.
            </p>
          </div>
          <Link
            href="/dashboard/create"
            className="text-sm text-bone underline hover:text-caption"
          >
            Create your first video
          </Link>
        </div>
      ) : (
        <div className="max-w-3xl space-y-3">
          {refreshed.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
