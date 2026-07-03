import { describe, expect, it } from "vitest";
import { buildScriptPrompt, buildTermsPrompt, parseTerms } from "../generate";

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
