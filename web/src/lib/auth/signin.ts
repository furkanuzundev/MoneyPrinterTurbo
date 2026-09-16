/**
 * /signin, Auth.js'in `?error=` parametresini hiç okumuyordu: hata olunca
 * kullanıcı hiçbir açıklama görmeden aynı forma geri düşüyordu.
 *
 * Prod'da görülen tek kod OAuthAccountNotLinked'di ve kaynağı
 * @auth/core/lib/actions/callback/handle-login.js:187 — "aktif oturum varken
 * başka bir kullanıcıya bağlı Google hesabıyla giriş". Bunun asıl çaresi
 * sayfanın girişli ziyaretçiyi hiç forma sokmaması; buradaki metin, oturumun
 * form gösterildikten sonra açıldığı yarış durumu için kalan güvenlik ağı.
 */
const GENERIC =
  "We could not complete sign-in. Please try again — if it keeps happening, contact support.";

export function signInErrorMessage(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;

  if (raw === "OAuthAccountNotLinked") {
    return "That Google account belongs to a different Reelate account, and you are already signed in with another one. Sign out first, then continue with the account you want.";
  }
  if (raw === "AccessDenied") {
    return "Google sign-in was cancelled or denied. Try again to continue.";
  }
  return GENERIC;
}
