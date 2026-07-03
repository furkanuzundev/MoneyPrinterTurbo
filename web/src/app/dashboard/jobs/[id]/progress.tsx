"use client";

import { useEffect, useState } from "react";
import { Card, buttonClasses } from "@/components/ui";

type JobEvent = {
  status: string;
  progress: number;
  stage: string;
  error: string | null;
  queueDepth?: number;
  etaSeconds?: number;
};

export function JobProgress({ jobId, initialStatus }: { jobId: string; initialStatus: string }) {
  const [event, setEvent] = useState<JobEvent>({
    status: initialStatus,
    progress: initialStatus === "done" ? 100 : 0,
    stage: "Preparing",
    error: null,
  });

  useEffect(() => {
    if (initialStatus === "done" || initialStatus === "failed") return;
    const source = new EventSource(`/api/jobs/${jobId}/events`);
    source.onmessage = (message) => {
      const data: JobEvent = JSON.parse(message.data);
      setEvent(data);
      if (data.status === "done" || data.status === "failed") source.close();
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, [jobId, initialStatus]);

  if (event.status === "failed") {
    return (
      <Card className="border-red-900">
        <p className="font-medium text-red-400">Generation failed</p>
        <p className="mt-1 text-sm text-muted">
          {event.error ?? "Something went wrong. Your credits have been refunded."}
        </p>
      </Card>
    );
  }
  if (event.status === "done") {
    return (
      <div className="space-y-4">
        <video
          src={`/api/videos/${jobId}`}
          controls
          className="max-h-[70vh] rounded-xl border border-line"
        />
        <a
          href={`/api/videos/${jobId}?download=1`}
          className={buttonClasses("primary", "inline-block")}
        >
          Download video
        </a>
      </div>
    );
  }
  return (
    <Card className="max-w-md">
      {event.status === "queued" && event.etaSeconds != null && (
        <p className="mb-2 text-sm text-muted">
          Waiting in queue — about {Math.max(1, Math.round(event.etaSeconds / 60))} min
        </p>
      )}
      <p className="mb-3 font-display font-bold text-bone">{event.stage}…</p>
      <div className="h-2 w-full overflow-hidden rounded bg-line">
        <div
          className="h-full bg-caption transition-all"
          style={{ width: `${Math.max(3, event.progress)}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-muted">
        <span className="font-mono-data">{event.progress}%</span> — you can
        close this page; the video keeps rendering.
      </p>
    </Card>
  );
}
