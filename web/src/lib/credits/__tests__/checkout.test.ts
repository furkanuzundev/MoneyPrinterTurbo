import { describe, expect, it } from "vitest";
import { buildCheckoutParams } from "../checkout";

const PKG = {
  key: "creator",
  credits: 50,
  amountCents: 1900,
  label: "Creator",
  featured: true,
};

describe("buildCheckoutParams", () => {
  const params = buildCheckoutParams(PKG, "user-1", "https://reelate.co", false);

  it("is a one-time payment with correct amount", () => {
    expect(params.mode).toBe("payment");
    expect(params.line_items).toEqual([
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: 1900,
          product_data: { name: "Creator — 50 credits" },
        },
      },
    ]);
  });
  it("never sets payment_method_types (dynamic payment methods)", () => {
    expect("payment_method_types" in params).toBe(false);
  });
  it("carries fulfillment metadata", () => {
    expect(params.metadata).toEqual({
      userId: "user-1",
      packageKey: "creator",
      credits: "50",
    });
  });
  it("sets redirect urls", () => {
    expect(params.success_url).toBe(
      "https://reelate.co/dashboard/buy/success?session_id={CHECKOUT_SESSION_ID}",
    );
    expect(params.cancel_url).toBe("https://reelate.co/dashboard/buy");
  });
  it("enables automatic tax only when flagged", () => {
    expect(params.automatic_tax).toBeUndefined();
    const taxed = buildCheckoutParams(PKG, "user-1", "https://reelate.co", true);
    expect(taxed.automatic_tax).toEqual({ enabled: true });
  });
});
