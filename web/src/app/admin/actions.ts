"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyPassword } from "@/lib/admin/password";
import {
  ADMIN_COOKIE,
  createSessionToken,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/admin/session";

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;
  const ok =
    !!expectedUser &&
    !!expectedHash &&
    username === expectedUser &&
    (await verifyPassword(password, expectedHash));
  if (!ok) {
    // Basit brute-force yavaşlatması.
    await new Promise((r) => setTimeout(r, 1000));
    return { error: "Kullanıcı adı veya şifre hatalı." };
  }
  const token = await createSessionToken(username);
  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/login");
}
