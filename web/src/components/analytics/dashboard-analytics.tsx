"use client";

import { useEffect } from "react";
import { setUserId, track } from "@/lib/analytics/gtag";

const SIGNUP_FLAG = "reelate_signup_tracked";

/** Dashboard'a girişte GA user_id'yi bağlar; yeni hesapsa sign_up'ı bir kez gönderir. */
export function DashboardAnalytics({
  userId,
  isNewUser,
}: {
  userId: string;
  isNewUser: boolean;
}) {
  useEffect(() => {
    setUserId(userId);
    if (!isNewUser) return;
    try {
      const key = `${SIGNUP_FLAG}:${userId}`;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      // Depolama kapalıysa (gizli mod vb.) yine de bir kez gönder.
    }
    track("sign_up", { method: "google" });
  }, [userId, isNewUser]);

  return null;
}
