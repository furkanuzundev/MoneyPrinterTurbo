import { describe, expect, it } from "vitest";
import {
  creditsForDuration,
  estimateDurationSeconds,
  DURATION_TIERS,
  WELCOME_BONUS_CREDITS,
} from "../pricing";

describe("creditsForDuration", () => {
  it("maps tier boundaries", () => {
    expect(creditsForDuration(30)).toBe(1);
    expect(creditsForDuration(60)).toBe(2);
    expect(creditsForDuration(90)).toBe(3);
    expect(creditsForDuration(180)).toBe(6);
  });
  it("rounds up between tiers", () => {
    expect(creditsForDuration(31)).toBe(2); // 30'u aştı -> 60 kademesi
    expect(creditsForDuration(61)).toBe(3);
    expect(creditsForDuration(91)).toBe(6); // 90'ı aştı -> 180 kademesi
  });
  it("handles beyond the largest tier", () => {
    expect(creditsForDuration(181)).toBe(7); // ceil(181/30)
    expect(creditsForDuration(240)).toBe(8);
  });
  it("minimum one credit for any positive duration", () => {
    expect(creditsForDuration(5)).toBe(1);
  });
});

describe("estimateDurationSeconds", () => {
  it("uses 2.5 words per second", () => {
    const words = Array(150).fill("word").join(" ");
    expect(estimateDurationSeconds(words)).toBe(60);
  });
  it("rounds up", () => {
    const words = Array(151).fill("word").join(" ");
    expect(estimateDurationSeconds(words)).toBe(61);
  });
  it("returns 0 for empty script", () => {
    expect(estimateDurationSeconds("")).toBe(0);
    expect(estimateDurationSeconds("   ")).toBe(0);
  });
});

describe("constants", () => {
  it("welcome bonus is 2", () => {
    expect(WELCOME_BONUS_CREDITS).toBe(2);
  });
  it("tiers match spec", () => {
    expect(DURATION_TIERS).toEqual([
      { seconds: 30, credits: 1 },
      { seconds: 60, credits: 2 },
      { seconds: 90, credits: 3 },
      { seconds: 180, credits: 6 },
    ]);
  });
});
