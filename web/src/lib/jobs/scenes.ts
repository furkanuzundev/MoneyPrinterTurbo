// Sahne bazlı script modeli: ekranda yanan caption ile seslendirilen metin ayrıdır.
export type Scene = {
  tag: string; // "HOOK" | "SCENE 1"... | "CTA"
  caption: string;
  voiceover: string;
};

export type CaptionStyle = {
  size: "sm" | "md" | "lg";
  position: "top" | "center" | "bottom";
  textColor: string;
  bgColor: string | "none";
};

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  size: "md",
  position: "bottom",
  textColor: "#141208",
  bgColor: "#F4C63A",
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

// "#abc" / "abc" / "#aabbcc" / "aabbcc" -> "#AABBCC"; geçersiz -> null.
export function normalizeHex(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const m = input.trim().replace(/^#/, "");
  if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(m)) return null;
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  return "#" + full.toUpperCase();
}

// Eski→yeni renk migrasyonu (DB'deki color:"yellow"|"white"|"none" kayıtları).
const LEGACY_COLOR_MAP: Record<string, { textColor: string; bgColor: string }> = {
  yellow: { textColor: "#141208", bgColor: "#F4C63A" },
  white: { textColor: "#141208", bgColor: "#FFFFFF" },
  none: { textColor: "#FFFFFF", bgColor: "none" },
};

export function sanitizeCaptionStyle(input: unknown): CaptionStyle {
  const obj = (typeof input === "object" && input !== null ? input : {}) as
    Record<string, unknown>;
  const size = ["sm", "md", "lg"].includes(String(obj.size))
    ? (String(obj.size) as CaptionStyle["size"])
    : DEFAULT_CAPTION_STYLE.size;
  const position = ["top", "center", "bottom"].includes(String(obj.position))
    ? (String(obj.position) as CaptionStyle["position"])
    : DEFAULT_CAPTION_STYLE.position;

  // Yeni alanlar yoksa ama eski color varsa: migrasyon.
  const hasNew = obj.textColor !== undefined || obj.bgColor !== undefined;
  const legacy =
    !hasNew && typeof obj.color === "string" && obj.color in LEGACY_COLOR_MAP
      ? LEGACY_COLOR_MAP[obj.color]
      : null;

  const textColor =
    normalizeHex(obj.textColor) ??
    legacy?.textColor ??
    DEFAULT_CAPTION_STYLE.textColor;

  const bgColor =
    obj.bgColor === "none"
      ? "none"
      : normalizeHex(obj.bgColor) ??
        (legacy ? legacy.bgColor : DEFAULT_CAPTION_STYLE.bgColor);

  return { size, position, textColor, bgColor };
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
  return {
    subtitle_position: style.position,
    font_size,
    text_fore_color: style.textColor,
    text_background_color: style.bgColor === "none" ? false : style.bgColor,
  };
}
