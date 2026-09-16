import { GA_MEASUREMENT_ID } from "./config";

export type PurchaseInput = {
  clientId?: string;
  sessionId?: string;
  userId: string;
  transactionId: string;
  amountTotalCents: number;
  amountTaxCents: number;
  currency: string;
  packageKey: string;
  credits: number;
};

type SendConfig = {
  measurementId?: string;
  apiSecret?: string;
  fetch?: typeof fetch;
};

export type SendResult = "sent" | "skipped" | "failed";

const TIMEOUT_MS = 3000;

export function buildPurchasePayload(input: PurchaseInput) {
  // GA'da value vergisiz gelirdir; vergi ayrı `tax` parametresinde.
  const value = (input.amountTotalCents - input.amountTaxCents) / 100;
  const params: Record<string, unknown> = {
    transaction_id: input.transactionId,
    currency: input.currency.toUpperCase(),
    value,
    tax: input.amountTaxCents / 100,
  };
  if (input.sessionId) params.session_id = Number(input.sessionId);
  params.engagement_time_msec = 1;
  params.items = [
    {
      item_id: input.packageKey,
      item_name: `${input.credits} credits`,
      item_category: "credits",
      price: value,
      quantity: 1,
    },
  ];
  return {
    client_id: input.clientId,
    user_id: input.userId,
    // Reklam sinyalleri hiç kullanılmıyor (bkz. Consent Mode ayarı).
    consent: { ad_user_data: "DENIED", ad_personalization: "DENIED" },
    events: [{ name: "purchase", params }],
  };
}

/**
 * Stripe webhook'undan çağrılır. ASLA throw etmez: analytics hatası 500'e,
 * 500 de Stripe'ın retry döngüsüne dönüşmemeli. Onay vermeyen kullanıcının
 * client id'si yoktur -> gönderilmez (gerçek gelir zaten purchases tablosunda).
 */
export async function sendPurchaseEvent(
  input: PurchaseInput,
  config: SendConfig = {},
): Promise<SendResult> {
  const measurementId = config.measurementId ?? GA_MEASUREMENT_ID;
  const apiSecret = config.apiSecret ?? process.env.GA_API_SECRET ?? "";
  if (!measurementId || !apiSecret || !input.clientId) return "skipped";

  const doFetch = config.fetch ?? fetch;
  const url =
    "https://www.google-analytics.com/mp/collect" +
    `?measurement_id=${encodeURIComponent(measurementId)}` +
    `&api_secret=${encodeURIComponent(apiSecret)}`;
  try {
    const res = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPurchasePayload(input)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(
        `ga purchase event rejected (${res.status}) for ${input.transactionId}`,
      );
      return "failed";
    }
    return "sent";
  } catch (e) {
    console.error(`ga purchase event failed for ${input.transactionId}`, e);
    return "failed";
  }
}
