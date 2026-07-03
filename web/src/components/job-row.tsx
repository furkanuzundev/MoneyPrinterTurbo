import Link from "next/link";
import { Badge } from "@/components/ui/badge";

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  script: "Preparing",
  downloading: "Gathering footage",
  rendering: "Rendering",
  done: "Ready",
  failed: "Failed",
};

export interface JobRowData {
  id: string;
  subject: string;
  targetSeconds: number;
  aspect: string;
  credits: number;
  status: string;
  createdAt: Date;
}

export function JobRow({ job }: { job: JobRowData }) {
  return (
    <Link
      href={`/dashboard/jobs/${job.id}`}
      className="flex items-center justify-between gap-4 rounded-xl bg-panel px-5 py-4 transition-colors hover:bg-elevated"
    >
      <div className="min-w-0">
        <div className="truncate font-medium text-bone">{job.subject}</div>
        <div className="font-mono-data text-xs text-muted">
          {job.targetSeconds}s · {job.aspect} · {job.credits} cr ·{" "}
          {job.createdAt.toISOString().slice(0, 10)}
        </div>
      </div>
      {job.status === "done" ? (
        <Badge className="shrink-0">{STATUS_LABELS[job.status]}</Badge>
      ) : job.status === "failed" ? (
        <Badge variant="destructive" className="shrink-0">
          {STATUS_LABELS[job.status] ?? job.status}
        </Badge>
      ) : (
        <Badge variant="secondary" className="shrink-0 gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-caption opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-caption" />
          </span>
          {STATUS_LABELS[job.status] ?? job.status}
        </Badge>
      )}
    </Link>
  );
}
