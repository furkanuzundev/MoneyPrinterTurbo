import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { videoJobs } from "@/db/schema";
import { DEFAULT_CAPTION_STYLE } from "@/lib/jobs/scenes";
import { CaptionEditor } from "./editor";

export default async function CaptionsPage({
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
  // Editör yalnız sahne verisi olan, bitmiş işlerde çalışır.
  if (job.status !== "done" || !job.scenes || job.scenes.length === 0) {
    redirect(`/dashboard/jobs/${id}`);
  }

  return (
    <CaptionEditor
      jobId={job.id}
      subject={job.subject}
      initialScenes={job.scenes!}
      initialStyle={job.captionStyle ?? DEFAULT_CAPTION_STYLE}
    />
  );
}
