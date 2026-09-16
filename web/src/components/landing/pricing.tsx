import Link from "next/link";
import { CreditCostTable } from "@/components/credits/credit-cost-table";
import { packageCta } from "@/lib/auth/cta";
import {
  CREDITS_FREE_NOTE,
  CREDITS_REFUND_NOTE,
  CREDITS_TAGLINE,
  formatCreditsForPack,
  perVideoCents,
} from "@/lib/credits/copy";
import type { CreditPackage } from "@/lib/credits/packages";

export function Pricing({
  packages,
  signedIn = false,
}: {
  packages: CreditPackage[];
  signedIn?: boolean;
}) {
  // "save %" en pahalı video başı fiyata (en küçük paket) göre hesaplanır.
  // Video başı fiyat 60 sn referans videoya göre; bir kredi bir video değil.
  const baselinePerVideo = Math.max(
    ...packages.map((pkg) => perVideoCents(pkg.amountCents, pkg.credits)),
  );

  return (
    <section id="pricing" className="scroll-mt-[72px] px-6 pb-[84px] md:px-12 lg:px-[72px]">
      <div className="mb-11 text-center">
        <div className="mb-3 font-mono-data text-[12.5px] uppercase tracking-[0.1em] text-caption-dim">
          Pricing
        </div>
        <h2 className="mb-2.5 font-display text-3xl font-extrabold tracking-[-0.02em] text-bone lg:text-[44px]">
          Simple, pay-as-you-go
        </h2>
        <p className="text-base text-muted">{CREDITS_TAGLINE}</p>
        <CreditCostTable className="mt-5" />
        <p className="mx-auto mt-4 max-w-[520px] text-[13.5px] leading-relaxed text-muted/80">
          {CREDITS_REFUND_NOTE} {CREDITS_FREE_NOTE}
        </p>
      </div>
      <div className="grid items-stretch gap-5 pt-3 sm:grid-cols-3">
        {packages.map((pkg) => {
          const cents = perVideoCents(pkg.amountCents, pkg.credits);
          const savePercent = Math.round((1 - cents / baselinePerVideo) * 100);
          const perVideoLine = `≈ $${(cents / 100).toFixed(2)} / 60s video${
            savePercent > 0 ? ` · save ${savePercent}%` : ""
          }`;

          return pkg.featured ? (
            <div
              key={pkg.key}
              className="relative flex flex-col rounded-[20px] border-[1.5px] border-caption bg-gradient-to-br from-[#241F12] to-[#17140C] p-8 shadow-[0_30px_70px_rgba(244,198,58,0.08)]"
            >
              <div className="absolute -top-[13px] left-8 rounded-full bg-caption px-[11px] py-[5px] font-mono-data text-[11px] font-bold tracking-[0.06em] text-caption-ink">
                MOST POPULAR
              </div>
              <PackageBody pkg={pkg} perVideoLine={perVideoLine} highlight />
              <Link
                href={packageCta(signedIn, pkg.label).href}
                className="mt-[26px] rounded-xl bg-caption p-3.5 text-center text-[15px] font-bold text-caption-ink transition-opacity hover:opacity-90"
              >
                {packageCta(signedIn, pkg.label).label}
              </Link>
            </div>
          ) : (
            <div
              key={pkg.key}
              className="flex flex-col rounded-[20px] border border-white/[0.07] bg-panel p-8"
            >
              <PackageBody pkg={pkg} perVideoLine={perVideoLine} />
              <Link
                href={packageCta(signedIn, pkg.label).href}
                className="mt-[26px] rounded-xl border border-white/15 p-[13px] text-center text-[15px] font-bold text-bone transition-colors hover:border-white/30"
              >
                {packageCta(signedIn, pkg.label).label}
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PackageBody({
  pkg,
  perVideoLine,
  highlight = false,
}: {
  pkg: CreditPackage;
  perVideoLine: string;
  highlight?: boolean;
}) {
  return (
    <>
      <div className="text-[17px] font-bold text-bone">{pkg.label}</div>
      <div className="mb-1.5 mt-4 font-display text-5xl font-extrabold text-bone">
        ${(pkg.amountCents / 100).toFixed(0)}
      </div>
      <div className="text-[15px] text-muted">
        {formatCreditsForPack(pkg.credits)}
      </div>
      <div
        className={`mt-1.5 font-mono-data text-[12.5px] ${
          highlight ? "text-caption-dim" : "text-muted/80"
        }`}
      >
        {perVideoLine}
      </div>
      <div className="flex-1" />
    </>
  );
}
