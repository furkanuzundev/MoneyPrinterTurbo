import { cn } from "@/lib/utils";

// The Reelate "R" mark — the app's core brand element. Rendered inline as SVG
// so it stays crisp at any size and needs no network request. Icon files under
// public/brand/ + src/app/ are generated from the same geometry via
// scripts/generate-icons.mjs; keep the path here in sync if the mark changes.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={cn("h-[30px] w-[30px]", className)}
      role="img"
      aria-label="Reelate"
    >
      <rect width="512" height="512" rx="114" fill="var(--color-caption)" />
      <path
        fill="var(--color-caption-ink)"
        transform="translate(0 6)"
        d="M150 128 h132 c56 0 96 38 96 92 c0 42 -24 73 -62 86 l70 106 a4 4 0 0 1 -3 6 h-58 a4 4 0 0 1 -3 -2 l-64 -100 h-34 v98 a4 4 0 0 1 -4 4 h-53 a4 4 0 0 1 -4 -4 V132 a4 4 0 0 1 4 -4 Z M211 182 v78 h60 c26 0 41 -15 41 -39 c0 -24 -15 -39 -41 -39 Z"
      />
    </svg>
  );
}

// Mark + wordmark lockup. `wordmark={false}` renders the chip alone.
export function Logo({
  className,
  markClassName,
  wordmark = true,
  wordmarkClassName,
}: {
  className?: string;
  markClassName?: string;
  wordmark?: boolean;
  wordmarkClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={markClassName} />
      {wordmark ? (
        <span
          className={cn(
            "font-display font-extrabold tracking-[-0.02em]",
            wordmarkClassName,
          )}
        >
          Reelate
        </span>
      ) : null}
    </span>
  );
}
