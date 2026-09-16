import { describe, expect, it } from "vitest";
import { followUpFor, STAR_LABELS, toggleTag } from "../rating-ui";

describe("followUpFor", () => {
  it("asks what fell short for 1–3 stars", () => {
    for (const r of [1, 2, 3]) {
      const f = followUpFor(r);
      expect(f.showTags).toBe(true);
      expect(f.question).toBe("What fell short?");
    }
  });

  it("only offers an optional comment for 4–5 stars", () => {
    for (const r of [4, 5]) {
      const f = followUpFor(r);
      expect(f.showTags).toBe(false);
      expect(f.question).toBe("What did you like most?");
    }
  });
});

describe("STAR_LABELS", () => {
  it("has a label for every star", () => {
    expect(Object.keys(STAR_LABELS)).toEqual(["1", "2", "3", "4", "5"]);
  });
});

describe("toggleTag", () => {
  it("adds a missing tag and removes a present one", () => {
    expect(toggleTag(["voice"], "captions")).toEqual(["voice", "captions"]);
    expect(toggleTag(["voice", "captions"], "voice")).toEqual(["captions"]);
  });
});
