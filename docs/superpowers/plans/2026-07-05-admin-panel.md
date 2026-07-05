# Reelate Admin Panel (admin.reelate.org) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin panel to the existing Next.js app, served from `admin.reelate.org` with its own username/password login, showing analytics, users (with manual credit adjustment), and job monitoring.

**Architecture:** Host-based routing in `web/src/middleware.ts` rewrites admin-subdomain requests to `/admin/*` routes inside the existing `web/` app. Admin auth is fully independent from NextAuth: env credentials (`ADMIN_USERNAME` + scrypt `ADMIN_PASSWORD_HASH`), a jose-signed JWT in an httpOnly `admin_session` cookie. Data comes straight from the existing Drizzle/Postgres schema via server components.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM (`web/src/db`), jose (already in node_modules via next-auth — added as explicit dep), Node built-in `crypto.scrypt` (no bcrypt dep), Vitest (existing setup, integration tests against test Postgres on port 5434), server-rendered inline SVG charts (no chart lib).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-05-admin-panel-design.md`
- Do NOT touch NextAuth flow, `/dashboard` gating behavior, or the Google OAuth config.
- Admin panel reachable ONLY via admin host; `reelate.org/admin*` must 404.
- All work in `web/` runs from `/Users/furkanuzun/Documents/GitHub/MoneyPrinterTurbo/MoneyPrinterTurbo/web` (referred to as `web/` below).
- Tests: `npm test` (vitest, serial). Integration tests use `DATABASE_URL_TEST` (already in `web/.env.local`; local container `reelate-postgres` on port 5434 must be running).
- Middleware runs on the Edge runtime: it may import `src/lib/admin/session.ts` (jose) and `src/lib/admin/routing.ts`, but NEVER `src/lib/admin/password.ts` (uses `node:crypto`).
- UI: reuse existing components from `web/src/components/ui/` (card, input, button, badge, select). Keep admin UI minimal — no sidebar framework needed, simple top-nav layout.
- Chart colors come verbatim from the dataviz reference palette (pre-validated; values embedded in Task 7). Text/labels never wear series colors.
- Commit after every task (messages given per task).

---

### Task 1: Schema changes + migration (user.created_at, ledger kind + note)

The `user` table has no `created_at` (needed for signup analytics and user list). `credit_ledger.kind` needs an `admin_adjustment` value (the DB column is plain text — the enum lives only in TypeScript) and a nullable `note` column for admin adjustment notes.

**Files:**
- Modify: `web/src/db/schema.ts` (users table lines 16–24, creditLedger lines 67–92)
- Create: `web/drizzle/0003_*.sql` (generated, then hand-edited for backfill)
- Test: `web/src/db/__tests__/schema.test.ts`

**Interfaces:**
- Produces: `users.createdAt` (Date, not null, default now), `creditLedger.note` (string | null), `creditLedger.kind` accepts `"admin_adjustment"`. Later tasks import these via `@/db/schema`.

- [ ] **Step 1: Write the failing test**

Append to `web/src/db/__tests__/schema.test.ts` inside `describe("schema", ...)`:

```ts
  it("has admin panel columns", async () => {
    const cols = await db.execute(
      sql`SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'public'
            AND ((table_name = 'user' AND column_name = 'created_at')
              OR (table_name = 'credit_ledger' AND column_name = 'note'))`,
    );
    expect(cols.rows).toHaveLength(2);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- src/db/__tests__/schema.test.ts`
Expected: FAIL — `expected [] to have a length of 2`

- [ ] **Step 3: Update schema.ts**

In `web/src/db/schema.ts`, add to the `users` table (after `image`):

```ts
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
```

In `creditLedger`, change the `kind` enum and add `note` after `purchaseId`:

```ts
    kind: text("kind", {
      enum: ["purchase", "spend", "refund", "welcome_bonus", "admin_adjustment"],
    }).notNull(),
```

```ts
    note: text("note"),
```

- [ ] **Step 4: Generate migration and add backfill**

Run: `cd web && npm run db:generate`
Expected: creates `web/drizzle/0003_<name>.sql` containing `ALTER TABLE "user" ADD COLUMN "created_at" ...` and `ALTER TABLE "credit_ledger" ADD COLUMN "note" text`.

Append the backfill to the END of the generated `0003_*.sql` (welcome bonus is granted at signup, so its ledger timestamp is the best signup-time proxy for existing users):

```sql
--> statement-breakpoint
UPDATE "user" u SET "created_at" = wb."created_at"
FROM (SELECT "user_id", "created_at" FROM "credit_ledger" WHERE "kind" = 'welcome_bonus') wb
WHERE wb."user_id" = u."id";
```

- [ ] **Step 5: Apply migration to test DB and local dev DB**

Run (uses drizzle.config.ts, which reads `DATABASE_URL`):

```bash
cd web
export $(grep DATABASE_URL_TEST .env.local)
DATABASE_URL="$DATABASE_URL_TEST" npm run db:migrate
npm run db:migrate   # local dev DB (DATABASE_URL from .env.local/.env)
```

Expected: both complete without error.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd web && npm test -- src/db/__tests__/schema.test.ts`
Expected: PASS

- [ ] **Step 7: Run full suite (regression) and commit**

Run: `cd web && npm test`
Expected: all pass.

```bash
git add web/src/db/schema.ts web/drizzle web/src/db/__tests__/schema.test.ts
git commit -m "feat(admin): add user.created_at, credit_ledger.note and admin_adjustment kind"
```

---

### Task 2: Admin password + session libraries

Two separate modules so the Edge middleware never imports `node:crypto`.

**Files:**
- Create: `web/src/lib/admin/password.ts` (Node-only: scrypt verify)
- Create: `web/scripts/admin-password-hash.mjs` (hash generator CLI)
- Create: `web/src/lib/admin/session.ts` (Edge-safe: jose JWT + cookie name)
- Modify: `web/package.json` (add explicit `jose` dependency)
- Test: `web/src/lib/admin/__tests__/password.test.ts`, `web/src/lib/admin/__tests__/session.test.ts`

**Interfaces:**
- Produces:
  - `verifyPassword(password: string, stored: string): Promise<boolean>` — `stored` format `scrypt:<salt-hex>:<hash-hex>`
  - `ADMIN_COOKIE = "admin_session"` (const string)
  - `createSessionToken(username: string): Promise<string>`
  - `verifySessionToken(token: string | undefined): Promise<boolean>`
  - CLI: `node scripts/admin-password-hash.mjs <password>` prints the hash for `.env`

- [ ] **Step 1: Add jose as explicit dependency**

Run: `cd web && npm install jose`
Expected: `jose` appears in `package.json` dependencies (it was already in node_modules transitively via next-auth).

- [ ] **Step 2: Write the failing tests**

Create `web/src/lib/admin/__tests__/password.test.ts`:

```ts
import { scryptSync, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyPassword } from "../password";

function makeHash(pw: string): string {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString("hex")}:${scryptSync(pw, salt, 64).toString("hex")}`;
}

describe("verifyPassword", () => {
  it("accepts the correct password", async () => {
    expect(await verifyPassword("hunter2!", makeHash("hunter2!"))).toBe(true);
  });
  it("rejects a wrong password", async () => {
    expect(await verifyPassword("wrong", makeHash("hunter2!"))).toBe(false);
  });
  it("rejects malformed stored values", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "bcrypt:aa:bb")).toBe(false);
    expect(await verifyPassword("x", "")).toBe(false);
  });
});
```

Create `web/src/lib/admin/__tests__/session.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken, ADMIN_COOKIE } from "../session";

beforeAll(() => {
  process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-for-vitest";
});

