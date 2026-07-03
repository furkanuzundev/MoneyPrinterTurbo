# Language and Duration Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scripts/captions generate in the user's selected language (all 30 locales, not just en/tr), and the wizard's shown duration + credit cost — and the credits actually charged — reflect the selected target length instead of the generated script's word count.

**Architecture:** Bug A is fixed in the web script layer: `generate.ts` gets a full locale→language-name map and `script/route.ts` validates against the real `LANGUAGES` code list. Bug B aligns both the wizard display AND the backend credit authority to `targetSeconds`: the display reads `targetSeconds`, and `jobs/route.ts` → `create.ts` charge credits from `targetSeconds` (passed through from the client) instead of `estimateDurationSeconds(script)`.

**Tech Stack:** Next.js/TypeScript, Vitest (some tests DB+Redis-backed), OpenAI SDK.

## Global Constraints

- Vitest suites for jobs are DB+Redis-backed: Postgres at localhost:5434 (`DATABASE_URL_TEST` → reelate_test), Redis db 15. The test DB schema is synced (drizzle push already applied). `generate.ts` tests are pure unit (no infra).
- Do NOT run `npm run build` (a dev server may be using .next). Use `npx vitest run`.
- Backward compatibility: existing tests call `buildScriptPrompt("sabah","tr",30)` with SHORT codes — the language-name map MUST keep short codes (`en`,`tr`) mapping correctly in addition to full locales (`en-US`,`tr-TR`, …).
- All 30 locale codes (from `web/src/lib/jobs/options.ts` LANGUAGES): en-US en-GB tr-TR es-ES es-MX de-DE fr-FR pt-BR it-IT ru-RU ar-SA zh-CN ja-JP ko-KR hi-IN nl-NL pl-PL sv-SE id-ID vi-VN th-TH uk-UA ro-RO el-GR cs-CZ he-IL da-DK fi-FI nb-NO fa-IR.
- Do NOT touch the unrelated uncommitted change in `web/src/app/dashboard/create/wizard.tsx` (a back-button UI edit). Note: Task 2 and Task 3 DO edit wizard.tsx for their own lines — edit only the specific lines named, leave the back-button hunk alone.
- Credit tiers (pricing.ts): 30s→1, 60s→2, 90s→3, 180s→6.

---

### Task 1: Full locale language support in script generation

Makes `generate.ts` map every locale code to its language name, and makes `script/route.ts` accept any valid locale (not just `en`/`tr`). This fixes captions/script coming out in English when a non-English language is selected.

**Files:**
- Modify: `web/src/lib/script/generate.ts` (the `LANGUAGE_NAMES` map, ~line 18)
- Modify: `web/src/app/api/script/route.ts:36`
- Test: `web/src/lib/script/__tests__/generate.test.ts`

**Interfaces:**
- Consumes: `buildScenesPrompt(subject, language, targetSeconds)`, `buildScriptPrompt(subject, language, targetSeconds)` — both read `LANGUAGE_NAMES[language] ?? "English"`.
- Produces: unchanged signatures; `LANGUAGE_NAMES` now covers all 30 locales + legacy short codes.

- [ ] **Step 1: Write the failing test**

Add to `web/src/lib/script/__tests__/generate.test.ts` inside the `buildScenesPrompt` describe block (or a new describe if none — place near the existing buildScriptPrompt tests):

```typescript
describe("locale language coverage", () => {
  it("maps full locale codes to language names in scenes prompt", () => {
    expect(buildScenesPrompt("konu", "tr-TR", 60)).toContain("Language: Turkish");
    expect(buildScenesPrompt("konu", "tr-TR", 60)).not.toContain("Language: English");
  });
  it("maps several locales correctly", () => {
    expect(buildScenesPrompt("x", "es-ES", 60)).toContain("Spanish");
    expect(buildScenesPrompt("x", "ja-JP", 60)).toContain("Japanese");
    expect(buildScenesPrompt("x", "de-DE", 60)).toContain("German");
  });
  it("keeps legacy short codes working", () => {
    expect(buildScriptPrompt("x", "tr", 30)).toContain("Turkish");
    expect(buildScriptPrompt("x", "en", 30)).toContain("English");
  });
  it("falls back to English for unknown codes", () => {
    expect(buildScenesPrompt("x", "xx-YY", 60)).toContain("English");
  });
});
```

