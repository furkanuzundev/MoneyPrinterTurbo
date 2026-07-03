import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { videoJobs } from "@/db/schema";
import { getBalance } from "@/lib/credits/ledger";
import { formatDuration } from "@/lib/jobs/display";
import { JobLive } from "@/components/dashboard/job-live";

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/signin");
  const { id } = await params;
  const [job] = await db.select().from(videoJobs).where(eq(videoJobs.id, id));
  if (!job || job.userId !== userId) notFound();
  const balance = await getBalance(db, userId);

  return (
    <div className="mx-auto max-w-4xl">
      {job.status !== "done" && (
        <div className="mb-2">
          <h1 className="mb-1 font-display text-2xl font-extrabold tracking-[-0.02em] text-bone">
            {job.subject}
          </h1>
          <p className="text-sm text-muted">
            {job.targetSeconds}s &middot; {job.aspect} &middot;{" "}
            <span className="font-mono-data">{job.credits}</span> credits
          </p>
        </div>
      )}
      <JobLive
        jobId={job.id}
        title={job.subject}
        aspect={job.aspect}
        duration={formatDuration(job.targetSeconds)}
        initialStatus={job.status}
        creditsLeft={balance}
      />
    </div>
  );
}
