"use client";

import { useRef, useState } from "react";

import { creditsForDuration } from "@/lib/credits/pricing";
import { ASPECTS, DURATION_OPTIONS, LANGUAGES, VOICES } from "@/lib/jobs/options";
import type { CaptionStyle } from "@/lib/jobs/scenes";
import {
  captionPreviewStyles,
  SIZE_LABEL,
  POSITION_LABEL,
  COLOR_LABEL,
} from "@/lib/jobs/caption-ui";
import { SubtitleSettings } from "./subtitle-settings";

const ASPECT_META: Record<string, { sub: string; w: number; h: number }> = {
  "9:16": { sub: "TikTok · Reels", w: 20, h: 34 },
  "1:1": { sub: "Feed post", w: 30, h: 30 },
  "16:9": { sub: "YouTube", w: 36, h: 20 },
};

function durationLabel(s: number) {
  return s >= 60 ? (s % 60 === 0 ? `${s / 60}m` : `${s}s`) : `${s}s`;
}

// "Jenny (US, Female)" → { name: "Jenny", meta: "EN · US" }
function voiceDisplay(v: (typeof VOICES)[number]) {
  const name = v.label.split(" (")[0];
  const inner = v.label.match(/\(([^)]+)\)/)?.[1] ?? "";
  const region = inner.split(",")[0]?.trim() ?? "";
  return { name, meta: `${v.language.toUpperCase()} · ${region}` };
}

export type BriefValues = {
  subject: string;
  language: string;
  voice: string;
  aspect: string;
  targetSeconds: number;
};

