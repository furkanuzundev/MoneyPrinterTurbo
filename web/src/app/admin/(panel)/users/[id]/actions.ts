"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db } from "@/db";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/admin/session";
import {
  adminAdjustCredits,
  InsufficientCreditsError,
} from "@/lib/credits/ledger";

export type AdjustState = { error?: string; ok?: boolean };

export async function adjustCreditsAction(
  userId: string,
  _prev: AdjustState,
  formData: FormData,
): Promise<AdjustState> {
  // Server action'lar doğrudan çağrılabilir; cookie burada da doğrulanmak zorunda.
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!(await verifySessionToken(token))) return { error: "Yetkisiz." };

  const delta = Number(formData.get("delta"));
  const note = String(formData.get("note") ?? "");
  if (!Number.isInteger(delta) || delta === 0) {
    return { error: "Miktar sıfır olmayan bir tam sayı olmalı." };
  }
  try {
    await adminAdjustCredits(db, userId, delta, note);
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      return { error: "Bakiye eksiye düşemez." };
    }
    throw e;
  }
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}
