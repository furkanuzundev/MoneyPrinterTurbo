# Subtitle Text + Background Color Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `color` (yellow/white/none) caption axis with two independent axes — **Text color** and **Background color** — each offering 5 presets plus a free color-palette picker, wired end-to-end and shown in both the brief accordion and the post-render captions editor.

**Architecture:** Change `CaptionStyle` from `{size,position,color}` to `{size,position,textColor,bgColor}`. `sanitizeCaptionStyle` becomes the trust boundary AND the read-time migration for old `{color}` records (Decision A — no DB backfill). A new shared `ColorAxis` client component renders presets + palette; both `subtitle-settings.tsx` (brief) and `captions/editor.tsx` (post-render) consume it. `engineSubtitleParams` maps `textColor → text_fore_color` and `bgColor → text_background_color` (`"none" → false`).

**Tech Stack:** Next.js (App Router), React, TypeScript, Tailwind, Vitest (create.test.ts is a Postgres+Redis integration test).

## Global Constraints

- All work under `web/`. Run commands from `web/`.
- Test: `npm test` → `vitest run`. Type check: `npx tsc --noEmit`. Lint: `npm run lint`.
- `create.test.ts` is INTEGRATION: needs `DATABASE_URL_TEST=postgres://reelate:reelate_dev@localhost:5434/reelate_test` + Redis `redis://localhost:6379/15` (both UP). Enqueue payload read via `redis.rpop(PENDING_KEY)`, shape `{ task_id, params: {...} }`.
- New `CaptionStyle` shape: `{ size:"sm"|"md"|"lg"; position:"top"|"center"|"bottom"; textColor: string; bgColor: string | "none" }`. The `color` field is REMOVED everywhere.
- `DEFAULT_CAPTION_STYLE = { size:"md", position:"bottom", textColor:"#141208", bgColor:"#F4C63A" }`.
- Hex format: always stored as uppercase `#RRGGBB`. `normalizeHex` accepts `#?[0-9a-fA-F]{3 or 6}`, expands 3→6, uppercases; returns null on invalid.
- Engine mapping: `text_fore_color = style.textColor`; `text_background_color = style.bgColor === "none" ? false : style.bgColor`. font_size sm/md/lg = 44/60/76. position passes through.
- Old-format migration (in sanitizeCaptionStyle): if input has no `textColor` but has `color`: `yellow→{textColor:"#141208",bgColor:"#F4C63A"}`, `white→{textColor:"#141208",bgColor:"#FFFFFF"}`, `none→{textColor:"#FFFFFF",bgColor:"none"}`.
- TEXT_COLOR_PRESETS (order matters): White #FFFFFF, Black #141208, Yellow #F4C63A, Red #E5484D, Cyan #33C9D6.
- BG_COLOR_PRESETS (order matters): None "none", Yellow #F4C63A, White #FFFFFF, Black #141208, Blue #2B6CF4.
- Active selection styling in this codebase: `border-caption` / `bg-caption text-caption-ink`.
- Do NOT weaken/delete existing test assertions — migrate them to the new shape.
- End git commits with the Co-Authored-By + Claude-Session trailers used across this repo.

---

### Task 1: Data model — `scenes.ts` (type, default, normalizeHex, sanitize+migration, engine mapping)

**Files:**
- Modify: `web/src/lib/jobs/scenes.ts`
- Test: `web/src/lib/jobs/__tests__/scenes.test.ts` (create)

**Interfaces:**
- Produces:
  - `type CaptionStyle = { size; position; textColor: string; bgColor: string | "none" }`
  - `DEFAULT_CAPTION_STYLE` (new default above)
  - `normalizeHex(input: unknown): string | null`
  - `sanitizeCaptionStyle(input: unknown): CaptionStyle` (validates + migrates old `color`)
  - `engineSubtitleParams(style): { subtitle_position; font_size; text_fore_color; text_background_color }`

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/jobs/__tests__/scenes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAPTION_STYLE,
  normalizeHex,
  sanitizeCaptionStyle,
  engineSubtitleParams,
} from "../scenes";

