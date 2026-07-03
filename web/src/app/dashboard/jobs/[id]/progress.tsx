"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

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
      <Card className="border-0 px-6">
        <p className="font-medium text-destructive">Generation failed</p>
        <p className="mt-1 text-sm text-muted">
          {event.error ?? "Something went wrong. Your credits have been refunded."}
        </p>
      </Card>
    );
  }
  if (event.status === "done") {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="w-full max-w-xs overflow-hidden rounded-xl bg-panel p-2">
          <video
            src={`/api/videos/${jobId}`}
            controls
            className="aspect-[9/16] w-full rounded-lg bg-ink object-cover"
          />
        </div>
        <Button asChild>
          <a href={`/api/videos/${jobId}?download=1`}>Download video</a>
        </Button>
      </div>
    );
  }
  return (
    <Card className="mx-auto max-w-md border-0 px-6">
      {event.status === "queued" && event.etaSeconds != null && (
        <p className="mb-2 text-sm text-muted">
          Waiting in queue — about {Math.max(1, Math.round(event.etaSeconds / 60))} min
        </p>
      )}
      <div className="mb-3 flex items-baseline justify-between">
        <p className="font-display text-xl font-bold text-bone">{event.stage}…</p>
        <span className="font-mono-data text-sm text-muted">{event.progress}%</span>
      </div>
      <Progress value={Math.max(3, event.progress)} />
      <p className="mt-2 text-sm text-muted">
        you can close this page; the video keeps rendering.
      </p>
    </Card>
  );
}
