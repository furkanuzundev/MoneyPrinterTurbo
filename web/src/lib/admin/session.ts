import { SignJWT, jwtVerify } from "jose";

export const ADMIN_COOKIE = "admin_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 gün

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(username: string): Promise<string> {
  return new SignJWT({ sub: username, scope: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySessionToken(
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload.scope === "admin";
  } catch {
    return false;
  }
}
