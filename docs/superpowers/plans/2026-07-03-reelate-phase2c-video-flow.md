# Reelate Faz 2c — Sihirbaz + Kuyruk Entegrasyonu + Kütüphane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kredi karşılığı uçtan uca video üretimi: sihirbaz (senaryo üretimi + canlı fiyat) → kredi düşme + Redis kuyruğu → Python worker → SSE ilerleme → oynatıcı/indirme → kütüphane.

**Architecture:** Python worker OLDUĞU GİBİ kalır (Faz 1: `reelate:queue:pending`'den `{task_id, params, attempts}` çeker, durumu Redis hash'ine yazar — key = task_id, alanlar `state` (-1 fail / 1 complete / 4 processing) ve `progress`). Next.js tarafı: ioredis ile aynı kuyruğa yazar; durum **sync-on-read** ile Postgres'e işlenir (SSE/kütüphane her okuyuşta Redis'e bakar, terminal durumda `video_jobs` güncellenir; başarısızlıkta `refundJob` — idempotens DB indeksiyle garantili, çift iade imkânsız). Video dosyası worker'ın yazdığı `storage/tasks/<jobId>/final-1.mp4` deterministik yolundan, sahiplik kontrollü API route ile stream edilir. Not: spec Bölüm 2 "worker durumu Postgres'e işler" der; MVP'de eşdeğer sonuç sync-on-read ile alınır (worker'a pg bağımlılığı eklemeden) — bilinçli sapma, spec'e not düşülecek.

**Tech Stack:** ioredis, openai (Node SDK), mevcut Drizzle/Auth.js/pricing altyapısı.

## Global Constraints

- Spec Bölüm 5/7/9; kredi = `creditsForDuration(estimateDurationSeconds(script))` — istemci ve sunucu AYNI saf fonksiyonlarla hesaplar, düşülen tutar sunucununkidir
- Kredi düşme + `video_jobs` kaydı tek transaction (mevcut `spendCreditsForJob`); enqueue başarısız olursa otomatik iade + `failed`
- Başarısız işte kredi iadesi TAM BİR KEZ (`refundJob` idempotent, DB partial unique index korumalı)
- Kuyruk formatı Python worker ile birebir: `LPUSH reelate:queue:pending {"task_id","params","attempts":0}`; params alanları `VideoParams` isimleriyle (`video_subject, video_script, video_terms, video_aspect, voice_name, subtitle_enabled`)
- Kullanıcı yalnızca KENDİ işlerini/videolarını görebilir ve indirebilir
- İngilizce UI; testler `cd web && npm test`; commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Yeni env: `REDIS_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL` (varsayılan gpt-4o-mini), `STORAGE_ROOT` — `.env.example`'a boş/örnek değerle eklenir
- Redis testleri gerçek Redis'in **15 numaralı db'sini** kullanır (`redis://localhost:6379/15`), her testte flushdb — üretim kuyruğuna (db 0) dokunmaz

---

### Task 1: Node tarafı kuyruk/durum istemcisi

**Files:**
- Create: `web/src/lib/jobs/queue.ts`
- Modify: `web/.env.example` (REDIS_URL)
- Test: `web/src/lib/jobs/__tests__/queue.test.ts`

**Interfaces:**
- Produces:
  - `getRedis(): Redis` — lazy ioredis istemcisi (`REDIS_URL`, varsayılan `redis://localhost:6379`)
  - `PENDING_KEY = "reelate:queue:pending"`
  - `type EngineParams = { video_subject: string; video_script: string; video_terms: string[]; video_aspect: string; voice_name: string; subtitle_enabled: boolean }`
  - `enqueueJob(redis: Redis, jobId: string, params: EngineParams): Promise<void>`
  - `readEngineState(redis: Redis, jobId: string): Promise<{ state: number; progress: number } | null>` — worker hiç dokunmadıysa null
  - `ENGINE_FAILED = -1`, `ENGINE_COMPLETE = 1`

- [ ] **Step 1: Bağımlılık + env**

```bash
cd web && npm install ioredis
```

`web/.env.example`'a: `REDIS_URL=redis://localhost:6379` (`.env.local`'a da aynı).

- [ ] **Step 2: Failing test**

`web/src/lib/jobs/__tests__/queue.test.ts`:

```typescript
import Redis from "ioredis";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ENGINE_COMPLETE,
  ENGINE_FAILED,
  enqueueJob,
  PENDING_KEY,
  readEngineState,
} from "../queue";

const redis = new Redis("redis://localhost:6379/15");

beforeEach(() => redis.flushdb());
afterAll(() => redis.quit());

const PARAMS = {
  video_subject: "morning habits",
  video_script: "drink water",
  video_terms: ["morning", "coffee"],
  video_aspect: "9:16",
  voice_name: "en-US-JennyNeural-Female",
  subtitle_enabled: true,
};

describe("enqueueJob", () => {
  it("pushes worker-compatible payload", async () => {
    await enqueueJob(redis, "job-1", PARAMS);
    const raw = await redis.rpop(PENDING_KEY);
    expect(JSON.parse(raw!)).toEqual({
      task_id: "job-1",
      params: PARAMS,
      attempts: 0,
    });
  });
});

describe("readEngineState", () => {
  it("returns null when worker has not touched the job", async () => {
    expect(await readEngineState(redis, "job-x")).toBeNull();
  });
  it("parses processing state", async () => {
    await redis.hset("job-1", { state: "4", progress: "42" });
    expect(await readEngineState(redis, "job-1")).toEqual({ state: 4, progress: 42 });
  });
  it("parses terminal states", async () => {
    await redis.hset("job-2", { state: String(ENGINE_COMPLETE), progress: "100" });
    expect((await readEngineState(redis, "job-2"))!.state).toBe(1);
    await redis.hset("job-3", { state: String(ENGINE_FAILED), progress: "0" });
    expect((await readEngineState(redis, "job-3"))!.state).toBe(-1);
  });
});
```

- [ ] **Step 3: FAIL doğrula**

Run: `cd web && npm test -- jobs`
Expected: FAIL — modül yok. (Redis konteyneri kapalıysa önce `docker start reelate-redis`.)

- [ ] **Step 4: Implementasyon**

`web/src/lib/jobs/queue.ts`:

