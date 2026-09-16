"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { GA_MEASUREMENT_ID } from "@/lib/analytics/config";
import { initGtag, track } from "@/lib/analytics/gtag";
import { ConsentBanner } from "./consent-banner";

/**
 * GA4 + Consent Mode v2. Hostname yalnızca tarayıcıda bilinir (admin host aynı
 * uygulamadan rewrite ile servis ediliyor), bu yüzden karar mount'ta verilir.
 * Sayfa geçişlerindeki page_view'ları GA4 enhanced measurement (history
 * değişiklikleri) otomatik gönderir.
 */
export function Analytics() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(initGtag());
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // Kayıt/giriş CTA'ları sayfalara dağınık; tek delege dinleyiciyle ölçülür.
    function onClick(event: MouseEvent) {
      const link = (event.target as Element | null)?.closest?.("a[href^='/signin']");
      if (!link) return;
      track("cta_click", {
        cta_text: (link.textContent ?? "").trim().slice(0, 100),
        cta_href: link.getAttribute("href") ?? "",
        page_path: window.location.pathname,
      });
    }
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [enabled]);

  if (!enabled) return null;
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <ConsentBanner />
    </>
  );
}
