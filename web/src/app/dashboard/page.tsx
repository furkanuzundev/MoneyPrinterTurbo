import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { videoJobs } from "@/db/schema";
import { getBalance, grantWelcomeBonus } from "@/lib/credits/ledger";
import { Card, CaptionChip, buttonClasses } from "@/components/ui";
import { JobRow } from "@/components/job-row";

const IN_PROGRESS_STATUSES = ["queued", "script", "downloading", "rendering"] as const;

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/signin");
  await grantWelcomeBonus(db, userId); // idempotent: kayıt anında verilememişse telafi
  const balance = await getBalance(db, userId);

  const [doneJobs, inProgressJobs, recentJobs] = await Promise.all([
    db
      .select()
      .from(videoJobs)
      .where(and(eq(videoJobs.userId, userId), eq(videoJobs.status, "done"))),
    db
      .select()
      .from(videoJobs)
      .where(
        and(
          eq(videoJobs.userId, userId),
          inArray(videoJobs.status, [...IN_PROGRESS_STATUSES]),
        ),
      ),
    db
      .select()
      .from(videoJobs)
      .where(eq(videoJobs.userId, userId))
      .orderBy(desc(videoJobs.createdAt))
      .limit(5),
  ]);

  const videosCreated = doneJobs.length;
  const inProgressCount = inProgressJobs.length;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-bone">
          Home
        </h1>
        <a href="/dashboard/create" className={buttonClasses("primary")}>
          Create a video
        </a>
      </div>

      <Card className="mb-8 border-0">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs text-muted">Credits</div>
            <div className="font-mono-data text-6xl text-bone">{balance}</div>
            {balance === 0 && (
              <a href="/dashboard/buy" className="mt-2 inline-block hover:brightness-110">
                <CaptionChip>Buy credits</CaptionChip>
              </a>
            )}
          </div>
          <div className="flex gap-8">
            <div className="flex flex-col gap-1">
              <span className="font-mono-data text-2xl text-bone">{videosCreated}</span>
              <span className="text-xs text-muted">Videos created</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-mono-data text-2xl text-bone">{inProgressCount}</span>
              <span className="text-xs text-muted">In progress</span>
            </div>
          </div>
        </div>
      </Card>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-bone">Recent videos</h2>
      </div>

      {recentJobs.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 border-0 py-16 text-center">
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
          <a href="/dashboard/create" className={buttonClasses("primary")}>
            Create your first video
          </a>
        </Card>
      ) : (
        <div className="space-y-3">
          {recentJobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
          <div className="pt-2">
            <Link
              href="/dashboard/library"
              className="text-sm text-muted hover:text-bone"
            >
              View all &rarr;
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
