# Reelate Faz 2a — Next.js Temeli + Kredi Defteri + Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `web/` altında Next.js SaaS temeli: Postgres şeması, hareket-bazlı kredi defteri, Auth.js girişi (Google + e-posta), hoş geldin bonusu ve bakiye gösteren korumalı panel.

**Architecture:** Monorepo — mevcut Python motoru repo kökünde kalır, SaaS uygulaması `web/` dizininde yaşar. Postgres'e Drizzle ORM ile erişilir; kredi bakiyesi tutulmaz, `credit_ledger` hareketlerinin toplamıdır; harcama, kullanıcı satırı kilitlenerek tek transaction'da yapılır (spec Bölüm 4). Auth.js v5 (next-auth beta) Drizzle adapter ile; kullanıcı oluşturulduğunda hoş geldin bonusu idempotent yazılır.

**Tech Stack:** Next.js 15 (App Router, TypeScript, Tailwind), Drizzle ORM + node-postgres, Auth.js v5 (`next-auth@beta` + `@auth/drizzle-adapter`), Vitest, Docker Compose (Postgres 16).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-03-reelate-credit-saas-design.md` — Bölüm 4 (veri modeli), 5 (kredi), 7 (UX)
- Kredi defteri hareket tipleri tam olarak: `purchase | spend | refund | welcome_bonus`; bakiye = `sum(delta)`
- Kredi düşme + iş kaydı **tek veritabanı transaction'ında**; yetersiz bakiyede hiçbir satır yazılmaz
- Hoş geldin bonusu: **2 kredi**, kullanıcı başına en fazla bir kez (idempotent)
- Kredi kademeleri (Bölüm 5): 30 sn=1, 60 sn=2, 90 sn=3, 180 sn=6; konuşma hızı tahmini **2,5 kelime/sn**
- Site dili İngilizce (kullanıcıya görünen tüm metinler)
- Web testleri: `cd web && npm test` (vitest); commit'ler `web/` scope'lu, mesaj sonu: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Gizli değerler `.env.local`'da (gitignored); `.env.example` commit'lenir, gerçek değer içermez

---

### Task 1: Next.js iskeleti + Vitest

**Files:**
- Create: `web/` (create-next-app ile), `web/vitest.config.ts`, `web/src/lib/__tests__/smoke.test.ts`
- Modify: `web/package.json` (test script)

**Interfaces:**
- Produces: `cd web && npm run dev` çalışan uygulama; `npm test` vitest koşusu; `@/` alias'ı `web/src/`

- [ ] **Step 1: Scaffold**

```bash
cd /Users/furkanuzun/Documents/GitHub/MoneyPrinterTurbo/MoneyPrinterTurbo
npx create-next-app@15 web --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack
```

(Sorulan her soruda varsayılanı kabul et; komut interaktif kalırsa bayrakların tamamı verildiği için sormaz.)

- [ ] **Step 2: Vitest kur**

```bash
cd web && npm install -D vitest @vitejs/plugin-react vite-tsconfig-paths
```

`web/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

`web/package.json` scripts'e ekle: `"test": "vitest run"`.

- [ ] **Step 3: Smoke test yaz ve koş**

`web/src/lib/__tests__/smoke.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

describe("vitest smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `cd web && npm test`
Expected: 1 passed

- [ ] **Step 4: Dev server doğrula**

Run: `cd web && npm run build`
Expected: build başarılı (exit 0)

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "feat(web): scaffold Next.js app with vitest"
```

---

### Task 2: Dev Postgres + Drizzle şeması + migration

**Files:**
- Create: `docker-compose.dev.yml` (repo kökü), `web/.env.example`, `web/drizzle.config.ts`, `web/src/db/schema.ts`, `web/src/db/index.ts`
- Test: `web/src/db/__tests__/schema.test.ts`

**Interfaces:**
- Produces:
  - `db` (drizzle instance) — `web/src/db/index.ts` export'u; `DATABASE_URL` env'den bağlanır
  - Şema tabloları: `users, accounts, sessions, verificationTokens` (Auth.js adapter standardı) + `creditLedger, videoJobs, purchases, appConfig`
  - `creditLedger` kolonları: `id serial pk, userId, delta integer, kind ('purchase'|'spend'|'refund'|'welcome_bonus'), jobId uuid nullable, purchaseId text nullable, createdAt`
  - `videoJobs` kolonları: `id uuid pk default random, userId, subject text, script text, terms jsonb, aspect text, voice text, targetSeconds integer, credits integer, status ('queued'|'script'|'downloading'|'rendering'|'done'|'failed') default 'queued', outputPath text nullable, error text nullable, createdAt, updatedAt`
  - `purchases` kolonları: `id serial pk, userId, stripeSessionId text unique, packageKey text, credits integer, amountCents integer, status text default 'pending', createdAt`
  - `appConfig`: `key text pk, value jsonb`

