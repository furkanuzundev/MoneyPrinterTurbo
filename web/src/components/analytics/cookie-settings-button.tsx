"use client";

import { GA_MEASUREMENT_ID } from "@/lib/analytics/config";
import { OPEN_CONSENT_EVENT } from "@/lib/analytics/consent";

/** Onay banner'ını yeniden açar; kullanıcı kararını her an değiştirebilsin. */
export function CookieSettingsButton({ className }: { className?: string }) {
  // ID yokken banner hiç mount olmaz; dinleyicisiz ölü bir buton gösterme.
  if (!GA_MEASUREMENT_ID) return null;
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
