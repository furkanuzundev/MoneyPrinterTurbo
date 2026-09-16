import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { packageCta, primaryCta, signInCta } from "../cta";

describe("primaryCta", () => {
  it("sends an anonymous visitor to sign-up", () => {
    expect(primaryCta(false)).toEqual({
      href: "/signin?mode=signup",
      label: "Start free",
    });
  });

  it("keeps the section-specific wording for anonymous visitors", () => {
    expect(primaryCta(false, "Start free — 5 credits on us").label).toBe(
      "Start free — 5 credits on us",
    );
  });

  it("sends a signed-in visitor to the dashboard, never to sign-in", () => {
    // Kök neden: girişli kullanıcı Google hesap seçicisine gidiyor, farklı bir
    // hesap seçince Auth.js OAuthAccountNotLinked fırlatıyordu.
    const cta = primaryCta(true, "Start free — 5 credits on us");
    expect(cta).toEqual({ href: "/dashboard", label: "Go to dashboard" });
    expect(cta.href).not.toContain("signin");
  });
});

describe("signInCta", () => {
  it("is shown only when there is no session", () => {
    expect(signInCta(false)).toEqual({ href: "/signin", label: "Sign in" });
    expect(signInCta(true)).toBeNull();
  });
});

describe("packageCta", () => {
  it("routes an anonymous buyer through sign-up", () => {
    expect(packageCta(false, "Pro")).toEqual({
      href: "/signin?mode=signup",
      label: "Get Pro",
    });
  });

  it("routes a signed-in buyer straight to checkout", () => {
    expect(packageCta(true, "Pro")).toEqual({
      href: "/dashboard/buy",
      label: "Get Pro",
    });
  });
});

describe("landing surfaces use the session-aware CTAs", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("resolves the session once on the landing page", () => {
    const page = read("src/app/page.tsx");
    expect(page).toMatch(/await auth\(\)/);
    expect(page).toContain("signedIn={signedIn}");
  });

  for (const file of [
    "src/components/landing/header.tsx",
    "src/components/landing/mobile-nav.tsx",
    "src/components/landing/hero.tsx",
    "src/components/landing/final-cta.tsx",
    "src/components/landing/pricing.tsx",
  ]) {
    it(`${file} has no unconditional /signin link`, () => {
      const source = read(file);
      expect(source).toContain("@/lib/auth/cta");
      expect(source).not.toMatch(/href="\/signin/);
    });
  }
});
