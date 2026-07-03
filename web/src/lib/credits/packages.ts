import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { appConfig } from "@/db/schema";

export type CreditPackage = {
  key: string;
  credits: number;
  amountCents: number;
  label: string;
  featured: boolean;
};

// Spec Bölüm 5 fiyatlaması; app_config 'credit_packages' anahtarıyla ezilebilir.
export const DEFAULT_PACKAGES: CreditPackage[] = [
  { key: "starter", credits: 10, amountCents: 500, label: "Starter", featured: false },
  { key: "creator", credits: 50, amountCents: 1900, label: "Creator", featured: true },
  { key: "pro", credits: 200, amountCents: 5900, label: "Pro", featured: false },
];

export async function getPackages(db: Db): Promise<CreditPackage[]> {
  const [row] = await db
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, "credit_packages"));
  if (row) return row.value as CreditPackage[];
  return DEFAULT_PACKAGES;
}

export async function getPackage(
  db: Db,
  key: string,
): Promise<CreditPackage | undefined> {
  const packages = await getPackages(db);
  return packages.find((p) => p.key === key);
}
