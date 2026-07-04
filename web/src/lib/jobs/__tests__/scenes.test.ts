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
