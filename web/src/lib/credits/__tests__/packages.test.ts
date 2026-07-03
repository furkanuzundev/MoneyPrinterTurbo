import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { DEFAULT_PACKAGES, getPackage, getPackages } from "../packages";

const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST });
const db = drizzle(pool, { schema });

beforeEach(async () => {
  await db.execute(sql`TRUNCATE app_config`);
});
afterAll(() => pool.end());

describe("DEFAULT_PACKAGES", () => {
  it("matches spec pricing", () => {
    expect(DEFAULT_PACKAGES).toEqual([
      { key: "starter", credits: 10, amountCents: 500, label: "Starter", featured: false },
      { key: "creator", credits: 50, amountCents: 1900, label: "Creator", featured: true },
      { key: "pro", credits: 200, amountCents: 5900, label: "Pro", featured: false },
    ]);
  });
});

describe("getPackages", () => {
  it("falls back to defaults when config empty", async () => {
    expect(await getPackages(db)).toEqual(DEFAULT_PACKAGES);
  });
  it("reads override from app_config", async () => {
    const custom = [
      { key: "mini", credits: 5, amountCents: 300, label: "Mini", featured: false },
    ];
    await db.insert(schema.appConfig).values({ key: "credit_packages", value: custom });
    expect(await getPackages(db)).toEqual(custom);
  });
});

describe("getPackage", () => {
  it("finds by key", async () => {
    const pkg = await getPackage(db, "creator");
    expect(pkg?.credits).toBe(50);
  });
  it("returns undefined for unknown key", async () => {
    expect(await getPackage(db, "nope")).toBeUndefined();
  });
});
