"use client";

import { OPEN_CONSENT_EVENT } from "@/lib/analytics/consent";

/** Onay banner'ını yeniden açar; kullanıcı kararını her an değiştirebilsin. */
export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}
      className={className}
    >
      Cookie settings
    </button>
  );
}