describe("admin session token", () => {
  it("round-trips a valid token", async () => {
    const token = await createSessionToken("admin");
    expect(await verifySessionToken(token)).toBe(true);
  });
  it("rejects undefined and garbage tokens", async () => {
    expect(await verifySessionToken(undefined)).toBe(false);
    expect(await verifySessionToken("not.a.jwt")).toBe(false);
  });
  it("rejects a tampered token", async () => {
    const token = await createSessionToken("admin");
    expect(await verifySessionToken(token.slice(0, -2) + "xx")).toBe(false);
  });
  it("exports the cookie name", () => {
    expect(ADMIN_COOKIE).toBe("admin_session");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd web && npm test -- src/lib/admin`
Expected: FAIL — cannot resolve `../password` / `../session`

- [ ] **Step 4: Implement password.ts**

Create `web/src/lib/admin/password.ts`:

```ts
import { scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

// Saklama formatı: scrypt:<salt-hex>:<hash-hex> (64 byte anahtar).
// Hash üretimi: node scripts/admin-password-hash.mjs <şifre>
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const derived = (await scryptAsync(
    password,
    Buffer.from(saltHex, "hex"),
    expected.length,
  )) as Buffer;
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
```

- [ ] **Step 5: Implement session.ts**

Create `web/src/lib/admin/session.ts`:

```ts
import { SignJWT, jwtVerify } from "jose";

export const ADMIN_COOKIE = "admin_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 gün

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(username: string): Promise<string> {
  return new SignJWT({ sub: username, scope: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySessionToken(
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload.scope === "admin";
  } catch {
    return false;
  }
}
```

- [ ] **Step 6: Create the hash generator script**

Create `web/scripts/admin-password-hash.mjs`:

```js
import { scryptSync, randomBytes } from "node:crypto";

const pw = process.argv[2];
if (!pw) {
  console.error("usage: node scripts/admin-password-hash.mjs <password>");
  process.exit(1);
}
const salt = randomBytes(16);
console.log(`scrypt:${salt.toString("hex")}:${scryptSync(pw, salt, 64).toString("hex")}`);
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd web && npm test -- src/lib/admin`
Expected: PASS (7 tests)

Also verify the CLI: `cd web && node scripts/admin-password-hash.mjs testpw` → prints a `scrypt:...:...` line.

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/admin web/scripts/admin-password-hash.mjs web/package.json web/package-lock.json
git commit -m "feat(admin): password verification and JWT session helpers"
```

---

### Task 3: Host-based routing decision + middleware

Pure decision function (unit-testable) + middleware wiring. Existing `/dashboard` gating must keep working unchanged.

**Files:**
- Create: `web/src/lib/admin/routing.ts`
- Modify: `web/src/middleware.ts` (full rewrite, 22 lines currently)
- Test: `web/src/lib/admin/__tests__/routing.test.ts`

**Interfaces:**
- Consumes: `verifySessionToken`, `ADMIN_COOKIE` from `@/lib/admin/session` (Task 2)
- Produces: `decideAdminRoute(host: string, pathname: string, hasValidSession: boolean): RouteDecision` where `RouteDecision = { action: "next" } | { action: "rewrite"; path: string } | { action: "redirect"; path: string }`; `isAdminHost(host: string): boolean`

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/admin/__tests__/routing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decideAdminRoute, isAdminHost } from "../routing";

const HOST = "admin.reelate.org";

describe("isAdminHost", () => {
  it("matches prod and dev admin hosts", () => {
    expect(isAdminHost("admin.reelate.org")).toBe(true);
    expect(isAdminHost("ADMIN.REELATE.ORG")).toBe(true);
    expect(isAdminHost("admin.localhost:3000")).toBe(true);
    expect(isAdminHost("reelate.org")).toBe(false);
    expect(isAdminHost("www.reelate.org")).toBe(false);
  });
});

describe("decideAdminRoute — main host", () => {
  it("passes normal traffic through", () => {
    expect(decideAdminRoute("reelate.org", "/dashboard", false)).toEqual({ action: "next" });
    expect(decideAdminRoute("reelate.org", "/", false)).toEqual({ action: "next" });
  });
  it("hides /admin on the main host", () => {
    expect(decideAdminRoute("reelate.org", "/admin", false)).toEqual({ action: "rewrite", path: "/404" });
    expect(decideAdminRoute("reelate.org", "/admin/users", true)).toEqual({ action: "rewrite", path: "/404" });
  });
});

describe("decideAdminRoute — admin host", () => {
  it("redirects unauthenticated traffic to /login", () => {
    expect(decideAdminRoute(HOST, "/", false)).toEqual({ action: "redirect", path: "/login" });
    expect(decideAdminRoute(HOST, "/users", false)).toEqual({ action: "redirect", path: "/login" });
  });
  it("rewrites /login to the login page", () => {
    expect(decideAdminRoute(HOST, "/login", false)).toEqual({ action: "rewrite", path: "/admin/login" });
  });
  it("sends an already-authenticated /login visit home", () => {
    expect(decideAdminRoute(HOST, "/login", true)).toEqual({ action: "redirect", path: "/" });
  });
  it("rewrites authenticated paths under /admin", () => {
    expect(decideAdminRoute(HOST, "/", true)).toEqual({ action: "rewrite", path: "/admin" });
    expect(decideAdminRoute(HOST, "/users/abc", true)).toEqual({ action: "rewrite", path: "/admin/users/abc" });
    expect(decideAdminRoute(HOST, "/jobs", true)).toEqual({ action: "rewrite", path: "/admin/jobs" });
  });
  it("404s direct /admin, /api and /dashboard access on the admin host", () => {
    expect(decideAdminRoute(HOST, "/admin/users", true)).toEqual({ action: "rewrite", path: "/404" });
    expect(decideAdminRoute(HOST, "/api/jobs", true)).toEqual({ action: "rewrite", path: "/404" });
    expect(decideAdminRoute(HOST, "/dashboard", true)).toEqual({ action: "rewrite", path: "/404" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- src/lib/admin/__tests__/routing.test.ts`
Expected: FAIL — cannot resolve `../routing`

- [ ] **Step 3: Implement routing.ts**

Create `web/src/lib/admin/routing.ts`:

```ts
const ADMIN_HOSTS = new Set([
  "admin.reelate.org",
  "admin.localhost",
  "admin.localhost:3000",
]);

export type RouteDecision =
  | { action: "next" }
  | { action: "rewrite"; path: string }
  | { action: "redirect"; path: string };

export function isAdminHost(host: string): boolean {
  return ADMIN_HOSTS.has(host.toLowerCase());
}

export function decideAdminRoute(
  host: string,
  pathname: string,
  hasValidSession: boolean,
): RouteDecision {
  if (!isAdminHost(host)) {
    // Panel yalnızca subdomain'den erişilir; ana domainde /admin görünmez.
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      return { action: "rewrite", path: "/404" };
    }
    return { action: "next" };
  }
  // Admin host'ta iç route'lara/ana ürün route'larına doğrudan erişim yok.
  if (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/dashboard")
  ) {
    return { action: "rewrite", path: "/404" };
  }
  if (pathname === "/login") {
    return hasValidSession
      ? { action: "redirect", path: "/" }
      : { action: "rewrite", path: "/admin/login" };
  }
  if (!hasValidSession) return { action: "redirect", path: "/login" };
  return {
    action: "rewrite",
    path: pathname === "/" ? "/admin" : `/admin${pathname}`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- src/lib/admin/__tests__/routing.test.ts`
Expected: PASS

- [ ] **Step 5: Rewrite middleware.ts**

Replace `web/src/middleware.ts` entirely with:

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/admin/session";
import { decideAdminRoute, isAdminHost } from "@/lib/admin/routing";

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { pathname } = request.nextUrl;
  const adminHost = isAdminHost(host);
  const hasValidSession = adminHost
    ? await verifySessionToken(request.cookies.get(ADMIN_COOKIE)?.value)
    : false;

  const decision = decideAdminRoute(host, pathname, hasValidSession);
  if (decision.action === "redirect") {
    return NextResponse.redirect(new URL(decision.path, request.url));
  }
  if (decision.action === "rewrite") {
    const res = NextResponse.rewrite(new URL(decision.path, request.url));
    if (adminHost) res.headers.set("x-robots-tag", "noindex, nofollow");
    return res;
  }

  // Ana host, normal akış — mevcut /dashboard gating'i aynen korunur.
  // Database-session stratejisinde adapter'sız NextAuth örneği session çerezini
  // JWT sanıp JWTSessionError üretir (bilinen v5 tuzağı). Edge'de yalnızca
  // çerez VARLIĞI kontrol edilir; gerçek doğrulama sayfalarda auth() ile yapılır.
  if (pathname.startsWith("/dashboard")) {
    const hasSessionCookie =
      request.cookies.has("authjs.session-token") ||
      request.cookies.has("__Secure-authjs.session-token");
    if (!hasSessionCookie) {
      const url = new URL("/signin", request.url);
      url.searchParams.set("callbackUrl", request.nextUrl.href);
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  // Statik dosyalar ve Next iç yolları hariç her istek (admin host rewrite'ı
  // için genişletildi; eski matcher yalnızca /dashboard idi).
  matcher: ["/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)"],
};
```

Note: the matcher excludes any path containing a file extension (favicon.ico, images, sitemap.xml etc.), so static assets and Next internals bypass the middleware on both hosts.

- [ ] **Step 6: Run full test suite + build**

Run: `cd web && npm test && npm run build`
Expected: tests pass; build succeeds (this catches any accidental `node:crypto` import in the Edge middleware bundle).

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/admin/routing.ts web/src/lib/admin/__tests__/routing.test.ts web/src/middleware.ts
git commit -m "feat(admin): host-based routing for admin.reelate.org in middleware"
```

---

### Task 4: Admin aggregate queries

All analytics/list queries in one module, integration-tested against the test DB.

**Files:**
- Create: `web/src/lib/admin/queries.ts`
- Test: `web/src/lib/admin/__tests__/queries.test.ts`

**Interfaces:**
- Consumes: `Db` type from `@/db`, tables from `@/db/schema`
- Produces (all take `db: Db` as first arg):
  - `getDashboardStats(db, days?: number): Promise<DashboardStats>` with
    `DashboardStats = { totals: { users: number; jobs30d: number; doneJobs30d: number; failedJobs30d: number; revenueCents30d: number; creditsSpent30d: number }, signupsByDay: DayValue[], revenueByDay: DayValue[], creditsSpentByDay: DayValue[], jobsByDay: JobsDay[] }`,
    `DayValue = { day: string; value: number }` (day = `YYYY-MM-DD`, gaps filled with 0, oldest→newest, exactly `days` entries),
    `JobsDay = { day: string; done: number; failed: number; inProgress: number }`
  - `listUsers(db, opts: { q?: string; page?: number; pageSize?: number }): Promise<{ rows: AdminUserRow[]; total: number }>` with
    `AdminUserRow = { id: string; name: string | null; email: string | null; createdAt: Date; balance: number; jobCount: number; paidCents: number }` (ordered newest first; `q` filters email, case-insensitive substring)
  - `getUserDetail(db, userId: string): Promise<AdminUserDetail | null>` with
    `AdminUserDetail = { user: AdminUserRow; ledger: { id: number; delta: number; kind: string; note: string | null; createdAt: Date }[]; jobs: { id: string; subject: string; status: string; credits: number; error: string | null; createdAt: Date }[]; purchases: { id: number; packageKey: string; credits: number; amountCents: number; status: string; createdAt: Date }[] }` (each list newest first, max 50)
  - `listJobs(db, opts: { status?: string; limit?: number }): Promise<AdminJobRow[]>` with
    `AdminJobRow = { id: string; userEmail: string | null; subject: string; status: string; credits: number; targetSeconds: number; error: string | null; createdAt: Date; updatedAt: Date }` (newest first, default limit 100)

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/admin/__tests__/queries.test.ts`:

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import {
  getDashboardStats,
  getUserDetail,
  listJobs,
  listUsers,
} from "../queries";

const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST });
const db = drizzle(pool, { schema });

const JOB_BASE = {
  subject: "morning habits",
  script: "drink water",
  terms: ["morning"],
  scenes: null,
  captionStyle: null,
  aspect: "9:16",
  voice: "en-US-JennyNeural-Female",
  targetSeconds: 60,
  credits: 2,
} as const;

let aliceId: string;
let bobId: string;

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE "user", credit_ledger, video_jobs, purchases CASCADE`,
  );
  const [alice] = await db
    .insert(schema.users)
    .values({ email: "alice@example.com", name: "Alice" })
    .returning();
  const [bob] = await db
    .insert(schema.users)
    .values({ email: "bob@example.com", name: "Bob" })
    .returning();
  aliceId = alice.id;
  bobId = bob.id;
  await db.insert(schema.creditLedger).values([
    { userId: aliceId, delta: 5, kind: "welcome_bonus" },
    { userId: aliceId, delta: 10, kind: "purchase" },
    { userId: aliceId, delta: -2, kind: "spend" },
    { userId: bobId, delta: 5, kind: "welcome_bonus" },
  ]);
  await db.insert(schema.videoJobs).values([
    { ...JOB_BASE, userId: aliceId, status: "done" },
    { ...JOB_BASE, userId: aliceId, status: "failed", error: "boom" },
    { ...JOB_BASE, userId: bobId, status: "rendering" },
  ]);
  await db.insert(schema.purchases).values([
    {
      userId: aliceId,
      packageKey: "starter",
      credits: 10,
      amountCents: 500,
      status: "completed",
      stripeSessionId: "cs_1",
    },
    {
      userId: aliceId,
      packageKey: "creator",
      credits: 50,
      amountCents: 1900,
      status: "pending",
      stripeSessionId: "cs_2",
    },
  ]);
});

afterAll(() => pool.end());

describe("getDashboardStats", () => {
  it("computes totals over the window", async () => {
    const stats = await getDashboardStats(db, 30);
    expect(stats.totals.users).toBe(2);
    expect(stats.totals.jobs30d).toBe(3);
    expect(stats.totals.doneJobs30d).toBe(1);
    expect(stats.totals.failedJobs30d).toBe(1);
    expect(stats.totals.revenueCents30d).toBe(500); // yalnızca completed
    expect(stats.totals.creditsSpent30d).toBe(2);
  });
  it("returns gap-filled daily series, oldest first", async () => {
    const stats = await getDashboardStats(db, 7);
    expect(stats.signupsByDay).toHaveLength(7);
    expect(stats.revenueByDay).toHaveLength(7);
    expect(stats.creditsSpentByDay).toHaveLength(7);
    expect(stats.jobsByDay).toHaveLength(7);
    const today = stats.signupsByDay[6];
    expect(today.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(today.value).toBe(2);
    expect(stats.signupsByDay[0].value).toBe(0);
    const jobsToday = stats.jobsByDay[6];
    expect(jobsToday).toMatchObject({ done: 1, failed: 1, inProgress: 1 });
  });
});

describe("listUsers", () => {
  it("returns rows with aggregates, newest first", async () => {
    const { rows, total } = await listUsers(db, {});
    expect(total).toBe(2);
    expect(rows).toHaveLength(2);
    const alice = rows.find((r) => r.email === "alice@example.com")!;
    expect(alice.balance).toBe(13);
    expect(alice.jobCount).toBe(2);
    expect(alice.paidCents).toBe(500);
    const bob = rows.find((r) => r.email === "bob@example.com")!;
    expect(bob.balance).toBe(5);
    expect(bob.jobCount).toBe(1);
    expect(bob.paidCents).toBe(0);
  });
  it("filters by email substring, case-insensitive", async () => {
    const { rows, total } = await listUsers(db, { q: "ALICE" });
    expect(total).toBe(1);
    expect(rows[0].email).toBe("alice@example.com");
  });
  it("paginates", async () => {
    const page1 = await listUsers(db, { page: 1, pageSize: 1 });
    const page2 = await listUsers(db, { page: 2, pageSize: 1 });
    expect(page1.rows).toHaveLength(1);
    expect(page2.rows).toHaveLength(1);
    expect(page1.rows[0].id).not.toBe(page2.rows[0].id);
    expect(page1.total).toBe(2);
  });
});

describe("getUserDetail", () => {
  it("returns profile with ledger, jobs and purchases", async () => {
    const detail = await getUserDetail(db, aliceId);
    expect(detail).not.toBeNull();
    expect(detail!.user.email).toBe("alice@example.com");
    expect(detail!.user.balance).toBe(13);
    expect(detail!.ledger).toHaveLength(3);
    expect(detail!.jobs).toHaveLength(2);
    expect(detail!.purchases).toHaveLength(2);
  });
  it("returns null for an unknown user", async () => {
    expect(await getUserDetail(db, crypto.randomUUID())).toBeNull();
  });
});

describe("listJobs", () => {
  it("lists jobs with user email, newest first", async () => {
    const jobs = await listJobs(db, {});
    expect(jobs).toHaveLength(3);
    expect(jobs.every((j) => j.userEmail)).toBe(true);
  });
  it("filters by status", async () => {
    const failed = await listJobs(db, { status: "failed" });
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toBe("boom");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- src/lib/admin/__tests__/queries.test.ts`
Expected: FAIL — cannot resolve `../queries`

- [ ] **Step 3: Implement queries.ts**

Create `web/src/lib/admin/queries.ts`:

```ts
import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { creditLedger, purchases, users, videoJobs } from "@/db/schema";

export type DayValue = { day: string; value: number };
export type JobsDay = { day: string; done: number; failed: number; inProgress: number };

export type DashboardStats = {
  totals: {
    users: number;
    jobs30d: number;
    doneJobs30d: number;
    failedJobs30d: number;
    revenueCents30d: number;
    creditsSpent30d: number;
  };
  signupsByDay: DayValue[];
  revenueByDay: DayValue[];
  creditsSpentByDay: DayValue[];
  jobsByDay: JobsDay[];
};

// UTC gün anahtarı (YYYY-MM-DD). Sunucu ve Postgres UTC'de çalışır.
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function lastNDays(days: number): string[] {
  const out: string[] = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    out.push(dayKey(new Date(now - i * 86_400_000)));
  }
  return out;
}

function fillDays(days: number, rows: { day: string; value: number }[]): DayValue[] {
  const byDay = new Map(rows.map((r) => [r.day, Number(r.value)]));
  return lastNDays(days).map((day) => ({ day, value: byDay.get(day) ?? 0 }));
}

const DAY_EXPR = (col: unknown) =>
  sql<string>`to_char(date_trunc('day', ${col} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`;

export async function getDashboardStats(db: Db, days = 30): Promise<DashboardStats> {
  const since = sql`now() - make_interval(days => ${days})`;

  const [totals] = await db
    .select({
      users: sql<number>`(SELECT count(*)::int FROM "user")`,
      jobs30d: sql<number>`(SELECT count(*)::int FROM video_jobs WHERE created_at >= ${since})`,
      doneJobs30d: sql<number>`(SELECT count(*)::int FROM video_jobs WHERE status = 'done' AND created_at >= ${since})`,
      failedJobs30d: sql<number>`(SELECT count(*)::int FROM video_jobs WHERE status = 'failed' AND created_at >= ${since})`,
      revenueCents30d: sql<number>`(SELECT coalesce(sum(amount_cents), 0)::int FROM purchases WHERE status = 'completed' AND created_at >= ${since})`,
      creditsSpent30d: sql<number>`(SELECT coalesce(sum(-delta), 0)::int FROM credit_ledger WHERE kind = 'spend' AND created_at >= ${since})`,
    })
    .from(sql`(SELECT 1) AS one`);

  const signups = await db
    .select({ day: DAY_EXPR(users.createdAt), value: sql<number>`count(*)::int` })
    .from(users)
    .where(sql`${users.createdAt} >= ${since}`)
    .groupBy(sql`1`);

  const revenue = await db
    .select({ day: DAY_EXPR(purchases.createdAt), value: sql<number>`sum(amount_cents)::int` })
    .from(purchases)
    .where(sql`${purchases.status} = 'completed' AND ${purchases.createdAt} >= ${since}`)
    .groupBy(sql`1`);

  const spent = await db
    .select({ day: DAY_EXPR(creditLedger.createdAt), value: sql<number>`sum(-delta)::int` })
    .from(creditLedger)
    .where(sql`${creditLedger.kind} = 'spend' AND ${creditLedger.createdAt} >= ${since}`)
    .groupBy(sql`1`);

  const jobsRaw = await db
    .select({
      day: DAY_EXPR(videoJobs.createdAt),
      done: sql<number>`count(*) FILTER (WHERE status = 'done')::int`,
      failed: sql<number>`count(*) FILTER (WHERE status = 'failed')::int`,
      inProgress: sql<number>`count(*) FILTER (WHERE status NOT IN ('done', 'failed'))::int`,
    })
    .from(videoJobs)
    .where(sql`${videoJobs.createdAt} >= ${since}`)
    .groupBy(sql`1`);

  const jobsMap = new Map(jobsRaw.map((r) => [r.day, r]));
  const jobsByDay = lastNDays(days).map((day) => {
    const r = jobsMap.get(day);
    return {
      day,
      done: r?.done ?? 0,
      failed: r?.failed ?? 0,
      inProgress: r?.inProgress ?? 0,
    };
  });

  return {
    totals,
    signupsByDay: fillDays(days, signups),
    revenueByDay: fillDays(days, revenue),
    creditsSpentByDay: fillDays(days, spent),
    jobsByDay,
  };
}

export type AdminUserRow = {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: Date;
  balance: number;
  jobCount: number;
  paidCents: number;
};

const USER_AGGREGATES = {
  balance: sql<number>`coalesce((SELECT sum(delta)::int FROM credit_ledger l WHERE l.user_id = ${users.id}), 0)`,
  jobCount: sql<number>`coalesce((SELECT count(*)::int FROM video_jobs j WHERE j.user_id = ${users.id}), 0)`,
  paidCents: sql<number>`coalesce((SELECT sum(amount_cents)::int FROM purchases p WHERE p.user_id = ${users.id} AND p.status = 'completed'), 0)`,
};

export async function listUsers(
  db: Db,
  opts: { q?: string; page?: number; pageSize?: number },
): Promise<{ rows: AdminUserRow[]; total: number }> {
  const q = opts.q?.trim() ?? "";
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const where = q
    ? sql`${users.email} ILIKE ${"%" + q + "%"}`
    : sql`true`;

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
      ...USER_AGGREGATES,
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(users)
    .where(where);

  return { rows, total };
}

export type AdminUserDetail = {
  user: AdminUserRow;
  ledger: { id: number; delta: number; kind: string; note: string | null; createdAt: Date }[];
  jobs: { id: string; subject: string; status: string; credits: number; error: string | null; createdAt: Date }[];
  purchases: { id: number; packageKey: string; credits: number; amountCents: number; status: string; createdAt: Date }[];
};

export async function getUserDetail(
  db: Db,
  userId: string,
): Promise<AdminUserDetail | null> {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
      ...USER_AGGREGATES,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) return null;

  const ledger = await db
    .select({
      id: creditLedger.id,
      delta: creditLedger.delta,
      kind: creditLedger.kind,
      note: creditLedger.note,
      createdAt: creditLedger.createdAt,
    })
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))
    .orderBy(desc(creditLedger.createdAt), desc(creditLedger.id))
    .limit(50);

  const jobs = await db
    .select({
      id: videoJobs.id,
      subject: videoJobs.subject,
      status: videoJobs.status,
      credits: videoJobs.credits,
      error: videoJobs.error,
      createdAt: videoJobs.createdAt,
    })
    .from(videoJobs)
    .where(eq(videoJobs.userId, userId))
    .orderBy(desc(videoJobs.createdAt))
    .limit(50);

  const userPurchases = await db
    .select({
      id: purchases.id,
      packageKey: purchases.packageKey,
      credits: purchases.credits,
      amountCents: purchases.amountCents,
      status: purchases.status,
      createdAt: purchases.createdAt,
    })
    .from(purchases)
    .where(eq(purchases.userId, userId))
    .orderBy(desc(purchases.createdAt))
    .limit(50);

  return { user, ledger, jobs, purchases: userPurchases };
}

export type AdminJobRow = {
  id: string;
  userEmail: string | null;
  subject: string;
  status: string;
  credits: number;
  targetSeconds: number;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function listJobs(
  db: Db,
  opts: { status?: string; limit?: number },
): Promise<AdminJobRow[]> {
  const limit = Math.min(500, Math.max(1, opts.limit ?? 100));
  const where = opts.status ? eq(videoJobs.status, opts.status as never) : sql`true`;
  return db
    .select({
      id: videoJobs.id,
      userEmail: users.email,
      subject: videoJobs.subject,
      status: videoJobs.status,
      credits: videoJobs.credits,
      targetSeconds: videoJobs.targetSeconds,
      error: videoJobs.error,
      createdAt: videoJobs.createdAt,
      updatedAt: videoJobs.updatedAt,
    })
    .from(videoJobs)
    .leftJoin(users, eq(videoJobs.userId, users.id))
    .where(where)
    .orderBy(desc(videoJobs.createdAt))
    .limit(limit);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- src/lib/admin/__tests__/queries.test.ts`
Expected: PASS. If the totals subquery pattern (`from(sql\`(SELECT 1) AS one\`)`) trips Drizzle's typing, fall back to `db.execute(sql\`SELECT ...\`)` and map the row — behavior asserted by the test is what matters.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/admin/queries.ts web/src/lib/admin/__tests__/queries.test.ts
git commit -m "feat(admin): dashboard, users and jobs aggregate queries"
```

---

### Task 5: adminAdjustCredits in the ledger

**Files:**
- Modify: `web/src/lib/credits/ledger.ts` (append function)
- Test: `web/src/lib/credits/__tests__/ledger.test.ts` (append describe block)

**Interfaces:**
- Consumes: existing `InsufficientCreditsError`, `getBalance` from the same module
- Produces: `adminAdjustCredits(db: Db, userId: string, delta: number, note?: string): Promise<void>` — throws `InsufficientCreditsError` if the adjustment would make the balance negative; throws `Error("delta must be a non-zero integer")` on invalid delta; inserts a `kind: "admin_adjustment"` ledger row.

- [ ] **Step 1: Write the failing test**

Append to `web/src/lib/credits/__tests__/ledger.test.ts` (imports: add `adminAdjustCredits` to the existing import from `../ledger`; add `creditLedger` — check existing imports, `schema` is already imported as namespace so use `schema.creditLedger`):

```ts
describe("adminAdjustCredits", () => {
  it("adds credits with a note", async () => {
    await adminAdjustCredits(db, userId, 5, "destek telafisi");
    expect(await getBalance(db, userId)).toBe(5);
    const [row] = await db
      .select()
      .from(schema.creditLedger)
      .where(eq(schema.creditLedger.userId, userId));
    expect(row.kind).toBe("admin_adjustment");
    expect(row.note).toBe("destek telafisi");
  });
  it("removes credits but never below zero", async () => {
    await adminAdjustCredits(db, userId, 3);
    await adminAdjustCredits(db, userId, -2);
    expect(await getBalance(db, userId)).toBe(1);
    await expect(adminAdjustCredits(db, userId, -2)).rejects.toThrow(
      InsufficientCreditsError,
    );
    expect(await getBalance(db, userId)).toBe(1);
  });
  it("rejects zero and non-integer deltas", async () => {
    await expect(adminAdjustCredits(db, userId, 0)).rejects.toThrow();
    await expect(adminAdjustCredits(db, userId, 1.5)).rejects.toThrow();
  });
});
```

Note: `eq` must be imported from `drizzle-orm` in the test file if not already.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- src/lib/credits/__tests__/ledger.test.ts`
Expected: FAIL — `adminAdjustCredits` is not exported

- [ ] **Step 3: Implement**

Append to `web/src/lib/credits/ledger.ts`:

```ts
export async function adminAdjustCredits(
  db: Db,
  userId: string,
  delta: number,
  note?: string,
): Promise<void> {
  if (!Number.isInteger(delta) || delta === 0) {
    throw new Error("delta must be a non-zero integer");
  }
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`);
    const [row] = await tx
      .select({ balance: sql<number>`coalesce(sum(${creditLedger.delta}), 0)::int` })
      .from(creditLedger)
      .where(eq(creditLedger.userId, userId));
    if (row.balance + delta < 0) throw new InsufficientCreditsError();
    await tx.insert(creditLedger).values({
      userId,
      delta,
      kind: "admin_adjustment",
      note: note?.trim() || null,
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- src/lib/credits/__tests__/ledger.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/credits/ledger.ts web/src/lib/credits/__tests__/ledger.test.ts
git commit -m "feat(admin): adminAdjustCredits ledger operation"
```

---

### Task 6: Login page, auth actions, panel layout shell

UI from here on is verified manually (dev server) — vitest covers the libs the pages call.

**Files:**
- Create: `web/src/app/admin/actions.ts` (login/logout server actions)
- Create: `web/src/app/admin/login/page.tsx`
- Create: `web/src/app/admin/login/login-form.tsx` (client component)
- Create: `web/src/app/admin/(panel)/layout.tsx`
- Create: `web/src/app/admin/(panel)/page.tsx` (placeholder until Task 7)

**Interfaces:**
- Consumes: `verifyPassword` (`@/lib/admin/password`), `createSessionToken`, `verifySessionToken`, `ADMIN_COOKIE`, `SESSION_MAX_AGE_SECONDS` (`@/lib/admin/session`)
- Produces: `loginAction(prevState, formData)` and `logoutAction()` used by the login form and panel layout. Panel pages live under `web/src/app/admin/(panel)/` — the route group keeps the login page outside the guarded layout while both stay under `/admin/*`.

- [ ] **Step 1: Add dev env vars**

Append to `web/.env.local` (dev credentials; generate the hash first):

```bash
cd web
node scripts/admin-password-hash.mjs admin-dev-password
```

Then add to `web/.env.local`:

```
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<output of the script>
```

- [ ] **Step 2: Create the server actions**

Create `web/src/app/admin/actions.ts`:

```ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyPassword } from "@/lib/admin/password";
import {
  ADMIN_COOKIE,
  createSessionToken,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/admin/session";

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;
  const ok =
    !!expectedUser &&
    !!expectedHash &&
    username === expectedUser &&
    (await verifyPassword(password, expectedHash));
  if (!ok) {
    // Basit brute-force yavaşlatması.
    await new Promise((r) => setTimeout(r, 1000));
    return { error: "Kullanıcı adı veya şifre hatalı." };
  }
  const token = await createSessionToken(username);
  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/login");
}
```

- [ ] **Step 3: Create the login page + form**

Create `web/src/app/admin/login/login-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  );
  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="username">Kullanıcı adı</Label>
        <Input id="username" name="username" autoComplete="username" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Şifre</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Giriş yapılıyor…" : "Giriş yap"}
      </Button>
    </form>
  );
}
```

Create `web/src/app/admin/login/page.tsx`:

```tsx
import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Reelate Admin — Giriş",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <h1 className="text-2xl font-semibold">Reelate Admin</h1>
      <LoginForm />
    </main>
  );
}
```

- [ ] **Step 4: Create the guarded panel layout**

Create `web/src/app/admin/(panel)/layout.tsx`. Defense in depth: the layout re-verifies the cookie even though middleware already gates it.

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/admin/session";
import { logoutAction } from "../actions";

export const metadata: Metadata = {
  title: "Reelate Admin",
  robots: { index: false, follow: false },
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/users", label: "Kullanıcılar" },
  { href: "/jobs", label: "Jobs" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!(await verifySessionToken(token))) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <span className="font-semibold">Reelate Admin</span>
          <nav className="flex items-center gap-4 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <form action={logoutAction} className="ml-auto">
            <button
              type="submit"
              title="Çıkış"
              className="flex items-center p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <LogOut size={16} />
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
```

Note: nav hrefs are subdomain-root paths (`/users`, not `/admin/users`) — the middleware rewrites them. Next's `<Link>` prefetch will also hit the middleware and rewrite correctly.

- [ ] **Step 5: Placeholder dashboard page**

Create `web/src/app/admin/(panel)/page.tsx`:

```tsx
export default function AdminDashboardPage() {
  return <p className="text-muted-foreground">Dashboard — Task 7&apos;de dolacak.</p>;
}
```

- [ ] **Step 6: Manual verification**

Run: `cd web && npm run dev`

- `http://admin.localhost:3000/` → redirected to `/login`, login form renders.
- Wrong password → "Kullanıcı adı veya şifre hatalı." after ~1s.
- Correct (`admin` / `admin-dev-password`) → redirected to `/`, placeholder + nav + logout visible.
- `http://admin.localhost:3000/login` while logged in → redirected to `/`.
- Logout → back to `/login`, then `/` redirects to `/login` again.
- `http://localhost:3000/admin` → 404 page.
- `http://localhost:3000/` and `/dashboard` (Google sign-in) still behave as before.

Expected: all pass. Stop the dev server.

- [ ] **Step 7: Build + commit**

Run: `cd web && npm run build`
Expected: succeeds.

```bash
git add web/src/app/admin
git commit -m "feat(admin): login flow and guarded panel layout"
```

---

### Task 7: Analytics dashboard page + SVG chart components

Server-rendered SVG bar charts, no chart library. Colors are from the pre-validated dataviz reference palette — do not eyeball-substitute other hex values.

**Files:**
- Create: `web/src/components/admin/chart-theme.css` — imported by the panel layout
- Create: `web/src/components/admin/bar-chart.tsx` — `<DailyBarChart>` (single series) and `<JobsChart>` (grouped by outcome)
- Create: `web/src/components/admin/stat-card.tsx`
- Modify: `web/src/app/admin/(panel)/layout.tsx` (import the css)
- Modify: `web/src/app/admin/(panel)/page.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `getDashboardStats`, `DayValue`, `JobsDay` from `@/lib/admin/queries` (Task 4); `db` from `@/db`
- Produces: `<DailyBarChart title data={DayValue[]} color format? />`, `<JobsChart title data={JobsDay[]} />`, `<StatCard label value hint? />`

- [ ] **Step 1: Chart theme CSS**

Create `web/src/components/admin/chart-theme.css` (values verbatim from the dataviz reference palette; light + dark selected per mode):

```css
.viz-root {
  --viz-surface: #fcfcfb;
  --viz-ink: #0b0b0b;
  --viz-ink-muted: #898781;
  --viz-grid: #e1e0d9;
  --viz-baseline: #c3c2b7;
  --viz-series-1: #2a78d6; /* categorical slot 1: blue */
  --viz-status-good: #0ca30c;
  --viz-status-critical: #d03b3b;
}
@media (prefers-color-scheme: dark) {
  .viz-root {
    --viz-surface: #1a1a19;
    --viz-ink: #ffffff;
    --viz-ink-muted: #898781;
    --viz-grid: #2c2c2a;
    --viz-baseline: #383835;
    --viz-series-1: #3987e5;
    --viz-status-good: #0ca30c;
    --viz-status-critical: #d03b3b;
  }
}
```

- [ ] **Step 2: StatCard component**

Create `web/src/components/admin/stat-card.tsx`:

```tsx
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-semibold">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Bar chart components**

Create `web/src/components/admin/bar-chart.tsx`. Mark specs from the dataviz skill: bars anchored to the baseline with 2px-rounded tops, 2px gaps between bars/segments, hairline grid, muted axis text, native `<title>` tooltips per mark, legend for the multi-series chart (text in ink tokens, never series color).

```tsx
import type { DayValue, JobsDay } from "@/lib/admin/queries";

const W = 520;
const H = 140;
const PAD_TOP = 18;
const PAD_BOTTOM = 20;
const PLOT_H = H - PAD_TOP - PAD_BOTTOM;

function barGeometry(count: number) {
  const gap = 2;
  const barW = Math.max(2, (W - gap * (count - 1)) / count);
  return { gap, barW };
}

// Baseline'a oturan, üst köşeleri 2px yuvarlatılmış bar path'i.
function barPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return "";
  const r = Math.min(2, w / 2, h);
  const bottom = y + h;
  return [
    `M ${x} ${bottom}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + w - r} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + r}`,
    `L ${x + w} ${bottom}`,
    "Z",
  ].join(" ");
}

function ChartFrame({
  title,
  maxLabel,
  children,
}: {
  title: string;
  maxLabel: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="viz-root rounded-lg border p-4" style={{ background: "var(--viz-surface)" }}>
      <figcaption
        className="mb-2 text-sm font-medium"
        style={{ color: "var(--viz-ink)" }}
      >
        {title}
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={title}
      >
        <text
          x={0}
          y={PAD_TOP - 6}
          fontSize={10}
          fill="var(--viz-ink-muted)"
        >
          {maxLabel}
        </text>
        <line
          x1={0}
          y1={PAD_TOP}
          x2={W}
          y2={PAD_TOP}
          stroke="var(--viz-grid)"
          strokeWidth={1}
        />
        {children}
        <line
          x1={0}
          y1={H - PAD_BOTTOM}
          x2={W}
          y2={H - PAD_BOTTOM}
          stroke="var(--viz-baseline)"
          strokeWidth={1}
        />
      </svg>
    </figure>
  );
}

function endLabels(days: string[]) {
  const fmt = (d: string) => d.slice(5); // MM-DD
  return (
    <>
      <text x={0} y={H - 6} fontSize={10} fill="var(--viz-ink-muted)">
        {fmt(days[0])}
      </text>
      <text x={W} y={H - 6} fontSize={10} textAnchor="end" fill="var(--viz-ink-muted)">
        {fmt(days[days.length - 1])}
      </text>
    </>
  );
}

export function DailyBarChart({
  title,
  data,
  color = "var(--viz-series-1)",
  format = (v: number) => String(v),
}: {
  title: string;
  data: DayValue[];
  color?: string;
  format?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const { gap, barW } = barGeometry(data.length);
  return (
    <ChartFrame title={title} maxLabel={format(max)}>
      {data.map((d, i) => {
        const h = (d.value / max) * PLOT_H;
        const x = i * (barW + gap);
        return (
          <path key={d.day} d={barPath(x, H - PAD_BOTTOM - h, barW, h)} fill={color}>
            <title>{`${d.day}: ${format(d.value)}`}</title>
          </path>
        );
      })}
      {endLabels(data.map((d) => d.day))}
    </ChartFrame>
  );
}

const JOB_SERIES = [
  { key: "done", label: "Tamamlanan", color: "var(--viz-status-good)" },
  { key: "failed", label: "Başarısız", color: "var(--viz-status-critical)" },
  { key: "inProgress", label: "Devam eden", color: "var(--viz-series-1)" },
] as const;

export function JobsChart({ title, data }: { title: string; data: JobsDay[] }) {
  const max = Math.max(1, ...data.map((d) => d.done + d.failed + d.inProgress));
  const { gap, barW } = barGeometry(data.length);
  return (
    <div>
      <ChartFrame title={title} maxLabel={String(max)}>
        {data.map((d, i) => {
          const x = i * (barW + gap);
          let yBottom = H - PAD_BOTTOM;
          return JOB_SERIES.map((s) => {
            const v = d[s.key];
            const h = (v / max) * PLOT_H;
            if (v === 0) return null;
            // Segmentler arası 2px yüzey boşluğu: segment yüksekliğinden düşülmez,
            // bir sonraki segment 2px yukarıdan başlar.
            const y = yBottom - h;
            yBottom = y - 2;
            return (
              <path key={`${d.day}-${s.key}`} d={barPath(x, y, barW, h)} fill={s.color}>
                <title>{`${d.day} — ${s.label}: ${v}`}</title>
              </path>
            );
          });
        })}
        {endLabels(data.map((d) => d.day))}
      </ChartFrame>
      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
        {JOB_SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: s.color }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Import the theme CSS in the panel layout**

At the top of `web/src/app/admin/(panel)/layout.tsx` add:

```tsx
import "@/components/admin/chart-theme.css";
```

- [ ] **Step 5: Dashboard page**

Replace `web/src/app/admin/(panel)/page.tsx`:

```tsx
import { db } from "@/db";
import { getDashboardStats } from "@/lib/admin/queries";
import { StatCard } from "@/components/admin/stat-card";
import { DailyBarChart, JobsChart } from "@/components/admin/bar-chart";

export const dynamic = "force-dynamic";

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function AdminDashboardPage() {
  const stats = await getDashboardStats(db, 30);
  const successBase = stats.totals.doneJobs30d + stats.totals.failedJobs30d;
  const successRate =
    successBase > 0
      ? `${Math.round((stats.totals.doneJobs30d / successBase) * 100)}%`
      : "—";

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Toplam kullanıcı" value={String(stats.totals.users)} />
        <StatCard label="Job (30g)" value={String(stats.totals.jobs30d)} />
        <StatCard
          label="Başarı oranı (30g)"
          value={successRate}
          hint={`${stats.totals.doneJobs30d} done / ${stats.totals.failedJobs30d} failed`}
        />
        <StatCard label="Gelir (30g)" value={usd(stats.totals.revenueCents30d)} />
        <StatCard label="Harcanan kredi (30g)" value={String(stats.totals.creditsSpent30d)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <DailyBarChart title="Yeni kayıtlar" data={stats.signupsByDay} />
        <JobsChart title="Job'lar (duruma göre)" data={stats.jobsByDay} />
        <DailyBarChart title="Gelir" data={stats.revenueByDay} format={usd} />
        <DailyBarChart title="Harcanan kredi" data={stats.creditsSpentByDay} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Manual verification (render and LOOK at it)**

Run: `cd web && npm run dev`, log in at `http://admin.localhost:3000/`.

- 5 stat cards show plausible numbers from the local dev DB.
- 4 charts render; hovering a bar shows the native tooltip (`day: value`).
- Jobs chart shows the 3-entry legend; segments have visible 2px gaps.
- Check both light and dark OS themes (charts must stay readable in both).
- No label collisions or overflow at narrow window widths.

Expected: all good. Stop the dev server.

- [ ] **Step 7: Build + commit**

Run: `cd web && npm run build`
Expected: succeeds.

```bash
git add web/src/components/admin web/src/app/admin
git commit -m "feat(admin): analytics dashboard with SVG daily charts"
```

---

### Task 8: Users list, user detail, credit adjustment

**Files:**
- Create: `web/src/app/admin/(panel)/users/page.tsx`
- Create: `web/src/app/admin/(panel)/users/[id]/page.tsx`
- Create: `web/src/app/admin/(panel)/users/[id]/adjust-form.tsx` (client)
- Create: `web/src/app/admin/(panel)/users/[id]/actions.ts` (server action)

**Interfaces:**
- Consumes: `listUsers`, `getUserDetail` (`@/lib/admin/queries`), `adminAdjustCredits`, `InsufficientCreditsError` (`@/lib/credits/ledger`), `verifySessionToken`, `ADMIN_COOKIE` (`@/lib/admin/session`)
- Produces: `adjustCreditsAction(userId, prevState, formData)` — the ONLY mutating admin endpoint; it MUST re-verify the admin cookie itself (server actions are directly invokable; layout/middleware guards don't protect them).

- [ ] **Step 1: Users list page**

Create `web/src/app/admin/(panel)/users/page.tsx`:

```tsx
import Link from "next/link";
import { db } from "@/db";
import { listUsers } from "@/lib/admin/queries";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const page = Math.max(1, Number(params.page) || 1);
  const { rows, total } = await listUsers(db, { q, page, pageSize: PAGE_SIZE });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Kullanıcılar ({total})</h1>
        <form className="flex gap-2">
          <Input name="q" placeholder="E-posta ara…" defaultValue={q} className="w-64" />
          <Button type="submit" variant="secondary">Ara</Button>
        </form>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-3 py-2 font-medium">E-posta</th>
              <th className="px-3 py-2 font-medium">Ad</th>
              <th className="px-3 py-2 font-medium">Kayıt</th>
              <th className="px-3 py-2 text-right font-medium">Bakiye</th>
              <th className="px-3 py-2 text-right font-medium">Job</th>
              <th className="px-3 py-2 text-right font-medium">Ödeme</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-3 py-2">
                  <Link href={`/users/${u.id}`} className="underline-offset-2 hover:underline">
                    {u.email ?? u.id}
                  </Link>
                </td>
                <td className="px-3 py-2">{u.name ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums">
                  {u.createdAt.toISOString().slice(0, 10)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{u.balance}</td>
                <td className="px-3 py-2 text-right tabular-nums">{u.jobCount}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  ${(u.paidCents / 100).toFixed(2)}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  Kullanıcı bulunamadı.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {pageCount > 1 ? (
        <div className="flex items-center gap-3 text-sm">
          {page > 1 ? (
            <Link href={`/users?q=${encodeURIComponent(q)}&page=${page - 1}`} className="underline">
              ← Önceki
            </Link>
          ) : null}
          <span className="text-muted-foreground">
            Sayfa {page} / {pageCount}
          </span>
          {page < pageCount ? (
            <Link href={`/users?q=${encodeURIComponent(q)}&page=${page + 1}`} className="underline">
              Sonraki →
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Credit adjustment server action**

Create `web/src/app/admin/(panel)/users/[id]/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db } from "@/db";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/admin/session";
import {
  adminAdjustCredits,
  InsufficientCreditsError,
} from "@/lib/credits/ledger";

export type AdjustState = { error?: string; ok?: boolean };

export async function adjustCreditsAction(
  userId: string,
  _prev: AdjustState,
  formData: FormData,
): Promise<AdjustState> {
  // Server action'lar doğrudan çağrılabilir; cookie burada da doğrulanmak zorunda.
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!(await verifySessionToken(token))) return { error: "Yetkisiz." };

  const delta = Number(formData.get("delta"));
  const note = String(formData.get("note") ?? "");
  if (!Number.isInteger(delta) || delta === 0) {
    return { error: "Miktar sıfır olmayan bir tam sayı olmalı." };
  }
  try {
    await adminAdjustCredits(db, userId, delta, note);
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      return { error: "Bakiye eksiye düşemez." };
    }
    throw e;
  }
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}
```

- [ ] **Step 3: Adjustment form (client)**

Create `web/src/app/admin/(panel)/users/[id]/adjust-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { adjustCreditsAction, type AdjustState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AdjustCreditsForm({ userId }: { userId: string }) {
  const action = adjustCreditsAction.bind(null, userId);
  const [state, formAction, pending] = useActionState<AdjustState, FormData>(
    action,
    {},
  );
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <label htmlFor="delta" className="text-xs text-muted-foreground">
          Kredi (± tam sayı)
        </label>
        <Input id="delta" name="delta" type="number" step={1} required className="w-28" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="note" className="text-xs text-muted-foreground">
          Not (opsiyonel)
        </label>
        <Input id="note" name="note" className="w-64" maxLength={200} />
      </div>
      <Button type="submit" disabled={pending} variant="secondary">
        {pending ? "Uygulanıyor…" : "Uygula"}
      </Button>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-muted-foreground">Uygulandı.</p> : null}
    </form>
  );
}
```

- [ ] **Step 4: User detail page**

Create `web/src/app/admin/(panel)/users/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { db } from "@/db";
import { getUserDetail } from "@/lib/admin/queries";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/admin/stat-card";
import { AdjustCreditsForm } from "./adjust-form";

export const dynamic = "force-dynamic";

function fmtDate(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 16);
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getUserDetail(db, id);
  if (!detail) notFound();
  const { user, ledger, jobs, purchases } = detail;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">{user.email ?? user.id}</h1>
        <p className="text-sm text-muted-foreground">
          {user.name ?? "—"} · kayıt {fmtDate(user.createdAt)}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Bakiye" value={String(user.balance)} />
        <StatCard label="Job" value={String(user.jobCount)} />
        <StatCard label="Toplam ödeme" value={`$${(user.paidCents / 100).toFixed(2)}`} />
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Kredi ayarla</h2>
        <AdjustCreditsForm userId={user.id} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Kredi geçmişi</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="px-3 py-2 font-medium">Tarih</th>
                <th className="px-3 py-2 font-medium">Tür</th>
                <th className="px-3 py-2 text-right font-medium">Δ</th>
                <th className="px-3 py-2 font-medium">Not</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="px-3 py-2 tabular-nums">{fmtDate(l.createdAt)}</td>
                  <td className="px-3 py-2">{l.kind}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {l.delta > 0 ? `+${l.delta}` : l.delta}
                  </td>
                  <td className="px-3 py-2">{l.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Job&apos;lar</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="px-3 py-2 font-medium">Tarih</th>
                <th className="px-3 py-2 font-medium">Konu</th>
                <th className="px-3 py-2 font-medium">Durum</th>
                <th className="px-3 py-2 text-right font-medium">Kredi</th>
                <th className="px-3 py-2 font-medium">Hata</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-b last:border-0">
                  <td className="px-3 py-2 tabular-nums">{fmtDate(j.createdAt)}</td>
                  <td className="max-w-64 truncate px-3 py-2">{j.subject}</td>
                  <td className="px-3 py-2">
                    <Badge variant={j.status === "failed" ? "destructive" : "secondary"}>
                      {j.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{j.credits}</td>
                  <td className="max-w-64 truncate px-3 py-2 text-muted-foreground">
                    {j.error ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Satın almalar</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="px-3 py-2 font-medium">Tarih</th>
                <th className="px-3 py-2 font-medium">Paket</th>
                <th className="px-3 py-2 text-right font-medium">Kredi</th>
                <th className="px-3 py-2 text-right font-medium">Tutar</th>
                <th className="px-3 py-2 font-medium">Durum</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-3 py-2 tabular-nums">{fmtDate(p.createdAt)}</td>
                  <td className="px-3 py-2">{p.packageKey}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.credits}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    ${(p.amountCents / 100).toFixed(2)}
                  </td>
                  <td className="px-3 py-2">{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Manual verification**

Run: `cd web && npm run dev`, log in at `http://admin.localhost:3000/`.

- `/users` lists dev-DB users with balances; email search narrows; pagination appears with >25 users (skip if fewer).
- Clicking an email opens the detail page with the three tables.
- Adjust +5 credits with a note → "Uygulandı.", balance card and ledger table update, ledger row shows kind `admin_adjustment` and the note.
- Adjust below zero (e.g. −9999) → "Bakiye eksiye düşemez.", balance unchanged.
- Adjust `0` → validation error.

Expected: all pass. Stop the dev server.

- [ ] **Step 6: Build + commit**

Run: `cd web && npm run build`
Expected: succeeds.

```bash
git add web/src/app/admin
git commit -m "feat(admin): users list, user detail and credit adjustment"
```

---

### Task 9: Jobs monitoring page

**Files:**
- Create: `web/src/app/admin/(panel)/jobs/page.tsx`

**Interfaces:**
- Consumes: `listJobs` (`@/lib/admin/queries`), `db` (`@/db`)

- [ ] **Step 1: Jobs page**

Create `web/src/app/admin/(panel)/jobs/page.tsx`:

```tsx
import Link from "next/link";
import { db } from "@/db";
import { listJobs } from "@/lib/admin/queries";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const STATUSES = ["queued", "script", "downloading", "rendering", "done", "failed"] as const;

function badgeVariant(status: string): "default" | "secondary" | "destructive" {
  if (status === "failed") return "destructive";
  if (status === "done") return "default";
  return "secondary";
}

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const active = STATUSES.includes(status as (typeof STATUSES)[number])
    ? status
    : undefined;
  const jobs = await listJobs(db, { status: active, limit: 100 });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Jobs</h1>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href="/jobs"
          className={!active ? "font-semibold underline" : "text-muted-foreground hover:underline"}
        >
          Tümü
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/jobs?status=${s}`}
            className={active === s ? "font-semibold underline" : "text-muted-foreground hover:underline"}
          >
            {s}
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-3 py-2 font-medium">Oluşturma</th>
              <th className="px-3 py-2 font-medium">Kullanıcı</th>
              <th className="px-3 py-2 font-medium">Konu</th>
              <th className="px-3 py-2 font-medium">Durum</th>
              <th className="px-3 py-2 text-right font-medium">Süre hedefi</th>
              <th className="px-3 py-2 font-medium">Son güncelleme</th>
              <th className="px-3 py-2 font-medium">Hata</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-3 py-2 tabular-nums">
                  {j.createdAt.toISOString().replace("T", " ").slice(0, 16)}
                </td>
                <td className="px-3 py-2">{j.userEmail ?? "—"}</td>
                <td className="max-w-56 truncate px-3 py-2">{j.subject}</td>
                <td className="px-3 py-2">
                  <Badge variant={badgeVariant(j.status)}>{j.status}</Badge>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{j.targetSeconds}s</td>
                <td className="px-3 py-2 tabular-nums">
                  {j.updatedAt.toISOString().replace("T", " ").slice(0, 16)}
                </td>
                <td className="max-w-72 truncate px-3 py-2 text-muted-foreground" title={j.error ?? undefined}>
                  {j.error ?? "—"}
                </td>
              </tr>
            ))}
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  Job bulunamadı.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Run: `cd web && npm run dev`, log in, open `/jobs`.

- Job list renders with statuses; status filter links narrow the list; `failed` rows show the error text (hover for full message).

Expected: pass. Stop the dev server.

- [ ] **Step 3: Full suite + build + commit**

Run: `cd web && npm test && npm run build`
Expected: all pass.

```bash
git add web/src/app/admin
git commit -m "feat(admin): jobs monitoring page"
```

---

### Task 10: Deploy config + runbook docs

No code — deployment wiring and documentation. Actual prod deploy is a manual operator step AFTER merge (documented, not executed here).

**Files:**
- Modify: `deploy/docker-compose.prod.yml:16` (Traefik host rule)
- Modify: `deploy/RUNBOOK.md` (admin panel section)

- [ ] **Step 1: Traefik rule**

In `deploy/docker-compose.prod.yml` change line 16 from:

```yaml
      traefik.http.routers.reelate.rule: "Host(`reelate.org`) || Host(`www.reelate.org`)"
```

to:

```yaml
      traefik.http.routers.reelate.rule: "Host(`reelate.org`) || Host(`www.reelate.org`) || Host(`admin.reelate.org`)"
```

- [ ] **Step 2: Runbook section**

Append to `deploy/RUNBOOK.md`:

```markdown
## Admin panel (admin.reelate.org)

Admin paneli ayrı bir servis DEĞİLDİR; `reelate-web` konteynerinin içindedir.
Middleware, `admin.reelate.org` host'unu `/admin/*` route'larına yönlendirir.

### İlk kurulum (bir kez)

1. Cloudflare DNS: `admin` A kaydı → `116.203.145.5`, proxy AÇIK.
   (Origin cert `*.reelate.org`'u kapsıyor; Traefik tarafında ek TLS işi yok.)
2. Şifre hash'i üret (lokalde):
   `cd web && node scripts/admin-password-hash.mjs '<güçlü-şifre>'`
3. Sunucuda `/opt/reelate/.env.production` dosyasına ekle:
   ```
   ADMIN_USERNAME=<kullanıcı-adı>
   ADMIN_PASSWORD_HASH=<script çıktısı>
   ```
4. Normal deploy akışı (rsync + `docker compose up -d --build web`) ve
   migration (`npm run db:migrate`) — 0003 migration'ı `user.created_at`,
   `credit_ledger.note` kolonlarını ekler ve created_at backfill yapar.

### Smoke test

- `https://admin.reelate.org` → login sayfası; doğru bilgilerle giriş → dashboard.
- `https://reelate.org/admin` → 404.
- `https://reelate.org` Google girişi etkilenmemiş olmalı.

### Notlar

- Admin oturumu: `admin_session` httpOnly cookie (7 gün, AUTH_SECRET ile imzalı JWT).
- Şifre değişikliği: yeni hash üret, env'i güncelle, `docker compose up -d web`.
- Kredi düzeltmeleri `credit_ledger`'a `kind='admin_adjustment'` satırı olarak yazılır (not alanıyla).
```

- [ ] **Step 3: Commit**

```bash
git add deploy/docker-compose.prod.yml deploy/RUNBOOK.md
git commit -m "feat(deploy): route admin.reelate.org and document admin panel ops"
```

---

## Final Verification (after all tasks)

1. `cd web && npm test` — full suite green.
2. `cd web && npm run build` — production build green.
3. `cd web && npm run lint` — no new errors.
4. Full manual pass on `http://admin.localhost:3000` (login, dashboard charts, user search/detail/credit adjust, jobs filter, logout) and `http://localhost:3000` regression (landing, Google sign-in, dashboard).
5. Use the superpowers:verification-before-completion skill before claiming done; then superpowers:finishing-a-development-branch.

Prod deploy (DNS + env + rsync) is an operator step per the new RUNBOOK section — do not execute it as part of this plan.
