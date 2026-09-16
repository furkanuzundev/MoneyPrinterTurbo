import { describe, expect, it } from "vitest";
import { DEFAULT_CAPTION_STYLE } from "../scenes";
import {
  SAVED_SETTINGS_KEY,
  clearSavedSettings,
  loadSavedSettings,
  parseSavedSettings,
  storeSettings,
  type SavedSettings,
} from "../saved-brief";

const VALID: SavedSettings = {
  language: "tr-TR",
  voice: "tr-TR-EmelNeural-Female",
  aspect: "16:9",
  targetSeconds: 90,
  captionStyle: { size: "lg", position: "top", textColor: "#FFFFFF", bgColor: "none" },
};

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const throwingStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceeded");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

describe("parseSavedSettings", () => {
  it("returns null when nothing is stored", () => {
    expect(parseSavedSettings(null)).toBeNull();
  });

  it("returns null for corrupt JSON", () => {
    expect(parseSavedSettings("{not json")).toBeNull();
  });

  it("round-trips a valid record", () => {
    expect(parseSavedSettings(JSON.stringify(VALID))).toEqual(VALID);
  });

  it("falls back to defaults for unknown language, aspect and duration", () => {
    const parsed = parseSavedSettings(
      JSON.stringify({ ...VALID, language: "xx-XX", aspect: "4:3", targetSeconds: 45 }),
    );
    expect(parsed?.language).toBe("en-US");
    expect(parsed?.aspect).toBe("9:16");
    expect(parsed?.targetSeconds).toBe(60);
  });

  it("picks the language's first voice when the saved voice does not match", () => {
    const parsed = parseSavedSettings(
      JSON.stringify({ ...VALID, voice: "en-US-AriaNeural-Female" }),
    );
    expect(parsed?.language).toBe("tr-TR");
    expect(parsed?.voice.startsWith("tr-TR-")).toBe(true);
  });

  it("sanitizes a broken caption style", () => {
    const parsed = parseSavedSettings(
      JSON.stringify({ ...VALID, captionStyle: { size: "huge" } }),
    );
    expect(parsed?.captionStyle).toEqual(DEFAULT_CAPTION_STYLE);
  });
});

describe("storage helpers", () => {
  it("stores and loads settings", () => {
    const s = memoryStorage();
    storeSettings(s, VALID);
    expect(s.data.has(SAVED_SETTINGS_KEY)).toBe(true);
    expect(loadSavedSettings(s)).toEqual(VALID);
  });

  it("does not persist the subject even if it is passed along", () => {
    const s = memoryStorage();
    storeSettings(s, { ...VALID, subject: "secret topic" } as SavedSettings);
    expect(s.data.get(SAVED_SETTINGS_KEY)).not.toContain("secret topic");
  });

  it("clears saved settings", () => {
    const s = memoryStorage({ [SAVED_SETTINGS_KEY]: JSON.stringify(VALID) });
    clearSavedSettings(s);
    expect(loadSavedSettings(s)).toBeNull();
  });

  it("swallows storage errors", () => {
    expect(loadSavedSettings(throwingStorage)).toBeNull();
    expect(() => storeSettings(throwingStorage, VALID)).not.toThrow();
    expect(() => clearSavedSettings(throwingStorage)).not.toThrow();
  });

  it("treats a missing storage as empty", () => {
    expect(loadSavedSettings(undefined)).toBeNull();
    expect(() => storeSettings(undefined, VALID)).not.toThrow();
  });
});
