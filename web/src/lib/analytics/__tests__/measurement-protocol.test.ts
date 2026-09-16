import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPurchasePayload, sendPurchaseEvent } from "../measurement-protocol";

const purchase = {
  clientId: "123.456",
  sessionId: "1726480000",
  userId: "user-1",
  transactionId: "cs_test_1",
  amountTotalCents: 2090,
  amountTaxCents: 190,
  currency: "usd",
  packageKey: "creator",
  credits: 50,
};

describe("buildPurchasePayload", () => {
  it("builds a GA4 recommended purchase event", () => {
    expect(buildPurchasePayload(purchase)).toEqual({
      client_id: "123.456",
      user_id: "user-1",
      consent: { ad_user_data: "DENIED", ad_personalization: "DENIED" },
      events: [
        {
          name: "purchase",
          params: {
            transaction_id: "cs_test_1",
            currency: "USD",
            value: 19,
            tax: 1.9,
            session_id: 1726480000,
            engagement_time_msec: 1,
            items: [
              {
                item_id: "creator",
                item_name: "50 credits",
                item_category: "credits",
                price: 19,
                quantity: 1,
              },
            ],
          },
        },
      ],
    });
  });
  it("omits session_id when unknown", () => {
    const payload = buildPurchasePayload({ ...purchase, sessionId: undefined });
    expect("session_id" in payload.events[0].params).toBe(false);
  });
});

describe("sendPurchaseEvent", () => {
  afterEach(() => vi.restoreAllMocks());

  const config = { measurementId: "G-TEST123", apiSecret: "secret" };

  it("skips without an api secret or measurement id", async () => {
    const fetchMock = vi.fn();
    expect(
      await sendPurchaseEvent(purchase, { ...config, apiSecret: "", fetch: fetchMock }),
    ).toBe("skipped");
    expect(
      await sendPurchaseEvent(purchase, { ...config, measurementId: "", fetch: fetchMock }),
    ).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips when the buyer has no GA client id (no consent)", async () => {
    const fetchMock = vi.fn();
    expect(
      await sendPurchaseEvent({ ...purchase, clientId: undefined }, { ...config, fetch: fetchMock }),
    ).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the payload to the collect endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    expect(await sendPurchaseEvent(purchase, { ...config, fetch: fetchMock })).toBe("sent");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://www.google-analytics.com/mp/collect?measurement_id=G-TEST123&api_secret=secret",
    );
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(buildPurchasePayload(purchase));
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("never throws: network errors and non-2xx become 'failed'", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = vi.fn().mockRejectedValue(new Error("timeout"));
    expect(await sendPurchaseEvent(purchase, { ...config, fetch: boom })).toBe("failed");
    const bad = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    expect(await sendPurchaseEvent(purchase, { ...config, fetch: bad })).toBe("failed");
  });
});
