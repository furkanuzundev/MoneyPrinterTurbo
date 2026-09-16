export type ConsentChoice = "granted" | "denied";

export const CONSENT_COOKIE = "reelate_consent";
/** Banner'ı yeniden açmak için (ör. "Cookie settings" linki) window'a dispatch edilir. */
export const OPEN_CONSENT_EVENT = "reelate:open-consent";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function parseConsent(cookieHeader: string): ConsentChoice | null {
  for (const part of cookieHeader.split(";")) {
    const [name, value] = part.trim().split("=");
    if (name === CONSENT_COOKIE && (value === "granted" || value === "denied")) {
      return value;
    }
  }
  return null;
}

export function serializeConsent(choice: ConsentChoice, secure: boolean): string {
  const attrs = [
    `${CONSENT_COOKIE}=${choice}`,
    "Path=/",
    `Max-Age=${ONE_YEAR_SECONDS}`,
    "SameSite=Lax",
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

/**
 * gtag _ga çerezlerini mümkün olan en üst alan adına yazar (www.reelate.org
 * için .reelate.org). Onay geri çekildiğinde silebilmek için her adayı dener;
 * "" = Domain özniteliği olmayan (host-only) çerez.
 */
export function gaCookieDomains(hostname: string): string[] {
  const domains = [""];
  const labels = hostname.split(".");
  for (let i = 0; i < Math.max(labels.length - 1, 1); i++) {
    const domain = labels.slice(i).join(".");
    domains.push(domain, `.${domain}`);
  }
  return domains;
}