Ensure `buildScenesPrompt` is imported at the top of the test file (add it to the existing import from `../generate` if missing).

- [ ] **Step 2: Run test to verify it fails**

Run (from `web/`): `npx vitest run src/lib/script/__tests__/generate.test.ts -t "locale language coverage"`
Expected: FAIL — `tr-TR` currently maps to "English" (LANGUAGE_NAMES only has en/tr).

- [ ] **Step 3: Write minimal implementation**

In `web/src/lib/script/generate.ts`, replace the line:

```typescript
const LANGUAGE_NAMES: Record<string, string> = { en: "English", tr: "Turkish" };
```

with:

```typescript
// Locale kodu → İngilizce dil adı (LLM prompt'unda kullanılır). Hem tam
// locale (tr-TR) hem eski kısa kodlar (tr) desteklenir. Bilinmeyen kod
// çağıran tarafta "English"e düşer.
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  tr: "Turkish",
  "en-US": "English",
  "en-GB": "English",
  "tr-TR": "Turkish",
  "es-ES": "Spanish",
  "es-MX": "Spanish",
  "de-DE": "German",
  "fr-FR": "French",
  "pt-BR": "Portuguese",
  "it-IT": "Italian",
  "ru-RU": "Russian",
  "ar-SA": "Arabic",
  "zh-CN": "Chinese",
  "ja-JP": "Japanese",
  "ko-KR": "Korean",
  "hi-IN": "Hindi",
  "nl-NL": "Dutch",
  "pl-PL": "Polish",
  "sv-SE": "Swedish",
  "id-ID": "Indonesian",
  "vi-VN": "Vietnamese",
  "th-TH": "Thai",
  "uk-UA": "Ukrainian",
  "ro-RO": "Romanian",
  "el-GR": "Greek",
  "cs-CZ": "Czech",
  "he-IL": "Hebrew",
  "da-DK": "Danish",
  "fi-FI": "Finnish",
  "nb-NO": "Norwegian",
  "fa-IR": "Persian",
};
```

Then in `web/src/app/api/script/route.ts`, add an import at the top (with the other imports):

```typescript
import { LANGUAGES } from "@/lib/jobs/options";
```

and replace line 36:

```typescript
  const language = ["en", "tr"].includes(body.language) ? body.language : "en";
```

with:

```typescript
  const language = LANGUAGES.some((l) => l.code === body.language)
    ? String(body.language)
    : "en-US";
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `web/`): `npx vitest run src/lib/script/__tests__/generate.test.ts`
Expected: PASS (all tests in the file, including the existing ones)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/script/generate.ts web/src/app/api/script/route.ts web/src/lib/script/__tests__/generate.test.ts
git commit -m "fix(web): generate script/captions in selected language for all locales

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Wizard duration + cost display uses target length

Makes the Script step and Render summary show the selected target duration and its credit cost, instead of deriving them from the generated script's word count.

**Files:**
- Modify: `web/src/app/dashboard/create/script-step.tsx` (add `targetSeconds` prop; lines 36-37, 65, 136)
- Modify: `web/src/app/dashboard/create/wizard.tsx` (lines 38, 175 display; pass `targetSeconds` to ScriptStep)
- Test: none (prop-threading; verified by tsc + the Task 3 backend test for the credit value)

**Interfaces:**
- Consumes: `formatDuration(seconds)` from `@/lib/jobs/display`; `creditsForDuration(seconds)` from `@/lib/credits/pricing`; `brief.targetSeconds: number`.
- Produces: `ScriptStep` now requires a `targetSeconds: number` prop.

- [ ] **Step 1: Update ScriptStep to take targetSeconds and use it**

In `web/src/app/dashboard/create/script-step.tsx`:

Add `targetSeconds` to the props type and destructure. Change the type block to include (add this line alongside the other props like `voice: string;`):

```typescript
  targetSeconds: number;
