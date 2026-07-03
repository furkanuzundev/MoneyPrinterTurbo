import type { HTMLAttributes, ReactNode } from "react";

function cx(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

const BUTTON_BASE =
  "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-caption disabled:opacity-50 disabled:pointer-events-none";
const BUTTON_VARIANTS = {
  primary: "bg-caption text-ink hover:brightness-110",
  ghost: "border border-line text-bone hover:bg-panel",
} as const;

/** Shared class string so non-<button> elements (e.g. next/link) can match Button's look. */
export function buttonClasses(
  variant: keyof typeof BUTTON_VARIANTS = "primary",
  className?: string,
) {
  return cx(BUTTON_BASE, BUTTON_VARIANTS[variant], className);
}

/**
 * NOTE: kept alongside shadcn's Card because the landing/use-cases/signin/buy
 * screens still use it and must stay byte-identical (see project constraints).
 * App/dashboard screens should prefer @/components/ui/card going forward.
 */
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cx("rounded-2xl border border-line bg-panel p-6", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export interface CaptionChipProps extends HTMLAttributes<HTMLSpanElement> {
  children?: ReactNode;
}

export function CaptionChip({ className, children, ...props }: CaptionChipProps) {
  return (
    <span
      className={cx(
        "inline-block -rotate-1 rounded-md bg-caption px-2 py-0.5 text-sm font-bold text-ink",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export interface MonoStatProps {
  label: string;
  value: string | number;
  className?: string;
}

export function MonoStat({ label, value, className }: MonoStatProps) {
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <span className="font-mono-data text-2xl text-bone">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}