describe("normalizeHex", () => {
  it("accepts 6-digit hex and uppercases", () => {
    expect(normalizeHex("#ff0000")).toBe("#FF0000");
  });
  it("expands 3-digit hex", () => {
    expect(normalizeHex("#abc")).toBe("#AABBCC");
  });
  it("accepts without leading hash", () => {
    expect(normalizeHex("00ff00")).toBe("#00FF00");
  });
  it("rejects invalid", () => {
    expect(normalizeHex("zzz")).toBeNull();
    expect(normalizeHex("#12")).toBeNull();
    expect(normalizeHex(42)).toBeNull();
    expect(normalizeHex(null)).toBeNull();
  });
});

describe("sanitizeCaptionStyle (new shape)", () => {
  it("keeps valid text/bg colors, normalizing hex", () => {
    const s = sanitizeCaptionStyle({ size: "lg", position: "top", textColor: "#ff0000", bgColor: "none" });
    expect(s).toEqual({ size: "lg", position: "top", textColor: "#FF0000", bgColor: "none" });
  });
  it("falls back invalid colors to default", () => {
    const s = sanitizeCaptionStyle({ textColor: "zzz", bgColor: "nope" });
    expect(s.textColor).toBe(DEFAULT_CAPTION_STYLE.textColor);
    expect(s.bgColor).toBe(DEFAULT_CAPTION_STYLE.bgColor);
  });
  it("accepts a palette hex for bgColor", () => {
    expect(sanitizeCaptionStyle({ bgColor: "#2b6cf4" }).bgColor).toBe("#2B6CF4");
  });
});

describe("sanitizeCaptionStyle (old-format migration)", () => {
  it("migrates yellow", () => {
    const s = sanitizeCaptionStyle({ size: "md", position: "bottom", color: "yellow" });
    expect(s.textColor).toBe("#141208");
    expect(s.bgColor).toBe("#F4C63A");
  });
  it("migrates white", () => {
    const s = sanitizeCaptionStyle({ color: "white" });
    expect(s.textColor).toBe("#141208");
    expect(s.bgColor).toBe("#FFFFFF");
  });
  it("migrates none", () => {
    const s = sanitizeCaptionStyle({ color: "none" });
    expect(s.textColor).toBe("#FFFFFF");
    expect(s.bgColor).toBe("none");
  });
  it("prefers new fields over legacy color when both present", () => {
    const s = sanitizeCaptionStyle({ color: "yellow", textColor: "#00ff00", bgColor: "none" });
    expect(s.textColor).toBe("#00FF00");
    expect(s.bgColor).toBe("none");
  });
});

