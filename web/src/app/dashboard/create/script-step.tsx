"use client";

import Link from "next/link";
import {
  creditsForDuration,
  estimateDurationSeconds,
} from "@/lib/credits/pricing";
import { scriptFromScenes, type Scene } from "@/lib/jobs/scenes";
import { VOICES } from "@/lib/jobs/options";
import { formatDuration } from "@/lib/jobs/display";

export function ScriptStep({
  subject,
  scenes,
  voice,
  aspect,
  balance,
  busy,
  onScenesChange,
  onRegenerate,
  onGenerate,
  onBack,
}: {
  subject: string;
  scenes: Scene[];
  voice: string;
  aspect: string;
  balance: number;
  busy: "script" | "job" | null;
  onScenesChange: (scenes: Scene[]) => void;
  onRegenerate: () => void;
  onGenerate: () => void;
  onBack: () => void;
}) {
  const script = scriptFromScenes(scenes);
  const estimate = estimateDurationSeconds(script);
  const credits = Math.max(1, creditsForDuration(estimate));
  const canAfford = balance >= credits;
  const voiceLabel =
    VOICES.find((v) => v.id === voice)?.label.split(" (")[0] ?? voice;

  function patchScene(index: number, patch: Partial<Scene>) {
    onScenesChange(
      scenes.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
      <div className="rounded-[20px] border border-white/5 bg-[#141310] p-6 sm:p-7">
        <div className="mb-1.5 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 text-lg font-bold leading-[1.3] text-bone">
            {subject}
          </div>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={busy !== null}
            className="mt-[3px] inline-flex flex-none items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold text-caption-dim transition-colors hover:text-caption disabled:opacity-50"
          >
            ↻ {busy === "script" ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
        <p className="mb-[22px] text-[13.5px] text-muted/80">
          AI drafted a ~{formatDuration(estimate)} script with {scenes.length}{" "}
          scenes. Edit any line &mdash; captions and price update live.
        </p>

        <div className="flex flex-col gap-3">
          {scenes.map((scene, i) => (
            <div
              key={i}
              className="flex gap-3.5 rounded-[14px] border border-white/5 bg-[#0E0C08] p-4"
            >
              <div
                className="relative h-[92px] w-[52px] flex-none rounded-lg"
                style={{
                  background:
                    "repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0 8px, rgba(255,255,255,0.08) 8px 16px)",
                }}
              >
                <span className="absolute left-[5px] top-[5px] font-mono-data text-[9px] text-bone/80">
                  {i + 1}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <span className="mb-2 inline-block rounded-[5px] bg-caption px-[7px] py-0.5 font-mono-data text-[10px] font-bold tracking-[0.06em] text-caption-ink">
                  {scene.tag}
                </span>
                <input
                  value={scene.caption}
                  onChange={(e) => patchScene(i, { caption: e.target.value })}
                  placeholder="On-screen caption"
                  className="mb-1.5 w-full border-none bg-transparent text-[15px] font-bold leading-[1.3] text-bone outline-none placeholder:text-muted/40"
                />
                <div className="flex gap-1.5">
                  <span aria-hidden className="mt-0.5 text-[13px]">
                    🎙
                  </span>
                  <textarea
                    value={scene.voiceover}
                    onChange={(e) =>
                      patchScene(i, { voiceover: e.target.value })
                    }
                    rows={2}
                    className="w-full resize-y border-none bg-transparent text-[13.5px] leading-[1.45] text-muted outline-none placeholder:text-muted/40"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ready to render paneli */}
      <div className="rounded-[20px] border border-white/5 bg-[#141310] p-6 lg:sticky lg:top-6">
        <div className="mb-4 font-mono-data text-[11px] uppercase tracking-[0.08em] text-muted/70">
          Ready to render
        </div>
        <div className="mb-[18px] flex flex-col gap-2.5 text-[13.5px]">
          <div className="flex justify-between">
            <span className="text-muted/80">Scenes</span>
            <span className="font-semibold text-bone">{scenes.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted/80">Voice</span>
            <span className="font-semibold text-bone">{voiceLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted/80">Format</span>
            <span className="font-semibold text-bone">{aspect}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted/80">Est. duration</span>
            <span className="font-semibold text-bone">
              ~{formatDuration(estimate)}
            </span>
          </div>
        </div>
        <div className="mb-4 flex items-center justify-between rounded-[11px] border border-caption/20 bg-[#0E0C08] px-3.5 py-[11px]">
          <span className="text-[13px] text-muted">Cost to render</span>
          <span className="font-display text-base font-extrabold text-caption">
            {credits} credit{credits > 1 ? "s" : ""}
          </span>
        </div>
        {canAfford ? (
          <button
            type="button"
            onClick={onGenerate}
            disabled={busy !== null || script.trim().length === 0}
            className="w-full rounded-xl bg-caption p-[15px] text-[15px] font-bold text-caption-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy === "job" ? "Starting…" : "Generate video →"}
          </button>
        ) : (
          <Link
            href="/dashboard/buy"
            className="block w-full rounded-xl bg-caption p-[15px] text-center text-[15px] font-bold text-caption-ink transition-opacity hover:opacity-90"
          >
            Need {credits - balance} more credit
            {credits - balance > 1 ? "s" : ""} &mdash; Buy
          </Link>
        )}
        <button
          type="button"
          onClick={onBack}
          className="mt-3 w-full text-center text-[13px] text-muted/80 transition-colors hover:text-bone"
        >
          ← Back to brief
        </button>
      </div>
    </div>
  );
}
