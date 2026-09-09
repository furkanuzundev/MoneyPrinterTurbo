import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

/**
 * Markalı hata çerçevesi. Daha önce hiç not-found.tsx/error.tsx yoktu ve
 * geçersiz her URL Next'in çıplak siyah-beyaz "404 | This page could not be
 * found" sayfasına düşüyordu — logo yok, ana sayfaya dönüş yok.
 */
export function ErrorShell({
  code,
  title,
  description,
  children,
}: {
  code: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col bg-ink px-6 py-10 text-bone md:px-12">
      <Link href="/" aria-label="Reelate home" className="inline-flex w-fit">
        <Logo markClassName="h-7 w-7" wordmarkClassName="text-[22px] text-bone" />
      </Link>

      <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
        <div className="font-mono-data text-[12.5px] uppercase tracking-[0.12em] text-caption-dim">
          {code}
        </div>
        <h1 className="mt-3.5 max-w-[620px] font-display text-3xl font-extrabold leading-[1.08] tracking-[-0.02em] text-bone sm:text-[44px]">
          {title}
        </h1>
        <p className="mt-4 max-w-[440px] text-base leading-relaxed text-muted">
          {description}
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3.5">
          {children}
        </div>
      </div>

      <div className="font-mono-data text-[11.5px] text-muted/70">
        &copy; 2026 Reelate
      </div>
    </main>
  );
}

export const primaryActionClass =
  "rounded-[13px] bg-caption px-[26px] py-[14px] text-[15px] font-bold text-caption-ink transition-opacity hover:opacity-90";

export const secondaryActionClass =
  "rounded-[13px] border border-white/12 px-[22px] py-[14px] text-[15px] font-semibold text-bone transition-colors hover:border-white/30";