- [ ] **Step 1: Docker Compose dev dosyası**

`docker-compose.dev.yml` (repo kökü):

```yaml
# Yerel geliştirme bağımlılıkları. Redis zaten `reelate-redis` adıyla çalışıyorsa
# önce onu durdurun veya sadece postgres servisini başlatın:
#   docker compose -f docker-compose.dev.yml up -d postgres
services:
  postgres:
    image: postgres:16-alpine
    container_name: reelate-postgres
    environment:
      POSTGRES_USER: reelate
      POSTGRES_PASSWORD: reelate_dev
      POSTGRES_DB: reelate
    ports:
      - "5432:5432"
    volumes:
      - reelate_pg_data:/var/lib/postgresql/data
  redis:
    image: redis:7-alpine
    container_name: reelate-redis-compose
    ports:
      - "6379:6379"
    profiles: ["full"]
volumes:
  reelate_pg_data:
```

Başlat: `docker compose -f docker-compose.dev.yml up -d postgres`

- [ ] **Step 2: Drizzle bağımlılıkları**

```bash
cd web && npm install drizzle-orm pg && npm install -D drizzle-kit @types/pg dotenv
```

`web/.env.example`:

```bash
DATABASE_URL=postgres://reelate:reelate_dev@localhost:5432/reelate
DATABASE_URL_TEST=postgres://reelate:reelate_dev@localhost:5432/reelate_test
AUTH_SECRET=change-me
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
```

`web/.env.local` oluştur (gitignored — create-next-app'in .gitignore'u `.env*` içerir; `!.env.example` satırı ekle): example'ın kopyası + `AUTH_SECRET=$(openssl rand -hex 32)` çıktısı.

- [ ] **Step 3: Şema yaz**

`web/src/db/schema.ts`:

```typescript
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// ---- Auth.js standart tablolar (https://authjs.dev/getting-started/adapters/drizzle)
export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

// ---- Reelate tabloları (spec Bölüm 4)
export const creditLedger = pgTable("credit_ledger", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  delta: integer("delta").notNull(),
  kind: text("kind", {
    enum: ["purchase", "spend", "refund", "welcome_bonus"],
  }).notNull(),
  jobId: uuid("job_id"),
  purchaseId: text("purchase_id"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const videoJobs = pgTable("video_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  script: text("script").notNull(),
  terms: jsonb("terms").$type<string[]>().notNull(),
  aspect: text("aspect").notNull().default("9:16"),
  voice: text("voice").notNull(),
  targetSeconds: integer("target_seconds").notNull(),
  credits: integer("credits").notNull(),
  status: text("status", {
    enum: ["queued", "script", "downloading", "rendering", "done", "failed"],
  })
    .notNull()
    .default("queued"),
  outputPath: text("output_path"),
  error: text("error"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const purchases = pgTable("purchases", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeSessionId: text("stripe_session_id").unique(),
  packageKey: text("package_key").notNull(),
  credits: integer("credits").notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const appConfig = pgTable("app_config", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});
```

`web/src/db/index.ts`:

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
export type Db = typeof db;
```

`web/drizzle.config.ts`:

```typescript
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

`web/package.json` scripts'e ekle: `"db:push": "drizzle-kit push", "db:generate": "drizzle-kit generate", "db:migrate": "drizzle-kit migrate"`.

Not: drizzle-kit `.env.local`'ı otomatik okumaz; `dotenv/config` yalnızca `.env` okur. `web/.env` dosyası oluştur (yalnızca DATABASE_URL satırı, gitignored) veya komutları `DATABASE_URL=... npm run db:push` ile çalıştır.

- [ ] **Step 4: Migration üret ve uygula; test veritabanını hazırla**

```bash
cd web && npm run db:generate && npm run db:migrate
docker exec reelate-postgres psql -U reelate -c "CREATE DATABASE reelate_test;"
DATABASE_URL=postgres://reelate:reelate_dev@localhost:5432/reelate_test npm run db:migrate
```

