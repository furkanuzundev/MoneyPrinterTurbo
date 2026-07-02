# Reelate Faz 2b — Stripe Kredi Satın Alma Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kullanıcının Stripe Checkout ile kredi paketi satın alması: paket tanımları, checkout oturumu, imza doğrulamalı idempotent webhook ile kredi yükleme, satın alma sayfası.

**Architecture:** Stripe **Checkout Sessions** (hosted sayfa; PCI kapsamı dışı, spec Bölüm 6). Kredi yükleme YALNIZCA webhook'ta: `checkout.session.completed` → `purchases` tablosuna `stripe_session_id` unique kısıtıyla idempotent kayıt → aynı transaction'da `credit_ledger`'a `purchase` hareketi. Başarı sayfası asla kredi yüklemez. `payment_method_types` hiçbir çağrıda GÖNDERİLMEZ (dinamik ödeme yöntemleri). Paket tanımları `app_config` tablosundan okunur, kod içi varsayılana düşer (spec: fiyatlar kod değişikliği olmadan ayarlanabilir).

**Tech Stack:** stripe (Node SDK, API version `2026-06-24.dahlia`), mevcut Drizzle/Postgres + Auth.js altyapısı (Faz 2a).

## Global Constraints

- Spec Bölüm 5/6: paketler Starter 10=$5, Creator 50=$19, Pro 200=$59; fiyatlar USD; webhook idempotent; başarı sayfası kredi yüklemez
- `payment_method_types` asla gönderilmez (Stripe dinamik ödeme yöntemleri)
- Stripe Tax: `automatic_tax.enabled`, `STRIPE_TAX_ENABLED=true` env bayrağına bağlı (test modunda vergi kaydı olmadan hata vermesin diye varsayılan kapalı; prod'da açılır)
- Kredi yükleme tek transaction: purchases insert (unique çakışmada hiçbir şey yazma) + ledger `purchase` satırı
- Kullanıcıya görünen metinler İngilizce; testler `cd web && npm test`; commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Secret'lar `.env.local`; `.env.example`'a boş anahtar satırları eklenir

---

### Task 1: Paket tanımları modülü

**Files:**
- Create: `web/src/lib/credits/packages.ts`
- Test: `web/src/lib/credits/__tests__/packages.test.ts`

**Interfaces:**
- Produces:
  - `type CreditPackage = { key: string; credits: number; amountCents: number; label: string; featured: boolean }`
  - `DEFAULT_PACKAGES: CreditPackage[]` — starter/creator/pro spec değerleriyle
  - `getPackages(db: Db): Promise<CreditPackage[]>` — `app_config.key = 'credit_packages'` varsa onu, yoksa varsayılanı döner
  - `getPackage(db: Db, key: string): Promise<CreditPackage | undefined>`

- [ ] **Step 1: Failing test**

`web/src/lib/credits/__tests__/packages.test.ts`:

```typescript
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
```

- [ ] **Step 2: FAIL doğrula**

Run: `cd web && npm test -- packages`
Expected: FAIL — modül yok

- [ ] **Step 3: Implementasyon**

`web/src/lib/credits/packages.ts`:

```typescript
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
```

- [ ] **Step 4: PASS doğrula**

Run: `cd web && npm test -- packages`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/credits
git commit -m "feat(web): add credit package definitions with config override"
```

---

### Task 2: Satın alma yerine getirme (idempotent webhook çekirdeği)

**Files:**
- Create: `web/src/lib/credits/purchases.ts`
- Test: `web/src/lib/credits/__tests__/purchases.test.ts`

**Interfaces:**
- Consumes: şema (`purchases`, `creditLedger`), `Db`
- Produces: `fulfillPurchase(db: Db, input: { userId: string; stripeSessionId: string; packageKey: string; credits: number; amountCents: number }): Promise<boolean>` — ilk çağrıda purchase + ledger yazar (`true`); aynı `stripeSessionId` ile tekrar çağrıda hiçbir şey yazmaz (`false`)

- [ ] **Step 1: Failing test**

`web/src/lib/credits/__tests__/purchases.test.ts`:

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { getBalance } from "../ledger";
import { fulfillPurchase } from "../purchases";

const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST });
const db = drizzle(pool, { schema });

let userId: string;

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user", credit_ledger, purchases CASCADE`);
  const [u] = await db
    .insert(schema.users)
    .values({ email: "buyer@example.com" })
    .returning();
  userId = u.id;
});
afterAll(() => pool.end());

