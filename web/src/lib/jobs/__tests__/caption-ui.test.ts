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