describe("engineSubtitleParams", () => {
  it("maps none bg to false", () => {
    const p = engineSubtitleParams({ size: "lg", position: "top", textColor: "#FFFFFF", bgColor: "none" });
    expect(p).toEqual({
      subtitle_position: "top",
      font_size: 76,
      text_fore_color: "#FFFFFF",
      text_background_color: false,
    });
  });
  it("maps hex bg through", () => {
    const p = engineSubtitleParams({ size: "md", position: "bottom", textColor: "#141208", bgColor: "#F4C63A" });
    expect(p).toEqual({
      subtitle_position: "bottom",
      font_size: 60,
      text_fore_color: "#141208",
      text_background_color: "#F4C63A",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `web/`): `npm test -- scenes`
Expected: FAIL — `normalizeHex` not exported; sanitize still returns `{color}`.

- [ ] **Step 3: Implement in `scenes.ts`**

Replace the `CaptionStyle` type:

```ts
export type CaptionStyle = {
  size: "sm" | "md" | "lg";
  position: "top" | "center" | "bottom";
  textColor: string;
  bgColor: string | "none";
};
```

Replace `DEFAULT_CAPTION_STYLE`:

```ts
export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  size: "md",
  position: "bottom",
  textColor: "#141208",
  bgColor: "#F4C63A",
};
```

Add `normalizeHex` (place above `sanitizeCaptionStyle`):

```ts
// "#abc" / "abc" / "#aabbcc" / "aabbcc" -> "#AABBCC"; geçersiz -> null.
export function normalizeHex(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const m = input.trim().replace(/^#/, "");
  if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(m)) return null;
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  return "#" + full.toUpperCase();
}
```

Replace `sanitizeCaptionStyle` with the migrating version:

```ts
// Eski→yeni renk migrasyonu (DB'deki color:"yellow"|"white"|"none" kayıtları).
const LEGACY_COLOR_MAP: Record<string, { textColor: string; bgColor: string }> = {
  yellow: { textColor: "#141208", bgColor: "#F4C63A" },
  white: { textColor: "#141208", bgColor: "#FFFFFF" },
  none: { textColor: "#FFFFFF", bgColor: "none" },
};

export function sanitizeCaptionStyle(input: unknown): CaptionStyle {
  const obj = (typeof input === "object" && input !== null ? input : {}) as
    Record<string, unknown>;
  const size = ["sm", "md", "lg"].includes(String(obj.size))
    ? (String(obj.size) as CaptionStyle["size"])
    : DEFAULT_CAPTION_STYLE.size;
  const position = ["top", "center", "bottom"].includes(String(obj.position))
    ? (String(obj.position) as CaptionStyle["position"])
    : DEFAULT_CAPTION_STYLE.position;

  // Yeni alanlar yoksa ama eski color varsa: migrasyon.
  const hasNew = obj.textColor !== undefined || obj.bgColor !== undefined;
  const legacy =
    !hasNew && typeof obj.color === "string" && obj.color in LEGACY_COLOR_MAP
      ? LEGACY_COLOR_MAP[obj.color]
      : null;

  const textColor =
    normalizeHex(obj.textColor) ??
    legacy?.textColor ??
    DEFAULT_CAPTION_STYLE.textColor;

  const bgColor =
    obj.bgColor === "none"
      ? "none"
      : normalizeHex(obj.bgColor) ??
        (legacy ? legacy.bgColor : DEFAULT_CAPTION_STYLE.bgColor);

  return { size, position, textColor, bgColor };
}
```

Replace `engineSubtitleParams` body (remove `colorMap`):

```ts
export function engineSubtitleParams(style: CaptionStyle): {
  subtitle_position: string;
  font_size: number;
  text_fore_color: string;
  text_background_color: boolean | string;
} {
  const font_size = { sm: 44, md: 60, lg: 76 }[style.size];
  return {
    subtitle_position: style.position,
    font_size,
    text_fore_color: style.textColor,
    text_background_color: style.bgColor === "none" ? false : style.bgColor,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `web/`): `npm test -- scenes`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/jobs/scenes.ts web/src/lib/jobs/__tests__/scenes.test.ts
git commit -m "feat(caption): text+bg color model with legacy migration

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AhS1N8t6eHH62Gu8FMMhCo"
```

---

### Task 2: Presentation data — `caption-ui.ts` (presets, preview, colorLabel)

**Files:**
- Modify: `web/src/lib/jobs/caption-ui.ts`
- Test: `web/src/lib/jobs/__tests__/caption-ui.test.ts`

**Interfaces:**
- Consumes: `type CaptionStyle` from `./scenes`.
- Produces: `SIZES`, `POSITIONS` (unchanged), `SIZE_LABEL`, `POSITION_LABEL` (unchanged), `TEXT_COLOR_PRESETS`, `BG_COLOR_PRESETS`, `captionPreviewStyles(style)`, `colorLabel(value, presets)`. REMOVES `COLORS`, `COLOR_LABEL`.

- [ ] **Step 1: Rewrite the test**

Replace `web/src/lib/jobs/__tests__/caption-ui.test.ts` entirely:

```ts
import { describe, expect, it } from "vitest";
import {
  SIZES,
  POSITIONS,
  SIZE_LABEL,
  POSITION_LABEL,
  TEXT_COLOR_PRESETS,
  BG_COLOR_PRESETS,
  captionPreviewStyles,
  colorLabel,
} from "../caption-ui";

describe("caption-ui constants", () => {
  it("keeps sizes and positions", () => {
    expect(SIZES.map((s) => s.id)).toEqual(["sm", "md", "lg"]);
    expect(SIZES.map((s) => s.px)).toEqual([17, 23, 30]);
    expect(POSITIONS.map((p) => p.id)).toEqual(["top", "center", "bottom"]);
    expect(SIZE_LABEL.md).toBe("M");
    expect(POSITION_LABEL.bottom).toBe("Bottom");
  });
  it("exposes text color presets in order", () => {
    expect(TEXT_COLOR_PRESETS.map((c) => c.hex)).toEqual([
      "#FFFFFF", "#141208", "#F4C63A", "#E5484D", "#33C9D6",
    ]);
  });
  it("exposes bg color presets with None first", () => {
    expect(BG_COLOR_PRESETS.map((c) => c.hex)).toEqual([
      "none", "#F4C63A", "#FFFFFF", "#141208", "#2B6CF4",
    ]);
    expect(BG_COLOR_PRESETS[0].label).toBe("None");
  });
});

describe("captionPreviewStyles", () => {
  it("bg none -> shadowed text, no background", () => {
    const c = captionPreviewStyles({ size: "md", position: "bottom", textColor: "#FFFFFF", bgColor: "none" }).color;
    expect(c).toEqual({ color: "#FFFFFF", textShadow: "0 2px 12px rgba(0,0,0,0.65)" });
  });
  it("bg hex -> text color over background box", () => {
    const c = captionPreviewStyles({ size: "md", position: "bottom", textColor: "#141208", bgColor: "#F4C63A" }).color;
    expect(c).toEqual({ color: "#141208", background: "#F4C63A" });
  });
  it("keeps position + size mapping", () => {
    const r = captionPreviewStyles({ size: "lg", position: "top", textColor: "#FFFFFF", bgColor: "none" });
    expect(r.pos).toEqual({ top: 16 });
    expect(r.sizePx).toBe(30);
  });
});

describe("colorLabel", () => {
  it("returns preset label when matched", () => {
    expect(colorLabel("#F4C63A", BG_COLOR_PRESETS)).toBe("Yellow");
    expect(colorLabel("none", BG_COLOR_PRESETS)).toBe("None");
    expect(colorLabel("#FFFFFF", TEXT_COLOR_PRESETS)).toBe("White");
  });
  it("returns raw hex when unmatched (palette pick)", () => {
    expect(colorLabel("#123456", TEXT_COLOR_PRESETS)).toBe("#123456");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `web/`): `npm test -- caption-ui`
Expected: FAIL — new exports missing; old `COLORS`/`COLOR_LABEL` gone.

- [ ] **Step 3: Implement in `caption-ui.ts`**

Keep `SIZES`, `POSITIONS`, `SIZE_LABEL`, `POSITION_LABEL` as-is. DELETE `COLORS` and `COLOR_LABEL`. Add:

```ts
export const TEXT_COLOR_PRESETS: { label: string; hex: string }[] = [
  { label: "White", hex: "#FFFFFF" },
  { label: "Black", hex: "#141208" },
  { label: "Yellow", hex: "#F4C63A" },
  { label: "Red", hex: "#E5484D" },
  { label: "Cyan", hex: "#33C9D6" },
];

export const BG_COLOR_PRESETS: { label: string; hex: string | "none" }[] = [
  { label: "None", hex: "none" },
  { label: "Yellow", hex: "#F4C63A" },
  { label: "White", hex: "#FFFFFF" },
  { label: "Black", hex: "#141208" },
  { label: "Blue", hex: "#2B6CF4" },
];

// Bir hex/none için insan-okur kısa etiket: preset ise adı, değilse hex'in
// kendisi (palet seçimi). Özet satırlarında kullanılır.
export function colorLabel(
  value: string,
  presets: { label: string; hex: string | "none" }[],
): string {
  return (
    presets.find((p) => p.hex.toLowerCase() === value.toLowerCase())?.label ??
    value
  );
}
```

Rewrite `captionPreviewStyles` color branch (keep `pos` and `sizePx` logic unchanged):

```ts
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
    style.bgColor === "none"
      ? { color: style.textColor, textShadow: "0 2px 12px rgba(0,0,0,0.65)" }
      : { color: style.textColor, background: style.bgColor };
  const sizePx = SIZES.find((s) => s.id === style.size)?.px ?? 23;
  return { pos, color, sizePx };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `web/`): `npm test -- caption-ui`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/jobs/caption-ui.ts web/src/lib/jobs/__tests__/caption-ui.test.ts
git commit -m "feat(caption): color presets + colorLabel + two-axis preview

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AhS1N8t6eHH62Gu8FMMhCo"
```

---

### Task 3: Shared `ColorAxis` component

**Files:**
- Create: `web/src/components/subtitle/color-axis.tsx`

**Interfaces:**
- Consumes: nothing from other tasks except preset shape (`{ label; hex }`).
- Produces: `ColorAxis({ label, presets, value, onChange })` where
  `presets: { label: string; hex: string | "none" }[]`, `value: string`,
  `onChange: (v: string) => void`. A preset with `hex === "none"` renders a
  transparent/crossed swatch and calls `onChange("none")`. A trailing palette
  button wraps a native `<input type="color">` and calls
  `onChange(e.target.value.toUpperCase())`.

This is a presentational client component, exercised by tsc/lint + manual test.

- [ ] **Step 1: Create the component**

Create `web/src/components/subtitle/color-axis.tsx`:

```tsx
"use client";

export function ColorAxis({
  label,
  presets,
  value,
  onChange,
}: {
  label: string;
  presets: { label: string; hex: string | "none" }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const selectedPreset = presets.find(
    (p) => p.hex.toLowerCase() === value.toLowerCase(),
  );
  // Palet seçimi: değer bir preset değilse ve "none" değilse.
  const isPalette = !selectedPreset && value !== "none";
  // Native color input "none" veremez; palet için geçerli bir hex lazım.
  const paletteValue = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#FFFFFF";

  return (
    <div>
      <label className="mb-2 block text-[13px] font-semibold text-bone">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-[9px]">
        {presets.map((p) => {
          const on = p.hex.toLowerCase() === value.toLowerCase();
          const none = p.hex === "none";
          return (
            <button
              key={p.hex}
              type="button"
              aria-label={p.label}
              title={p.label}
              onClick={() => onChange(p.hex)}
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${
                on ? "border-caption" : "border-white/20 hover:border-white/40"
              }`}
            >
              <span
                className="h-5 w-5 rounded-full border border-white/25"
                style={
                  none
                    ? {
                        background:
                          "linear-gradient(135deg, transparent 43%, #E5484D 43%, #E5484D 57%, transparent 57%)",
                      }
                    : { background: p.hex }
                }
              />
            </button>
          );
        })}

        {/* Palet düğmesi: serbest hex */}
        <label
          className={`relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 transition-colors ${
            isPalette ? "border-caption" : "border-white/20 hover:border-white/40"
          }`}
          title="Custom color"
        >
          <span
            className="h-5 w-5 rounded-full border border-white/25"
            style={{
              background: isPalette
                ? value
                : "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
            }}
          />
          <input
            type="color"
            value={paletteValue}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={`${label} custom`}
          />
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type check + lint**

Run (from `web/`): `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/subtitle/color-axis.tsx
git commit -m "feat(subtitle): shared ColorAxis presets+palette component

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AhS1N8t6eHH62Gu8FMMhCo"
```

---

### Task 4: `SubtitleSettings` — two color axes + summary

**Files:**
- Modify: `web/src/app/dashboard/create/subtitle-settings.tsx`

**Interfaces:**
- Consumes: `ColorAxis` from `@/components/subtitle/color-axis`; `SIZES`, `POSITIONS`, `SIZE_LABEL`, `POSITION_LABEL`, `TEXT_COLOR_PRESETS`, `BG_COLOR_PRESETS`, `colorLabel` from `@/lib/jobs/caption-ui`; `type CaptionStyle` from `@/lib/jobs/scenes`. Props unchanged: `{ value: CaptionStyle; onChange: (patch: Partial<CaptionStyle>) => void }`.

- [ ] **Step 1: Update imports and summary**

In `subtitle-settings.tsx`: remove `COLORS`, `COLOR_LABEL` from the caption-ui import; add `TEXT_COLOR_PRESETS`, `BG_COLOR_PRESETS`, `colorLabel`. Add `import { ColorAxis } from "@/components/subtitle/color-axis";`.

Replace the `summary` line:

```ts
  const summary = `${SIZE_LABEL[value.size]} · ${POSITION_LABEL[value.position]} · T:${colorLabel(value.textColor, TEXT_COLOR_PRESETS)} · BG:${colorLabel(value.bgColor, BG_COLOR_PRESETS)}`;
```

- [ ] **Step 2: Replace the single color block with two axes**

Find the `Caption style` label + the `COLORS.map(...)` chip block and replace the whole block with:

```tsx
          <div className="mt-[18px]">
            <ColorAxis
              label="Text color"
              presets={TEXT_COLOR_PRESETS}
              value={value.textColor}
              onChange={(v) => onChange({ textColor: v })}
            />
          </div>

          <div className="mt-[18px]">
            <ColorAxis
              label="Background color"
              presets={BG_COLOR_PRESETS}
              value={value.bgColor}
              onChange={(v) => onChange({ bgColor: v })}
            />
          </div>
```

(Text size and Position segments above stay untouched.)

- [ ] **Step 3: Type check + lint**

Run (from `web/`): `npx tsc --noEmit && npm run lint`
Expected: no errors inside subtitle-settings.tsx. (brief-step.tsx may still error on `COLOR_LABEL` — fixed in Task 5. If tsc reports only brief-step.tsx COLOR_LABEL errors, that's expected here.)

- [ ] **Step 4: Commit**

```bash
git add web/src/app/dashboard/create/subtitle-settings.tsx
git commit -m "feat(create): two color axes in subtitle accordion

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AhS1N8t6eHH62Gu8FMMhCo"
```

---

### Task 5: `brief-step.tsx` summary row

**Files:**
- Modify: `web/src/app/dashboard/create/brief-step.tsx`

**Interfaces:**
- Consumes: `colorLabel`, `TEXT_COLOR_PRESETS`, `BG_COLOR_PRESETS` from `@/lib/jobs/caption-ui`. The live-preview thumbnail already calls `captionPreviewStyles(captionStyle)` — its signature is unchanged, so it needs no edit.

- [ ] **Step 1: Update imports**

In `brief-step.tsx`: from the caption-ui import remove `COLOR_LABEL`; add `colorLabel`, `TEXT_COLOR_PRESETS`, `BG_COLOR_PRESETS`. (`SIZE_LABEL`, `POSITION_LABEL`, `captionPreviewStyles` stay.)

- [ ] **Step 2: Update the Subtitles summary row**

Replace the summary row value expression (currently uses `COLOR_LABEL[captionStyle.color]`) with:

```tsx
              {`${SIZE_LABEL[captionStyle.size]} · ${POSITION_LABEL[captionStyle.position]} · T:${colorLabel(captionStyle.textColor, TEXT_COLOR_PRESETS)} · BG:${colorLabel(captionStyle.bgColor, BG_COLOR_PRESETS)}`}
```

- [ ] **Step 3: Type check + lint**

Run (from `web/`): `npx tsc --noEmit && npm run lint`
Expected: no errors in brief-step.tsx. (captions/editor.tsx may still error on `COLORS`/`.color` — fixed in Task 6.)

- [ ] **Step 4: Commit**

```bash
git add web/src/app/dashboard/create/brief-step.tsx
git commit -m "feat(create): text+bg color summary in brief preview

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AhS1N8t6eHH62Gu8FMMhCo"
```

---

### Task 6: Post-render captions editor + page

**Files:**
- Modify: `web/src/app/dashboard/videos/[id]/captions/editor.tsx`
- Modify: `web/src/app/dashboard/videos/[id]/captions/page.tsx`

**Interfaces:**
- Consumes: `ColorAxis` from `@/components/subtitle/color-axis`; `TEXT_COLOR_PRESETS`, `BG_COLOR_PRESETS` from `@/lib/jobs/caption-ui`; `sanitizeCaptionStyle` from `@/lib/jobs/scenes`.

- [ ] **Step 1: Update editor imports and preview**

In `editor.tsx`: remove `COLORS` from the caption-ui import; add `TEXT_COLOR_PRESETS`, `BG_COLOR_PRESETS`. Add `import { ColorAxis } from "@/components/subtitle/color-axis";`. `captionPreviewStyles` import stays (its `.color` output already drives `previewColor`, signature unchanged).

- [ ] **Step 2: Replace the editor's color chip block with two axes**

Find the `Caption style` label + `COLORS.map(...)` block in editor.tsx and replace with:

```tsx
          <div className="mt-[22px]">
            <ColorAxis
              label="Text color"
              presets={TEXT_COLOR_PRESETS}
              value={style.textColor}
              onChange={(v) => setStyle({ ...style, textColor: v })}
            />
          </div>
          <div className="mt-[18px]">
            <ColorAxis
              label="Background color"
              presets={BG_COLOR_PRESETS}
              value={style.bgColor}
              onChange={(v) => setStyle({ ...style, bgColor: v })}
            />
          </div>
```

- [ ] **Step 3: Sanitize initialStyle in page.tsx (read-time migration)**

In `page.tsx`: import `sanitizeCaptionStyle` from `@/lib/jobs/scenes` (alongside `DEFAULT_CAPTION_STYLE`). Change:

```tsx
      initialStyle={job.captionStyle ?? DEFAULT_CAPTION_STYLE}
```
to:
```tsx
      initialStyle={sanitizeCaptionStyle(job.captionStyle ?? DEFAULT_CAPTION_STYLE)}
```

(So old `{color}` records from the DB are migrated to the new shape before the editor renders.)

- [ ] **Step 4: Type check + lint**

Run (from `web/`): `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/dashboard/videos/[id]/captions/editor.tsx web/src/app/dashboard/videos/[id]/captions/page.tsx
git commit -m "feat(captions): two color axes in post-render editor + migrate initial style

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AhS1N8t6eHH62Gu8FMMhCo"
```

---

### Task 7: Backend types + integration tests

**Files:**
- Modify: `web/src/db/schema.ts`
- Modify: `web/src/lib/credits/ledger.ts`
- Test: `web/src/lib/jobs/__tests__/create.test.ts`

**Interfaces:**
- Consumes: nothing new. `create.ts` and `route.ts` already pass `captionStyle` through `sanitizeCaptionStyle` (from the prior feature) — no logic change needed there; only the DB/ledger TS types and the create tests move to the new shape.

- [ ] **Step 1: Update the failing tests**

In `web/src/lib/jobs/__tests__/create.test.ts`, replace the two caption-style tests (the ones asserting `subtitle_position`/`font_size`/`text_fore_color`/`text_background_color`) with the new-shape versions:

```ts
  it("applies the caller's caption style to scene jobs", async () => {
    await createVideoJob(db, redis, userId, {
      ...INPUT,
      script: "",
      scenes: [{ caption: "Hi!", voiceover: "Hello there." }],
      captionStyle: { size: "lg", position: "top", textColor: "#FFFFFF", bgColor: "none" },
    });
    const payload = JSON.parse((await redis.rpop(PENDING_KEY))!);
    expect(payload.params.subtitle_position).toBe("top");
    expect(payload.params.font_size).toBe(76);
    expect(payload.params.text_fore_color).toBe("#FFFFFF");
    expect(payload.params.text_background_color).toBe(false);
  });

  it("falls back to the default caption style when none is provided", async () => {
    await createVideoJob(db, redis, userId, {
      ...INPUT,
      script: "",
      scenes: [{ caption: "Hi!", voiceover: "Hello there." }],
    });
    const payload = JSON.parse((await redis.rpop(PENDING_KEY))!);
    expect(payload.params.subtitle_position).toBe("bottom");
    expect(payload.params.font_size).toBe(60);
    expect(payload.params.text_fore_color).toBe("#141208");
    expect(payload.params.text_background_color).toBe("#F4C63A");
  });
```

Also scan the file for any other `color:` references in caption-style fixtures and migrate them to `textColor`/`bgColor` (or remove `captionStyle` if the test doesn't care about it). Do NOT weaken unrelated assertions.

- [ ] **Step 2: Run to verify failure**

Run (from `web/`): `npm test -- create`
Expected: FAIL — either the old assertions (`text_background_color: "#FFFFFF"` for white) or a tsc-in-test mismatch on the removed `color` field.

- [ ] **Step 3: Update DB + ledger types**

In `web/src/db/schema.ts`, change the `captionStyle` jsonb `$type`:

```ts
  captionStyle: jsonb("caption_style").$type<{
    size: "sm" | "md" | "lg";
    position: "top" | "center" | "bottom";
    textColor: string;
    bgColor: string;
  }>(),
```

In `web/src/lib/credits/ledger.ts`, find the inline captionStyle type (the `color: "yellow" | "white" | "none"` line) and change it to:

```ts
      textColor: string;
      bgColor: string;
```
(matching the schema; keep the surrounding `size`/`position` fields).

- [ ] **Step 4: Run to verify pass + full check**

Run (from `web/`): `npm test -- create`
Expected: PASS.

Then: `npx tsc --noEmit && npm run lint && npm test`
Expected: all green (scenes + caption-ui + create + everything else).

- [ ] **Step 5: Commit**

```bash
git add web/src/db/schema.ts web/src/lib/credits/ledger.ts web/src/lib/jobs/__tests__/create.test.ts
git commit -m "feat(jobs): text+bg color types in schema/ledger + integration tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AhS1N8t6eHH62Gu8FMMhCo"
```

---

## Self-Review

**Spec coverage:**
- Data model (CaptionStyle, DEFAULT, normalizeHex, sanitize+migration, engine map) → Task 1. ✓
- Presentation data (presets, preview two-axis, colorLabel; remove COLORS/COLOR_LABEL) → Task 2. ✓
- Shared ColorAxis (presets + palette + none swatch) → Task 3. ✓
- SubtitleSettings two axes + summary → Task 4. ✓
- brief-step summary row (preview auto via unchanged captionPreviewStyles signature) → Task 5. ✓
- Editor two axes + page.tsx initialStyle migration → Task 6. ✓
- schema.ts + ledger.ts types + create.test.ts → Task 7. ✓
- Tests: scenes.test.ts (Task 1), caption-ui.test.ts (Task 2), create.test.ts (Task 7). ✓
- Out of scope (stroke, font, gradient, custom_position, DB backfill) respected. ✓

**Placeholder scan:** No TBD/TODO; all code shown. ✓

**Type consistency:** `CaptionStyle` = `{size,position,textColor,bgColor}` used identically across scenes.ts, caption-ui.ts, ColorAxis (via preset shape + string value), subtitle-settings, brief-step, editor, schema, ledger. `captionPreviewStyles` still returns `{pos,color,sizePx}` (signature unchanged → brief-step and editor previews need no edit). `colorLabel(value, presets)` signature consistent between Task 2 def and Tasks 4/5 use. `ColorAxis` props `{label,presets,value,onChange}` consistent between Task 3 def and Tasks 4/6 use. Engine values (sm/md/lg 44/60/76; none→false) consistent between Task 1 and Task 7 test expectations. Migration values (yellow→#141208/#F4C63A etc.) identical in Task 1 impl, Task 1 tests, and spec. ✓

**Ordering note:** Tasks 4→5→6 each clear a tsc error the previous task introduces (COLOR_LABEL / COLORS references). Task 7 clears the final type mismatch. This is expected cross-task tsc churn, called out in each task's Step 3/4 expectations; only Task 7 ends fully green.
