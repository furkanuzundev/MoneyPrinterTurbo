import { beforeAll, describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken, ADMIN_COOKIE } from "../session";

beforeAll(() => {
  process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-for-vitest";
});

describe("admin session token", () => {
  it("round-trips a valid token", async () => {
    const token = await createSessionToken("admin");
    expect(await verifySessionToken(token)).toBe(true);
  });
  it("rejects undefined and garbage tokens", async () => {
    expect(await verifySessionToken(undefined)).toBe(false);
    expect(await verifySessionToken("not.a.jwt")).toBe(false);
  });
  it("rejects a tampered token", async () => {
    const token = await createSessionToken("admin");
    expect(await verifySessionToken(token.slice(0, -2) + "xx")).toBe(false);
  });
  it("exports the cookie name", () => {
    expect(ADMIN_COOKIE).toBe("admin_session");
  });
});