export function BriefStep({
  values,
  onChange,
  onGenerate,
  busy,
  captionStyle,
  onCaptionChange,
}: {
  values: BriefValues;
  onChange: (patch: Partial<BriefValues>) => void;
  onGenerate: () => void;
  busy: boolean;
  captionStyle: CaptionStyle;
  onCaptionChange: (patch: Partial<CaptionStyle>) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentUrlRef = useRef<string | null>(null);
  const requestSeqRef = useRef(0);
  // Hangi ses için önizleme durumu: null | { id, state }
  const [preview, setPreview] = useState<{ id: string; state: "loading" | "playing" | "error" } | null>(null);

  function stopCurrent() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = null;
    }
  }

  async function playPreview(voiceId: string) {
    // Çalan varsa durdur ve blob URL'sini serbest bırak.
    stopCurrent();
    const token = ++requestSeqRef.current;
    setPreview({ id: voiceId, state: "loading" });
    try {
      const res = await fetch("/api/voice/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceName: voiceId }),
      });
      if (token !== requestSeqRef.current) return;
      if (!res.ok) throw new Error(`preview ${res.status}`);
      const blob = await res.blob();
      if (token !== requestSeqRef.current) return;
      const url = URL.createObjectURL(blob);
      if (token !== requestSeqRef.current) {
        URL.revokeObjectURL(url);
        return;
      }
      const audio = new Audio(url);
      audio.onended = () => {
        if (currentUrlRef.current === url) {
          URL.revokeObjectURL(url);
          currentUrlRef.current = null;
        }
        setPreview((p) => (p?.id === voiceId ? null : p));
      };
      audio.onerror = () => {
        if (currentUrlRef.current === url) {
          URL.revokeObjectURL(url);
          currentUrlRef.current = null;
        }
        setPreview({ id: voiceId, state: "error" });
      };
      audioRef.current = audio;
      currentUrlRef.current = url;
      await audio.play();
      if (token !== requestSeqRef.current) return;
      setPreview({ id: voiceId, state: "playing" });
    } catch {
      if (token !== requestSeqRef.current) return;
      setPreview({ id: voiceId, state: "error" });
    }
  }

  const voices = VOICES.filter((v) => v.language === values.language);
  const canGenerate = values.subject.trim().length > 0 && !busy;
  const lengthLabel =
    values.targetSeconds >= 60
      ? `${values.targetSeconds / 60} min`
      : `${values.targetSeconds} sec`;
  const languageLabel =
    LANGUAGES.find((l) => l.code === values.language)?.label ?? values.language;
  const voiceLabel = voices.find((v) => v.id === values.voice)
    ? voiceDisplay(voices.find((v) => v.id === values.voice)!).name
    : "—";

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
      <div className="rounded-[20px] border border-white/5 bg-[#141310] p-6 sm:p-7">
        <label className="mb-2 block text-sm font-semibold text-bone">
          What&apos;s the video about?
        </label>
        <textarea
          value={values.subject}
          onChange={(e) => onChange({ subject: e.target.value })}
          placeholder="e.g. three morning habits that changed my life"
          className="min-h-[88px] w-full resize-y rounded-xl border border-white/10 bg-[#0E0C08] px-[15px] py-3.5 text-[15px] leading-normal text-bone outline-none placeholder:text-muted/50 focus:border-caption/50"
        />
        <div className="mt-2 font-mono-data text-[11.5px] text-muted/70">
          Be specific &mdash; a niche topic makes a sharper script.
        </div>

        <div className="my-6 h-px bg-white/5" />

        <label className="mb-[11px] block text-sm font-semibold text-bone">
          Length
        </label>
        <div className="flex gap-2 rounded-xl border border-white/10 bg-[#0E0C08] p-[5px]">
          {DURATION_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ targetSeconds: s })}
              className={`flex-1 rounded-[9px] px-1.5 py-2.5 text-sm font-semibold transition-colors ${
                values.targetSeconds === s
                  ? "bg-caption text-caption-ink"
                  : "text-muted hover:text-bone"
              }`}
            >
              {durationLabel(s)}
            </button>
          ))}
        </div>

        <label className="mb-[11px] mt-[22px] block text-sm font-semibold text-bone">
          Language
        </label>
        <select
          value={values.language}
          onChange={(e) => {
            const code = e.target.value;
            const firstVoice = VOICES.find((v) => v.language === code);
            onChange({
              language: code,
              ...(firstVoice ? { voice: firstVoice.id } : {}),
            });
          }}
          className="w-full rounded-xl border border-white/10 bg-[#0E0C08] px-[15px] py-3.5 text-[15px] text-bone outline-none focus:border-caption/50"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code} className="bg-[#0E0C08]">
              {lang.label}
            </option>
          ))}
        </select>

        <label className="mb-[11px] mt-[22px] block text-sm font-semibold text-bone">
          Voice
        </label>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {voices.map((v) => {
            const on = values.voice === v.id;
            const d = voiceDisplay(v);
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onChange({ voice: v.id })}
                className={`flex flex-col gap-[5px] rounded-[13px] border p-3.5 text-left transition-colors ${
                  on
                    ? "border-caption bg-caption/10"
                    : "border-white/10 bg-[#0E0C08] hover:border-white/25"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-bone">{d.name}</span>
                  <div className="flex items-center gap-2">
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Play ${d.name} sample`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void playPreview(v.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          void playPreview(v.id);
                        }
                      }}
                      className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] transition-colors ${
                        preview?.id === v.id && preview.state === "error"
                          ? "border-red-500/60 text-red-400"
                          : "border-white/20 text-muted hover:border-caption hover:text-caption"
                      }`}
                    >
                      {preview?.id === v.id && preview.state === "loading"
                        ? "…"
                        : preview?.id === v.id && preview.state === "playing"
                          ? "⏸"
                          : "▶"}
                    </span>
                    <span
                      className={`h-3.5 w-3.5 rounded-full border-2 ${
                        on ? "border-caption bg-caption" : "border-white/20"
                      }`}
                    />
                  </div>
                </div>
                <span className="font-mono-data text-[10.5px] text-muted/80">
                  {d.meta}
                </span>
              </button>
            );
          })}
        </div>

        <label className="mb-[11px] mt-[22px] block text-sm font-semibold text-bone">
          Format
        </label>
        <div className="grid grid-cols-3 gap-2.5">
          {ASPECTS.map((a) => {
            const on = values.aspect === a;
            const meta = ASPECT_META[a];
            return (
              <button
                key={a}
                type="button"
                onClick={() => onChange({ aspect: a })}
                className={`rounded-[13px] border p-3.5 text-left transition-colors ${
                  on
                    ? "border-caption bg-caption/10"
                    : "border-white/10 bg-[#0E0C08] hover:border-white/25"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`rounded-[3px] border ${on ? "border-caption" : "border-white/25"}`}
                    style={{ width: meta.w, height: meta.h }}
                  />
                  <div>
                    <div className="text-sm font-bold text-bone">{a}</div>
                    <div className="font-mono-data text-[10px] text-muted/80">
                      {meta.sub}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="my-6 h-px bg-white/5" />

        <label className="mb-[11px] block text-sm font-semibold text-bone">
          Subtitles
        </label>
        <SubtitleSettings value={captionStyle} onChange={onCaptionChange} />
      </div>

      {/* Özet paneli */}
      <div className="rounded-[20px] border border-white/5 bg-[#141310] p-6 lg:sticky lg:top-6">
        <div className="mb-4 font-mono-data text-[11px] uppercase tracking-[0.08em] text-muted/70">
          Your brief
        </div>
        <div
          className="relative mx-auto mb-[18px] aspect-[9/16] w-28 rounded-xl border border-white/5"
          style={{
            background:
              "repeating-linear-gradient(135deg, rgba(255,255,255,0.03) 0 12px, rgba(255,255,255,0.06) 12px 24px)",
          }}
        >
          {(() => {
            const cp = captionPreviewStyles(captionStyle);
            return (
              <div className="absolute left-2 right-2 text-center" style={cp.pos}>
                <span
                  className="box-decoration-clone rounded px-1 font-display font-extrabold leading-[1.15]"
                  style={{ fontSize: Math.round(cp.sizePx * 0.42), ...cp.color }}
                >
                  {values.subject.trim() || "Your topic here"}
                </span>
              </div>
            );
          })()}
        </div>
        <div className="flex flex-col gap-2.5 text-[13.5px]">
          <div className="flex justify-between">
            <span className="text-muted/80">Length</span>
            <span className="font-semibold text-bone">{lengthLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted/80">Language</span>
            <span className="font-semibold text-bone">{languageLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted/80">Voice</span>
            <span className="font-semibold text-bone">{voiceLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted/80">Format</span>
            <span className="font-semibold text-bone">{values.aspect}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted/80">Subtitles</span>
            <span className="font-semibold text-bone">
              {`${SIZE_LABEL[captionStyle.size]} · ${POSITION_LABEL[captionStyle.position]} · ${COLOR_LABEL[captionStyle.color]}`}
            </span>
          </div>
        </div>
        <div className="my-[18px] h-px bg-white/5" />
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canGenerate}
          className="w-full rounded-xl bg-caption p-3.5 text-[15px] font-bold text-caption-ink transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Writing script…" : "Generate script with AI"}
        </button>
        <div className="mt-2.5 text-center font-mono-data text-[11px] text-muted/70">
          Free &middot; you&apos;ll review it before rendering
        </div>
        <div className="mt-1 text-center font-mono-data text-[11px] text-muted/50">
          render costs {creditsForDuration(values.targetSeconds)} credit
          {creditsForDuration(values.targetSeconds) > 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
}