- [ ] **Step 5: Failing şema testi yaz, koş**

`web/src/db/__tests__/schema.test.ts` (gerçek test DB'sine bağlanır):

```typescript
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
```

Vitest'e env yüklemek için `web/vitest.config.ts`'i güncelle:

```typescript
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

Run: `cd web && npm test`
Expected: schema testi PASS (migration Step 4'te uygulandığı için)

- [ ] **Step 6: Commit**

```bash
git add docker-compose.dev.yml web
git commit -m "feat(web): add postgres schema and drizzle setup"
```

---

### Task 3: Kredi hesap modülü (saf fonksiyonlar)

**Files:**
- Create: `web/src/lib/credits/pricing.ts`
- Test: `web/src/lib/credits/__tests__/pricing.test.ts`

**Interfaces:**
- Produces (hepsi `web/src/lib/credits/pricing.ts` export'u):
  - `DURATION_TIERS: { seconds: number; credits: number }[]` — `[{30,1},{60,2},{90,3},{180,6}]`
  - `creditsForDuration(seconds: number): number` — saniyeyi kapsayan en küçük kademenin kredisi; 180'i aşarsa `Math.ceil(seconds/30)`
  - `estimateDurationSeconds(script: string): number` — kelime sayısı / 2.5, yukarı yuvarlanır; boş metin 0
  - `WELCOME_BONUS_CREDITS = 2`

- [ ] **Step 1: Failing test**

`web/src/lib/credits/__tests__/pricing.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  creditsForDuration,
  estimateDurationSeconds,
  DURATION_TIERS,
  WELCOME_BONUS_CREDITS,
} from "../pricing";

describe("creditsForDuration", () => {
  it("maps tier boundaries", () => {
    expect(creditsForDuration(30)).toBe(1);
    expect(creditsForDuration(60)).toBe(2);
    expect(creditsForDuration(90)).toBe(3);
    expect(creditsForDuration(180)).toBe(6);
  });
  it("rounds up between tiers", () => {
    expect(creditsForDuration(31)).toBe(2); // 30'u aştı -> 60 kademesi
    expect(creditsForDuration(61)).toBe(3);
    expect(creditsForDuration(91)).toBe(6); // 90'ı aştı -> 180 kademesi
  });
  it("handles beyond the largest tier", () => {
    expect(creditsForDuration(181)).toBe(7); // ceil(181/30)
    expect(creditsForDuration(240)).toBe(8);
  });
  it("minimum one credit for any positive duration", () => {
    expect(creditsForDuration(5)).toBe(1);
  });
});

describe("estimateDurationSeconds", () => {
  it("uses 2.5 words per second", () => {
    const words = Array(150).fill("word").join(" ");
    expect(estimateDurationSeconds(words)).toBe(60);
  });
  it("rounds up", () => {
    const words = Array(151).fill("word").join(" ");
    expect(estimateDurationSeconds(words)).toBe(61);
  });
  it("returns 0 for empty script", () => {
    expect(estimateDurationSeconds("")).toBe(0);
    expect(estimateDurationSeconds("   ")).toBe(0);
  });
});

describe("constants", () => {
  it("welcome bonus is 2", () => {
    expect(WELCOME_BONUS_CREDITS).toBe(2);
  });
  it("tiers match spec", () => {
    expect(DURATION_TIERS).toEqual([
      { seconds: 30, credits: 1 },
      { seconds: 60, credits: 2 },
      { seconds: 90, credits: 3 },
      { seconds: 180, credits: 6 },
    ]);
  });
});
```

- [ ] **Step 2: FAIL doğrula**

Run: `cd web && npm test -- pricing`
Expected: FAIL — modül yok

- [ ] **Step 3: Implementasyon**

`web/src/lib/credits/pricing.ts`:

```typescript
// Spec Bölüm 5: 1 kredi = 30 sn hedef süre; kademeler ve 2.5 kelime/sn tahmini.
export const DURATION_TIERS = [
  { seconds: 30, credits: 1 },
  { seconds: 60, credits: 2 },
  { seconds: 90, credits: 3 },
  { seconds: 180, credits: 6 },
] as const satisfies readonly { seconds: number; credits: number }[];

export const WELCOME_BONUS_CREDITS = 2;

const WORDS_PER_SECOND = 2.5;

