"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { VideoCardData } from "./video-grid";

const POST_TARGETS = [
  { label: "TikTok", href: "https://www.tiktok.com/upload" },
  { label: "Reels", href: "https://www.instagram.com" },
  { label: "Shorts", href: "https://studio.youtube.com" },
];

export function VideoModal({
  video,
  onClose,
}: {
  video: VideoCardData;
  onClose: () => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${video.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`delete failed (${res.status})`);
      onClose();
      router.refresh();
    } catch {
      setError("Could not delete the video. Try again.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,5,4,0.72)] p-4 backdrop-blur-sm sm:p-8"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="grid max-h-full w-full max-w-[780px] overflow-y-auto rounded-[22px] border border-white/10 bg-[#141310] shadow-[0_40px_100px_rgba(0,0,0,0.6)] sm:grid-cols-[280px_1fr]"
      >
        <div className="relative min-h-[320px] bg-black sm:min-h-[500px]">
          <video
            className="absolute inset-0 h-full w-full object-contain"
            src={`/api/videos/${video.id}`}
            controls
            playsInline
            preload="metadata"
          />
        </div>
        <div className="relative p-6 sm:p-7">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-[18px] top-[18px] flex h-8 w-8 items-center justify-center rounded-[9px] border border-white/10 text-base text-muted transition-colors hover:text-bone"
            aria-label="Close"
          >
            ✕
          </button>
          <span className="mb-3.5 inline-block rounded-md bg-caption/15 px-[9px] py-[3px] text-[10.5px] font-bold text-caption">
            READY
          </span>
          <h2 className="mb-4 max-w-[340px] font-display text-2xl font-extrabold leading-[1.15] tracking-[-0.01em] text-bone">
            {video.title}
          </h2>
          <div className="mb-5 flex gap-5 border-b border-white/5 pb-5">
            <div>
              <div className="font-mono-data text-[10px] uppercase text-muted/70">
                Format
              </div>
              <div className="mt-[3px] text-sm font-bold text-bone">
                {video.aspect}
              </div>
            </div>
            <div>
              <div className="font-mono-data text-[10px] uppercase text-muted/70">
                Duration
              </div>
              <div className="mt-[3px] text-sm font-bold text-bone">
                {video.duration}
              </div>
            </div>
          </div>
          <div className="mb-3.5 flex gap-2.5">
            <a
              href={`/api/videos/${video.id}?download=1`}
              className="flex-1 rounded-[11px] bg-caption p-3 text-center text-sm font-bold text-caption-ink transition-opacity hover:opacity-90"
            >
              ↓ Download MP4
            </a>
          </div>
          <div className="mb-2 mt-4 font-mono-data text-[10.5px] uppercase text-muted/70">
            Post to
          </div>
          <div className="mb-6 flex gap-2">
            {POST_TARGETS.map((target) => (
              <a
                key={target.label}
                href={target.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-[9px] border border-white/10 px-3.5 py-2 text-[13px] font-semibold text-bone/80 transition-colors hover:border-white/25"
              >
                {target.label}
              </a>
            ))}
          </div>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center gap-[7px] text-[13px] font-semibold text-[#D98B7A] transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            🗑 {deleting ? "Deleting…" : confirmDelete ? "Click again to confirm" : "Delete video"}
          </button>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  );
}
