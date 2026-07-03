// Sahne bazlı script modeli: ekranda yanan caption ile seslendirilen metin ayrıdır.
export type Scene = {
  tag: string; // "HOOK" | "SCENE 1"... | "CTA"
  caption: string;
  voiceover: string;
};

export type CaptionStyle = {
  size: "sm" | "md" | "lg";
  position: "top" | "center" | "bottom";
  color: "yellow" | "white" | "none";
};

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  size: "md",
  position: "bottom",
  color: "yellow",
};

export const MAX_SCENES = 12;

export function sanitizeScenes(input: unknown): Scene[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (s): s is Record<string, unknown> => typeof s === "object" && s !== null,
    )
    .map((s) => ({
      tag: String(s.tag ?? "SCENE").slice(0, 20).toUpperCase(),
      caption: String(s.caption ?? "").trim().slice(0, 120),
      voiceover: String(s.voiceover ?? "").trim().slice(0, 600),
    }))
    .filter((s) => s.voiceover.length > 0)
    .slice(0, MAX_SCENES);
}

export function sanitizeCaptionStyle(input: unknown): CaptionStyle {
  const obj = (typeof input === "object" && input !== null ? input : {}) as
    Record<string, unknown>;
  const size = ["sm", "md", "lg"].includes(String(obj.size))
    ? (String(obj.size) as CaptionStyle["size"])
    : DEFAULT_CAPTION_STYLE.size;
  const position = ["top", "center", "bottom"].includes(String(obj.position))
    ? (String(obj.position) as CaptionStyle["position"])
    : DEFAULT_CAPTION_STYLE.position;
  const color = ["yellow", "white", "none"].includes(String(obj.color))
    ? (String(obj.color) as CaptionStyle["color"])
    : DEFAULT_CAPTION_STYLE.color;
  return { size, position, color };
}

export function scriptFromScenes(scenes: Scene[]): string {
  return scenes
    .map((s) => s.voiceover.trim())
    .filter(Boolean)
    .join(" ");
}

// Python motoruna (app/models/schema.py VideoParams) giden altyazı stil eşlemesi.
export function engineSubtitleParams(style: CaptionStyle): {
  subtitle_position: string;
  font_size: number;
  text_fore_color: string;
  text_background_color: boolean | string;
} {
  const font_size = { sm: 44, md: 60, lg: 76 }[style.size];
  const colorMap = {
    yellow: { text_fore_color: "#141208", text_background_color: "#F4C63A" },
    white: { text_fore_color: "#141208", text_background_color: "#FFFFFF" },
    none: { text_fore_color: "#FFFFFF", text_background_color: false as const },
  };
  return {
    subtitle_position: style.position,
    font_size,
    ...colorMap[style.color],
  };
}
