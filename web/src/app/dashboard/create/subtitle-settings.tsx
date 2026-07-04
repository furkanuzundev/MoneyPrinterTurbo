"use client";

import { useState } from "react";
import type { CaptionStyle } from "@/lib/jobs/scenes";
import {
  SIZES,
  POSITIONS,
  COLORS,
  SIZE_LABEL,
  POSITION_LABEL,
  COLOR_LABEL,
} from "@/lib/jobs/caption-ui";

export function SubtitleSettings({
  value,
  onChange,
}: {
  value: CaptionStyle;
  onChange: (patch: Partial<CaptionStyle>) => void;
}) {
  const [open, setOpen] = useState(false);
  const summary = `${SIZE_LABEL[value.size]} · ${POSITION_LABEL[value.position]} · ${COLOR_LABEL[value.color]}`;

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

          <label className="mb-2 mt-[18px] block text-[13px] font-semibold text-bone">
            Caption style
          </label>
          <div className="flex flex-wrap gap-[9px]">
            {COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onChange({ color: c.id })}
                className={`flex items-center gap-[9px] rounded-[10px] border px-3 py-[9px] text-[13px] font-semibold transition-colors ${
                  value.color === c.id
                    ? "border-caption bg-caption/10 text-bone"
                    : "border-white/10 bg-[#141310] text-muted hover:text-bone"
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
        </div>
      )}
    </div>
  );
}
