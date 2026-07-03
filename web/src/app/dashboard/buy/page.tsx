import { db } from "@/db";
import { getPackages } from "@/lib/credits/packages";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BuyButton } from "./buy-button";

export default async function BuyPage() {
  const packages = await getPackages(db);
  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-bold tracking-[-0.02em] text-bone">
        Buy credits
      </h1>
      <div className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
        {packages.map((pkg) => {
          const perVideo = pkg.amountCents / 100 / pkg.credits;
          return (
            <Card
              key={pkg.key}
              className={pkg.featured ? "relative ring-2 ring-primary" : "relative border-0"}
            >
              {pkg.featured && (
                <Badge className="absolute -top-3 left-6">
                  Most popular
                </Badge>
              )}
              <div className="text-sm font-semibold text-bone">{pkg.label}</div>
              <div className="mt-3 font-mono-data text-4xl text-bone">
                ${(pkg.amountCents / 100).toFixed(0)}
              </div>
              <div className="mt-2 text-sm text-muted">
                {pkg.credits} credits · ~{pkg.credits} short videos
              </div>
              <div className="mt-1 font-mono-data text-xs text-muted">
                &asymp; ${perVideo.toFixed(2)} per video
              </div>
              <BuyButton packageKey={pkg.key} />
            </Card>
          );
        })}
      </div>
    </div>
  );
}
