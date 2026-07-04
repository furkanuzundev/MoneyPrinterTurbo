# Brief Subtitle Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible subtitle-style editor with live preview to the create wizard's brief step, and wire the chosen style end-to-end into the first render.

**Architecture:** Extract the existing caption UI presentation layer (`SIZES`/`POSITIONS`/`COLORS` + preview mapping) from `captions/editor.tsx` into a shared `caption-ui.ts` module. Build a controlled `SubtitleSettings` accordion consuming it, mount it in `brief-step.tsx`, thread `captionStyle` through wizard → `/api/jobs` → `createVideoJob`, where the hardcoded default is replaced by `sanitizeCaptionStyle(input.captionStyle)`.

**Tech Stack:** Next.js (App Router), React, TypeScript, Tailwind, Vitest (integration tests use Postgres+Redis).

## Global Constraints

- All work is under `web/` (Next.js app). Run commands from `web/`.
- Test runner: `npm test` → `vitest run`. Type check: `npx tsc --noEmit`. Lint: `npm run lint`.
- `create.test.ts` is an **integration** test requiring `DATABASE_URL_TEST` (Postgres) + Redis on `redis://localhost:6379/15`. It reads the enqueue payload via `redis.rpop(PENDING_KEY)`; payload shape is `{ task_id, params: {...} }`.
- Existing `CaptionStyle` type/logic in `web/src/lib/jobs/scenes.ts` is the single source of truth for validation/engine mapping — do NOT duplicate it. `caption-ui.ts` holds **presentation only** and imports `type CaptionStyle` from scenes.
- `DEFAULT_CAPTION_STYLE = { size:"md", position:"bottom", color:"yellow" }`.
- Colors: `yellow` → swatch `#F4C63A`; `white` → `#FFFFFF`; `none` labelled **"Plain"**, swatch `transparent`.
- Active segment/chip styling in this codebase is `bg-caption text-caption-ink`.
- Refactoring `captions/editor.tsx` must NOT change its visual/behavioral output.
- `BriefValues` type must NOT change — `captionStyle` flows as a separate prop.
- End git commit messages with the Co-Authored-By + Claude-Session trailers used elsewhere in this repo's history.

---

### Task 1: Shared caption UI module (`caption-ui.ts`)

**Files:**
- Create: `web/src/lib/jobs/caption-ui.ts`
- Test: `web/src/lib/jobs/__tests__/caption-ui.test.ts`

**Interfaces:**
- Consumes: `type CaptionStyle` from `web/src/lib/jobs/scenes.ts`.
- Produces:
  - `SIZES: { id: CaptionStyle["size"]; label: string; px: number }[]`
  - `POSITIONS: { id: CaptionStyle["position"]; label: string }[]`
  - `COLORS: { id: CaptionStyle["color"]; label: string; swatch: string }[]`
  - `SIZE_LABEL: Record<CaptionStyle["size"], string>`
  - `POSITION_LABEL: Record<CaptionStyle["position"], string>`
  - `COLOR_LABEL: Record<CaptionStyle["color"], string>`
  - `captionPreviewStyles(style: CaptionStyle): { pos: CSSProperties; color: CSSProperties; sizePx: number }`

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/jobs/__tests__/caption-ui.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  SIZES,
  POSITIONS,
  COLORS,
  SIZE_LABEL,
  POSITION_LABEL,
  COLOR_LABEL,
  captionPreviewStyles,
} from "../caption-ui";

describe("caption-ui constants", () => {
  it("exposes the three sizes with px values", () => {
    expect(SIZES.map((s) => s.id)).toEqual(["sm", "md", "lg"]);
    expect(SIZES.map((s) => s.px)).toEqual([17, 23, 30]);
  });
  it("exposes positions and colors", () => {
    expect(POSITIONS.map((p) => p.id)).toEqual(["top", "center", "bottom"]);
    expect(COLORS.map((c) => c.id)).toEqual(["yellow", "white", "none"]);
    expect(COLORS.find((c) => c.id === "none")?.label).toBe("Plain");
    expect(COLORS.find((c) => c.id === "yellow")?.swatch).toBe("#F4C63A");
  });
  it("provides human labels for the summary line", () => {
    expect(SIZE_LABEL.md).toBe("M");
    expect(POSITION_LABEL.bottom).toBe("Bottom");
    expect(COLOR_LABEL.none).toBe("Plain");
    expect(COLOR_LABEL.yellow).toBe("Yellow");
  });
});

