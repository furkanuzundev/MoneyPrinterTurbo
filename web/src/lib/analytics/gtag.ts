import { GA_DEBUG, GA_MEASUREMENT_ID, isTrackableHost } from "./config";
import {
  type ConsentChoice,
  gaCookieDomains,
  parseConsent,
  serializeConsent,
} from "./consent";

type GtagWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  __reelateGa?: boolean;
  /** Onay beklerken tutulan hesap id'si; onay gelince GA'ya bağlanır. */
  __reelateUid?: string | null;
};

export type GaItem = {
  item_id: string;
  item_name: string;
  item_category: string;
  price: number;
  quantity: number;
};

/** Olay adları ve parametreleri tek yerde; spec §2 tablosuyla aynı. */
type EventParams = {
  cta_click: { cta_text: string; cta_href: string; page_path: string };
  sign_up: { method: "google" };
  video_generate: { aspect: string; target_seconds: number; voice: string };
  credits_insufficient: Record<string, never>;
  video_download: { location: "job_done" | "library" };
  video_rate: { rating: number; location: string };
  caption_rerender: Record<string, never>;
  begin_checkout: { currency: "USD"; value: number; items: GaItem[] };
};

function gaWindow(): GtagWindow | null {
  return typeof window === "undefined" ? null : (window as GtagWindow);
}

/**
 * dataLayer'ı kurar ve Consent Mode v2 varsayılanını (hepsi denied) HER ŞEYDEN
 * ÖNCE kuyruğa koyar. İdempotent; ilk track() çağrısı da buradan geçer, böylece
 * alt bileşen effect'leri root layout'taki <Analytics />'ten önce çalışsa bile
 * hiçbir olay onay varsayılanından önce kuyruğa girmez.
 */
export function initGtag(): boolean {
  const w = gaWindow();
  if (!w) return false;
  if (w.__reelateGa !== undefined) return w.__reelateGa;
  if (!GA_MEASUREMENT_ID || !isTrackableHost(w.location.hostname, GA_DEBUG)) {
    w.__reelateGa = false;
    return false;
  }
  w.dataLayer = w.dataLayer ?? [];
  w.gtag = function gtag() {
    // gtag.js Arguments nesnesi bekler; rest dizisi çalışmaz.
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments);
  };
  w.gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    wait_for_update: 500,
  });
  if (parseConsent(document.cookie) === "granted") {
    w.gtag("consent", "update", { analytics_storage: "granted" });
  }
  w.gtag("js", new Date());
  w.gtag("config", GA_MEASUREMENT_ID, GA_DEBUG ? { debug_mode: true } : {});
  w.__reelateGa = true;
  return true;
}

export function track<K extends keyof EventParams>(name: K, params: EventParams[K]) {
  if (!initGtag()) return;
  gaWindow()!.gtag!("event", name, params);
}

/**
 * user_id yalnızca analytics onayı varsa gönderilir: onaysız çerezsiz
 * ping'lere kalıcı hesap kimliği eklenmemeli (gizlilik metni bunu vaat ediyor).
 */
export function setUserId(userId: string) {
  if (!initGtag()) return;
  const w = gaWindow()!;
  w.__reelateUid = userId;
  if (getStoredConsent() === "granted") w.gtag!("set", { user_id: userId });
}

/** Dashboard'dan çıkınca (ör. sign-out sonrası landing) hesap kimliğini düşür. */
export function clearUserId() {
  const w = gaWindow();
  if (!w?.__reelateUid || !initGtag()) return;
  w.__reelateUid = null;
  w.gtag!("set", { user_id: null });
}

export function getStoredConsent(): ConsentChoice | null {
  return typeof document === "undefined" ? null : parseConsent(document.cookie);
}

export function setConsent(choice: ConsentChoice) {
  const w = gaWindow();
  if (!w) return;
  document.cookie = serializeConsent(choice, w.location.protocol === "https:");
  if (initGtag()) {
    w.gtag!("consent", "update", { analytics_storage: choice });
    if (w.__reelateUid) {
      w.gtag!("set", { user_id: choice === "granted" ? w.__reelateUid : null });
    }
  }
  if (choice === "denied") clearGaCookies(w.location.hostname);
}

function clearGaCookies(hostname: string) {
  const names = document.cookie
    .split(";")
    .map((part) => part.trim().split("=")[0])
    .filter((name) => name === "_ga" || name.startsWith("_ga_"));
  for (const name of names) {
    for (const domain of gaCookieDomains(hostname)) {
      document.cookie = `${name}=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ""}`;
    }
  }
}

function gtagGet(field: string, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), timeoutMs);
    gaWindow()!.gtag!("get", GA_MEASUREMENT_ID, field, (value: unknown) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

/**
 * Checkout'a eklenecek GA kimlikleri. Yalnızca onay verilmişse: onaysız
 * oturumda client_id kalıcı değildir ve server-side purchase'a bağlanmamalı.
 * gtag.js engellenmişse (adblock) callback gelmez -> zaman aşımıyla boş döner.
 */
export async function getGaIds(
  timeoutMs = 300,
): Promise<{ gaClientId?: string; gaSessionId?: string }> {
  if (!initGtag() || getStoredConsent() !== "granted") return {};
  const [clientId, sessionId] = await Promise.all([
    gtagGet("client_id", timeoutMs),
    gtagGet("session_id", timeoutMs),
  ]);
  if (typeof clientId !== "string" || !clientId) return {};
  return sessionId == null
    ? { gaClientId: clientId }
    : { gaClientId: clientId, gaSessionId: String(sessionId) };
}
