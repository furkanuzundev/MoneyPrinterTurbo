// GA4 web stream measurement ID. Herkese açık bir değer (her sayfanın HTML'inde
// görünür), bu yüzden kodda sabit: web/.env.* dosyaları .gitignore ve
// .dockerignore dışında kaldığı için build-time env Docker build'e ulaşmaz.
// Boşken hiçbir analytics kodu yüklenmez. Kurulum: deploy/ANALYTICS.md.
const PRODUCTION_MEASUREMENT_ID = "G-CW5BEZD393";

const ENV_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";

/**
 * Env'den gelen ID yalnızca yerel doğrulama içindir: localhost'ta da yüklenir,
 * debug_mode açılır. Prod env'ine (/opt/reelate/.env.production) KOYMA:
 * NEXT_PUBLIC_* istemciye build'de gömülür, sunucu runtime'da okur; ikisi
 * ayrışabilir ve prod'da debug_mode açılır.
 */
export const GA_DEBUG = ENV_MEASUREMENT_ID !== "";

export const GA_MEASUREMENT_ID = ENV_MEASUREMENT_ID || PRODUCTION_MEASUREMENT_ID;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isTrackableHost(hostname: string, allowLocal: boolean): boolean {
  if (hostname.startsWith("admin.")) return false;
  if (LOCAL_HOSTS.has(hostname)) return allowLocal;
  return true;
}
