"use client";

import { useEffect, useRef, useState } from "react";

// Her kart bir Reelate çıktısıdır. Videolar public/showcase/showcase-{1,2,3}.mp4
// (+ .jpg poster) olarak beklenir. Videolarda burned-in altyazı zaten var, o
// yüzden kart yalnızca videoyu + küçük bir meta etiketini gösterir. Dosya yoksa
// kart stilize placeholder arka planına düşer (bölüm yine de yayınlanabilir).
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

function ShowcaseCard({ item }: { item: ShowcaseItem }) {
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
    <div
      className={`relative aspect-[9/16] overflow-hidden rounded-[18px] border border-white/5 ${
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
          aria-label={`A short video made with Reelate: ${item.meta}`}
          onError={() => setFailed(true)}
        />
      ) : null}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
      <div className="pointer-events-none absolute bottom-3.5 left-3.5 rounded-md bg-black/40 px-2 py-1 font-mono-data text-[11px] text-bone/90 backdrop-blur-sm">
        {item.meta}
      </div>
    </div>
  );
}

export function Showcase() {
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
          <ShowcaseCard key={item.meta} item={item} />
        ))}
      </div>
    </section>
  );
}
