import { scryptSync, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyPassword } from "../password";

function makeHash(pw: string): string {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString("hex")}:${scryptSync(pw, salt, 64).toString("hex")}`;
}

describe("verifyPassword", () => {
  it("accepts the correct password", async () => {
    expect(await verifyPassword("hunter2!", makeHash("hunter2!"))).toBe(true);
  });
  it("rejects a wrong password", async () => {
    expect(await verifyPassword("wrong", makeHash("hunter2!"))).toBe(false);
  });
  it("rejects malformed stored values", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "bcrypt:aa:bb")).toBe(false);
    expect(await verifyPassword("x", "")).toBe(false);
  });
});