```typescript
import Redis from "ioredis";

// Python worker (worker/queue.py + app/services/state.py RedisState) sözleşmesi:
// kuyruk LPUSH reelate:queue:pending {"task_id","params","attempts"}
// durum HGETALL <task_id> -> state: -1 fail / 1 complete / 4 processing, progress: 0-100
export const PENDING_KEY = "reelate:queue:pending";
export const ENGINE_FAILED = -1;
export const ENGINE_COMPLETE = 1;

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: 2,
    });
  }
  return client;
}

export type EngineParams = {
  video_subject: string;
  video_script: string;
  video_terms: string[];
  video_aspect: string;
  voice_name: string;
  subtitle_enabled: boolean;
};

export async function enqueueJob(
  redis: Redis,
  jobId: string,
  params: EngineParams,
): Promise<void> {
  await redis.lpush(
    PENDING_KEY,
    JSON.stringify({ task_id: jobId, params, attempts: 0 }),
  );
}

export async function readEngineState(
  redis: Redis,
  jobId: string,
): Promise<{ state: number; progress: number } | null> {
  const hash = await redis.hgetall(jobId);
  if (!hash || Object.keys(hash).length === 0) return null;
  return { state: Number(hash.state ?? 4), progress: Number(hash.progress ?? 0) };
}
```

- [ ] **Step 5: PASS + commit**

Run: `cd web && npm test -- jobs`
Expected: 4 PASS

```bash
git add web
git commit -m "feat(web): add worker-compatible redis job client"
```

---

### Task 2: Durum senkronu + otomatik iade

**Files:**
- Create: `web/src/lib/jobs/status.ts`
- Test: `web/src/lib/jobs/__tests__/status.test.ts`

**Interfaces:**
- Consumes: `readEngineState` (Task 1), `refundJob` (2a), `videoJobs` şeması
- Produces:
  - `syncJobStatus(db: Db, redis: Redis, jobId: string): Promise<{ job: VideoJobRow; progress: number } | null>` — job yoksa null; terminal Postgres durumunda Redis'e bakmaz; engine complete → `status="done"`, `outputPath="tasks/<id>/final-1.mp4"`; engine failed → `status="failed"` + `refundJob`; processing → progress döner (queued→rendering'e yükseltir)
  - `stageForProgress(progress: number): string` — <15 "Preparing" / <55 "Gathering footage" / <95 "Rendering" / "Finishing"
  - `type VideoJobRow = typeof videoJobs.$inferSelect`

- [ ] **Step 1: Failing test**

`web/src/lib/jobs/__tests__/status.test.ts`:

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import Redis from "ioredis";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { getBalance, grantWelcomeBonus, spendCreditsForJob } from "@/lib/credits/ledger";
import { stageForProgress, syncJobStatus } from "../status";

const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST });
const db = drizzle(pool, { schema });
const redis = new Redis("redis://localhost:6379/15");

let userId: string;
let jobId: string;

beforeEach(async () => {
  await redis.flushdb();
  await db.execute(sql`TRUNCATE "user", credit_ledger, video_jobs CASCADE`);
  const [u] = await db.insert(schema.users).values({ email: "s@example.com" }).returning();
  userId = u.id;
  await grantWelcomeBonus(db, userId);
  const spent = await spendCreditsForJob(db, userId, {
    subject: "s",
    script: "drink water",
    terms: ["a"],
    aspect: "9:16",
    voice: "en-US-JennyNeural-Female",
    targetSeconds: 30,
    credits: 1,
  });
  jobId = spent.jobId;
});
afterAll(async () => {
  await redis.quit();
  await pool.end();
});

