"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { VideoGrid, type VideoCardData } from "./video-grid";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "ready", label: "Ready" },
  { id: "processing", label: "Processing" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

const POLL_MS = 3000;

type ActiveJob = { id: string; status: string; progress: number };

// İşlenen kartlar için tek yoklama: aktif iş kaldığı sürece /api/jobs/active
// çağrılır, yüzdeler kartlara yazılır ve bir iş terminal olduğunda sunucu
// bileşeni tazelenir (thumbnail + "X ready to post" sayacı gelsin diye).
// Eskiden sayfayı elle yenilemek gerekiyordu.
function useActiveProgress(videos: VideoCardData[]): Record<string, number> {
  const router = useRouter();
  const [progressById, setProgressById] = useState<Record<string, number>>({});
  const hasActive = videos.some((v) => v.status === "processing");

  useEffect(() => {
    if (!hasActive) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Efekt-yerel: router.refresh() yeni `videos` getirince efekt yeniden
    // kurulur ve bayrak sıfırlanır, böylece ikinci iş bittiğinde de tazeleriz.
    let refreshed = false;

    async function tick() {
      if (document.hidden) return schedule(); // arka plan sekmesinde yoklama yok
      try {
        const res = await fetch("/api/jobs/active");
        if (!res.ok) return schedule();
        const data: { jobs: ActiveJob[] } = await res.json();
        if (cancelled) return;
        setProgressById(
          Object.fromEntries(data.jobs.map((j) => [j.id, j.progress])),
        );
        const settled = data.jobs.some(
          (j) => j.status === "done" || j.status === "failed",
        );
        // Sunucudan gelen listede artık görünmeyen iş de bitmiş demektir.
        const vanished = videos.some(
          (v) =>
            v.status === "processing" && !data.jobs.some((j) => j.id === v.id),
        );
        if ((settled || vanished) && !refreshed) {
          refreshed = true;
          router.refresh();
          return; // tazelenen veri efekti yeniden kurar, döngü oradan devam eder
        }
      } catch {
        // Ağ hatası: bir sonraki turda tekrar denenir.
      }
      schedule();
    }

    function schedule() {
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    }

    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [hasActive, router, videos]);

  return progressById;
}

export function LibraryView({ videos }: { videos: VideoCardData[] }) {
  const [filter, setFilter] = useState<FilterId>("all");
  const progressById = useActiveProgress(videos);
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
        <VideoGrid videos={filtered} progressById={progressById} />
      )}
    </>
  );
}