```
and add `targetSeconds,` to the destructured parameter list (next to `voice,`).

Then replace lines 36-37:

```typescript
  const estimate = estimateDurationSeconds(script);
  const credits = Math.max(1, creditsForDuration(estimate));
```

with:

```typescript
  // Süre ve kredi kullanıcının seçtiği hedef uzunluğu yansıtır; üretilen
  // script'in kelime sayısından değil (backend de aynı hedefe göre düşer).
  const credits = Math.max(1, creditsForDuration(targetSeconds));
```

Replace the `~{formatDuration(estimate)}` on line 65 (the "AI drafted a ~… script" text) with:

```typescript
~{formatDuration(targetSeconds)}
```

Replace the `~{formatDuration(estimate)}` on line 136 (the "Est. duration" value) with:

```typescript
~{formatDuration(targetSeconds)}
```

Remove the now-unused `estimateDurationSeconds` from the import on lines 5-7 (keep `creditsForDuration`). The import becomes:

```typescript
import { creditsForDuration } from "@/lib/credits/pricing";
```

- [ ] **Step 2: Update Wizard to pass targetSeconds and use it for its own display**

In `web/src/app/dashboard/create/wizard.tsx`:

Replace lines 37-39 (the credits computation that currently branches on script):

```typescript
    scenes.length > 0
      ? Math.max(1, creditsForDuration(estimateDurationSeconds(script)))
      : creditsForDuration(brief.targetSeconds);
```

with:

```typescript
    creditsForDuration(brief.targetSeconds);
```

Replace line 175's `duration={`~${formatDuration(estimateDurationSeconds(script))}`}` with:

```typescript
          duration={`~${formatDuration(brief.targetSeconds)}`}
```

Add the `targetSeconds` prop to the `<ScriptStep … />` usage (near line 158 where `scenes={scenes}` is passed):

```typescript
          targetSeconds={brief.targetSeconds}
```

If `estimateDurationSeconds` is now unused in wizard.tsx, remove it from the import on line 8 (keep `creditsForDuration`). Verify with the tsc run in Step 3 — if tsc complains it's unused, remove it; if `script` becomes unused, leave it (it's still passed to ScriptStep/other uses — confirm before removing).

- [ ] **Step 3: Typecheck**

Run (from `web/`): `npx tsc --noEmit`
Expected: PASS — no type errors, no unused-variable errors. Fix any unused imports flagged (`estimateDurationSeconds`, or `script` if it genuinely became unused).

- [ ] **Step 4: Commit**

```bash
git add web/src/app/dashboard/create/script-step.tsx web/src/app/dashboard/create/wizard.tsx
git commit -m "fix(web): wizard shows selected target duration and cost, not script-derived

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Backend charges credits by target length

Makes the job-creation backend charge credits from the client-supplied `targetSeconds` (validated) instead of `estimateDurationSeconds(script)`, so the charged amount matches what the wizard displays.

**Files:**
- Modify: `web/src/app/api/jobs/route.ts` (read + pass `targetSeconds`)
- Modify: `web/src/lib/jobs/create.ts` (accept `targetSeconds` in input; use it for credits, lines 27-34 input type + line 59)
- Modify: `web/src/app/dashboard/create/wizard.tsx` (add `targetSeconds` to the job POST body)
- Test: `web/src/lib/jobs/__tests__/create.test.ts`

**Interfaces:**
- Consumes: `creditsForDuration(seconds)`; `createVideoJob(db, redis, userId, input)` where `input` gains `targetSeconds: number`.
- Produces: `createVideoJob` charges `creditsForDuration(input.targetSeconds)`; the enqueued/returned credits reflect target length.

- [ ] **Step 1: Write the failing test**

Add to `web/src/lib/jobs/__tests__/create.test.ts` inside `describe("createVideoJob", ...)`:

```typescript
it("charges credits by target length, not script word count", async () => {
  // Kısa script ama targetSeconds=180 -> 6 kredi (script'ten ~1 çıkardı).
  await db.execute(sql`UPDATE credit_ledger SET delta = 10 WHERE user_id = ${userId} AND kind = 'welcome_bonus'`);
  const { credits } = await createVideoJob(db, redis, userId, {
    ...INPUT,
    script: "Short script.",
    targetSeconds: 180,
  });
  expect(credits).toBe(6);
});
```

