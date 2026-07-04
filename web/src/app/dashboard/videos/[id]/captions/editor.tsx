"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CaptionStyle, Scene } from "@/lib/jobs/scenes";
import { SIZES, POSITIONS, COLORS, captionPreviewStyles } from "@/lib/jobs/caption-ui";

export function CaptionEditor({
  jobId,
  subject,
  initialScenes,
  initialStyle,
}: {
  jobId: string;
  subject: string;
  initialScenes: Scene[];
  initialStyle: CaptionStyle;
}) {
  const router = useRouter();
  const [scenes, setScenes] = useState<Scene[]>(initialScenes);
  const [style, setStyle] = useState<CaptionStyle>(initialStyle);
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scene = scenes[current] ?? scenes[0];
  const { pos: previewPos, color: previewColor, sizePx } = captionPreviewStyles(style);

  function patchCurrent(caption: string) {
    setScenes(scenes.map((s, i) => (i === current ? { ...s, caption } : s)));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/rerender`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenes, captionStyle: style }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Re-render failed");
      router.push(`/dashboard/jobs/${jobId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-[18px] flex items-center gap-3">
        <Link
          href={`/dashboard/jobs/${jobId}`}
          className="inline-flex items-center gap-[7px] rounded-[10px] border border-white/10 px-3.5 py-2 text-sm font-semibold text-muted transition-colors hover:text-bone"
        >
          ← Back
        </Link>
        <div>
          <h1 className="font-display text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-bone">
            Edit captions
          </h1>
          <p className="mt-[3px] text-[13.5px] text-muted/80">{subject}</p>
        </div>
      </div>

      <div className="grid items-start gap-7 lg:grid-cols-[300px_1fr]">
        {/* Canlı önizleme */}
        <div className="flex flex-col items-center gap-3.5">
          <div className="relative">
            <div className="absolute -inset-5 bg-[radial-gradient(circle_at_50%_42%,rgba(244,198,58,0.14),transparent_65%)] blur-lg" />
            <div className="relative h-[440px] w-[248px] rounded-[30px] border border-white/10 bg-elevated p-[11px] shadow-[0_30px_70px_rgba(0,0,0,0.5)]">
              <div
                className="relative h-full w-full overflow-hidden rounded-[22px]"
                style={{
                  background:
                    "repeating-linear-gradient(135deg, rgba(255,255,255,0.03) 0 14px, rgba(255,255,255,0.06) 14px 28px)",
                }}
              >
                <div className="absolute left-3 top-3 rounded-md bg-black/35 px-2 py-1 font-mono-data text-[9px] text-bone/90">
                  SCENE {current + 1} / {scenes.length}
                </div>
                <div
                  className="absolute left-3.5 right-3.5 text-center"
                  style={previewPos}
                >
                  <span
                    className="box-decoration-clone rounded px-1.5 font-display font-extrabold leading-[1.15]"
                    style={{ fontSize: sizePx, ...previewColor }}
                  >
                    {scene?.caption || "Caption preview"}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="font-mono-data text-[11.5px] text-muted/70">
            Live preview
          </div>
        </div>

        {/* Kontroller */}
        <div className="rounded-[20px] border border-white/5 bg-[#141310] p-[26px]">
          <label className="mb-2 block text-sm font-semibold text-bone">
            On-screen caption &middot; scene {current + 1}
          </label>
          <textarea
            value={scene?.caption ?? ""}
            onChange={(e) => patchCurrent(e.target.value)}
            className="min-h-[70px] w-full resize-y rounded-xl border border-white/10 bg-[#0E0C08] px-3.5 py-[13px] text-[15px] leading-normal text-bone outline-none focus:border-caption/50"
          />

          <div className="mt-[22px] grid gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-bone">
                Text size
              </label>
              <div className="flex gap-1.5 rounded-[11px] border border-white/10 bg-[#0E0C08] p-[5px]">
                {SIZES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStyle({ ...style, size: s.id })}
                    className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                      style.size === s.id
                        ? "bg-caption text-caption-ink"
                        : "text-muted hover:text-bone"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-bone">
                Position
              </label>
              <div className="flex gap-1.5 rounded-[11px] border border-white/10 bg-[#0E0C08] p-[5px]">
                {POSITIONS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setStyle({ ...style, position: p.id })}
                    className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                      style.position === p.id
                        ? "bg-caption text-caption-ink"
                        : "text-muted hover:text-bone"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label className="mb-2 mt-[22px] block text-[13px] font-semibold text-bone">
            Caption style
          </label>
          <div className="flex gap-[9px]">
            {COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setStyle({ ...style, color: c.id })}
                className={`flex items-center gap-[9px] rounded-[10px] border px-3 py-[9px] text-[13px] font-semibold transition-colors ${
                  style.color === c.id
                    ? "border-caption bg-caption/10 text-bone"
                    : "border-white/10 bg-[#0E0C08] text-muted hover:text-bone"
                }`}
              >
                <span
                  className="h-3.5 w-3.5 rounded-full border border-white/25"
                  style={{ background: c.swatch }}
                />
                {c.label}
              </button>
            ))}
          </div>

          <div className="my-6 h-px bg-white/5" />

          <label className="mb-[11px] block text-[13px] font-semibold text-bone">
            Scenes
          </label>
          <div className="flex flex-col gap-[9px]">
            {scenes.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCurrent(i)}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                  i === current
                    ? "border-caption bg-caption/10"
                    : "border-white/10 bg-[#0E0C08] hover:border-white/25"
                }`}
              >
                <span
                  className={`flex h-6 w-6 flex-none items-center justify-center rounded-full font-mono-data text-[11px] font-bold ${
                    i === current
                      ? "bg-caption text-caption-ink"
                      : "border border-white/15 text-muted"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-[3px] font-mono-data text-[10px] font-bold tracking-[0.05em] text-muted/80">
                    {s.tag}
                  </div>
                  <div className="line-clamp-1 text-[13.5px] leading-snug text-bone">
                    {s.caption || s.voiceover}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="flex-1 rounded-xl bg-caption p-3.5 text-[15px] font-bold text-caption-ink transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Queuing re-render…" : "Save & re-render"}
            </button>
            <Link
              href={`/dashboard/jobs/${jobId}`}
              className="rounded-xl border border-white/10 px-[18px] py-3.5 text-center text-sm font-semibold text-muted transition-colors hover:text-bone"
            >
              Cancel
            </Link>
          </div>
          <p className="mt-2.5 text-center font-mono-data text-[11px] text-muted/70">
            Free &middot; reuses your footage and voiceover
          </p>
          {error && (
            <p className="mt-2 text-center text-sm text-destructive">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
