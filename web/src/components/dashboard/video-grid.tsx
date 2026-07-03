"use client";

import Link from "next/link";
import { useState } from "react";
import { VideoModal } from "./video-modal";

export type VideoCardData = {
  id: string;
  title: string;
  status: "ready" | "processing" | "failed";
  aspect: string;
  duration: string; // "0:42"
  when: string; // "2h ago"
};

const BADGES: Record<VideoCardData["status"], { label: string; cls: string }> =
  {
    ready: { label: "Ready", cls: "bg-caption/15 text-caption" },
    processing: { label: "Processing", cls: "bg-white/10 text-muted" },
    failed: { label: "Failed", cls: "bg-destructive/15 text-destructive" },
  };

const PLACEHOLDER_BG =
  "repeating-linear-gradient(135deg, rgba(255,255,255,0.03) 0 12px, rgba(255,255,255,0.06) 12px 24px)";

export function VideoGrid({ videos }: { videos: VideoCardData[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const openVideo = videos.find((v) => v.id === openId) ?? null;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-[18px]">
        {videos.map((video) => (
          <VideoCard
            key={video.id}
            video={video}
            onOpen={() => setOpenId(video.id)}
          />
        ))}
      </div>
      {openVideo && (
        <VideoModal video={openVideo} onClose={() => setOpenId(null)} />
      )}
    </>
  );
}

function VideoCard({
  video,
  onOpen,
}: {
  video: VideoCardData;
  onOpen: () => void;
}) {
  const badge = BADGES[video.status];

  const thumbnail = (
    <div
      className="relative aspect-[9/16] overflow-hidden rounded-[14px] border border-white/5"
      style={{ background: PLACEHOLDER_BG }}
    >
      {video.status === "ready" && (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src={`/api/videos/${video.id}`}
          preload="metadata"
          muted
          playsInline
        />
      )}
      <div className="absolute left-2.5 top-2.5 rounded-md bg-black/40 px-[7px] py-[3px] font-mono-data text-[10px] text-bone/90">
        {video.aspect}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        {video.status === "processing" ? (
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-caption opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-caption" />
          </span>
        ) : (
          <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-white/15 bg-[rgba(20,18,8,0.55)] pl-0.5 text-[13px] text-caption">
            ▶
          </span>
        )}
      </div>
      <div className="absolute bottom-2.5 right-2.5 rounded-md bg-black/40 px-[7px] py-[3px] font-mono-data text-[10px] text-bone/90">
        {video.duration}
      </div>
    </div>
  );

  const meta = (
    <>
      <div className="mt-2.5 line-clamp-2 text-left text-[13.5px] font-semibold leading-[1.3] text-bone">
        {video.title}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="font-mono-data text-[10.5px] text-muted/70">
          {video.when}
        </span>
        <span
          className={`rounded-md px-[7px] py-0.5 text-[10.5px] font-bold ${badge.cls}`}
        >
          {badge.label}
        </span>
      </div>
    </>
  );

  if (video.status === "ready") {
    return (
      <button type="button" onClick={onOpen} className="block text-left">
        {thumbnail}
        {meta}
      </button>
    );
  }
  return (
    <Link href={`/dashboard/jobs/${video.id}`} className="block">
      {thumbnail}
      {meta}
    </Link>
  );
}
