/**
 * Altyazılar videoya burned-in ve karenin en altında duruyor (%5 alt marj,
 * app/services/video.py). Tarayıcının native kontrol çubuğu da elementin en
 * altına çizildiği için, video kutuyu tam doldurduğunda kontroller son altyazı
 * satırını örtüyordu — özellikle mobilde okunmaz hale geliyordu.
 *
 * Çözüm: kutuyu karenin kendisinden CONTROLS_STRIP kadar YÜKSEK yap ve videoyu
 * `object-contain object-top` ile üste sabitle. Kalan alt şerit letterbox olur
 * ve kontrol çubuğu tam oraya düşer. Native `controls` korunur — klavye
 * desteği, ekran okuyucu etiketleri, tam ekran, PiP ve AirPlay bedava gelir.
 */
export const CONTROLS_STRIP = 64;

/** 9:16 karenin genişliğe oranı, yüzde (16/9). */
const PORTRAIT_RATIO = "177.78%";

export function CaptionSafeVideo({
  src,
  poster,
  autoPlay = false,
  className = "",
}: {
  src: string;
  poster?: string;
  autoPlay?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`relative h-0 w-full overflow-hidden bg-black ${className}`}
      style={{ paddingBottom: `calc(${PORTRAIT_RATIO} + ${CONTROLS_STRIP}px)` }}
    >
      <video
        className="absolute inset-0 h-full w-full object-contain object-top"
        src={src}
        poster={poster}
        controls
        autoPlay={autoPlay}
        playsInline
        preload="metadata"
      />
    </div>
  );
}

/** Kutunun ekranı aşmaması için genişliği yükseklikten türetir. */
export function captionSafeMaxWidth(maxPx: number, viewportFraction = 88) {
  return `min(${maxPx}px, calc((${viewportFraction}vh - ${CONTROLS_STRIP}px) * 9 / 16))`;
}