describe("syncJobStatus", () => {
  it("returns null for unknown job", async () => {
    expect(await syncJobStatus(db, redis, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
  it("keeps queued when engine has not started", async () => {
    const result = await syncJobStatus(db, redis, jobId);
    expect(result!.job.status).toBe("queued");
    expect(result!.progress).toBe(0);
  });
  it("promotes to rendering with progress", async () => {
    await redis.hset(jobId, { state: "4", progress: "42" });
    const result = await syncJobStatus(db, redis, jobId);
    expect(result!.job.status).toBe("rendering");
    expect(result!.progress).toBe(42);
  });
  it("marks done with deterministic output path", async () => {
    await redis.hset(jobId, { state: "1", progress: "100" });
    const result = await syncJobStatus(db, redis, jobId);
    expect(result!.job.status).toBe("done");
    expect(result!.job.outputPath).toBe(`tasks/${jobId}/final-1.mp4`);
    expect(result!.progress).toBe(100);
  });
  it("marks failed and refunds exactly once", async () => {
    await redis.hset(jobId, { state: "-1", progress: "0" });
    await syncJobStatus(db, redis, jobId);
    expect(await getBalance(db, userId)).toBe(2); // 2 bonus - 1 spend + 1 refund
    await syncJobStatus(db, redis, jobId); // ikinci senkron çift iade yapmamalı
    expect(await getBalance(db, userId)).toBe(2);
    const [job] = await db.select().from(schema.videoJobs);
    expect(job.status).toBe("failed");
  });
  it("does not touch redis for already-terminal jobs", async () => {
    await redis.hset(jobId, { state: "1", progress: "100" });
    await syncJobStatus(db, redis, jobId);
    await redis.del(jobId); // worker state'i uçtu
    const result = await syncJobStatus(db, redis, jobId);
    expect(result!.job.status).toBe("done"); // Postgres artık kaynak
  });
});

describe("stageForProgress", () => {
  it("maps ranges to labels", () => {
    expect(stageForProgress(5)).toBe("Preparing");
    expect(stageForProgress(30)).toBe("Gathering footage");
    expect(stageForProgress(80)).toBe("Rendering");
    expect(stageForProgress(97)).toBe("Finishing");
  });
});
```

- [ ] **Step 2: FAIL doğrula**

Run: `cd web && npm test -- status`
Expected: FAIL

- [ ] **Step 3: Implementasyon**

`web/src/lib/jobs/status.ts`:

```typescript
import { eq } from "drizzle-orm";
import type Redis from "ioredis";
import type { Db } from "@/db";
import { videoJobs } from "@/db/schema";
import { refundJob } from "@/lib/credits/ledger";
import { ENGINE_COMPLETE, ENGINE_FAILED, readEngineState } from "./queue";

export type VideoJobRow = typeof videoJobs.$inferSelect;

export function stageForProgress(progress: number): string {
  if (progress < 15) return "Preparing";
  if (progress < 55) return "Gathering footage";
  if (progress < 95) return "Rendering";
  return "Finishing";
}

export async function syncJobStatus(
  db: Db,
  redis: Redis,
  jobId: string,
): Promise<{ job: VideoJobRow; progress: number } | null> {
  const [job] = await db.select().from(videoJobs).where(eq(videoJobs.id, jobId));
  if (!job) return null;
  if (job.status === "done") return { job, progress: 100 };
  if (job.status === "failed") return { job, progress: 0 };

  const engine = await readEngineState(redis, jobId);
  if (!engine) return { job, progress: 0 };

  if (engine.state === ENGINE_COMPLETE) {
    const outputPath = `tasks/${jobId}/final-1.mp4`;
    const [updated] = await db
      .update(videoJobs)
      .set({ status: "done", outputPath, updatedAt: new Date() })
      .where(eq(videoJobs.id, jobId))
      .returning();
    return { job: updated, progress: 100 };
  }
  if (engine.state === ENGINE_FAILED) {
    const [updated] = await db
      .update(videoJobs)
      .set({
        status: "failed",
        error: "Video generation failed. Your credits have been refunded.",
        updatedAt: new Date(),
      })
      .where(eq(videoJobs.id, jobId))
      .returning();
    await refundJob(db, jobId); // idempotent + DB unique index korumalı
    return { job: updated, progress: 0 };
  }
  if (job.status === "queued" && engine.progress > 0) {
    const [updated] = await db
      .update(videoJobs)
      .set({ status: "rendering", updatedAt: new Date() })
      .where(eq(videoJobs.id, jobId))
      .returning();
    return { job: updated, progress: engine.progress };
  }
  return { job, progress: engine.progress };
}
```

- [ ] **Step 4: PASS + commit**

Run: `cd web && npm test`
Expected: tümü PASS

```bash
git add web/src/lib/jobs
git commit -m "feat(web): sync engine state to postgres with auto-refund"
```

---

### Task 3: Senaryo üretimi (OpenAI)

**Files:**
- Create: `web/src/lib/script/generate.ts`, `web/src/app/api/script/route.ts`
- Modify: `web/.env.example` (OPENAI_API_KEY, OPENAI_MODEL)
- Test: `web/src/lib/script/__tests__/generate.test.ts`

**Interfaces:**
- Produces:
  - `buildScriptPrompt(subject: string, language: string, targetSeconds: number): string` — saf; kelime hedefi `Math.round(targetSeconds * 2.5)`
  - `buildTermsPrompt(subject: string, script: string): string` — saf; 5 İngilizce arama terimi, JSON array ister
  - `parseTerms(raw: string): string[]` — saf; JSON array veya satır listesi toleranslı, 5 ile sınırlar
  - `generateScriptAndTerms(subject, language, targetSeconds): Promise<{ script: string; terms: string[] }>` — OpenAI SDK (`OPENAI_MODEL`, varsayılan `gpt-4o-mini`), lazy client
  - `POST /api/script` — auth zorunlu; gövde `{ subject, language, targetSeconds }`; saatlik kullanıcı başına 20 istek limiti (Redis INCR, key `reelate:ratelimit:script:<userId>:<saat>`; aşımda 429)

- [ ] **Step 1: Bağımlılık + env**

```bash
cd web && npm install openai
```

`web/.env.example`'a:

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

`.env.local`'a da ekle; `OPENAI_API_KEY` değerini repo kökündeki `config.toml`'daki `openai_api_key`'den kopyala (operatör anahtarı — commit'leme).

- [ ] **Step 2: Failing test (saf fonksiyonlar)**

`web/src/lib/script/__tests__/generate.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildScriptPrompt, buildTermsPrompt, parseTerms } from "../generate";

describe("buildScriptPrompt", () => {
  const prompt = buildScriptPrompt("morning habits", "en", 60);
  it("includes word target from 2.5 wps", () => {
    expect(prompt).toContain("150 words");
  });
  it("includes subject and language", () => {
    expect(prompt).toContain("morning habits");
    expect(prompt).toContain("English");
  });
  it("supports turkish", () => {
    expect(buildScriptPrompt("sabah", "tr", 30)).toContain("Turkish");
  });
});

describe("buildTermsPrompt", () => {
  it("asks for a JSON array of English terms", () => {
    const p = buildTermsPrompt("morning habits", "some script");
    expect(p).toContain("JSON array");
    expect(p).toContain("morning habits");
  });
});

describe("parseTerms", () => {
  it("parses a json array", () => {
    expect(parseTerms('["a","b","c"]')).toEqual(["a", "b", "c"]);
  });
  it("parses fenced json", () => {
    expect(parseTerms('```json\n["a","b"]\n```')).toEqual(["a", "b"]);
  });
  it("falls back to line splitting", () => {
    expect(parseTerms("morning\ncoffee\nsunrise")).toEqual([
      "morning",
      "coffee",
      "sunrise",
    ]);
  });
  it("caps at five terms", () => {
    expect(parseTerms('["1","2","3","4","5","6","7"]')).toHaveLength(5);
  });
});
```

- [ ] **Step 3: FAIL doğrula**

Run: `cd web && npm test -- script`
Expected: FAIL

- [ ] **Step 4: Implementasyon**

`web/src/lib/script/generate.ts`:

```typescript
import OpenAI from "openai";

let client: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!client) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is not set");
    client = new OpenAI({ apiKey: key });
  }
  return client;
}

const LANGUAGE_NAMES: Record<string, string> = { en: "English", tr: "Turkish" };

export function buildScriptPrompt(
  subject: string,
  language: string,
  targetSeconds: number,
): string {
  const words = Math.round(targetSeconds * 2.5);
  const languageName = LANGUAGE_NAMES[language] ?? "English";
  return [
    `Write a voiceover script for a short vertical video about: ${subject}.`,
    `Language: ${languageName}. Target length: about ${words} words.`,
    "Rules: plain spoken prose only; no markdown, no headings, no emojis,",
    "no scene directions, no hashtags; hook the viewer in the first sentence;",
    "end with a single memorable takeaway. Return only the script text.",
  ].join("\n");
}

export function buildTermsPrompt(subject: string, script: string): string {
  return [
    `Video subject: ${subject}`,
    `Script: ${script}`,
    "Give 5 short English stock-footage search terms matching this video.",
    'Return ONLY a JSON array of strings, e.g. ["term one","term two"].',
  ].join("\n");
}

