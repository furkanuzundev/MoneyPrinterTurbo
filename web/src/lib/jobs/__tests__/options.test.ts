import { describe, expect, it } from "vitest";
import { LANGUAGES, VOICES } from "@/lib/jobs/options";

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
