"use client";

import { useEffect, useRef, useState } from "react";

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
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
      {/* Play afordansı: sesli açılacağını belli eder. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-caption text-caption-ink shadow-lg">
          <svg viewBox="0 0 24 24" className="ml-0.5 h-6 w-6" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </div>
      <div className="pointer-events-none absolute bottom-3.5 left-3.5 rounded-md bg-black/40 px-2 py-1 font-mono-data text-[11px] text-bone/90 backdrop-blur-sm">
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
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[88vh] w-full max-w-[380px] flex-col"
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
        {/* Altyazılar görüntüye burned-in olduğu için ayrı <track> yok. */}
        <video
          className="max-h-[88vh] w-full rounded-[18px] border border-white/10 bg-black object-contain"
          src={item.src}
          poster={item.poster}
          controls
          autoPlay
          playsInline
        />
      </div>
    </div>
  );
}

export function Showcase() {
  const [active, setActive] = useState<ShowcaseItem | null>(null);

  return (
    <section id="showcase" className="px-6 pb-[84px] md:px-12 lg:px-[72px]">
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
