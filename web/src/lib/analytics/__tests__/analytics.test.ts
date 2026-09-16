import { describe, expect, it } from "vitest";
import { isTrackableHost } from "../config";
import { parseConsent, serializeConsent, gaCookieDomains } from "../consent";
import { sanitizeGaIds } from "../ga-ids";
import { isRecentSignup } from "../signup";

describe("isTrackableHost", () => {
  it("tracks the public site", () => {
    expect(isTrackableHost("reelate.org", false)).toBe(true);
    expect(isTrackableHost("www.reelate.org", false)).toBe(true);
  });
  it("never tracks the admin host", () => {
    expect(isTrackableHost("admin.reelate.org", false)).toBe(false);
    expect(isTrackableHost("admin.localhost", true)).toBe(false);
  });
  it("skips local hosts unless explicitly allowed", () => {
    expect(isTrackableHost("localhost", false)).toBe(false);
    expect(isTrackableHost("127.0.0.1", false)).toBe(false);
    expect(isTrackableHost("localhost", true)).toBe(true);
  });
});

describe("consent cookie", () => {
  it("parses a stored choice among other cookies", () => {
    expect(parseConsent("a=1; reelate_consent=granted; b=2")).toBe("granted");
    expect(parseConsent("reelate_consent=denied")).toBe("denied");
  });
  it("returns null when missing or garbage", () => {
    expect(parseConsent("")).toBeNull();
    expect(parseConsent("reelate_consent=maybe")).toBeNull();
    expect(parseConsent("xreelate_consent=granted")).toBeNull();
  });
  it("serializes a one-year lax cookie, secure on https", () => {
    const secure = serializeConsent("granted", true);
    expect(secure).toContain("reelate_consent=granted");
    expect(secure).toContain("Max-Age=31536000");
    expect(secure).toContain("SameSite=Lax");
    expect(secure).toContain("Path=/");
    expect(secure).toContain("Secure");
    expect(serializeConsent("denied", false)).not.toContain("Secure");
  });
  it("lists every domain a _ga cookie may have been set on", () => {
    expect(gaCookieDomains("www.reelate.org")).toEqual([
      "",
      "www.reelate.org",
      ".www.reelate.org",
      "reelate.org",
      ".reelate.org",
    ]);
    expect(gaCookieDomains("localhost")).toEqual(["", "localhost", ".localhost"]);
  });
});

describe("sanitizeGaIds", () => {
  it("keeps well-formed ids", () => {
    expect(
      sanitizeGaIds({ gaClientId: "123456789.1726480000", gaSessionId: "1726480000" }),
    ).toEqual({ clientId: "123456789.1726480000", sessionId: "1726480000" });
  });
  it("accepts a numeric session id", () => {
    expect(sanitizeGaIds({ gaClientId: "1.2", gaSessionId: 1726480000 })).toEqual({
      clientId: "1.2",
      sessionId: "1726480000",
    });
  });
  it("drops malformed or missing ids", () => {
    expect(sanitizeGaIds({ gaClientId: "x<script>", gaSessionId: "12a" })).toEqual({});
    expect(sanitizeGaIds({})).toEqual({});
    expect(sanitizeGaIds(null)).toEqual({});
    expect(sanitizeGaIds({ gaSessionId: "1726480000" })).toEqual({});
  });
});

describe("isRecentSignup", () => {
  const now = new Date("2026-09-16T12:00:00Z");
  it("is true within ten minutes of account creation", () => {
    expect(isRecentSignup(new Date("2026-09-16T11:55:00Z"), now)).toBe(true);
  });
  it("is false for older accounts or a missing date", () => {
    expect(isRecentSignup(new Date("2026-09-16T11:49:59Z"), now)).toBe(false);
    expect(isRecentSignup(undefined, now)).toBe(false);
  });
});
