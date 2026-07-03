"use client";

import { useState } from "react";
import { VideoGrid, type VideoCardData } from "./video-grid";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "ready", label: "Ready" },
  { id: "processing", label: "Processing" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

export function LibraryView({ videos }: { videos: VideoCardData[] }) {
  const [filter, setFilter] = useState<FilterId>("all");
  const filtered =
    filter === "all" ? videos : videos.filter((v) => v.status === filter);

  return (
    <>
      <div className="mb-6 flex gap-2 border-b border-white/5 pb-0.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`-mb-[2px] rounded-t-[10px] border-b-2 px-4 py-[9px] text-sm font-semibold transition-colors ${
              filter === f.id
                ? "border-caption text-bone"
                : "border-transparent text-muted/80 hover:text-bone"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">
          No {filter === "all" ? "" : `${filter} `}videos.
        </p>
      ) : (
        <VideoGrid videos={filtered} />
      )}
    </>
  );
}
