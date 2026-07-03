"use client";

import { useEffect, useState } from "react";

type JobEvent = {
  status: string;
  progress: number;
  stage: string;
  error: string | null;
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
      <div className="rounded-xl border border-red-900 p-6">
        <p className="font-medium text-red-400">Generation failed</p>
        <p className="mt-1 text-sm text-zinc-400">
          {event.error ?? "Something went wrong. Your credits have been refunded."}
        </p>
      </div>
    );
  }
  if (event.status === "done") {
    return (
      <div className="space-y-4">
        <video
          src={`/api/videos/${jobId}`}
          controls
          className="max-h-[70vh] rounded-xl border border-zinc-800"
        />
        <a
          href={`/api/videos/${jobId}?download=1`}
          className="inline-block rounded-lg bg-white px-6 py-2 font-medium text-black hover:bg-zinc-200"
        >
          Download video
        </a>
      </div>
    );
  }
  return (
    <div className="max-w-md rounded-xl border border-zinc-800 p-6">
      <p className="mb-3 font-medium">{event.stage}…</p>
      <div className="h-2 w-full overflow-hidden rounded bg-zinc-800">
        <div
          className="h-full bg-white transition-all"
          style={{ width: `${Math.max(3, event.progress)}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-zinc-400">
        {event.progress}% — you can close this page; the video keeps rendering.
      </p>
    </div>
  );
}
