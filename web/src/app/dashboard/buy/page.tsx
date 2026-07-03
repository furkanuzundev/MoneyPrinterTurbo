import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { getPackages } from "@/lib/credits/packages";
import { getBalance } from "@/lib/credits/ledger";
import { BuyButton } from "./buy-button";

const FEATURES: Record<string, string[]> = {
  default: ["All voices & languages", "9:16, 1:1 & 16:9", "Watermark-free"],
};

export default async function BuyPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/signin");

  const [packages, balance] = await Promise.all([
    getPackages(db),
    getBalance(db, userId),
  ]);
  const baselinePerVideo = Math.max(
    ...packages.map((pkg) => pkg.amountCents / pkg.credits),
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1.5 font-display text-3xl font-extrabold tracking-[-0.02em] text-bone lg:text-[34px]">
          Buy credits
        </h1>
        <p className="text-[15px] text-muted">
          Credits never expire. One credit &asymp; one short video.
        </p>
      </div>

      <div className="mb-8 flex flex-col gap-3 rounded-2xl border border-caption/25 bg-gradient-to-br from-[#241F12] to-[#16130B] px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-caption/15 text-xl text-caption">
            ◆
          </span>
          <div>
            <div className="font-mono-data text-[11px] uppercase tracking-[0.08em] text-muted">
              Current balance
            </div>
            <div className="font-display text-2xl font-extrabold text-caption">
              {balance} credits
            </div>
          </div>
        </div>
        <span className="font-mono-data text-xs text-muted/80">
          &asymp; {balance} more videos
        </span>
      </div>

      <div className="grid items-stretch gap-5 pt-3 sm:grid-cols-3">
        {packages.map((pkg) => {
          const perVideoCents = pkg.amountCents / pkg.credits;
          const savePercent = Math.round(
            (1 - perVideoCents / baselinePerVideo) * 100,
          );
          const features = FEATURES[pkg.key] ?? FEATURES.default;

          return (
            <div
              key={pkg.key}
              className={
                pkg.featured
                  ? "relative flex flex-col rounded-[20px] border-[1.5px] border-caption bg-gradient-to-br from-[#241F12] to-[#17140C] p-[30px] shadow-[0_30px_70px_rgba(244,198,58,0.08)]"
                  : "flex flex-col rounded-[20px] border border-white/[0.07] bg-panel p-[30px]"
              }
            >
              {pkg.featured && (
                <div className="absolute -top-[13px] left-[30px] rounded-full bg-caption px-3 py-[5px] font-mono-data text-[11px] font-bold tracking-[0.05em] text-caption-ink">
                  MOST POPULAR
                </div>
              )}
              <div className="text-base font-bold text-bone">{pkg.label}</div>
              <div className="mb-1 mt-3.5 font-display text-[44px] font-extrabold text-bone">
                ${(pkg.amountCents / 100).toFixed(0)}
              </div>
              <div className="text-sm text-muted">
                {pkg.credits} credits &middot; ~{pkg.credits} shorts
              </div>
              <div
                className={`mt-[5px] font-mono-data text-xs ${
                  pkg.featured ? "text-caption-dim" : "text-muted/80"
                }`}
              >
                &asymp; ${(perVideoCents / 100).toFixed(2)} / video
                {savePercent > 0 ? ` · save ${savePercent}%` : ""}
              </div>
              <div className="my-5 h-px bg-white/5" />
              <div className="text-[13.5px] leading-[1.9] text-muted">
                {features.map((feature) => (
                  <div key={feature}>✓ {feature}</div>
                ))}
              </div>
              <div className="flex-1" />
              <BuyButton
                packageKey={pkg.key}
                label={pkg.label}
                featured={pkg.featured}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
