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
