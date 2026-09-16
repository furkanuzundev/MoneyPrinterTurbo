import { describe, expect, it } from "vitest";
import { buildSubjectPrompt, sanitizeSubject } from "../subject";

describe("buildSubjectPrompt", () => {
  const prompt = buildSubjectPrompt("morning habits", "en-US", 60);
  it("carries the raw idea and the target language", () => {
    expect(prompt).toContain("morning habits");
    expect(prompt).toContain("English");
  });
  it("writes the topic in the selected brief language", () => {
    const tr = buildSubjectPrompt("sabah rutini", "tr-TR", 60);
    expect(tr).toContain("Turkish");
    expect(tr).not.toContain("Language: English");
  });
  it("falls back to English for unknown locales", () => {
    expect(buildSubjectPrompt("x", "xx-YY", 60)).toContain("English");
  });
  it("scopes the topic to the chosen duration", () => {
    expect(buildSubjectPrompt("x", "en-US", 30)).toContain("30-second");
    expect(buildSubjectPrompt("x", "en-US", 180)).toContain("180-second");
  });
  it("bans decorations the pipeline cannot use", () => {
    expect(prompt).toMatch(/no emojis/i);
    expect(prompt).toMatch(/hashtags/i);
    expect(prompt).toMatch(/straight ASCII punctuation/i);
  });
});

describe("sanitizeSubject", () => {
  const fallback = "raw idea";
  it("strips code fences and surrounding quotes", () => {
    expect(sanitizeSubject('```\n"Three morning habits"\n```', fallback)).toBe(
      "Three morning habits",
    );
  });
  it("collapses newlines and repeated whitespace into one line", () => {
    expect(sanitizeSubject("Three morning\n\nhabits   that   stuck", fallback)).toBe(
      "Three morning habits that stuck",
    );
  });
  it("keeps quotes that are part of the sentence", () => {
    expect(sanitizeSubject('Why we say "no" more often', fallback)).toBe(
      'Why we say "no" more often',
    );
  });
  it("caps the result at the 300-char subject limit", () => {
    const long = "a".repeat(400);
    expect(sanitizeSubject(long, fallback)).toHaveLength(300);
  });
  it("falls back to the raw input when the model returns nothing usable", () => {
    expect(sanitizeSubject("   ", fallback)).toBe(fallback);
    expect(sanitizeSubject('```json\n```', fallback)).toBe(fallback);
  });
});
