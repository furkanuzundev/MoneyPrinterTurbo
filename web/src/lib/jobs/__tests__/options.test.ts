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

describe("expanded voice catalog", () => {
  // Azure'ın "-V2" sesleri azure_tts_v2() yoluna gidiyor ve config.azure
  // speech_key/speech_region istiyor (app/services/voice.py). config.toml'da
  // ikisi de boş, yani bu sesler seçilirse hem önizleme hem üretim patlar.
  it("excludes azure v2 voices the backend cannot synthesize", () => {
    for (const v of VOICES) {
      expect(v.id).not.toMatch(/-V2-(Male|Female)$/);
    }
  });

  it("has no duplicate voice ids", () => {
    const ids = VOICES.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("surfaces every backend voice for the richest languages", () => {
    const countFor = (code: string) =>
      VOICES.filter((v) => v.language === code).length;
    expect(countFor("en-US")).toBe(17);
    expect(countFor("zh-CN")).toBe(8);
    expect(countFor("de-DE")).toBe(6);
    expect(countFor("fr-FR")).toBe(5);
    expect(countFor("en-GB")).toBe(5);
    expect(countFor("it-IT")).toBe(4);
  });

  it("labels multilingual voices readably", () => {
    const ava = VOICES.find((v) => v.id === "en-US-AvaMultilingualNeural-Female");
    expect(ava?.label).toBe("Ava Multilingual (US, Female)");
  });

  it("keeps every language covered by both genders where the backend offers them", () => {
    const enUs = VOICES.filter((v) => v.language === "en-US").map((v) => v.id);
    expect(enUs).toContain("en-US-JennyNeural-Female");
    expect(enUs).toContain("en-US-GuyNeural-Male");
  });
});

describe("voice region labels", () => {
  it("keeps the friendly UK label for en-GB instead of the raw locale", () => {
    const ryan = VOICES.find((v) => v.id === "en-GB-RyanNeural-Male");
    expect(ryan?.label).toBe("Ryan (UK, Male)");
  });
});
