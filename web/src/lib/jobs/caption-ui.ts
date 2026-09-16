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

export const TEXT_COLOR_PRESETS: { label: string; hex: string }[] = [
  { label: "White", hex: "#FFFFFF" },
  { label: "Black", hex: "#141208" },
  { label: "Yellow", hex: "#F4C63A" },
  { label: "Red", hex: "#E5484D" },
  { label: "Cyan", hex: "#33C9D6" },
];

export const BG_COLOR_PRESETS: { label: string; hex: string | "none" }[] = [
  { label: "None", hex: "none" },
  { label: "Yellow", hex: "#F4C63A" },
  { label: "White", hex: "#FFFFFF" },
  { label: "Black", hex: "#141208" },
  { label: "Blue", hex: "#2B6CF4" },
];

// Bir hex/none için insan-okur kısa etiket: preset ise adı, değilse hex'in
// kendisi (palet seçimi). Özet satırlarında kullanılır.
export function colorLabel(
  value: string,
  presets: { label: string; hex: string | "none" }[],
): string {
  return (
    presets.find((p) => p.hex.toLowerCase() === value.toLowerCase())?.label ??
    value
  );
}

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
    style.bgColor === "none"
      ? { color: style.textColor, textShadow: "0 2px 12px rgba(0,0,0,0.65)" }
      : { color: style.textColor, background: style.bgColor };
  const sizePx = SIZES.find((s) => s.id === style.size)?.px ?? 23;
  return { pos, color, sizePx };
}

// Brief özet panelindeki önizleme küçük resmi eskiden sabit 9:16 idi; format
// seçimi değişse bile aynı dikey kutu duruyordu. Seçilen en-boy oranını sabit
// bir çerçeveye (176x200) oturtup gerçek px ölçüsünü döndürüyoruz, böylece
// panel yüksekliği format değişince zıplamıyor.
const PREVIEW_MAX_W = 176;
const PREVIEW_MAX_H = 200;
// Altyazı px'i 112 genişlikteki eski thumbnail'a göre ayarlanmıştı; kutu
// genişledikçe yazı da onunla birlikte ölçekleniyor.
const PREVIEW_BASE_W = 112;

export function aspectPreviewBox(aspect: string): {
  width: number;
  height: number;
  captionScale: number;
} {
  const [w, h] = aspect.split(":").map(Number);
  const valid = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
  const ratio = valid ? w / h : 9 / 16;
  const h0 = Math.min(PREVIEW_MAX_W / ratio, PREVIEW_MAX_H);
  const width = Math.round(h0 * ratio);
  const height = Math.round(h0);
  return { width, height, captionScale: width / PREVIEW_BASE_W };
}