const INPUT = {
  stripeSessionId: "cs_test_123",
  packageKey: "creator",
  credits: 50,
  amountCents: 1900,
};

describe("fulfillPurchase", () => {
  it("credits the user once", async () => {
    expect(await fulfillPurchase(db, { userId, ...INPUT })).toBe(true);
    expect(await getBalance(db, userId)).toBe(50);
    const rows = await db.select().from(schema.purchases);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("completed");
  });
  it("is idempotent for the same session id", async () => {
    await fulfillPurchase(db, { userId, ...INPUT });
    expect(await fulfillPurchase(db, { userId, ...INPUT })).toBe(false);
    expect(await getBalance(db, userId)).toBe(50);
    expect(await db.select().from(schema.creditLedger)).toHaveLength(1);
  });
  it("survives concurrent duplicate webhooks", async () => {
    const results = await Promise.allSettled([
      fulfillPurchase(db, { userId, ...INPUT }),
      fulfillPurchase(db, { userId, ...INPUT }),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const credited = results.filter(
      (r) => r.status === "fulfilled" && r.value === true,
    );
    expect(credited).toHaveLength(1);
    expect(await getBalance(db, userId)).toBe(50);
  });
});
```

- [ ] **Step 2: FAIL doğrula**

Run: `cd web && npm test -- purchases`
Expected: FAIL — modül yok

- [ ] **Step 3: Implementasyon**

`web/src/lib/credits/purchases.ts`:

```typescript
import type { Db } from "@/db";
import { creditLedger, purchases } from "@/db/schema";

export async function fulfillPurchase(
  db: Db,
  input: {
    userId: string;
    stripeSessionId: string;
    packageKey: string;
    credits: number;
    amountCents: number;
  },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    // stripe_session_id UNIQUE: çakışmada satır dönmez -> daha önce işlenmiş.
    const inserted = await tx
      .insert(purchases)
      .values({
        userId: input.userId,
        stripeSessionId: input.stripeSessionId,
        packageKey: input.packageKey,
        credits: input.credits,
        amountCents: input.amountCents,
        status: "completed",
      })
      .onConflictDoNothing({ target: purchases.stripeSessionId })
      .returning({ id: purchases.id });
    if (inserted.length === 0) return false;
    await tx.insert(creditLedger).values({
      userId: input.userId,
      delta: input.credits,
      kind: "purchase",
      purchaseId: String(inserted[0].id),
    });
    return true;
  });
}
```

- [ ] **Step 4: PASS doğrula**

Run: `cd web && npm test`
Expected: tümü PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/credits
git commit -m "feat(web): add idempotent purchase fulfillment"
```

---

### Task 3: Stripe istemcisi + checkout oturumu

**Files:**
- Create: `web/src/lib/stripe.ts`, `web/src/lib/credits/checkout.ts`, `web/src/app/api/checkout/route.ts`
- Modify: `web/.env.example`
- Test: `web/src/lib/credits/__tests__/checkout.test.ts`

**Interfaces:**
- Consumes: `getPackage` (Task 1), `auth()` (2a Task 5)
- Produces:
  - `stripe` — `web/src/lib/stripe.ts` export'u: `new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-06-24.dahlia" })` (lazy init: modül import'u env yokken patlamasın diye getter)
  - `buildCheckoutParams(pkg: CreditPackage, userId: string, appUrl: string, taxEnabled: boolean): Stripe.Checkout.SessionCreateParams` — SAF fonksiyon (test edilir)
  - `POST /api/checkout` — body `{ packageKey }`; oturum yoksa 401; bilinmeyen paket 400; başarıda `{ url }` (Stripe hosted checkout URL'si)

- [ ] **Step 1: Bağımlılık + env**

```bash
cd web && npm install stripe
```

`web/.env.example`'a ekle:

```bash
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_TAX_ENABLED=false
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

(`.env.local`'a da aynı satırları boş/localhost değerleriyle ekle.)

- [ ] **Step 2: Failing test (saf parametre kurucusu)**

`web/src/lib/credits/__tests__/checkout.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildCheckoutParams } from "../checkout";

const PKG = {
  key: "creator",
  credits: 50,
  amountCents: 1900,
  label: "Creator",
  featured: true,
};

