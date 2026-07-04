import type { CSSProperties } from "react";
import type { CaptionStyle } from "./scenes";

export const SIZES: { id: CaptionStyle["size"]; label: string; px: number }[] = [
  { id: "sm", label: "S", px: 17 },
  { id: "md", label: "M", px: 23 },
  { id: "lg", label: "L", px: 30 },
];

export const POSITIONS: { id: CaptionStyle["position"]; label: string }[] = [
  { id: "top", label: "Top" },
  { id: "center", label: "Center" },
  { id: "bottom", label: "Bottom" },
];

export const COLORS: { id: CaptionStyle["color"]; label: string; swatch: string }[] = [
  { id: "yellow", label: "Yellow", swatch: "#F4C63A" },
  { id: "white", label: "White", swatch: "#FFFFFF" },
  { id: "none", label: "Plain", swatch: "transparent" },
];

export const SIZE_LABEL: Record<CaptionStyle["size"], string> = {
  sm: "S",
  md: "M",
  lg: "L",
};
export const POSITION_LABEL: Record<CaptionStyle["position"], string> = {
  top: "Top",
  center: "Center",
  bottom: "Bottom",
};
export const COLOR_LABEL: Record<CaptionStyle["color"], string> = {
  yellow: "Yellow",
  white: "White",
  none: "Plain",
};

// captions/editor.tsx içindeki satır içi previewPos/previewColor/sizePx mantığının
// tek fonksiyona taşınmış hâli. Editör ölçekli px değerleri döndürür; küçük
// thumbnail'lar bu değeri kendileri oranlar.
export function captionPreviewStyles(style: CaptionStyle): {
  pos: CSSProperties;
  color: CSSProperties;
  sizePx: number;
} {
  const pos: CSSProperties =
    style.position === "top"
      ? { top: 16 }
      : style.position === "center"
        ? { top: "50%", transform: "translateY(-50%)" }
        : { bottom: 60 };
  const color: CSSProperties =
    style.color === "yellow"
      ? { background: "#F4C63A", color: "#141208" }
      : style.color === "white"
        ? { background: "#fff", color: "#141208" }
        : { color: "#fff", textShadow: "0 2px 12px rgba(0,0,0,0.65)" };
  const sizePx = SIZES.find((s) => s.id === style.size)?.px ?? 23;
  return { pos, color, sizePx };
}
