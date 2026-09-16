import { describe, expect, it } from "vitest";
import { COMMENT_MAX, isPositive, parseFeedbackInput } from "../rating";

describe("parseFeedbackInput", () => {
  it("accepts a bare star rating with defaults", () => {
    expect(parseFeedbackInput({ rating: 4, source: "library" })).toEqual({
      ok: true,
      value: { rating: 4, tags: [], comment: null, source: "library" },
    });
  });

  it.each([0, 6, 3.5, "5", null, undefined])("rejects rating %s", (rating) => {
    expect(parseFeedbackInput({ rating, source: "library" }).ok).toBe(false);
  });

  it("rejects an unknown source", () => {
    expect(parseFeedbackInput({ rating: 3, source: "email" }).ok).toBe(false);
  });

  it("rejects a non-object body", () => {
    expect(parseFeedbackInput(null).ok).toBe(false);
    expect(parseFeedbackInput("5").ok).toBe(false);
  });

  it("keeps only known, unique reason tags for low ratings", () => {
    const result = parseFeedbackInput({
      rating: 2,
      source: "done_screen",
      tags: ["voice", "bogus", "voice", 7, "captions"],
    });
    expect(result.ok && result.value.tags).toEqual(["voice", "captions"]);
  });

  it("drops reason tags for positive ratings", () => {
    const result = parseFeedbackInput({
      rating: 4,
      source: "done_screen",
      tags: ["voice"],
    });
    expect(result.ok && result.value.tags).toEqual([]);
  });

  it("trims the comment, stores blanks as null and caps the length", () => {
    const blank = parseFeedbackInput({ rating: 5, source: "library", comment: "   " });
    expect(blank.ok && blank.value.comment).toBeNull();

    const padded = parseFeedbackInput({ rating: 5, source: "library", comment: "  great  " });
    expect(padded.ok && padded.value.comment).toBe("great");

    const long = parseFeedbackInput({
      rating: 1,
      source: "library",
      comment: "x".repeat(COMMENT_MAX + 50),
    });
    expect(long.ok && long.value.comment).toHaveLength(COMMENT_MAX);
  });

  it("ignores a non-string comment", () => {
    const result = parseFeedbackInput({ rating: 3, source: "library", comment: 42 });
    expect(result.ok && result.value.comment).toBeNull();
  });
});

describe("isPositive", () => {
  it("treats 4 and 5 stars as positive", () => {
    expect([1, 2, 3, 4, 5].map(isPositive)).toEqual([false, false, false, true, true]);
  });
});
