/**
 * Landing yüzeyleri oturum durumuna bakmadan herkese "Sign in / Start free"
 * gösteriyordu. Girişli bir kullanıcı bunlara tıklayınca Google hesap
 * seçicisine düşüyor ve orada BAŞKA bir hesap seçerse Auth.js
 * OAuthAccountNotLinked fırlatıyordu (@auth/core .../handle-login.js:187,
 * prod'da görülen hata). CTA'ların hedefi artık oturumla birlikte belirleniyor.
 */
export type Cta = { href: string; label: string };

export function primaryCta(signedIn: boolean, anonLabel = "Start free"): Cta {
  return signedIn
    ? { href: "/dashboard", label: "Go to dashboard" }
    : { href: "/signin?mode=signup", label: anonLabel };
}

export function signInCta(signedIn: boolean): Cta | null {
  return signedIn ? null : { href: "/signin", label: "Sign in" };
}

export function packageCta(signedIn: boolean, packageLabel: string): Cta {
  return {
    href: signedIn ? "/dashboard/buy" : "/signin?mode=signup",
    label: `Get ${packageLabel}`,
  };
}
