import { describe, expect, it } from "vitest";
import {
  buildScenesPrompt,
  buildScriptPrompt,
  buildTermsPrompt,
  parseTerms,
} from "../generate";

describe("buildScriptPrompt", () => {
  const prompt = buildScriptPrompt("morning habits", "en", 60);
  it("includes word target from 2.5 wps", () => {
    expect(prompt).toContain("150 words");
  });
  it("includes subject and language", () => {
    expect(prompt).toContain("morning habits");
    expect(prompt).toContain("English");
  });
  it("supports turkish", () => {
    expect(buildScriptPrompt("sabah", "tr", 30)).toContain("Turkish");
  });
});

describe("locale language coverage", () => {
  it("maps full locale codes to language names in scenes prompt", () => {
    expect(buildScenesPrompt("konu", "tr-TR", 60)).toContain("Language: Turkish");
    expect(buildScenesPrompt("konu", "tr-TR", 60)).not.toContain("Language: English");
  });
  it("maps several locales correctly", () => {
    expect(buildScenesPrompt("x", "es-ES", 60)).toContain("Spanish");
    expect(buildScenesPrompt("x", "ja-JP", 60)).toContain("Japanese");
    expect(buildScenesPrompt("x", "de-DE", 60)).toContain("German");
  });
  it("keeps legacy short codes working", () => {
    expect(buildScriptPrompt("x", "tr", 30)).toContain("Turkish");
    expect(buildScriptPrompt("x", "en", 30)).toContain("English");
  });
  it("falls back to English for unknown codes", () => {
    expect(buildScenesPrompt("x", "xx-YY", 60)).toContain("English");
  });
});

describe("buildTermsPrompt", () => {
  it("asks for a JSON array of English terms", () => {
    const p = buildTermsPrompt("morning habits", "some script");
    expect(p).toContain("JSON array");
    expect(p).toContain("morning habits");
  });
});

describe("parseTerms", () => {
  it("parses a json array", () => {
    expect(parseTerms('["a","b","c"]')).toEqual(["a", "b", "c"]);
  });
  it("parses fenced json", () => {
    expect(parseTerms('```json\n["a","b"]\n```')).toEqual(["a", "b"]);
  });
  it("falls back to line splitting", () => {
    expect(parseTerms("morning\ncoffee\nsunrise")).toEqual([
      "morning",
      "coffee",
      "sunrise",
    ]);
  });
  it("caps at five terms", () => {
    expect(parseTerms('["1","2","3","4","5","6","7"]')).toHaveLength(5);
  });
});
