"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { RENDER_STAGES, stageIndexForProgress } from "@/lib/jobs/stages";
import { PostTo } from "./post-to";

type JobEvent = {
  status: string;
  progress: number;
  stage: string;
  error: string | null;
  queueDepth?: number;
  etaSeconds?: number;
};

export function JobLive({
  jobId,
  title,
  aspect,
  duration,
  initialStatus,
  creditsLeft,
  onDone,
}: {
  jobId: string;
  title: string;
  aspect: string;
  duration: string;
  initialStatus: string;
  creditsLeft?: number;
  onDone?: () => void;
}) {
  const [event, setEvent] = useState<JobEvent>({
    status: initialStatus,
    progress: initialStatus === "done" ? 100 : 0,
    stage: RENDER_STAGES[0],
    error: null,
  });
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (initialStatus === "done" || initialStatus === "failed") return;
    const source = new EventSource(`/api/jobs/${jobId}/events`);
    source.onmessage = (message) => {
      const data: JobEvent = JSON.parse(message.data);
      setEvent(data);
      if (data.status === "done" || data.status === "failed") {
        source.close();
        if (data.status === "done") onDoneRef.current?.();
      }
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, [jobId, initialStatus]);

  if (event.status === "failed") {
    return (
      <div className="mx-auto max-w-md rounded-[20px] border border-destructive/30 bg-panel p-7 text-center">
        <p className="mb-2 font-display text-xl font-bold text-destructive">
          Generation failed
        </p>
        <p className="text-sm text-muted">
          {event.error ??
            "Something went wrong. Your credits have been refunded."}
        </p>
      </div>
    );
  }

  if (event.status === "done") {
    return (
      <DoneView
        jobId={jobId}
        title={title}
        aspect={aspect}
        duration={duration}
        creditsLeft={creditsLeft}
      />
    );
  }

  const stageIndex = stageIndexForProgress(event.progress);

  return (
    <div className="flex flex-col items-center pb-10 pt-6 text-center">
      <div className="relative mb-[34px]">
        <div className="absolute -inset-[30px] bg-[radial-gradient(circle_at_50%_45%,rgba(244,198,58,0.16),transparent_65%)] blur-lg" />
        <div className="relative h-[392px] w-[220px] rounded-[28px] border border-white/10 bg-elevated p-2.5 shadow-[0_30px_70px_rgba(0,0,0,0.5)]">
          <div className="reShimmer relative h-full w-full overflow-hidden rounded-[20px]">
            <div className="absolute left-3 top-3 rounded-md bg-black/40 px-[7px] py-1 font-mono-data text-[9px] text-bone/90">
              ● RENDERING · {event.progress}%
            </div>
          </div>
        </div>
      </div>

      <h2 className="mb-1.5 font-display text-[26px] font-extrabold tracking-[-0.01em] text-bone">
        Building your short&hellip;
      </h2>
      <p className="mb-[26px] text-[14.5px] text-muted">
        {event.status === "queued" && event.etaSeconds != null
          ? `Waiting in queue — about ${Math.max(1, Math.round(event.etaSeconds / 60))} min. You can leave this page.`
          : "Usually done in a few minutes. You can leave this page."}
      </p>

      <div className="mb-[26px] h-2 w-[340px] max-w-full overflow-hidden rounded-md bg-white/10">
        <div
          className="h-full rounded-md bg-caption transition-[width] duration-300"
          style={{ width: `${Math.max(3, event.progress)}%` }}
        />
      </div>

      <div className="flex w-[300px] max-w-full flex-col items-start gap-3.5">
        {RENDER_STAGES.map((label, i) => {
          const done = i < stageIndex;
          const active = i === stageIndex;
          return (
            <div key={label} className="flex items-center gap-3">
              <span
                className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-xs font-bold text-caption-ink ${
                  done
                    ? "bg-caption"
                    : active
                      ? "border-2 border-caption"
                      : "border border-white/15"
                }`}
              >
                {done ? "✓" : ""}
              </span>
              <span
                className={`text-[15px] ${
                  done || active
                    ? "font-semibold text-bone"
                    : "font-medium text-muted/70"
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DoneView({
  jobId,
  title,
  aspect,
  duration,
  creditsLeft,
}: {
  jobId: string;
  title: string;
  aspect: string;
  duration: string;
  creditsLeft?: number;
}) {
  return (
    <div className="grid items-center gap-9 pb-8 pt-4 lg:grid-cols-[280px_1fr]">
      <div className="rePop flex justify-center">
        <div className="relative">
          <div className="absolute -inset-6 bg-[radial-gradient(circle_at_50%_40%,rgba(244,198,58,0.2),transparent_65%)] blur-lg" />
          <div className="relative h-[440px] w-[248px] rounded-[30px] border border-white/10 bg-elevated p-[11px] shadow-[0_34px_80px_rgba(0,0,0,0.55)]">
            <div className="relative h-full w-full overflow-hidden rounded-[22px] bg-black">
              <video
                className="absolute inset-0 h-full w-full object-cover"
                src={`/api/videos/${jobId}`}
                controls
                playsInline
                preload="metadata"
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <span className="mb-[18px] inline-flex items-center gap-2 rounded-full border border-[rgba(120,190,110,0.25)] bg-[rgba(120,190,110,0.1)] px-3 py-1.5 font-mono-data text-[11.5px] tracking-[0.06em] text-[#8FBF7A]">
          ✓ RENDER COMPLETE
        </span>
        <h2 className="mb-2.5 font-display text-2xl font-extrabold leading-[1.1] tracking-[-0.02em] text-bone lg:text-[32px]">
          {title}
        </h2>
        <p className="mb-6 text-[15px] text-muted">
          Your short is ready. Download it, or post straight to your channels.
        </p>

        <div className="mb-3.5 flex flex-wrap gap-3">
          <a
            href={`/api/videos/${jobId}?download=1`}
            className="inline-flex items-center gap-2 rounded-xl bg-caption px-[22px] py-[13px] text-[15px] font-bold text-caption-ink transition-opacity hover:opacity-90"
          >
            ↓ Download MP4
          </a>
          <span
            title="Caption editing is coming soon"
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-white/10 px-5 py-[13px] text-[15px] font-semibold text-muted/50"
          >
            ✎ Edit captions
          </span>
        </div>

        <div className="mb-2 mt-6 font-mono-data text-[11px] uppercase tracking-[0.06em] text-muted/70">
          Post to
        </div>
        <div className="mb-6">
          <PostTo />
        </div>

        <div className="mb-6 flex gap-[22px] border-t border-white/5 py-4">
          <div>
            <div className="font-mono-data text-[10.5px] uppercase text-muted/70">
              Format
            </div>
            <div className="mt-[3px] text-sm font-bold text-bone">{aspect}</div>
          </div>
          <div>
            <div className="font-mono-data text-[10.5px] uppercase text-muted/70">
              Duration
            </div>
            <div className="mt-[3px] text-sm font-bold text-bone">
              {duration}
            </div>
          </div>
          {creditsLeft != null && (
            <div>
              <div className="font-mono-data text-[10.5px] uppercase text-muted/70">
                Credits left
              </div>
              <div className="mt-[3px] text-sm font-bold text-caption">
                {creditsLeft}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3.5">
          {/* Sıradan <a>: wizard zaten /dashboard/create'teyse state'i sıfırlamak için tam yükleme gerekir */}
          <a
            href="/dashboard/create"
            className="text-sm font-semibold text-caption-dim transition-colors hover:text-caption"
          >
            ＋ Create another
          </a>
          <Link
            href="/dashboard/library"
            className="text-sm font-semibold text-muted/80 transition-colors hover:text-bone"
          >
            Go to library &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
