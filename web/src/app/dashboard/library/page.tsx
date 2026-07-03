import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { videoJobs } from "@/db/schema";
import { getRedis } from "@/lib/jobs/queue";
import { syncJobStatus } from "@/lib/jobs/status";
import { toVideoCardData } from "@/lib/jobs/display";
import { LibraryView } from "@/components/dashboard/library-view";
import { EmptyState } from "@/components/dashboard/empty-state";

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

  const readyCount = refreshed.filter((j) => j.status === "done").length;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="mb-1.5 font-display text-3xl font-extrabold tracking-[-0.02em] text-bone lg:text-[34px]">
            Library
          </h1>
          <p className="text-[15px] text-muted">
            {refreshed.length} videos &middot; {readyCount} ready to post
          </p>
        </div>
        <Link
          href="/dashboard/create"
          className="whitespace-nowrap rounded-[11px] bg-caption px-[18px] py-[11px] text-center text-sm font-bold text-caption-ink transition-opacity hover:opacity-90"
        >
          ＋ Create a video
        </Link>
      </div>

      {refreshed.length === 0 ? (
        <EmptyState
          title="No videos yet"
          message="Type a topic and Reelate writes, voices and captions a ready-to-post video in about five minutes."
          cta="＋ Create a video"
        />
      ) : (
        <LibraryView videos={refreshed.map(toVideoCardData)} />
      )}
    </div>
  );
}
