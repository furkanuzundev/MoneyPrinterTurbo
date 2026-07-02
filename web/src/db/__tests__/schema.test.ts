import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST });
const db = drizzle(pool);

afterAll(() => pool.end());

describe("schema", () => {
  it("has all reelate tables", async () => {
    const result = await db.execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const names = result.rows.map((r) => r.table_name);
    for (const t of ["user", "credit_ledger", "video_jobs", "purchases", "app_config"]) {
      expect(names).toContain(t);
    }
  });
});
