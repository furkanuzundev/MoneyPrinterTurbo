import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { videoJobs } from "@/db/schema";
import { JobProgress } from "./progress";

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
  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-bold tracking-[-0.02em] text-bone">
        {job.subject}
      </h1>
      <p className="mb-6 text-sm text-muted">
        {job.targetSeconds}s · {job.aspect} ·{" "}
        <span className="font-mono-data">{job.credits}</span> credits
      </p>
      <JobProgress jobId={job.id} initialStatus={job.status} />
    </div>
  );
}
