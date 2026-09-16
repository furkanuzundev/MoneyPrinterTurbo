/** Tarayıcıdaki GA oturumu; server-side purchase'ı aynı kullanıcı/oturuma bağlar. */
export type GaIds = { clientId?: string; sessionId?: string };

const CLIENT_ID = /^\d{1,20}\.\d{1,20}$/;
const SESSION_ID = /^\d{1,20}$/;

/** İstemciden gelen ham değerleri doğrular; bozuk olan sessizce atılır. */
export function sanitizeGaIds(input: unknown): GaIds {
  if (!input || typeof input !== "object") return {};
  const { gaClientId, gaSessionId } = input as Record<string, unknown>;
  const clientId = typeof gaClientId === "string" ? gaClientId : "";
  if (!CLIENT_ID.test(clientId)) return {};
  const sessionId =
    typeof gaSessionId === "string" || typeof gaSessionId === "number"
      ? String(gaSessionId)
      : "";
  return SESSION_ID.test(sessionId) ? { clientId, sessionId } : { clientId };
}
