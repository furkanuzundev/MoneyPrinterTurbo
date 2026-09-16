"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OPEN_CONSENT_EVENT } from "@/lib/analytics/consent";
import { getStoredConsent, setConsent } from "@/lib/analytics/gtag";
import type { ConsentChoice } from "@/lib/analytics/consent";

// Reddetmek kabul etmek kadar kolay: iki buton eş boyutta, aynı satırda.
export function ConsentBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(getStoredConsent() === null);
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
  }, []);

  if (!open) return null;

  function choose(choice: ConsentChoice) {
    setConsent(choice);
    setOpen(false);
  }

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-4 bottom-4 z-[70] rounded-2xl border border-white/10 bg-panel p-5 text-bone shadow-[0_24px_60px_rgba(0,0,0,0.55)] sm:left-6 sm:right-auto sm:max-w-[400px]"
    >
      <p className="mb-1.5 text-[15px] font-bold">Cookies</p>
      <p className="mb-4 text-[13.5px] leading-relaxed text-muted">
        We&apos;d like to use Google Analytics cookies to understand how people use
        Reelate and make it better. No ads, no selling data. See our{" "}
        <Link href="/privacy" className="underline hover:text-bone">
          Privacy Policy
        </Link>
        .
      </p>
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={() => choose("denied")}
          className="flex-1 rounded-[11px] border border-white/15 px-4 py-2.5 text-sm font-bold text-bone transition-colors hover:border-white/30"
        >
          Reject
        </button>
        <button
          type="button"
          onClick={() => choose("granted")}
          className="flex-1 rounded-[11px] bg-caption px-4 py-2.5 text-sm font-bold text-caption-ink transition-opacity hover:opacity-90"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
