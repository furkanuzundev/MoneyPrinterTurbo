const POST_TARGETS = [
  { label: "TikTok", href: "https://www.tiktok.com/upload" },
  { label: "Reels", href: "https://www.instagram.com" },
  { label: "Shorts", href: "https://studio.youtube.com" },
];

export function PostTo({ size = "md" }: { size?: "sm" | "md" }) {
  const cls =
    size === "sm"
      ? "rounded-[9px] px-3.5 py-2 text-[13px]"
      : "rounded-[10px] px-[15px] py-[9px] text-[13.5px]";
  return (
    <div className="flex gap-2">
      {POST_TARGETS.map((target) => (
        <a
          key={target.label}
          href={target.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`border border-white/10 font-semibold text-bone/80 transition-colors hover:border-white/25 ${cls}`}
        >
          {target.label}
        </a>
      ))}
    </div>
  );
}
