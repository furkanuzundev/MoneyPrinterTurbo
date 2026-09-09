"use client";

import { useEffect, useRef, useState } from "react";
import {
  CaptionSafeVideo,
  captionSafeMaxWidth,
} from "@/components/video/caption-safe-video";

// Her kart bir Reelate çıktısıdır. Videolar public/showcase/showcase-{1,2,3}.mp4
// (+ .jpg poster) olarak beklenir. Kartlar sessiz döngüde önizleme oynatır;
// üzerine tıklanınca video sesli olarak bir dialog'da açılır. Dosya yoksa kart
// stilize placeholder arka planına düşer (bölüm yine de yayınlanabilir).
type ShowcaseItem = {
  meta: string;
  offset: boolean;
  src: string;
  poster: string;
};

const SHOWCASE_ITEMS: ShowcaseItem[] = [
  {
    meta: "wellness · 0:40",
    offset: false,
    src: "/showcase/showcase-1.mp4",
    poster: "/showcase/showcase-1.jpg",
  },
  {
    meta: "morning routine · 0:25",
    offset: true,
    src: "/showcase/showcase-2.mp4",
    poster: "/showcase/showcase-2.jpg",
  },
  {
    meta: "social growth · 0:55",
    offset: false,
    src: "/showcase/showcase-3.mp4",
    poster: "/showcase/showcase-3.jpg",
  },
];

const PLACEHOLDER_BG =
  "repeating-linear-gradient(135deg, rgba(255,255,255,0.03) 0 14px, rgba(255,255,255,0.06) 14px 28px)";

function ShowcaseCard({
  item,
  onOpen,
}: {
  item: ShowcaseItem;
  onOpen: (item: ShowcaseItem) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Video kaynağı yüklenemezse placeholder'a düş.
  const [failed, setFailed] = useState(false);

  // Yalnızca görünürken oynat: mobilde/uzun sayfalarda gereksiz decode'u önler.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    // "Reduce Motion" açıkken otomatik oynatma yok; poster + play ikonu kalır.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          void el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={`Play with sound: ${item.meta}`}
      className={`group relative block aspect-[9/16] w-full cursor-pointer overflow-hidden rounded-[18px] border border-white/5 text-left transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caption focus-visible:ring-offset-2 focus-visible:ring-offset-ink hover:-translate-y-1 ${
        item.offset ? "sm:-mt-6" : ""
      }`}
      style={{ background: PLACEHOLDER_BG }}
    >
      {!failed ? (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          src={item.src}
          poster={item.poster}
          muted
          loop
          playsInline
          preload="none"
          onError={() => setFailed(true)}
        />
      ) : null}
      {/* Üstten gradient: alt kenarda kalan burned-in altyazıları örtmemeli. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-black/50 to-transparent" />
      {/* Play afordansı. Dokunmatikte hover yok, bu yüzden mobilde daima
          görünür; masaüstünde hover/focus ile tam opaklığa çıkar. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 opacity-100 transition-opacity lg:opacity-70 lg:group-hover:opacity-100 group-focus-visible:opacity-100">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-caption text-caption-ink shadow-lg">
          <svg viewBox="0 0 24 24" className="ml-0.5 h-6 w-6" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
        <span className="rounded-full bg-black/55 px-2.5 py-1 font-mono-data text-[10.5px] uppercase tracking-[0.07em] text-bone/95 backdrop-blur-sm">
          Tap for sound
        </span>
      </div>
      {/* Meta etiketi üstte: altta burned-in altyazı bandının üzerine düşüyordu. */}
      <div className="pointer-events-none absolute left-3.5 top-3.5 rounded-md bg-black/40 px-2 py-1 font-mono-data text-[11px] text-bone/90 backdrop-blur-sm">
        {item.meta}
      </div>
    </button>
  );
}

function VideoDialog({
  item,
  onClose,
}: {
  item: ShowcaseItem;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape ile kapat + açıkken sayfa scroll'unu kilitle.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Reelate short: ${item.meta}`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex w-full flex-col"
        // Genişliği yükseklikten türet: 9:16 kare + kontrol şeridi ekranı aşmasın.
        style={{ maxWidth: captionSafeMaxWidth(380) }}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute -top-11 right-0 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-bone transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caption"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
        <CaptionSafeVideo
          src={item.src}
          poster={item.poster}
          autoPlay
          className="rounded-[18px] border border-white/10"
        />
      </div>
    </div>
  );
}

export function Showcase() {
  const [active, setActive] = useState<ShowcaseItem | null>(null);

  return (
    <section id="showcase" className="scroll-mt-[72px] px-6 pb-[84px] md:px-12 lg:px-[72px]">
      <div className="mb-3 font-mono-data text-[12.5px] uppercase tracking-[0.1em] text-caption-dim">
        Showcase
      </div>
      <h2 className="mb-9 font-display text-3xl font-extrabold tracking-[-0.02em] text-bone lg:text-[42px]">
        Made with Reelate
      </h2>
      <div className="grid gap-6 sm:grid-cols-3">
        {SHOWCASE_ITEMS.map((item) => (
          <ShowcaseCard key={item.meta} item={item} onOpen={setActive} />
        ))}
      </div>
      {active ? (
        <VideoDialog item={active} onClose={() => setActive(null)} />
      ) : null}
    </section>
  );
}