export function parseTerms(raw: string): string[] {
  const cleaned = raw.replace(/```(?:json)?/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.map(String).filter(Boolean).slice(0, 5);
    }
  } catch {
    // JSON değilse satır satır dene
  }
  return cleaned
    .split("\n")
    .map((line) => line.replace(/^[-*\d.\s"']+|["',]+$/g, "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

export async function generateScriptAndTerms(
  subject: string,
  language: string,
  targetSeconds: number,
): Promise<{ script: string; terms: string[] }> {
  const openai = getOpenAI();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const scriptRes = await openai.chat.completions.create({
    model,
    messages: [{ role: "user", content: buildScriptPrompt(subject, language, targetSeconds) }],
  });
  const script = (scriptRes.choices[0]?.message?.content ?? "").trim();
  if (!script) throw new Error("empty script from model");
  const termsRes = await openai.chat.completions.create({
    model,
    messages: [{ role: "user", content: buildTermsPrompt(subject, script) }],
  });
  const terms = parseTerms(termsRes.choices[0]?.message?.content ?? "");
  return { script, terms: terms.length > 0 ? terms : [subject] };
}
```

`web/src/app/api/script/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getRedis } from "@/lib/jobs/queue";
import { generateScriptAndTerms } from "@/lib/script/generate";

const HOURLY_LIMIT = 20;

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const redis = getRedis();
  const hour = Math.floor(Date.now() / 3_600_000);
  const rateKey = `reelate:ratelimit:script:${userId}:${hour}`;
  const count = await redis.incr(rateKey);
  if (count === 1) await redis.expire(rateKey, 3600);
  if (count > HOURLY_LIMIT) {
    return NextResponse.json(
      { error: "Too many script requests. Please try again later." },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const subject = String(body.subject ?? "").trim().slice(0, 300);
  const language = ["en", "tr"].includes(body.language) ? body.language : "en";
  const targetSeconds = [30, 60, 90, 180].includes(Number(body.targetSeconds))
    ? Number(body.targetSeconds)
    : 60;
  if (!subject) return NextResponse.json({ error: "Subject is required" }, { status: 400 });

  try {
    const result = await generateScriptAndTerms(subject, language, targetSeconds);
    return NextResponse.json(result);
  } catch (e) {
    console.error("script generation failed", e);
    return NextResponse.json(
      { error: "Script generation is temporarily unavailable" },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 5: PASS + build + commit**

Run: `cd web && npm test && npm run build`
Expected: testler PASS, build exit 0

```bash
git add web
git commit -m "feat(web): add openai script generation with rate limit"
```

---

### Task 4: İş oluşturma endpoint'i

**Files:**
- Create: `web/src/lib/jobs/create.ts`, `web/src/app/api/jobs/route.ts`, `web/src/lib/jobs/options.ts`
- Test: `web/src/lib/jobs/__tests__/create.test.ts`

**Interfaces:**
- Produces:
  - `web/src/lib/jobs/options.ts`: `LANGUAGES`, `VOICES` (id/label/language; motor formatında: `en-US-JennyNeural-Female`, `en-US-GuyNeural-Male`, `en-GB-SoniaNeural-Female`, `tr-TR-EmelNeural-Female`, `tr-TR-AhmetNeural-Male`), `ASPECTS = ["9:16", "16:9", "1:1"]`, `DURATION_OPTIONS = [30, 60, 90, 180]`
  - `createVideoJob(db, redis, userId, input: { subject; script; terms: string[]; aspect; voice }): Promise<{ jobId: string; credits: number }>` — doğrulama; kredi = `creditsForDuration(estimateDurationSeconds(script))` (min 1); `spendCreditsForJob` → `enqueueJob`; enqueue hatasında `refundJob` + `failed` işaretle + hata fırlat. `ValidationError` ve mevcut `InsufficientCreditsError` ayrımlı
  - `POST /api/jobs` — auth; 400 validasyon / 402 yetersiz kredi / 503 kuyruk hatası; başarıda `{ jobId, credits }`
  - `class ValidationError extends Error`

- [ ] **Step 1: Failing test**

`web/src/lib/jobs/__tests__/create.test.ts`:

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import Redis from "ioredis";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { getBalance, grantWelcomeBonus, InsufficientCreditsError } from "@/lib/credits/ledger";
import { createVideoJob, ValidationError } from "../create";
import { PENDING_KEY } from "../queue";

const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST });
const db = drizzle(pool, { schema });
const redis = new Redis("redis://localhost:6379/15");

let userId: string;

const INPUT = {
  subject: "morning habits",
  script: Array(75).fill("word").join(" "), // 75 kelime -> 30 sn -> 1 kredi
  terms: ["morning", "coffee"],
  aspect: "9:16",
  voice: "en-US-JennyNeural-Female",
};

beforeEach(async () => {
  await redis.flushdb();
  await db.execute(sql`TRUNCATE "user", credit_ledger, video_jobs CASCADE`);
  const [u] = await db.insert(schema.users).values({ email: "c@example.com" }).returning();
  userId = u.id;
  await grantWelcomeBonus(db, userId); // 2 kredi
});
afterAll(async () => {
  await redis.quit();
  await pool.end();
});

describe("createVideoJob", () => {
  it("spends credits and enqueues a worker-compatible job", async () => {
    const { jobId, credits } = await createVideoJob(db, redis, userId, INPUT);
    expect(credits).toBe(1);
    expect(await getBalance(db, userId)).toBe(1);
    const raw = await redis.rpop(PENDING_KEY);
    const payload = JSON.parse(raw!);
    expect(payload.task_id).toBe(jobId);
    expect(payload.params.video_script).toBe(INPUT.script);
    expect(payload.params.voice_name).toBe(INPUT.voice);
    expect(payload.params.subtitle_enabled).toBe(true);
  });
  it("prices longer scripts higher", async () => {
    const { credits } = await createVideoJob(db, redis, userId, {
      ...INPUT,
      script: Array(150).fill("word").join(" "), // 60 sn -> 2 kredi
    });
    expect(credits).toBe(2);
  });
  it("rejects invalid voice and aspect", async () => {
    await expect(
      createVideoJob(db, redis, userId, { ...INPUT, voice: "evil-voice" }),
    ).rejects.toThrow(ValidationError);
    await expect(
      createVideoJob(db, redis, userId, { ...INPUT, aspect: "4:5" }),
    ).rejects.toThrow(ValidationError);
    expect(await getBalance(db, userId)).toBe(2); // hiç kredi düşmedi
  });
  it("rejects empty or oversized scripts", async () => {
    await expect(
      createVideoJob(db, redis, userId, { ...INPUT, script: "  " }),
    ).rejects.toThrow(ValidationError);
    await expect(
      createVideoJob(db, redis, userId, {
        ...INPUT,
        script: Array(1300).fill("word").join(" "),
      }),
    ).rejects.toThrow(ValidationError);
  });
  it("throws InsufficientCreditsError without touching the queue", async () => {
    const expensive = Array(600).fill("word").join(" "); // 240 sn -> 8 kredi > 2
    await expect(
      createVideoJob(db, redis, userId, { ...INPUT, script: expensive }),
    ).rejects.toThrow(InsufficientCreditsError);
    expect(await redis.llen(PENDING_KEY)).toBe(0);
  });
  it("refunds and marks failed when enqueue fails", async () => {
    const brokenRedis = {
      lpush: () => Promise.reject(new Error("redis down")),
    } as unknown as Redis;
    await expect(
      createVideoJob(db, brokenRedis, userId, INPUT),
    ).rejects.toThrow("redis down");
    expect(await getBalance(db, userId)).toBe(2); // iade edildi
    const [job] = await db.select().from(schema.videoJobs);
    expect(job.status).toBe("failed");
  });
});
```

- [ ] **Step 2: FAIL doğrula**

Run: `cd web && npm test -- create`
Expected: FAIL

- [ ] **Step 3: Implementasyon**

`web/src/lib/jobs/options.ts`:

```typescript
export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "tr", label: "Türkçe" },
] as const;

// Motor ses adı formatı: <locale>-<Name>Neural-<Gender> (app/services/voice.py)
export const VOICES = [
  { id: "en-US-JennyNeural-Female", label: "Jenny (US, Female)", language: "en" },
  { id: "en-US-GuyNeural-Male", label: "Guy (US, Male)", language: "en" },
  { id: "en-GB-SoniaNeural-Female", label: "Sonia (UK, Female)", language: "en" },
  { id: "tr-TR-EmelNeural-Female", label: "Emel (TR, Female)", language: "tr" },
  { id: "tr-TR-AhmetNeural-Male", label: "Ahmet (TR, Male)", language: "tr" },
] as const;

export const ASPECTS = ["9:16", "16:9", "1:1"] as const;
export const DURATION_OPTIONS = [30, 60, 90, 180] as const;
export const MAX_SCRIPT_WORDS = 1200;
```

`web/src/lib/jobs/create.ts`:

```typescript
import type Redis from "ioredis";
import type { Db } from "@/db";
import { eq } from "drizzle-orm";
import { videoJobs } from "@/db/schema";
import { refundJob, spendCreditsForJob } from "@/lib/credits/ledger";
import { creditsForDuration, estimateDurationSeconds } from "@/lib/credits/pricing";
import { ASPECTS, MAX_SCRIPT_WORDS, VOICES } from "./options";
import { enqueueJob } from "./queue";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export async function createVideoJob(
  db: Db,
  redis: Redis,
  userId: string,
  input: { subject: string; script: string; terms: string[]; aspect: string; voice: string },
): Promise<{ jobId: string; credits: number }> {
  const subject = input.subject.trim().slice(0, 300);
  const script = input.script.trim();
  const terms = (input.terms ?? []).map(String).filter(Boolean).slice(0, 8);
  if (!subject) throw new ValidationError("Subject is required");
  if (!script) throw new ValidationError("Script is required");
  const words = script.split(/\s+/).length;
  if (words > MAX_SCRIPT_WORDS) throw new ValidationError("Script is too long");
  if (terms.length === 0) throw new ValidationError("Search terms are required");
  if (!ASPECTS.includes(input.aspect as (typeof ASPECTS)[number])) {
    throw new ValidationError("Invalid aspect ratio");
  }
  if (!VOICES.some((v) => v.id === input.voice)) {
    throw new ValidationError("Invalid voice");
  }

  const targetSeconds = estimateDurationSeconds(script);
  const credits = Math.max(1, creditsForDuration(targetSeconds));

  // Kredi düşme + iş kaydı tek transaction (2a). Enqueue bunun DIŞINDA:
  // Redis düşerse iade + failed işaretleme yapılır; kredi asla havada kalmaz.
  const { jobId } = await spendCreditsForJob(db, userId, {
    subject,
    script,
    terms,
    aspect: input.aspect,
    voice: input.voice,
    targetSeconds,
    credits,
  });

  try {
    await enqueueJob(redis, jobId, {
      video_subject: subject,
      video_script: script,
      video_terms: terms,
      video_aspect: input.aspect,
      voice_name: input.voice,
      subtitle_enabled: true,
    });
  } catch (e) {
    await db
      .update(videoJobs)
      .set({
        status: "failed",
        error: "Could not queue the job. Your credits have been refunded.",
        updatedAt: new Date(),
      })
      .where(eq(videoJobs.id, jobId));
    await refundJob(db, jobId);
    throw e;
  }
  return { jobId, credits };
}
```

`web/src/app/api/jobs/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { InsufficientCreditsError } from "@/lib/credits/ledger";
import { createVideoJob, ValidationError } from "@/lib/jobs/create";
import { getRedis } from "@/lib/jobs/queue";

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    const result = await createVideoJob(db, getRedis(), userId, {
      subject: String(body.subject ?? ""),
      script: String(body.script ?? ""),
      terms: Array.isArray(body.terms) ? body.terms : [],
      aspect: String(body.aspect ?? ""),
      voice: String(body.voice ?? ""),
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { error: "Not enough credits", code: "INSUFFICIENT_CREDITS" },
        { status: 402 },
      );
    }
    console.error("job creation failed", e);
    return NextResponse.json(
      { error: "Could not start the job. Any spent credits were refunded." },
      { status: 503 },
    );
  }
}
```

- [ ] **Step 4: PASS + build + commit**

Run: `cd web && npm test && npm run build`
Expected: tümü PASS, build exit 0

```bash
git add web
git commit -m "feat(web): add job creation with server-side pricing and refund on enqueue failure"
```

---

### Task 5: Sihirbaz arayüzü

**Files:**
- Create: `web/src/app/dashboard/create/page.tsx`, `web/src/app/dashboard/create/wizard.tsx`
- Modify: `web/src/app/dashboard/layout.tsx` (nav: Create video / Library / Buy credits), `web/src/app/dashboard/page.tsx` ("Create a video" ana CTA)

**Interfaces:**
- Consumes: `POST /api/script`, `POST /api/jobs`, `creditsForDuration`/`estimateDurationSeconds` (saf, istemcide de çalışır), `options.ts` sabitleri

- [ ] **Step 1: Wizard client bileşeni**

`web/src/app/dashboard/create/wizard.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  creditsForDuration,
  estimateDurationSeconds,
} from "@/lib/credits/pricing";
import {
  ASPECTS,
  DURATION_OPTIONS,
  LANGUAGES,
  VOICES,
} from "@/lib/jobs/options";

export function Wizard({ balance }: { balance: number }) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [language, setLanguage] = useState<string>("en");
  const [voice, setVoice] = useState<string>(VOICES[0].id);
  const [aspect, setAspect] = useState<string>("9:16");
  const [targetSeconds, setTargetSeconds] = useState<number>(60);
  const [script, setScript] = useState("");
  const [terms, setTerms] = useState("");
  const [busy, setBusy] = useState<"script" | "job" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const estimate = useMemo(() => estimateDurationSeconds(script), [script]);
  const credits = script.trim()
    ? Math.max(1, creditsForDuration(estimate))
    : creditsForDuration(targetSeconds);
  const canAfford = balance >= credits;
  const voices = VOICES.filter((v) => v.language === language);

  async function generateScript() {
    setBusy("script");
    setError(null);
    try {
      const res = await fetch("/api/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, language, targetSeconds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Script generation failed");
      setScript(data.script);
      setTerms((data.terms as string[]).join(", "));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function createJob() {
    setBusy("job");
    setError(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          script,
          terms: terms.split(",").map((t) => t.trim()).filter(Boolean),
          aspect,
          voice,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "INSUFFICIENT_CREDITS") {
          router.push("/dashboard/buy");
          return;
        }
        throw new Error(data.error ?? "Could not start the job");
      }
      router.push(`/dashboard/jobs/${data.jobId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(null);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <label className="mb-1 block text-sm text-zinc-400">Video subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. three morning habits that changed my life"
          className="w-full rounded-lg border border-zinc-800 bg-transparent px-3 py-2"
        />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Length</label>
          <select
            value={targetSeconds}
            onChange={(e) => setTargetSeconds(Number(e.target.value))}
            className="w-full rounded-lg border border-zinc-800 bg-transparent px-3 py-2"
          >
            {DURATION_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s >= 60 ? `${s / 60} min` : `${s} sec`} —{" "}
                {creditsForDuration(s)} cr
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Language</label>
          <select
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value);
              const first = VOICES.find((v) => v.language === e.target.value);
              if (first) setVoice(first.id);
            }}
            className="w-full rounded-lg border border-zinc-800 bg-transparent px-3 py-2"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Voice</label>
          <select
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-transparent px-3 py-2"
          >
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Format</label>
          <select
            value={aspect}
            onChange={(e) => setAspect(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-transparent px-3 py-2"
          >
            {ASPECTS.map((a) => (
              <option key={a} value={a}>
                {a === "9:16" ? "9:16 (TikTok/Reels)" : a === "16:9" ? "16:9 (YouTube)" : "1:1 (Square)"}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button
        onClick={generateScript}
        disabled={!subject.trim() || busy !== null}
        className="rounded-lg border border-zinc-700 px-4 py-2 hover:border-zinc-500 disabled:opacity-50"
      >
        {busy === "script" ? "Writing script…" : script ? "Regenerate script" : "Generate script with AI"}
      </button>
      {script && (
        <>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              Script (edit freely — price updates live)
            </label>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={8}
              className="w-full rounded-lg border border-zinc-800 bg-transparent px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              Stock footage search terms (comma separated)
            </label>
            <input
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-transparent px-3 py-2"
            />
          </div>
          <div className="rounded-xl border border-zinc-800 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-zinc-400">
                Estimated length ~{Math.floor(estimate / 60)}:
                {String(estimate % 60).padStart(2, "0")} · Cost:{" "}
                <span className="font-semibold text-white">{credits} credits</span>{" "}
                · Balance: {balance}
              </div>
              {canAfford ? (
                <button
                  onClick={createJob}
                  disabled={busy !== null}
                  className="rounded-lg bg-white px-6 py-2 font-medium text-black hover:bg-zinc-200 disabled:opacity-50"
                >
                  {busy === "job" ? "Starting…" : `Generate video (${credits} cr)`}
                </button>
              ) : (
                <a
                  href="/dashboard/buy"
                  className="rounded-lg bg-white px-6 py-2 font-medium text-black hover:bg-zinc-200"
                >
                  Need {credits - balance} more credits — Buy
                </a>
              )}
            </div>
          </div>
        </>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Sayfa + nav**

`web/src/app/dashboard/create/page.tsx`:

```tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { getBalance } from "@/lib/credits/ledger";
import { Wizard } from "./wizard";

export default async function CreatePage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/signin");
  const balance = await getBalance(db, userId);
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Create a video</h1>
      <Wizard balance={balance} />
    </div>
  );
}
```

`web/src/app/dashboard/layout.tsx` header'ına (marka span'ının yanına) nav ekle:

```tsx
        <nav className="flex items-center gap-4 text-sm text-zinc-400">
          <a href="/dashboard/create" className="hover:text-white">Create video</a>
          <a href="/dashboard/library" className="hover:text-white">Library</a>
          <a href="/dashboard/buy" className="hover:text-white">Buy credits</a>
        </nav>
```

`web/src/app/dashboard/page.tsx`'e bakiye kartının üstüne ana CTA:

```tsx
      <a
        href="/dashboard/create"
        className="mb-6 inline-block rounded-lg bg-white px-6 py-2 font-medium text-black hover:bg-zinc-200"
      >
        Create a video
      </a>
```

- [ ] **Step 3: Doğrula + commit**

Run: `cd web && npm test && npm run build`
Expected: tümü yeşil

```bash
git add web/src/app
git commit -m "feat(web): add video creation wizard with live pricing"
```

---

### Task 6: SSE ilerleme + iş sayfası

**Files:**
- Create: `web/src/app/api/jobs/[id]/events/route.ts`, `web/src/app/dashboard/jobs/[id]/page.tsx`, `web/src/app/dashboard/jobs/[id]/progress.tsx`

**Interfaces:**
- Consumes: `syncJobStatus`, `stageForProgress` (Task 2)
- Produces: `GET /api/jobs/[id]/events` — auth + sahiplik; SSE: her 2 sn `data: {"status","progress","stage","error"}`; terminal durumda son event'ten sonra kapanır; 15 dk üst sınır

- [ ] **Step 1: SSE route**

`web/src/app/api/jobs/[id]/events/route.ts`:

```typescript
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { videoJobs } from "@/db/schema";
import { getRedis } from "@/lib/jobs/queue";
import { stageForProgress, syncJobStatus } from "@/lib/jobs/status";

export const dynamic = "force-dynamic";

const POLL_MS = 2000;
const MAX_LIFETIME_MS = 15 * 60 * 1000;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const [job] = await db.select().from(videoJobs).where(eq(videoJobs.id, id));
  if (!job || job.userId !== userId) return new Response("Not found", { status: 404 });

  const redis = getRedis();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const startedAt = Date.now();
      const send = (payload: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      try {
        while (Date.now() - startedAt < MAX_LIFETIME_MS) {
          const result = await syncJobStatus(db, redis, id);
          if (!result) break;
          send({
            status: result.job.status,
            progress: result.progress,
            stage: stageForProgress(result.progress),
            error: result.job.error,
          });
          if (result.job.status === "done" || result.job.status === "failed") break;
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
      } catch (e) {
        console.error("sse stream error", e);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 2: İş sayfası + progress bileşeni**

`web/src/app/dashboard/jobs/[id]/progress.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

type JobEvent = {
  status: string;
  progress: number;
  stage: string;
  error: string | null;
};

export function JobProgress({ jobId, initialStatus }: { jobId: string; initialStatus: string }) {
  const [event, setEvent] = useState<JobEvent>({
    status: initialStatus,
    progress: initialStatus === "done" ? 100 : 0,
    stage: "Preparing",
    error: null,
  });

  useEffect(() => {
    if (initialStatus === "done" || initialStatus === "failed") return;
    const source = new EventSource(`/api/jobs/${jobId}/events`);
    source.onmessage = (message) => {
      const data: JobEvent = JSON.parse(message.data);
      setEvent(data);
      if (data.status === "done" || data.status === "failed") source.close();
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, [jobId, initialStatus]);

  if (event.status === "failed") {
    return (
      <div className="rounded-xl border border-red-900 p-6">
        <p className="font-medium text-red-400">Generation failed</p>
        <p className="mt-1 text-sm text-zinc-400">
          {event.error ?? "Something went wrong. Your credits have been refunded."}
        </p>
      </div>
    );
  }
  if (event.status === "done") {
    return (
      <div className="space-y-4">
        <video
          src={`/api/videos/${jobId}`}
          controls
          className="max-h-[70vh] rounded-xl border border-zinc-800"
        />
        <a
          href={`/api/videos/${jobId}?download=1`}
          className="inline-block rounded-lg bg-white px-6 py-2 font-medium text-black hover:bg-zinc-200"
        >
          Download video
        </a>
      </div>
    );
  }
  return (
    <div className="max-w-md rounded-xl border border-zinc-800 p-6">
      <p className="mb-3 font-medium">{event.stage}…</p>
      <div className="h-2 w-full overflow-hidden rounded bg-zinc-800">
        <div
          className="h-full bg-white transition-all"
          style={{ width: `${Math.max(3, event.progress)}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-zinc-400">
        {event.progress}% — you can close this page; the video keeps rendering.
      </p>
    </div>
  );
}
```

`web/src/app/dashboard/jobs/[id]/page.tsx`:

```tsx
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { videoJobs } from "@/db/schema";
import { JobProgress } from "./progress";

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/signin");
  const { id } = await params;
  const [job] = await db.select().from(videoJobs).where(eq(videoJobs.id, id));
  if (!job || job.userId !== userId) notFound();
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">{job.subject}</h1>
      <p className="mb-6 text-sm text-zinc-400">
        {job.targetSeconds}s · {job.aspect} · {job.credits} credits
      </p>
      <JobProgress jobId={job.id} initialStatus={job.status} />
    </div>
  );
}
```

- [ ] **Step 3: Doğrula + commit**

Run: `cd web && npm test && npm run build`
Expected: yeşil

```bash
git add web/src/app
git commit -m "feat(web): add sse progress stream and job page"
```

---

### Task 7: Video servisi (sahiplik kontrollü stream)

**Files:**
- Create: `web/src/app/api/videos/[id]/route.ts`
- Modify: `web/.env.example` (STORAGE_ROOT)

**Interfaces:**
- Produces: `GET /api/videos/[id]` — auth + sahiplik + `status==="done"`; `STORAGE_ROOT/<outputPath>` dosyasını `video/mp4` olarak stream eder; `?download=1` ile `Content-Disposition: attachment`; dosya yoksa 404. Path traversal koruması: outputPath DB'den gelir (kullanıcı girdisi değil) ve `tasks/<uuid>/final-1.mp4` deterministik formatındadır; yine de `path.resolve` sonucu `STORAGE_ROOT` altını doğrular

- [ ] **Step 1: Env**

`web/.env.example`'a:

```bash
# Python motorun storage dizininin mutlak yolu (worker'ın video yazdığı yer)
STORAGE_ROOT=/absolute/path/to/MoneyPrinterTurbo/storage
```

`.env.local`'a gerçek yol: `/Users/furkanuzun/Documents/GitHub/MoneyPrinterTurbo/MoneyPrinterTurbo/storage`

- [ ] **Step 2: Route**

`web/src/app/api/videos/[id]/route.ts`:

```typescript
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { videoJobs } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const [job] = await db.select().from(videoJobs).where(eq(videoJobs.id, id));
  if (!job || job.userId !== userId) return new Response("Not found", { status: 404 });
  if (job.status !== "done" || !job.outputPath) {
    return new Response("Video not ready", { status: 409 });
  }

  const storageRoot = process.env.STORAGE_ROOT;
  if (!storageRoot) return new Response("Storage not configured", { status: 500 });
  const filePath = path.resolve(storageRoot, job.outputPath);
  if (!filePath.startsWith(path.resolve(storageRoot) + path.sep)) {
    return new Response("Not found", { status: 404 });
  }
  if (!existsSync(filePath)) return new Response("Not found", { status: 404 });

  const { size } = statSync(filePath);
  const download = new URL(request.url).searchParams.get("download") === "1";
  const headers: Record<string, string> = {
    "Content-Type": "video/mp4",
    "Content-Length": String(size),
  };
  if (download) {
    headers["Content-Disposition"] = `attachment; filename="reelate-${id}.mp4"`;
  }
  const nodeStream = createReadStream(filePath);
  return new Response(Readable.toWeb(nodeStream) as ReadableStream, { headers });
}
```

Not: HTTP Range desteği (oynatıcıda ileri sarma) bilinçli backlog — `<video>` etiketi range'siz de oynatır; Faz 4'te Caddy/nginx zaten dosyaları range destekli servis edecek.

- [ ] **Step 3: Doğrula + commit**

Run: `cd web && npm test && npm run build`
Expected: yeşil

```bash
git add web
git commit -m "feat(web): stream owned videos with download support"
```

---

### Task 8: Kütüphane sayfası

**Files:**
- Create: `web/src/app/dashboard/library/page.tsx`

**Interfaces:**
- Consumes: `syncJobStatus` (aktif işleri sayfa yüklenirken tazeler), `videoJobs`

- [ ] **Step 1: Sayfa**

`web/src/app/dashboard/library/page.tsx`:

```tsx
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { videoJobs } from "@/db/schema";
import { getRedis } from "@/lib/jobs/queue";
import { syncJobStatus } from "@/lib/jobs/status";

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  script: "Preparing",
  downloading: "Gathering footage",
  rendering: "Rendering",
  done: "Ready",
  failed: "Failed",
};

export default async function LibraryPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/signin");

  const jobs = await db
    .select()
    .from(videoJobs)
    .where(eq(videoJobs.userId, userId))
    .orderBy(desc(videoJobs.createdAt));

  // Aktif işleri Redis'ten tazele (sync-on-read; terminal olanlara dokunmaz)
  const redis = getRedis();
  const refreshed = await Promise.all(
    jobs.map(async (job) =>
      job.status === "done" || job.status === "failed"
        ? job
        : ((await syncJobStatus(db, redis, job.id))?.job ?? job),
    ),
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Library</h1>
      {refreshed.length === 0 ? (
        <p className="text-zinc-400">
          No videos yet.{" "}
          <Link href="/dashboard/create" className="underline">
            Create your first one
          </Link>
          .
        </p>
      ) : (
        <div className="max-w-3xl space-y-3">
          {refreshed.map((job) => (
            <Link
              key={job.id}
              href={`/dashboard/jobs/${job.id}`}
              className="flex items-center justify-between rounded-xl border border-zinc-800 px-5 py-4 hover:border-zinc-600"
            >
              <div>
                <div className="font-medium">{job.subject}</div>
                <div className="text-sm text-zinc-400">
                  {job.targetSeconds}s · {job.aspect} · {job.credits} credits ·{" "}
                  {job.createdAt.toISOString().slice(0, 10)}
                </div>
              </div>
              <span
                className={
                  job.status === "done"
                    ? "text-green-400"
                    : job.status === "failed"
                      ? "text-red-400"
                      : "text-zinc-400"
                }
              >
                {STATUS_LABELS[job.status] ?? job.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Doğrula + commit**

Run: `cd web && npm test && npm run build`
Expected: yeşil

```bash
git add web/src/app
git commit -m "feat(web): add video library with live status refresh"
```

---

### Task 9: Uçtan uca doğrulama (gerçek worker ile)

**Files:** yok (doğrulama; rapor `.superpowers/sdd/` altına)

- [ ] **Step 1: Ortamı ayağa kaldır**

```bash
docker start reelate-redis 2>/dev/null || docker run -d --name reelate-redis -p 6379:6379 redis:7-alpine
docker start reelate-postgres
# Terminal 1 (repo kökü): Python worker
uv run python -m worker.main
# Terminal 2: web
cd web && npm run dev
```

- [ ] **Step 2: API üzerinden tam akış (Google girişi henüz yoksa)**

Google OAuth yoksa UI login yapılamaz; akışı DB + kuyruk üzerinden doğrula: test kullanıcısı ve krediyi doğrudan üretim DB'sine yaz, `createVideoJob`'u bir Node betiğiyle çağır:

```bash
cd web && npx tsx --env-file=.env.local -e "
import { db } from './src/db';
import * as schema from './src/db/schema';
import { grantWelcomeBonus } from './src/lib/credits/ledger';
import { createVideoJob } from './src/lib/jobs/create';
import { getRedis } from './src/lib/jobs/queue';
const [u] = await db.insert(schema.users).values({ email: 'e2e@reelate.co' }).onConflictDoNothing().returning();
const userId = u?.id ?? (await db.select().from(schema.users)).find(x => x.email === 'e2e@reelate.co').id;
await grantWelcomeBonus(db, userId);
const r = await createVideoJob(db, getRedis(), userId, {
  subject: 'morning habits',
  script: 'Every morning offers a fresh start. Drink a glass of water, move your body for five minutes, and write down one clear goal. These three tiny habits compound into remarkable results. Start tomorrow morning and feel the difference within a week.',
  terms: ['morning', 'coffee', 'sunrise', 'journal'],
  aspect: '9:16',
  voice: 'en-US-JennyNeural-Female',
});
console.log(r);
process.exit(0);
"
```

(`npx tsx` yoksa `npm install -D tsx`.) Çıkan `jobId` ile:

- Worker logunda işin alındığını gör (`processing task <jobId>`)
- 2-3 dk içinde: `docker exec reelate-postgres psql -U reelate -d reelate -c "SELECT status, output_path FROM video_jobs;"` → önce `rendering` (SSE endpoint'ine curl ile de bakılabilir: `curl -N http://localhost:3000/api/jobs/<jobId>/events` — auth istediği için 401 dönecektir; durumu psql'den izle)
- Worker `task <jobId> completed` yazınca: kütüphane sync'inin çalışması için `syncJobStatus`'u tetikle (aynı tsx kalıbıyla `syncJobStatus(db, getRedis(), '<jobId>')` çağır) → `status=done`, `output_path=tasks/<jobId>/final-1.mp4`
- Dosya oynatılabilir mi: `ffprobe storage/tasks/<jobId>/final-1.mp4`

- [ ] **Step 3: Başarısızlık + iade akışı**

Kuyruğa bilerek bozuk iş at (geçersiz ses):

```bash
docker exec reelate-redis redis-cli LPUSH reelate:queue:pending '{"task_id":"<yeni bir uuid>","params":{"video_subject":"x","video_script":"y","video_terms":["z"],"video_aspect":"9:16","voice_name":"xx-XX-Nope","subtitle_enabled":true},"attempts":1}'
```

Bu, DB'de kaydı olmayan bir task olduğu için yalnızca worker'ın failed işaretlemesini doğrular. Gerçek iade testi: Step 2 kalıbıyla bir iş oluştur, worker'ı KAPALI tutup Redis'e elle `state=-1` yaz (`docker exec reelate-redis redis-cli HSET <jobId> state -1 progress 0`), sonra `syncJobStatus` çağır → `status=failed` + bakiyenin iade edildiğini `credit_ledger`'dan doğrula (`refund` satırı).

- [ ] **Step 4: Google girişi varsa tarayıcı akışı**

Operatör Google OAuth client'ı eklediyse: `/dashboard/create` → konu gir → script üret → Generate video → ilerleme çubuğu → oynatıcı → indir. Rapora ekran akışını yaz.

- [ ] **Step 5: Rapor + commit gerekmiyorsa kapanış**

Bulgular `.superpowers/sdd/task-9-report.md`'ye. Kod değişikliği çıkarsa ayrı commit.

---

## Self-Review Notları

- **Spec kapsaması (2c):** Bölüm 7 sihirbaz + canlı fiyat (Task 5, istemci/sunucu aynı saf fonksiyonlar — Bölüm 5 "sunucu doğrular" kuralı Task 4'te), SSE ilerleme (Task 6), kütüphane + yeniden indirme (Task 8; "aynı ayarlarla yeniden üret" bilinçli backlog — Faz 4), Bölüm 9 başarısızlıkta otomatik iade (Task 2, idempotent) ve kuyruk hatasında iade (Task 4).
- **Bilinçli sapmalar:** (1) Worker Postgres'e yazmıyor; sync-on-read eşdeğer sonucu veriyor (spec Bölüm 2 notu — final review'da spec'e işlenecek). (2) HTTP Range yok (Task 7 notu). (3) Ses önizleme yok (Faz 4). (4) Kullanıcının videoyu silmesi Faz 4.
- **Tip tutarlılığı:** `EngineParams` alanları Python `VideoParams` ile birebir; `PENDING_KEY` worker/queue.py sabitiyle aynı; `syncJobStatus` dönüşü Task 6/8'de aynı şekilde tüketiliyor; `creditsForDuration`/`estimateDurationSeconds` 2a imzaları.
- **Güvenlik:** iş/videolarda sahiplik kontrolü (Task 6/7), path traversal koruması (Task 7), script üretiminde maliyet koruması için rate limit (Task 3).
