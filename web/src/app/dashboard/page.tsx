import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { videoJobs } from "@/db/schema";
import { getBalance, grantWelcomeBonus } from "@/lib/credits/ledger";
import { toVideoCardData } from "@/lib/jobs/display";
import { VideoGrid } from "@/components/dashboard/video-grid";
import { EmptyState } from "@/components/dashboard/empty-state";

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
      .limit(4),
  ]);

  const firstName = (session?.user?.name ?? "").split(" ")[0];

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="mb-2 font-display text-3xl font-extrabold tracking-[-0.02em] text-bone lg:text-[38px]">
            Welcome back{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-base text-muted">
            You have{" "}
            <span className="font-bold text-caption">{balance} credits</span>{" "}
            ready &mdash; that&apos;s about {balance} more shorts.
          </p>
        </div>
        <Link
          href="/dashboard/create"
          className="whitespace-nowrap rounded-xl bg-caption px-[22px] py-[13px] text-center text-[15px] font-bold text-caption-ink transition-opacity hover:opacity-90"
        >
          ＋ Create a video
        </Link>
      </div>

      <div className="mb-11 grid gap-[18px] sm:grid-cols-3">
        <div className="rounded-[18px] border border-caption/25 bg-gradient-to-br from-[#241F12] to-[#16130B] p-6">
          <div className="mb-3.5 font-mono-data text-[11.5px] uppercase tracking-[0.08em] text-caption-dim">
            Credits left
          </div>
          <div className="font-display text-[46px] font-extrabold leading-none text-caption">
            {balance}
          </div>
          <div className="mt-2 text-[13.5px] text-muted">
            &asymp; {balance} short videos
          </div>
        </div>
        <div className="rounded-[18px] border border-white/5 bg-panel p-6">
          <div className="mb-3.5 font-mono-data text-[11.5px] uppercase tracking-[0.08em] text-muted/70">
            Videos created
          </div>
          <div className="font-display text-[46px] font-extrabold leading-none text-bone">
            {doneJobs.length}
          </div>
          <div className="mt-2 text-[13.5px] text-muted">
            {doneJobs.length} ready to post
          </div>
        </div>
        <div className="rounded-[18px] border border-white/5 bg-panel p-6">
          <div className="mb-3.5 font-mono-data text-[11.5px] uppercase tracking-[0.08em] text-muted/70">
            In progress
          </div>
          <div className="font-display text-[46px] font-extrabold leading-none text-bone">
            {inProgressJobs.length}
          </div>
          <div className="mt-2 text-[13.5px] text-muted">rendering now</div>
        </div>
      </div>

      {recentJobs.length === 0 ? (
        <EmptyState
          title="Make your first short"
          message="Type a topic and Reelate writes, voices and captions a ready-to-post video in about five minutes."
          cta="＋ Create your first video"
          note={`You have ${balance} free credits to start`}
        />
      ) : (
        <>
          <div className="mb-[18px] flex items-center justify-between">
            <h2 className="font-display text-[22px] font-bold text-bone">
              Recent videos
            </h2>
            <Link
              href="/dashboard/library"
              className="text-sm font-semibold text-caption-dim transition-colors hover:text-caption"
            >
              View library &rarr;
            </Link>
          </div>
          <VideoGrid videos={recentJobs.map(toVideoCardData)} />
        </>
      )}
    </div>
  );
}
