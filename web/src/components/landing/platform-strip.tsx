const PLATFORMS = [
  "TikTok",
  "Instagram Reels",
  "YouTube Shorts",
  "LinkedIn",
  "Facebook",
];

export function PlatformStrip() {
  return (
    <div className="flex items-center gap-6 border-y border-white/5 px-6 py-[22px] md:px-12 lg:gap-[38px] lg:px-[72px]">
      <span className="whitespace-nowrap font-mono-data text-xs uppercase tracking-[0.1em] text-muted/70">
        Made for
      </span>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-base font-semibold text-muted lg:gap-x-10 lg:text-lg">
        {PLATFORMS.map((platform) => (
          <span key={platform}>{platform}</span>
        ))}
      </div>
    </div>
  );
}