describe("buildCheckoutParams", () => {
  const params = buildCheckoutParams(PKG, "user-1", "https://reelate.co", false);

  it("is a one-time payment with correct amount", () => {
    expect(params.mode).toBe("payment");
    expect(params.line_items).toEqual([
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: 1900,
          product_data: { name: "Creator — 50 credits" },
        },
      },
    ]);
  });
  it("never sets payment_method_types (dynamic payment methods)", () => {
    expect("payment_method_types" in params).toBe(false);
  });
  it("carries fulfillment metadata", () => {
    expect(params.metadata).toEqual({
      userId: "user-1",
      packageKey: "creator",
      credits: "50",
    });
  });
  it("sets redirect urls", () => {
    expect(params.success_url).toBe(
      "https://reelate.co/dashboard/buy/success?session_id={CHECKOUT_SESSION_ID}",
    );
    expect(params.cancel_url).toBe("https://reelate.co/dashboard/buy");
  });
  it("enables automatic tax only when flagged", () => {
    expect(params.automatic_tax).toBeUndefined();
    const taxed = buildCheckoutParams(PKG, "user-1", "https://reelate.co", true);
    expect(taxed.automatic_tax).toEqual({ enabled: true });
  });
});
```

- [ ] **Step 3: FAIL doğrula**

Run: `cd web && npm test -- checkout`
Expected: FAIL

- [ ] **Step 4: Implementasyon**

`web/src/lib/stripe.ts`:

```typescript
import Stripe from "stripe";

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    client = new Stripe(key, { apiVersion: "2026-06-24.dahlia" });
  }
  return client;
}
```

`web/src/lib/credits/checkout.ts`:

```typescript
import type Stripe from "stripe";
import type { CreditPackage } from "./packages";

export function buildCheckoutParams(
  pkg: CreditPackage,
  userId: string,
  appUrl: string,
  taxEnabled: boolean,
): Stripe.Checkout.SessionCreateParams {
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: pkg.amountCents,
          product_data: { name: `${pkg.label} — ${pkg.credits} credits` },
        },
      },
    ],
    metadata: {
      userId,
      packageKey: pkg.key,
      credits: String(pkg.credits),
    },
    success_url: `${appUrl}/dashboard/buy/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/dashboard/buy`,
  };
  if (taxEnabled) params.automatic_tax = { enabled: true };
  return params;
}
```

`web/src/app/api/checkout/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { buildCheckoutParams } from "@/lib/credits/checkout";
import { getPackage } from "@/lib/credits/packages";
import { getStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const pkg = await getPackage(db, String(body.packageKey ?? ""));
  if (!pkg) {
    return NextResponse.json({ error: "Unknown package" }, { status: 400 });
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const taxEnabled = process.env.STRIPE_TAX_ENABLED === "true";
  const checkout = await getStripe().checkout.sessions.create(
    buildCheckoutParams(pkg, userId, appUrl, taxEnabled),
  );
  return NextResponse.json({ url: checkout.url });
}
```

- [ ] **Step 5: PASS + build doğrula**

Run: `cd web && npm test && npm run build`
Expected: testler PASS, build exit 0

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "feat(web): add stripe checkout session creation"
```

---

### Task 4: Webhook endpoint'i (imza doğrulamalı)

**Files:**
- Create: `web/src/app/api/stripe/webhook/route.ts`
- Test: `web/src/app/api/stripe/__tests__/webhook.test.ts`

**Interfaces:**
- Consumes: `fulfillPurchase` (Task 2), `getStripe` (Task 3)
- Produces: `POST /api/stripe/webhook` — imzasız/bozuk imzalı istek 400; `checkout.session.completed` (payment_status=paid) → `fulfillPurchase`; diğer event'ler 200 + no-op. Handler mantığı `handleStripeEvent(db, event)` olarak ayrı export edilir (test için)

- [ ] **Step 1: Failing test**

`web/src/app/api/stripe/__tests__/webhook.test.ts` — imza üretimi Stripe SDK'nın resmi test yardımıyla, DB gerçek:

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import Stripe from "stripe";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { getBalance } from "@/lib/credits/ledger";
import { handleStripeEvent } from "../webhook/route";

const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST });
const db = drizzle(pool, { schema });

let userId: string;

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user", credit_ledger, purchases CASCADE`);
  const [u] = await db
    .insert(schema.users)
    .values({ email: "hook@example.com" })
    .returning();
  userId = u.id;
});
afterAll(() => pool.end());

