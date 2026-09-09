import { describe, expect, it } from "vitest";
import {
  CREDITS_FREE_NOTE,
  CREDITS_REFUND_NOTE,
  CREDITS_RETRY_NOTE,
  CREDITS_TAGLINE,
  CREDIT_COST_ROWS,
  WELCOME_NOTE,
  formatCreditsForPack,
  perVideoCents,
} from "../copy";
import {
  DURATION_TIERS,
  WELCOME_BONUS_CREDITS,
  creditsForDuration,
} from "../pricing";

describe("CREDIT_COST_ROWS", () => {
  it("is derived from DURATION_TIERS so it cannot drift from billing", () => {
    expect(CREDIT_COST_ROWS).toHaveLength(DURATION_TIERS.length);
    CREDIT_COST_ROWS.forEach((row, i) => {
      expect(row.seconds).toBe(DURATION_TIERS[i].seconds);
      expect(row.credits).toBe(DURATION_TIERS[i].credits);
      expect(row.credits).toBe(creditsForDuration(row.seconds));
    });
  });

  it("labels each tier with the shared duration format", () => {
    expect(CREDIT_COST_ROWS.map((r) => r.label)).toEqual([
      "30s",
      "60s",
      "90s",
      "3 min",
    ]);
  });

  it("pluralises the credit label", () => {
    expect(CREDIT_COST_ROWS[0].creditsLabel).toBe("1 credit");
    expect(CREDIT_COST_ROWS[1].creditsLabel).toBe("2 credits");
  });
});

describe("copy strings", () => {
  it("states the real per-30s rate, not one-credit-one-video", () => {
    expect(CREDITS_TAGLINE).toContain("1 credit per 30 seconds");
    expect(CREDITS_TAGLINE).not.toContain("one short video");
  });

  it("derives the welcome note from the actual bonus", () => {
    expect(WELCOME_NOTE).toContain(String(WELCOME_BONUS_CREDITS));
    // 5 credits at the 60s default (2 credits) is two videos, not five.
    expect(WELCOME_NOTE).toContain("two 60-second videos");
  });

  it("promises refunds and names what is free", () => {
    expect(CREDITS_REFUND_NOTE).toMatch(/refund|returned/i);
    expect(CREDITS_FREE_NOTE).toMatch(/free/i);
    expect(CREDITS_RETRY_NOTE).toMatch(/new video/i);
  });
});

describe("formatCreditsForPack", () => {
  it("counts videos at the 60s default rather than assuming 1:1", () => {
    expect(formatCreditsForPack(50)).toBe("50 credits · 25 × 60s videos");
    expect(formatCreditsForPack(10)).toBe("10 credits · 5 × 60s videos");
  });

  it("floors partial videos", () => {
    expect(formatCreditsForPack(5)).toBe("5 credits · 2 × 60s videos");
  });

  it("handles a single video without pluralising", () => {
    expect(formatCreditsForPack(2)).toBe("2 credits · 1 × 60s video");
  });
});

describe("perVideoCents", () => {
  it("prices a 60s video, not a single credit", () => {
    // Creator pack: $19 / 50 credits = 38c per credit = 76c per 60s video.
    expect(perVideoCents(1900, 50)).toBe(76);
  });
});