export function creditsForDuration(seconds: number): number {
  for (const tier of DURATION_TIERS) {
    if (seconds <= tier.seconds) return tier.credits;
  }
  return Math.ceil(seconds / 30);
}

export function estimateDurationSeconds(script: string): number {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words / WORDS_PER_SECOND);
}
```

- [ ] **Step 4: PASS doğrula**

Run: `cd web && npm test -- pricing`
Expected: tümü PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/credits
git commit -m "feat(web): add credit pricing and duration estimation"
```

---

### Task 4: Kredi defteri (atomik harcama, idempotent bonus/iade)

**Files:**
- Create: `web/src/lib/credits/ledger.ts`
- Test: `web/src/lib/credits/__tests__/ledger.test.ts`

**Interfaces:**
- Consumes: `db` tipi (Task 2), şema tabloları, `WELCOME_BONUS_CREDITS` (Task 3)
- Produces (hepsi `Db` parametreli — test edilebilirlik için bağlantı dışarıdan verilir):
  - `getBalance(db: Db, userId: string): Promise<number>`
  - `grantWelcomeBonus(db: Db, userId: string): Promise<boolean>` — daha önce verildiyse `false`, verdiyse `true`
  - `spendCreditsForJob(db: Db, userId: string, job: { subject: string; script: string; terms: string[]; aspect: string; voice: string; targetSeconds: number; credits: number }): Promise<{ jobId: string }>` — yetersiz bakiyede `InsufficientCreditsError` fırlatır, hiçbir satır yazılmaz
  - `refundJob(db: Db, jobId: string): Promise<boolean>` — spend kaydı varsa ve daha önce iade edilmediyse refund satırı yazar (`true`); aksi halde `false`
  - `class InsufficientCreditsError extends Error`

- [ ] **Step 1: Failing test**

`web/src/lib/credits/__tests__/ledger.test.ts`:

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import {
  getBalance,
  grantWelcomeBonus,
  InsufficientCreditsError,
  refundJob,
  spendCreditsForJob,
} from "../ledger";

const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST });
const db = drizzle(pool, { schema });

const JOB = {
  subject: "morning habits",
  script: "drink water move your body write one goal",
  terms: ["morning", "coffee"],
  aspect: "9:16",
  voice: "en-US-JennyNeural-Female",
  targetSeconds: 60,
  credits: 2,
};

let userId: string;

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user", credit_ledger, video_jobs CASCADE`);
  const [u] = await db
    .insert(schema.users)
    .values({ email: "t@example.com" })
    .returning();
  userId = u.id;
});

afterAll(() => pool.end());

describe("grantWelcomeBonus", () => {
  it("grants 2 credits once", async () => {
    expect(await grantWelcomeBonus(db, userId)).toBe(true);
    expect(await getBalance(db, userId)).toBe(2);
  });
  it("is idempotent", async () => {
    await grantWelcomeBonus(db, userId);
    expect(await grantWelcomeBonus(db, userId)).toBe(false);
    expect(await getBalance(db, userId)).toBe(2);
  });
});

describe("spendCreditsForJob", () => {
  it("creates job and ledger row atomically", async () => {
    await grantWelcomeBonus(db, userId);
    const { jobId } = await spendCreditsForJob(db, userId, JOB);
    expect(jobId).toBeTruthy();
    expect(await getBalance(db, userId)).toBe(0);
    const jobs = await db.select().from(schema.videoJobs);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("queued");
    expect(jobs[0].credits).toBe(2);
  });
  it("rejects insufficient balance and writes nothing", async () => {
    await expect(spendCreditsForJob(db, userId, JOB)).rejects.toThrow(
      InsufficientCreditsError,
    );
    expect(await getBalance(db, userId)).toBe(0);
    expect(await db.select().from(schema.videoJobs)).toHaveLength(0);
  });
  it("prevents double-spend under concurrency", async () => {
    await grantWelcomeBonus(db, userId); // 2 kredi, her iş 2 kredi
    const results = await Promise.allSettled([
      spendCreditsForJob(db, userId, JOB),
      spendCreditsForJob(db, userId, JOB),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);
    expect(await getBalance(db, userId)).toBe(0);
  });
});

describe("refundJob", () => {
  it("refunds a spent job once", async () => {
    await grantWelcomeBonus(db, userId);
    const { jobId } = await spendCreditsForJob(db, userId, JOB);
    expect(await refundJob(db, jobId)).toBe(true);
    expect(await getBalance(db, userId)).toBe(2);
    expect(await refundJob(db, jobId)).toBe(false); // idempotent
    expect(await getBalance(db, userId)).toBe(2);
  });
  it("returns false for unknown job", async () => {
    expect(await refundJob(db, "00000000-0000-0000-0000-000000000000")).toBe(false);
  });
});
```

- [ ] **Step 2: FAIL doğrula**

Run: `cd web && npm test -- ledger`
Expected: FAIL — modül yok

- [ ] **Step 3: Implementasyon**

`web/src/lib/credits/ledger.ts`:

```typescript
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { creditLedger, users, videoJobs } from "@/db/schema";
import { WELCOME_BONUS_CREDITS } from "./pricing";

export class InsufficientCreditsError extends Error {
  constructor() {
    super("Insufficient credits");
    this.name = "InsufficientCreditsError";
  }
}

export async function getBalance(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ balance: sql<number>`coalesce(sum(${creditLedger.delta}), 0)::int` })
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId));
  return row.balance;
}