function completedEvent(sessionId: string): Stripe.Event {
  return {
    id: `evt_${sessionId}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        payment_status: "paid",
        amount_total: 1900,
        metadata: { userId, packageKey: "creator", credits: "50" },
      },
    },
  } as unknown as Stripe.Event;
}

describe("handleStripeEvent", () => {
  it("credits on checkout.session.completed", async () => {
    await handleStripeEvent(db, completedEvent("cs_1"));
    expect(await getBalance(db, userId)).toBe(50);
  });
  it("is idempotent for duplicate events", async () => {
    await handleStripeEvent(db, completedEvent("cs_1"));
    await handleStripeEvent(db, completedEvent("cs_1"));
    expect(await getBalance(db, userId)).toBe(50);
  });
  it("ignores unpaid sessions", async () => {
    const ev = completedEvent("cs_2");
    (ev.data.object as Stripe.Checkout.Session).payment_status = "unpaid";
    await handleStripeEvent(db, ev);
    expect(await getBalance(db, userId)).toBe(0);
  });
  it("ignores unrelated event types", async () => {
    const ev = { ...completedEvent("cs_3"), type: "invoice.paid" } as Stripe.Event;
    await handleStripeEvent(db, ev);
    expect(await getBalance(db, userId)).toBe(0);
  });
  it("throws on missing metadata (surfaces misconfigured session)", async () => {
    const ev = completedEvent("cs_4");
    (ev.data.object as Stripe.Checkout.Session).metadata = {};
    await expect(handleStripeEvent(db, ev)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: FAIL doğrula**

Run: `cd web && npm test -- webhook`
Expected: FAIL — route modülü yok

- [ ] **Step 3: Implementasyon**

`web/src/app/api/stripe/webhook/route.ts`:

```typescript
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import type { Db } from "@/db";
import { db } from "@/db";
import { fulfillPurchase } from "@/lib/credits/purchases";
import { getStripe } from "@/lib/stripe";

export async function handleStripeEvent(db: Db, event: Stripe.Event) {
  if (event.type !== "checkout.session.completed") return;
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") return;
  const { userId, packageKey, credits } = session.metadata ?? {};
  if (!userId || !packageKey || !credits) {
    throw new Error(`checkout session ${session.id} missing fulfillment metadata`);
  }
  await fulfillPurchase(db, {
    userId,
    stripeSessionId: session.id,
    packageKey,
    credits: Number(credits),
    amountCents: session.amount_total ?? 0,
  });
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }
  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  try {
    await handleStripeEvent(db, event);
  } catch (e) {
    // 500 dönersek Stripe yeniden dener; fulfillment idempotent olduğu için güvenli.
    console.error("stripe webhook handling failed", e);
    return NextResponse.json({ error: "Handler failure" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
```

- [ ] **Step 4: PASS + build doğrula**

Run: `cd web && npm test && npm run build`
Expected: testler PASS, build exit 0

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "feat(web): add signature-verified idempotent stripe webhook"
```

---

### Task 5: Satın alma sayfaları

**Files:**
- Create: `web/src/app/dashboard/buy/page.tsx`, `web/src/app/dashboard/buy/success/page.tsx`, `web/src/app/dashboard/buy/buy-button.tsx`
- Modify: `web/src/app/dashboard/page.tsx` (bakiye kartının yanına "Buy credits" linki)

**Interfaces:**
- Consumes: `getPackages` (Task 1), `POST /api/checkout` (Task 3), `getBalance` (2a)

- [ ] **Step 1: Buy button (client component)**

`web/src/app/dashboard/buy/buy-button.tsx`:

```tsx
"use client";

import { useState } from "react";

export function BuyButton({ packageKey }: { packageKey: string }) {
  const [loading, setLoading] = useState(false);
  return (
    <button
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const res = await fetch("/api/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ packageKey }),
          });
          const data = await res.json();
          if (data.url) window.location.href = data.url;
          else setLoading(false);
        } catch {
          setLoading(false);
        }
      }}
      className="w-full rounded-lg bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200 disabled:opacity-50"
    >
      {loading ? "Redirecting…" : "Buy"}
    </button>
  );
}
```

- [ ] **Step 2: Buy sayfası**

`web/src/app/dashboard/buy/page.tsx`:

```tsx
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
```

- [ ] **Step 3: Success sayfası (kredi YÜKLEMEZ; sadece durum gösterir)**

`web/src/app/dashboard/buy/success/page.tsx`:

```tsx
import Link from "next/link";

export default function BuySuccessPage() {
  return (
    <div className="max-w-md">
      <h1 className="mb-2 text-2xl font-semibold">Thanks for your purchase!</h1>
      <p className="mb-6 text-zinc-400">
        Your credits will appear on your dashboard within a few seconds, as soon
        as the payment is confirmed.
      </p>
      <Link href="/dashboard" className="underline">
        Back to dashboard
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Dashboard'a link**

`web/src/app/dashboard/page.tsx` — bakiye kartının altına ekle (mevcut kart div'inin hemen ardından):

```tsx
      <div className="mt-4">
        <a href="/dashboard/buy" className="text-sm underline">
          Buy credits
        </a>
      </div>
```

- [ ] **Step 5: Doğrula ve commit**

Run: `cd web && npm test && npm run build`
Expected: tümü yeşil, build exit 0

```bash
git add web/src/app
git commit -m "feat(web): add credit purchase pages"
```

---

### Task 6: Uçtan uca Stripe test modu doğrulaması

**Files:** yok (doğrulama görevi; rapor `.superpowers/sdd/` altına)

**Interfaces:**
- Consumes: Stripe test API key'i (operatörden VEYA `stripe sandbox create` ile), Stripe CLI

- [ ] **Step 1: Anahtarları hazırla**

Operatörün Stripe hesabından **test modu** anahtarı (tercihen kısıtlı anahtar, `rk_test_...`; Checkout Sessions write izni yeterli) `web/.env.local` → `STRIPE_SECRET_KEY`. Operatör anahtarı yoksa: `npm i -g @stripe/cli && stripe sandbox create` ile kayıtsız sandbox açılabilir.

- [ ] **Step 2: Webhook dinleyici**

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Çıktıdaki `whsec_...` değerini `web/.env.local` → `STRIPE_WEBHOOK_SECRET` yaz; dev server'ı başlat (`cd web && npm run dev`).

- [ ] **Step 3: Gerçek akış**

Tarayıcı: `/dashboard/buy` → Creator → Buy → Stripe Checkout'ta test kartı `4242 4242 4242 4242` (herhangi bir gelecek tarih/CVC) → success sayfası → dashboard'da bakiyenin +50 olduğunu gör. DB kontrol:

```bash
docker exec reelate-postgres psql -U reelate -d reelate -c "SELECT package_key, credits, status FROM purchases; SELECT kind, delta FROM credit_ledger ORDER BY id DESC LIMIT 3;"
```

Expected: `creator | 50 | completed` + ledger'da `purchase | 50`

- [ ] **Step 4: İdempotens canlı testi**

```bash
stripe events resend <az önceki checkout.session.completed event id>
```

Expected: webhook 200 döner, bakiye DEĞİŞMEZ (ikinci kez yüklenmez). Rapora işle.

Operatör anahtarı/Google girişi henüz yoksa: bu task "operatör girdisi bekliyor" olarak raporlanır ve branch bekletilmeden önceki task'ların birim testleriyle kapanır; canlı doğrulama anahtar gelince yapılır.

---

## Self-Review Notları

- **Spec kapsaması (2b):** Bölüm 6'nın dört maddesi — Checkout Session (Task 3), yalnızca webhook ile kredi yükleme + imza doğrulama (Task 4; success sayfası bilinçli olarak pasif, Task 5 Step 3), idempotens (Task 2 DB-unique + Task 4 testleri + Task 6 canlı test), Stripe Tax bayrağı (Task 3, prod'da açılacak). Paket fiyatları Bölüm 5 ile birebir ve `app_config`'ten ezilebilir (Task 1).
- **Stripe best-practices uyumu:** `payment_method_types` hiçbir yerde yok (test bunu açıkça doğruluyor); Checkout Sessions kullanılıyor; API versiyonu `2026-06-24.dahlia`; kısıtlı anahtar önerisi Task 6'da.
- **Tip tutarlılığı:** `CreditPackage` Task 1'de tanımlı, Task 3 `buildCheckoutParams` ve Task 5 sayfaları aynı tipi kullanıyor; `fulfillPurchase` imzası Task 2 ve Task 4 arasında birebir.
- **Bilinçli sınırlar:** refund/chargeback webhook'ları (charge.refunded) MVP dışı — Stripe Dashboard'dan manuel iade nadir vakadır, ledger'a manuel `purchase` düzeltmesi girilebilir; Faz 4 backlog'una not edildi.
