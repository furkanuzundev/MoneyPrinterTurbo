import type { MetadataRoute } from "next";
import { USE_CASES } from "@/lib/seo/use-cases";

const BASE_URL = "https://reelate.co";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, priority: 1 },
    { url: `${BASE_URL}/signin`, priority: 0.5 },
    { url: `${BASE_URL}/use-cases`, priority: 0.8 },
  ];

  const useCaseRoutes: MetadataRoute.Sitemap = USE_CASES.map((useCase) => ({
    url: `${BASE_URL}/use-cases/${useCase.slug}`,
    priority: 0.7,
  }));

  return [...staticRoutes, ...useCaseRoutes];
}