export async function grantWelcomeBonus(db: Db, userId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Kullanıcı satırını kilitle: aynı kullanıcı için eşzamanlı bonus/harcama serileşir.
    await tx.execute(sql`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`);
    const existing = await tx
      .select({ id: creditLedger.id })
      .from(creditLedger)
      .where(
        and(eq(creditLedger.userId, userId), eq(creditLedger.kind, "welcome_bonus")),
      );
    if (existing.length > 0) return false;
    await tx.insert(creditLedger).values({
      userId,
      delta: WELCOME_BONUS_CREDITS,
      kind: "welcome_bonus",
    });
    return true;
  });
}

export async function spendCreditsForJob(
  db: Db,
  userId: string,
  job: {
    subject: string;
    script: string;
    terms: string[];
    aspect: string;
    voice: string;
    targetSeconds: number;
    credits: number;
  },
): Promise<{ jobId: string }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`);
    const [row] = await tx
      .select({ balance: sql<number>`coalesce(sum(${creditLedger.delta}), 0)::int` })
      .from(creditLedger)
      .where(eq(creditLedger.userId, userId));
    if (row.balance < job.credits) throw new InsufficientCreditsError();
    const [created] = await tx
      .insert(videoJobs)
      .values({
        userId,
        subject: job.subject,
        script: job.script,
        terms: job.terms,
        aspect: job.aspect,
        voice: job.voice,
        targetSeconds: job.targetSeconds,
        credits: job.credits,
      })
      .returning({ id: videoJobs.id });
    await tx.insert(creditLedger).values({
      userId,
      delta: -job.credits,
      kind: "spend",
      jobId: created.id,
    });
    return { jobId: created.id };
  });
}

export async function refundJob(db: Db, jobId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [spend] = await tx
      .select({ userId: creditLedger.userId, delta: creditLedger.delta })
      .from(creditLedger)
      .where(and(eq(creditLedger.jobId, jobId), eq(creditLedger.kind, "spend")));
    if (!spend) return false;
    await tx.execute(
      sql`SELECT id FROM "user" WHERE id = ${spend.userId} FOR UPDATE`,
    );
    const [refund] = await tx
      .select({ id: creditLedger.id })
      .from(creditLedger)
      .where(and(eq(creditLedger.jobId, jobId), eq(creditLedger.kind, "refund")));
    if (refund) return false;
    await tx.insert(creditLedger).values({
      userId: spend.userId,
      delta: -spend.delta, // spend negatifti; iade pozitif
      kind: "refund",
      jobId,
    });
    return true;
  });
}
```

- [ ] **Step 4: PASS doğrula**

