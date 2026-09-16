import { describe, expect, it } from "vitest";
import { badgeFor } from "../display";

describe("badgeFor", () => {
  it("labels a finished video", () => {
    expect(badgeFor("ready", 100).label).toBe("Ready");
  });
  it("labels a failed video", () => {
    expect(badgeFor("failed", 0).label).toBe("Failed");
  });
  it("shows the live percentage while rendering", () => {
    expect(badgeFor("processing", 42).label).toBe("42%");
    expect(badgeFor("processing", 99).label).toBe("99%");
  });
  it("says Queued before the worker picks the job up", () => {
    expect(badgeFor("processing", 0).label).toBe("Queued");
  });
  it("treats a missing progress reading as queued", () => {
    expect(badgeFor("processing", undefined).label).toBe("Queued");
  });
  it("clamps out-of-range progress", () => {
    expect(badgeFor("processing", 140).label).toBe("100%");
    expect(badgeFor("processing", -5).label).toBe("Queued");
  });
  it("gives each state its own styling", () => {
    const classes = [
      badgeFor("ready", 100).cls,
      badgeFor("processing", 10).cls,
      badgeFor("failed", 0).cls,
    ];
    expect(new Set(classes).size).toBe(3);
  });
});
