import { db } from "@/db";
import { getPackages } from "@/lib/credits/packages";
import { BuyButton } from "./buy-button";

export default async function BuyPage() {
  const packages = await getPackages(db);
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Buy credits</h1>
      <div className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
        {packages.map((pkg) => (
          <div
            key={pkg.key}
            className={`rounded-xl border p-6 ${
              pkg.featured ? "border-white" : "border-zinc-800"
            }`}
          >
            {pkg.featured && (
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide">
                Most popular
              </div>
            )}
            <div className="text-lg font-semibold">{pkg.label}</div>
            <div className="mt-1 text-3xl font-bold">
              ${(pkg.amountCents / 100).toFixed(0)}
            </div>
            <div className="mb-4 mt-1 text-sm text-zinc-400">
              {pkg.credits} credits · ~{pkg.credits} short videos
            </div>
            <BuyButton packageKey={pkg.key} />
          </div>
        ))}
      </div>
    </div>
  );
}
