"use client";

import { useState } from "react";
import type { CaptionStyle } from "@/lib/jobs/scenes";
import {
  SIZES,
  POSITIONS,
  SIZE_LABEL,
  POSITION_LABEL,
  TEXT_COLOR_PRESETS,
  BG_COLOR_PRESETS,
  colorLabel,
} from "@/lib/jobs/caption-ui";
import { ColorAxis } from "@/components/subtitle/color-axis";

export function SubtitleSettings({
  value,
  onChange,
}: {
  value: CaptionStyle;
  onChange: (patch: Partial<CaptionStyle>) => void;
}) {
  const [open, setOpen] = useState(false);
  const summary = `${SIZE_LABEL[value.size]} · ${POSITION_LABEL[value.position]} · T:${colorLabel(value.textColor, TEXT_COLOR_PRESETS)} · BG:${colorLabel(value.bgColor, BG_COLOR_PRESETS)}`;

  return (
    <div className="rounded-[13px] border border-white/10 bg-[#0E0C08]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-bone">
          <span className="text-muted/70">{open ? "▾" : "▸"}</span>
          Subtitles
        </span>
        <span className="font-mono-data text-[11px] text-muted/80">{summary}</span>
      </button>

      {open && (
        <div className="border-t border-white/5 px-3.5 pb-4 pt-3.5">
          <label className="mb-2 block text-[13px] font-semibold text-bone">
            Text size
          </label>
          <div className="flex gap-1.5 rounded-[11px] border border-white/10 bg-[#141310] p-[5px]">
            {SIZES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onChange({ size: s.id })}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                  value.size === s.id
                    ? "bg-caption text-caption-ink"
                    : "text-muted hover:text-bone"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <label className="mb-2 mt-[18px] block text-[13px] font-semibold text-bone">
            Position
          </label>
          <div className="flex gap-1.5 rounded-[11px] border border-white/10 bg-[#141310] p-[5px]">
            {POSITIONS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange({ position: p.id })}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                  value.position === p.id
                    ? "bg-caption text-caption-ink"
                    : "text-muted hover:text-bone"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="mt-[18px]">
            <ColorAxis
              label="Text color"
              presets={TEXT_COLOR_PRESETS}
              value={value.textColor}
              onChange={(v) => onChange({ textColor: v })}
            />
          </div>

          <div className="mt-[18px]">
            <ColorAxis
              label="Background color"
              presets={BG_COLOR_PRESETS}
              value={value.bgColor}
              onChange={(v) => onChange({ bgColor: v })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