Run: `cd web && npm test`
Expected: tüm testler PASS (pricing + ledger + schema + smoke)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/credits
git commit -m "feat(web): add atomic credit ledger with idempotent bonus and refund"
```

---

### Task 5: Auth.js girişi + kayıt bonusu

**Files:**
- Create: `web/src/auth.ts`, `web/src/app/api/auth/[...nextauth]/route.ts`, `web/src/middleware.ts`, `web/src/app/signin/page.tsx`
- Test: `web/src/lib/credits/__tests__/on-user-created.test.ts`

**Interfaces:**
- Consumes: `grantWelcomeBonus` (Task 4), `db` (Task 2)
- Produces: `auth()` (server-side session), `signIn`/`signOut` — `web/src/auth.ts` export'ları; `/dashboard/*` yolları middleware ile korunur, oturumsuz kullanıcı `/signin`'e yönlenir

- [ ] **Step 1: Bağımlılıklar**

```bash
cd web && npm install next-auth@beta @auth/drizzle-adapter
```

- [ ] **Step 2: Auth yapılandırması**

`web/src/auth.ts`:

```typescript
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "@/db/schema";
import { grantWelcomeBonus } from "@/lib/credits/ledger";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [Google],
  events: {
    async createUser({ user }) {
      if (user.id) await grantWelcomeBonus(db, user.id);
    },
  },
  pages: { signIn: "/signin" },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
```

Not: E-posta magic link sağlayıcısı SMTP/Resend yapılandırması gerektirir; MVP'de Google ile başlanır, e-posta girişi Faz 4'te (lansman yapılandırması) eklenir. Spec'in "e-posta magic link + Google" hedefi bilinçli olarak ikiye bölünmüştür — plan self-review notuna işlendi.

`web/src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

`web/src/middleware.ts`:

```typescript
export { auth as middleware } from "@/auth";

export const config = {
  matcher: ["/dashboard/:path*"],
};
```

Middleware'in oturumsuz kullanıcıyı yönlendirmesi için `web/src/auth.ts`'e `callbacks.authorized` ekle:

```typescript
    authorized({ auth: session, request }) {
      if (request.nextUrl.pathname.startsWith("/dashboard")) {
        return !!session?.user;
      }
      return true;
    },
```

(`callbacks` bloğunun içine, `session` callback'inin yanına.)

Not (Auth.js v5 + Drizzle adapter + middleware): adapter'lı kurulumda middleware Edge runtime'da çalışır ve Postgres'e erişemez. Çözüm: `middleware.ts`'te adapter'sız hafif bir NextAuth örneği kullan. `web/src/auth.config.ts` oluştur:

```typescript
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export default {
  providers: [Google],
  pages: { signIn: "/signin" },
  callbacks: {
    authorized({ auth: session, request }) {
      if (request.nextUrl.pathname.startsWith("/dashboard")) {
        return !!session?.user;
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
```

`web/src/auth.ts` bu config'i spread eder (`...authConfig`, sonra adapter/events/session callback ekler; `session` stratejisi adapter ile `database` kalır) ve `web/src/middleware.ts` şöyle olur:

```typescript
import NextAuth from "next-auth";
import authConfig from "@/auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ["/dashboard/:path*"],
};
```

Önemli: database-session + Edge middleware kombinasyonunda middleware yalnızca session cookie'nin varlığını görür (tam doğrulama sunucu tarafında `auth()` ile yapılır) — dashboard sayfası ayrıca `auth()` çağırıp oturumsuzsa redirect eder (Task 6). Bu iki katman birlikte yeterlidir.

- [ ] **Step 3: Sign-in sayfası**

`web/src/app/signin/page.tsx`:

```tsx
import { signIn } from "@/auth";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 p-8 text-center">
        <h1 className="mb-2 text-2xl font-semibold">Sign in to Reelate</h1>
        <p className="mb-6 text-sm text-zinc-400">
          Get 2 free credits when you join.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-lg bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
          >
            Continue with Google
          </button>
        </form>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: createUser bonus davranışını test et**

Auth.js'in kendisini test etmeyiz; bonusun kullanıcı oluşturma akışına bağlandığını, adapter'ın çağırdığı yolu taklit ederek doğrularız — `grantWelcomeBonus`'un yeni kullanıcıda bakiyeyi 2 yaptığı zaten Task 4'te test edildi. Burada eklenen tek test: `auth.ts`'in export ettiği `events.createUser`'ın gerçekten `grantWelcomeBonus`'u çağırdığını statik olarak doğrulamak yerine (mock ağırlıklı, düşük değerli), kayıt akışının bütünü Step 5'teki manuel doğrulamayla kapatılır. Test dosyası EKLENMEZ; bu adım bilinçli boştur ve plan self-review'ında not edilmiştir.

- [ ] **Step 5: Manuel doğrulama (Google OAuth)**

`web/.env.local`'a Google OAuth client bilgilerini ekle (operatörden istenir — https://console.cloud.google.com/apis/credentials adresinden "OAuth client ID", redirect URI: `http://localhost:3000/api/auth/callback/google`). Sonra:

```bash
cd web && npm run dev
```

Tarayıcıda `http://localhost:3000/signin` → "Continue with Google" → giriş → `/dashboard`'a yönlenme (404 normal, sayfa Task 6'da). DB kontrolü:

```bash
docker exec reelate-postgres psql -U reelate -d reelate -c "SELECT kind, delta FROM credit_ledger;"
```

Expected: bir satır `welcome_bonus | 2`

Google client bilgisi hazır değilse: bu adım "operatör girdisi bekliyor" olarak rapor edilir, build doğrulaması (`npm run build`) ile devam edilir — auth kodu derleniyor olmalı.

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "feat(web): add Auth.js sign-in with welcome bonus on signup"
```

---

### Task 6: Panel iskeleti + bakiye

**Files:**
- Create: `web/src/app/dashboard/page.tsx`, `web/src/app/dashboard/layout.tsx`
- Modify: `web/src/app/page.tsx` (landing yer tutucusu → signin/dashboard yönlendirmeli basit sayfa)
- Test: `web/src/lib/credits/__tests__/balance-format.test.ts` yok — bakiye gösterimi doğrudan `getBalance` kullanır (Task 4'te test edildi); bu task'ın doğrulaması build + manuel

**Interfaces:**
- Consumes: `auth()` (Task 5), `getBalance` (Task 4), `db` (Task 2)

- [ ] **Step 1: Dashboard layout ve sayfası**

`web/src/app/dashboard/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <span className="font-semibold">Reelate</span>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-zinc-400">{session.user.email}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button type="submit" className="text-zinc-400 hover:text-white">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

`web/src/app/dashboard/page.tsx`:

```tsx
import { auth } from "@/auth";
import { db } from "@/db";
import { getBalance } from "@/lib/credits/ledger";

export default async function DashboardPage() {
  const session = await auth();
  const balance = await getBalance(db, session!.user!.id!);
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Dashboard</h1>
      <div className="inline-block rounded-xl border border-zinc-800 px-6 py-4">
        <div className="text-sm text-zinc-400">Credits</div>
        <div className="text-3xl font-bold">{balance}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Landing yer tutucusu**

`web/src/app/page.tsx` içeriğini değiştir:

```tsx
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 text-center">
      <h1 className="text-4xl font-bold">Reelate</h1>
      <p className="max-w-md text-zinc-400">
        Turn any topic into a ready-to-post short video in minutes.
      </p>
      <Link
        href="/signin"
        className="rounded-lg bg-white px-6 py-2 font-medium text-black hover:bg-zinc-200"
      >
        Get started — 2 free credits
      </Link>
    </main>
  );
}
```

- [ ] **Step 3: Doğrula**

```bash
cd web && npm run build && npm test
```

Expected: build exit 0, tüm testler PASS. Google client varsa manuel: giriş → dashboard'da "Credits: 2".

- [ ] **Step 4: Commit**

```bash
git add web/src/app
git commit -m "feat(web): add dashboard shell with credit balance"
```

---

## Self-Review Notları

- **Spec kapsaması (2a kapsamı):** Bölüm 4 veri modeli (Task 2), kredi defteri + tek-transaction harcama + idempotent bonus/iade (Task 4), kademeler ve 2,5 kelime/sn (Task 3), auth + 2 kredi bonus (Task 5), bakiye paneli (Task 6). Stripe (2b) ve sihirbaz/kuyruk/SSE/kütüphane (2c) sonraki planlarda.
- **Bilinçli sapmalar:** (1) E-posta magic link Faz 4'e ertelendi — SMTP/Resend yapılandırması operatör girdisi gerektiriyor; MVP girişi Google. (2) Task 5 Step 4 test eklemiyor (mock-ağır, düşük değer); kayıt bonusunun mantığı Task 4 testlerinde, uçtan uca akış manuel doğrulamada.
- **Tip tutarlılığı:** `Db` tipi Task 2'de tanımlı, Task 4 imzaları onu kullanıyor; `grantWelcomeBonus(db, userId)` Task 5'in `events.createUser`'ında aynı imzayla çağrılıyor; `spendCreditsForJob` iş alanları `videoJobs` şema kolonlarıyla birebir.
- **Dış bağımlılık notu:** Google OAuth client bilgileri operatörden istenecek (Task 5 Step 5); yoksa akış build-doğrulamalı ilerler, manuel doğrulama bekletilir.
