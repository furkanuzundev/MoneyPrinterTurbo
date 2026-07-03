import type { VideoJobRow } from "@/lib/jobs/status";
import type { VideoCardData } from "@/components/dashboard/video-grid";

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function relativeTime(date: Date, now = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function toVideoCardData(job: VideoJobRow): VideoCardData {
  return {
    id: job.id,
    title: job.subject,
    status:
      job.status === "done"
        ? "ready"
        : job.status === "failed"
          ? "failed"
          : "processing",
    aspect: job.aspect,
    duration: formatDuration(job.targetSeconds),
    when: relativeTime(job.createdAt),
    hasScenes: (job.scenes?.length ?? 0) > 0,
  };
}
