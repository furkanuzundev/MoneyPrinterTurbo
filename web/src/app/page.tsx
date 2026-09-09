import { db } from "@/db";
import {
  DEFAULT_PACKAGES,
  getPackages,
  type CreditPackage,
} from "@/lib/credits/packages";
import { LandingHeader } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { PlatformStrip } from "@/components/landing/platform-strip";
import { HowItWorks } from "@/components/landing/how-it-works";
import { FeatureBento } from "@/components/landing/feature-bento";
import { InsideTheEditor } from "@/components/landing/inside-the-editor";
import { Showcase } from "@/components/landing/showcase";
import { FactsStrip } from "@/components/landing/facts-strip";
import { Pricing } from "@/components/landing/pricing";
import { CreditsFaq } from "@/components/landing/credits-faq";
import { FinalCta } from "@/components/landing/final-cta";
import { LandingFooter } from "@/components/landing/footer";
import "./landing.css";

export default async function Home() {
  // Landing statik prerender edilir; Docker build ortamında DB yoktur.
  // Fiyat GÖSTERİMİ için varsayılanlara düşmek güvenlidir — gerçek ücret
  // her zaman checkout anında sunucuda DB'den doğrulanır.
  let packages: CreditPackage[];
  try {
    packages = await getPackages(db);
  } catch {
    packages = DEFAULT_PACKAGES;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1240px] flex-col">
      <LandingHeader />
      <Hero />
      <PlatformStrip />
      <HowItWorks />
      <FeatureBento />
      <InsideTheEditor />
      <Showcase />
      <FactsStrip />
      <Pricing packages={packages} />
      <CreditsFaq />
      <FinalCta />
      <LandingFooter />
    </main>
  );
}