describe("captionPreviewStyles", () => {
  it("maps position to css", () => {
    expect(captionPreviewStyles({ size: "md", position: "top", color: "yellow" }).pos).toEqual({ top: 16 });
    expect(captionPreviewStyles({ size: "md", position: "center", color: "yellow" }).pos).toEqual({
      top: "50%",
      transform: "translateY(-50%)",
    });
    expect(captionPreviewStyles({ size: "md", position: "bottom", color: "yellow" }).pos).toEqual({ bottom: 60 });
  });
  it("maps color to css", () => {
    expect(captionPreviewStyles({ size: "md", position: "bottom", color: "yellow" }).color).toEqual({
      background: "#F4C63A",
      color: "#141208",
    });
    expect(captionPreviewStyles({ size: "md", position: "bottom", color: "white" }).color).toEqual({
      background: "#fff",
      color: "#141208",
    });
    expect(captionPreviewStyles({ size: "md", position: "bottom", color: "none" }).color).toEqual({
      color: "#fff",
      textShadow: "0 2px 12px rgba(0,0,0,0.65)",
    });
  });
  it("maps size to px", () => {
    expect(captionPreviewStyles({ size: "sm", position: "bottom", color: "yellow" }).sizePx).toBe(17);
    expect(captionPreviewStyles({ size: "lg", position: "bottom", color: "yellow" }).sizePx).toBe(30);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `web/`): `npm test -- caption-ui`
Expected: FAIL — cannot resolve `../caption-ui`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/lib/jobs/caption-ui.ts`:

```ts
import type { CSSProperties } from "react";
import type { CaptionStyle } from "./scenes";

export const SIZES: { id: CaptionStyle["size"]; label: string; px: number }[] = [
  { id: "sm", label: "S", px: 17 },
  { id: "md", label: "M", px: 23 },
  { id: "lg", label: "L", px: 30 },
];

export const POSITIONS: { id: CaptionStyle["position"]; label: string }[] = [
  { id: "top", label: "Top" },
  { id: "center", label: "Center" },
  { id: "bottom", label: "Bottom" },
];

export const COLORS: { id: CaptionStyle["color"]; label: string; swatch: string }[] = [
  { id: "yellow", label: "Yellow", swatch: "#F4C63A" },
  { id: "white", label: "White", swatch: "#FFFFFF" },
  { id: "none", label: "Plain", swatch: "transparent" },
];

export const SIZE_LABEL: Record<CaptionStyle["size"], string> = {
  sm: "S",
  md: "M",
  lg: "L",
};
export const POSITION_LABEL: Record<CaptionStyle["position"], string> = {
  top: "Top",
  center: "Center",
  bottom: "Bottom",
};
export const COLOR_LABEL: Record<CaptionStyle["color"], string> = {
  yellow: "Yellow",
  white: "White",
  none: "Plain",
};

// captions/editor.tsx içindeki satır içi previewPos/previewColor/sizePx mantığının
// tek fonksiyona taşınmış hâli. Editör ölçekli px değerleri döndürür; küçük
// thumbnail'lar bu değeri kendileri oranlar.
export function captionPreviewStyles(style: CaptionStyle): {
  pos: CSSProperties;
  color: CSSProperties;
  sizePx: number;
} {
  const pos: CSSProperties =
    style.position === "top"
      ? { top: 16 }
      : style.position === "center"
        ? { top: "50%", transform: "translateY(-50%)" }
        : { bottom: 60 };
  const color: CSSProperties =
    style.color === "yellow"
      ? { background: "#F4C63A", color: "#141208" }
      : style.color === "white"
        ? { background: "#fff", color: "#141208" }
        : { color: "#fff", textShadow: "0 2px 12px rgba(0,0,0,0.65)" };
  const sizePx = SIZES.find((s) => s.id === style.size)?.px ?? 23;
  return { pos, color, sizePx };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `web/`): `npm test -- caption-ui`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/jobs/caption-ui.ts web/src/lib/jobs/__tests__/caption-ui.test.ts
git commit -m "feat(caption): shared caption UI presentation module

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AhS1N8t6eHH62Gu8FMMhCo"
```

---

### Task 2: Refactor `captions/editor.tsx` onto the shared module

**Files:**
- Modify: `web/src/app/dashboard/videos/[id]/captions/editor.tsx`

**Interfaces:**
- Consumes: `SIZES`, `POSITIONS`, `COLORS`, `captionPreviewStyles` from `@/lib/jobs/caption-ui`.
- Produces: nothing new. Behavior/markup unchanged — pure internal refactor.

- [ ] **Step 1: Replace local constants with imports**

In `editor.tsx`, delete the local `SIZES`, `POSITIONS`, `COLORS` declarations (lines ~8–22) and add to imports:

```ts
import { SIZES, POSITIONS, COLORS, captionPreviewStyles } from "@/lib/jobs/caption-ui";
```

Keep `import type { CaptionStyle, Scene } from "@/lib/jobs/scenes";`.

- [ ] **Step 2: Replace inline preview math with the helper**

Replace the inline `sizePx` / `previewPos` / `previewColor` block (lines ~43–56) with:

```ts
  const { pos: previewPos, color: previewColor, sizePx } = captionPreviewStyles(style);
```

Leave the JSX that consumes `previewPos` / `previewColor` / `sizePx` unchanged (it references the same names).

- [ ] **Step 3: Type check + lint**

Run (from `web/`): `npx tsc --noEmit && npm run lint`
Expected: no errors related to `editor.tsx`.

- [ ] **Step 4: Run the full test suite to confirm no regression**

Run (from `web/`): `npm test`
Expected: PASS (caption-ui test + all pre-existing tests green; editor has no dedicated test but must still compile/lint).

- [ ] **Step 5: Commit**

```bash
git add web/src/app/dashboard/videos/[id]/captions/editor.tsx
git commit -m "refactor(caption): reuse shared caption UI module in editor

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AhS1N8t6eHH62Gu8FMMhCo"
```

---

### Task 3: `SubtitleSettings` accordion component

**Files:**
- Create: `web/src/app/dashboard/create/subtitle-settings.tsx`

**Interfaces:**
- Consumes: `type CaptionStyle` from `@/lib/jobs/scenes`; `SIZES`, `POSITIONS`, `COLORS`, `SIZE_LABEL`, `POSITION_LABEL`, `COLOR_LABEL` from `@/lib/jobs/caption-ui`.
- Produces: `SubtitleSettings({ value, onChange }: { value: CaptionStyle; onChange: (patch: Partial<CaptionStyle>) => void })`.

This is a presentational client component. It has no dedicated unit test (behavior is trivial state + prop callbacks; it is exercised by manual/live test). Correctness is guarded by type check + lint and the brief-step integration in Task 4.

- [ ] **Step 1: Create the component**

Create `web/src/app/dashboard/create/subtitle-settings.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { CaptionStyle } from "@/lib/jobs/scenes";
import {
  SIZES,
  POSITIONS,
  COLORS,
  SIZE_LABEL,
  POSITION_LABEL,
  COLOR_LABEL,
} from "@/lib/jobs/caption-ui";

export function SubtitleSettings({
  value,
  onChange,
}: {
  value: CaptionStyle;
  onChange: (patch: Partial<CaptionStyle>) => void;
}) {
  const [open, setOpen] = useState(false);
  const summary = `${SIZE_LABEL[value.size]} · ${POSITION_LABEL[value.position]} · ${COLOR_LABEL[value.color]}`;

  return (
    <div className="rounded-[13px] border border-white/10 bg-[#0E0C08]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-bone">
          <span className="text-muted/70">{open ? "▾" : "▸"}</span>
          Subtitles
        </span>
        <span className="font-mono-data text-[11px] text-muted/80">{summary}</span>
      </button>

      {open && (
        <div className="border-t border-white/5 px-3.5 pb-4 pt-3.5">
          <label className="mb-2 block text-[13px] font-semibold text-bone">
            Text size
          </label>
          <div className="flex gap-1.5 rounded-[11px] border border-white/10 bg-[#141310] p-[5px]">
            {SIZES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onChange({ size: s.id })}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                  value.size === s.id
                    ? "bg-caption text-caption-ink"
                    : "text-muted hover:text-bone"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <label className="mb-2 mt-[18px] block text-[13px] font-semibold text-bone">
            Position
          </label>
          <div className="flex gap-1.5 rounded-[11px] border border-white/10 bg-[#141310] p-[5px]">
            {POSITIONS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange({ position: p.id })}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                  value.position === p.id
                    ? "bg-caption text-caption-ink"
                    : "text-muted hover:text-bone"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <label className="mb-2 mt-[18px] block text-[13px] font-semibold text-bone">
            Caption style
          </label>
          <div className="flex flex-wrap gap-[9px]">
            {COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onChange({ color: c.id })}
                className={`flex items-center gap-[9px] rounded-[10px] border px-3 py-[9px] text-[13px] font-semibold transition-colors ${
                  value.color === c.id
                    ? "border-caption bg-caption/10 text-bone"
                    : "border-white/10 bg-[#141310] text-muted hover:text-bone"
                }`}
              >
                <span
                  className="h-3.5 w-3.5 rounded-full border border-white/25"
                  style={{ background: c.swatch }}
                />
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type check + lint**

Run (from `web/`): `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/dashboard/create/subtitle-settings.tsx
git commit -m "feat(create): subtitle settings accordion component

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AhS1N8t6eHH62Gu8FMMhCo"
```

---

### Task 4: Mount in `brief-step.tsx` + live preview + summary row

**Files:**
- Modify: `web/src/app/dashboard/create/brief-step.tsx`

**Interfaces:**
- Consumes: `SubtitleSettings` from `./subtitle-settings`; `captionPreviewStyles`, `SIZE_LABEL`, `POSITION_LABEL`, `COLOR_LABEL` from `@/lib/jobs/caption-ui`; `type CaptionStyle` from `@/lib/jobs/scenes`.
- Produces: `BriefStep` now additionally accepts `captionStyle: CaptionStyle` and `onCaptionChange: (patch: Partial<CaptionStyle>) => void` props. `BriefValues` is unchanged.

- [ ] **Step 1: Extend imports and props**

Add imports near the top of `brief-step.tsx`:

```ts
import type { CaptionStyle } from "@/lib/jobs/scenes";
import {
  captionPreviewStyles,
  SIZE_LABEL,
  POSITION_LABEL,
  COLOR_LABEL,
} from "@/lib/jobs/caption-ui";
import { SubtitleSettings } from "./subtitle-settings";
```

Extend the `BriefStep` prop destructuring + type:

```tsx
export function BriefStep({
  values,
  onChange,
  onGenerate,
  busy,
  captionStyle,
  onCaptionChange,
}: {
  values: BriefValues;
  onChange: (patch: Partial<BriefValues>) => void;
  onGenerate: () => void;
  busy: boolean;
  captionStyle: CaptionStyle;
  onCaptionChange: (patch: Partial<CaptionStyle>) => void;
}) {
```

- [ ] **Step 2: Mount the accordion under the Format block**

In the left card, immediately after the closing `</div>` of the Format grid (the block that maps over `ASPECTS`), insert:

```tsx
        <div className="my-6 h-px bg-white/5" />

        <label className="mb-[11px] block text-sm font-semibold text-bone">
          Subtitles
        </label>
        <SubtitleSettings value={captionStyle} onChange={onCaptionChange} />
```

- [ ] **Step 3: Reflect the style in the "Your brief" thumbnail**

In the right summary panel, replace the existing caption overlay `div` inside the thumbnail (currently the `absolute bottom-3.5 left-2 right-2 ...` div showing `values.subject`) with a style-driven version:

```tsx
        {(() => {
          const cp = captionPreviewStyles(captionStyle);
          return (
            <div className="absolute left-2 right-2 text-center" style={cp.pos}>
              <span
                className="box-decoration-clone rounded px-1 font-display font-extrabold leading-[1.15]"
                style={{ fontSize: Math.round(cp.sizePx * 0.42), ...cp.color }}
              >
                {values.subject.trim() || "Your topic here"}
              </span>
            </div>
          );
        })()}
```

(`sizePx * 0.42` scales the editor-scale px down to this small `w-28` thumbnail. `cp.pos` uses the editor's absolute offsets; for this compact thumbnail they land acceptably — top:16/bottom:60 read as near-edges. Keep as-is unless it visibly clips, which the live test will confirm.)

- [ ] **Step 4: Add the Subtitles summary row**

In the summary rows list (the `flex flex-col gap-2.5` block with Length/Language/Voice/Format), add after the Format row:

```tsx
          <div className="flex justify-between">
            <span className="text-muted/80">Subtitles</span>
            <span className="font-semibold text-bone">
              {`${SIZE_LABEL[captionStyle.size]} · ${POSITION_LABEL[captionStyle.position]} · ${COLOR_LABEL[captionStyle.color]}`}
            </span>
          </div>
```

- [ ] **Step 5: Type check + lint**

Run (from `web/`): `npx tsc --noEmit && npm run lint`
Expected: errors only about `BriefStep` now requiring `captionStyle`/`onCaptionChange` at its call site in `wizard.tsx` (fixed in Task 5). No errors inside `brief-step.tsx` itself.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/dashboard/create/brief-step.tsx
git commit -m "feat(create): subtitle accordion + live preview in brief step

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AhS1N8t6eHH62Gu8FMMhCo"
```

---

### Task 5: Wizard state + API request body

**Files:**
- Modify: `web/src/app/dashboard/create/wizard.tsx`

**Interfaces:**
- Consumes: `DEFAULT_CAPTION_STYLE`, `type CaptionStyle` from `@/lib/jobs/scenes`; the extended `BriefStep` props from Task 4.
- Produces: `/api/jobs` POST body now includes `captionStyle`.

- [ ] **Step 1: Add caption state**

Add import:

```ts
import { DEFAULT_CAPTION_STYLE, type CaptionStyle } from "@/lib/jobs/scenes";
```

Add state alongside the other `useState` calls:

```ts
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>(DEFAULT_CAPTION_STYLE);
```

- [ ] **Step 2: Include captionStyle in the createJob POST body**

In `createJob()`, add `captionStyle` to the JSON body:

```ts
        body: JSON.stringify({
          subject: brief.subject,
          script,
          scenes,
          terms,
          aspect: brief.aspect,
          voice: brief.voice,
          targetSeconds: brief.targetSeconds,
          captionStyle,
        }),
```

- [ ] **Step 3: Pass props to BriefStep**

Where `<BriefStep ... />` is rendered, add:

```tsx
          captionStyle={captionStyle}
          onCaptionChange={(patch) => setCaptionStyle((s) => ({ ...s, ...patch }))}
```

- [ ] **Step 4: Type check + lint**

Run (from `web/`): `npx tsc --noEmit && npm run lint`
Expected: no errors (the Task 4 call-site error is now resolved).

- [ ] **Step 5: Commit**

```bash
git add web/src/app/dashboard/create/wizard.tsx
git commit -m "feat(create): carry subtitle style through wizard to job request

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AhS1N8t6eHH62Gu8FMMhCo"
```

---

### Task 6: Backend — accept & apply captionStyle in job creation

**Files:**
- Modify: `web/src/app/api/jobs/route.ts`
- Modify: `web/src/lib/jobs/create.ts`
- Test: `web/src/lib/jobs/__tests__/create.test.ts`

**Interfaces:**
- Consumes: `sanitizeCaptionStyle` from `./scenes` (already imported alongside `DEFAULT_CAPTION_STYLE`/`engineSubtitleParams`).
- Produces: `createVideoJob` input gains `captionStyle?: unknown`; when scenes exist, the enqueued payload's `subtitle_position`/`font_size`/`text_fore_color`/`text_background_color` reflect the caller's style.

- [ ] **Step 1: Write the failing test**

Append to `web/src/lib/jobs/__tests__/create.test.ts` (inside the existing `describe`), after the `match_materials_to_script` test:

```ts
  it("applies the caller's caption style to scene jobs", async () => {
    await createVideoJob(db, redis, userId, {
      ...INPUT,
      script: "",
      scenes: [{ caption: "Hi!", voiceover: "Hello there." }],
      captionStyle: { size: "lg", position: "top", color: "white" },
    });
    const payload = JSON.parse((await redis.rpop(PENDING_KEY))!);
    // engineSubtitleParams mapping: lg->76, top->"top", white->fore #141208 / bg #FFFFFF
    expect(payload.params.subtitle_position).toBe("top");
    expect(payload.params.font_size).toBe(76);
    expect(payload.params.text_fore_color).toBe("#141208");
    expect(payload.params.text_background_color).toBe("#FFFFFF");
  });

  it("falls back to the default caption style when none is provided", async () => {
    await createVideoJob(db, redis, userId, {
      ...INPUT,
      script: "",
      scenes: [{ caption: "Hi!", voiceover: "Hello there." }],
      // captionStyle omitted
    });
    const payload = JSON.parse((await redis.rpop(PENDING_KEY))!);
    // DEFAULT_CAPTION_STYLE: md->60, bottom, yellow-> fore #141208 / bg #F4C63A
    expect(payload.params.subtitle_position).toBe("bottom");
    expect(payload.params.font_size).toBe(60);
    expect(payload.params.text_background_color).toBe("#F4C63A");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `web/`): `npm test -- create`
Expected: FAIL — the first new test sees default values (position `bottom`, font 60) because `create.ts` still hardcodes `DEFAULT_CAPTION_STYLE`. (The second test may already pass; the first must fail.)

- [ ] **Step 3: Read the caller's style in `create.ts`**

In `web/src/lib/jobs/create.ts`, add `sanitizeCaptionStyle` to the existing import from `./scenes`:

```ts
import {
  DEFAULT_CAPTION_STYLE,
  engineSubtitleParams,
  sanitizeCaptionStyle,
  sanitizeScenes,
  type Scene,
} from "./scenes";
```

Add `captionStyle?: unknown;` to the `input` parameter type object. Then replace the hardcoded line (currently `const captionStyle = scenes.length > 0 ? DEFAULT_CAPTION_STYLE : null;`) with:

```ts
  const captionStyle =
    scenes.length > 0 ? sanitizeCaptionStyle(input.captionStyle) : null;
```

Leave the rest untouched — `spendCreditsForJob({ ..., captionStyle, ... })` and `engineSubtitleParams(captionStyle ?? DEFAULT_CAPTION_STYLE)` already consume the variable. (`DEFAULT_CAPTION_STYLE` remains imported and used in that fallback expression.)

- [ ] **Step 4: Pass captionStyle from the API route**

In `web/src/app/api/jobs/route.ts`, add to the `createVideoJob` input object:

```ts
      targetSeconds: Number(body.targetSeconds ?? 60),
      captionStyle: body.captionStyle,
```

(No sanitizing here — `createVideoJob` validates via `sanitizeCaptionStyle`.)

- [ ] **Step 5: Run tests to verify they pass**

Run (from `web/`): `npm test -- create`
Expected: PASS — both new tests plus all pre-existing create tests green.

- [ ] **Step 6: Full type check, lint, and test suite**

Run (from `web/`): `npx tsc --noEmit && npm run lint && npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/jobs/create.ts web/src/app/api/jobs/route.ts web/src/lib/jobs/__tests__/create.test.ts
git commit -m "feat(jobs): apply brief-selected subtitle style to first render

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AhS1N8t6eHH62Gu8FMMhCo"
```

---

## Self-Review

**Spec coverage:**
- Bölüm 1 (caption-ui.ts) → Task 1 (+ editor refactor Task 2). ✓
- Bölüm 2 (subtitle-settings.tsx accordion, summary header, default closed) → Task 3. ✓
- Bölüm 3 (wizard + brief-step: mount, live preview w/ subject text, summary row) → Tasks 4 & 5. ✓
- Bölüm 4 (route.ts + create.ts end-to-end, sanitizeCaptionStyle) → Task 6. ✓
- Test stratejisi: caption-ui unit (Task 1), editor regression via full suite (Task 2), create.ts hermetic style + fallback tests (Task 6). ✓
- Kapsam dışı (no new axes, no per-scene style, scenes.length===0 → null) → respected; create.ts keeps `null` for sceneless path. ✓

**Placeholder scan:** No TBD/TODO; all code shown in full. ✓

**Type consistency:** `captionPreviewStyles` returns `{ pos, color, sizePx }` — consumed with those exact names in editor (Task 2, aliased to previewPos/previewColor) and brief-step (Task 4). `SubtitleSettings({ value, onChange })` — called with those props in Task 4. `BriefStep` gains `captionStyle`/`onCaptionChange` (Task 4) supplied in Task 5. `createVideoJob` input `captionStyle?: unknown` (Task 6) supplied by route (Task 6) and wizard body (Task 5). Engine mapping values (lg→76, md→60, yellow bg #F4C63A, white bg #FFFFFF) match `engineSubtitleParams` in scenes.ts. ✓
