import { describe, expect, it } from "vitest";
import {
  DURATION_OPTIONS,
  LANGUAGES,
  VOICES,
  formatDuration,
} from "@/lib/jobs/options";

describe("options language/voice data", () => {
  it("exposes ~28 languages", () => {
    expect(LANGUAGES.length).toBeGreaterThanOrEqual(28);
  });

  it("every voice maps to a known language", () => {
    const codes = new Set(LANGUAGES.map((l) => l.code));
    for (const v of VOICES) {
      expect(codes.has(v.language)).toBe(true);
    }
  });

  it("every language has at least one voice", () => {
    for (const l of LANGUAGES) {
      expect(VOICES.some((v) => v.language === l.code)).toBe(true);
    }
  });

  it("voice id starts with its language locale prefix", () => {
    for (const v of VOICES) {
      expect(v.id.startsWith(v.language + "-")).toBe(true);
    }
  });

  it("keeps the engine voice id suffix format", () => {
    for (const v of VOICES) {
      expect(v.id).toMatch(/Neural-(Male|Female)$/);
    }
  });
});

describe("formatDuration", () => {
  it("uses one canonical label per option", () => {
    // brief-step gösterimi 30s/1m/90s/3m, özet ise "1.5 min" basıyordu.
    expect(DURATION_OPTIONS.map(formatDuration)).toEqual([
      "30s",
      "60s",
      "90s",
      "3 min",
    ]);
  });

  it("keeps sub-two-minute durations in seconds", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(119)).toBe("119s");
  });

  it("switches to minutes at two minutes and drops a trailing .0", () => {
    expect(formatDuration(120)).toBe("2 min");
    expect(formatDuration(150)).toBe("2.5 min");
  });
});
