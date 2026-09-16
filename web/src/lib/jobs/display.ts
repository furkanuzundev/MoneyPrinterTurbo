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

// Kütüphane kartındaki durum rozeti. İşlenen işlerde canlı yüzdeyi gösterir;
// worker işi henüz almadıysa (progress 0) yüzde yerine "Queued" yazar, yoksa
// kart sonsuza kadar "%0" gösteriyormuş gibi görünüyor.
export function badgeFor(
  status: VideoCardData["status"],
  progress: number | undefined,
): { label: string; cls: string } {
  if (status === "ready") {
    return { label: "Ready", cls: "bg-caption/90 text-caption-ink" };
  }
  if (status === "failed") {
    return { label: "Failed", cls: "bg-destructive/90 text-white" };
  }
  const pct = Math.min(100, Math.max(0, Math.round(progress ?? 0)));
  return {
    label: pct > 0 ? `${pct}%` : "Queued",
    cls: "bg-black/55 text-bone/90",
  };
}
