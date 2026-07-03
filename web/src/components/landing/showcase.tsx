// Placeholder kartlar: gerçek showcase videoları hazır olana kadar mockup'taki
// stilize arka planlar kullanılır.
const SHOWCASE_ITEMS = [
  {
    title: (
      <>
        3 ChatGPT prompts that{" "}
        <mark className="bg-caption px-1 text-caption-ink">save me hours</mark>
      </>
    ),
    meta: "productivity · 0:42",
    offset: false,
  },
  {
    title: (
      <>
        Why you&apos;re{" "}
        <mark className="bg-caption px-1 text-caption-ink">always tired</mark>{" "}
        at 3pm
      </>
    ),
    meta: "health · 0:36",
    offset: true,
  },
  {
    title: (
      <>
        5 books that{" "}
        <mark className="bg-caption px-1 text-caption-ink">rewired</mark> how I
        think
      </>
    ),
    meta: "books · 0:48",
    offset: false,
  },
];

const PLACEHOLDER_BG =
  "repeating-linear-gradient(135deg, rgba(255,255,255,0.03) 0 14px, rgba(255,255,255,0.06) 14px 28px)";

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
        {SHOWCASE_ITEMS.map((item, index) => (
          <div
            key={item.meta}
            className={`relative aspect-[9/16] overflow-hidden rounded-[18px] border border-white/5 ${
              item.offset ? "sm:-mt-6" : ""
            }`}
            style={{ background: PLACEHOLDER_BG }}
            data-index={index}
          >
            <div className="absolute bottom-11 left-3.5 right-3.5 font-display text-[23px] font-extrabold leading-[1.1] text-white [text-shadow:0_3px_12px_rgba(0,0,0,0.6)]">
              {item.title}
            </div>
            <div className="absolute bottom-4 left-3.5 font-mono-data text-[11px] text-bone/90">
              {item.meta}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