Note: `INPUT` currently has no `targetSeconds`; this test adds it. The welcome bonus is bumped to 10 so the user can afford 6 credits.

- [ ] **Step 2: Run test to verify it fails**

Run (from `web/`): `npx vitest run src/lib/jobs/__tests__/create.test.ts -t "charges credits by target length"`
Expected: FAIL — current code computes credits from `estimateDurationSeconds("Short script.")` = 1 credit (or a TS error because `targetSeconds` isn't on the input type). Either failure confirms the gap.

- [ ] **Step 3: Implement — accept and use targetSeconds in create.ts**

In `web/src/lib/jobs/create.ts`, add `targetSeconds` to the input type (the object at lines 27-34), so it reads:

```typescript
  input: {
    subject: string;
    script: string;
    terms: string[];
    scenes?: unknown;
    aspect: string;
    voice: string;
    targetSeconds: number;
  },
```

Replace line 59:

```typescript
  const targetSeconds = estimateDurationSeconds(script);
```

with:

```typescript
  // Kredi ve süre otoritesi kullanıcının seçtiği hedef uzunluktur (wizard ile
  // birebir tutarlı). Geçersiz/eksik değer 60s'e düşer.
  const allowedTargets = [30, 60, 90, 180];
  const targetSeconds = allowedTargets.includes(Number(input.targetSeconds))
    ? Number(input.targetSeconds)
    : 60;
```

If `estimateDurationSeconds` is now unused in create.ts, remove it from the import on line 6 (keep `creditsForDuration`):

```typescript
import { creditsForDuration } from "@/lib/credits/pricing";
```

- [ ] **Step 4: Implement — pass targetSeconds through the API route and wizard**

In `web/src/app/api/jobs/route.ts`, add to the object passed to `createVideoJob` (alongside `voice: String(body.voice ?? "")`):

```typescript
      targetSeconds: Number(body.targetSeconds ?? 60),
```

In `web/src/app/dashboard/create/wizard.tsx`, find the job-creation `fetch("/api/jobs", …)` POST body and add `targetSeconds: brief.targetSeconds` to it. (Locate the body object that already sends `scenes`, `aspect`, `voice`, etc. — add the field there.)

- [ ] **Step 5: Run the test to verify it passes**

Run (from `web/`): `npx vitest run src/lib/jobs/__tests__/create.test.ts -t "charges credits by target length"`
Expected: PASS

- [ ] **Step 6: Run the full create test file + typecheck for regressions**

Run (from `web/`): `npx vitest run src/lib/jobs/__tests__/create.test.ts`
Expected: PASS (all). The pre-existing "spends credits and enqueues" test uses `INPUT` — it now needs `targetSeconds`. If it fails for a missing `targetSeconds`, add `targetSeconds: 60` to the shared `INPUT` object at the top of the test file (that keeps its expected `credits: 1` at 30s... note: 60s→2). IMPORTANT: adding `targetSeconds: 60` to INPUT changes credits to 2 — check the existing assertions that expect `credits` (e.g. `expect(credits).toBe(1)`) and update them to the target-based value, OR set `INPUT.targetSeconds = 30` to preserve `credits: 1`. Choose `targetSeconds: 30` in INPUT to keep existing assertions valid, and confirm each existing credit assertion still holds.

Then: `npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/app/api/jobs/route.ts web/src/lib/jobs/create.ts web/src/app/dashboard/create/wizard.tsx web/src/lib/jobs/__tests__/create.test.ts
git commit -m "fix(web): charge credits by selected target length, consistent with display

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Verification (after all tasks)

1. `cd web && npx vitest run src/lib/script src/lib/jobs && npx tsc --noEmit` — all green.
2. Manual: create a video with language=Türkçe, length=1m. Confirm: scenes/captions are Turkish; Script step shows "~1:00" and 2 credits; Render summary shows "~1:00" and 2 credits; after generating, the user's balance dropped by exactly 2.
