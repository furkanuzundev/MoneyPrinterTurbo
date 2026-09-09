export const DEFAULT_AFTER_SIGNIN = "/dashboard";

/**
 * middleware.ts korumalı bir sayfaya `?callbackUrl=…` ekleyerek /signin'e
 * yönlendiriyor, ama signin sayfası bunu okumuyordu ve giriş sonrası herkesi
 * /dashboard'a atıyordu.
 *
 * Yalnızca uygulama içi göreli yol kabul edilir: origin'i runtime'da
 * doğrulayamadığımız için mutlak URL'ler (kendi origin'imiz dahil) reddedilir
 * ve middleware göreli yol yazar. Böylece açık yönlendirme (open redirect)
 * mümkün olmaz.
 */
export function safeCallbackPath(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) return DEFAULT_AFTER_SIGNIN;

  // "//host" ve "/\host" tarayıcıda protokol-göreli sayılır.
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return DEFAULT_AFTER_SIGNIN;
  }

  // Giriş sonrası kullanıcıyı tekrar giriş sayfasına göndermek anlamsız.
  const pathname = raw.split(/[?#]/)[0];
  if (pathname === "/signin") return DEFAULT_AFTER_SIGNIN;

  return raw;
}
