import { describe, expect, it } from "vitest";
import { decideAdminRoute, isAdminHost } from "../routing";

const HOST = "admin.reelate.org";

describe("isAdminHost", () => {
  it("matches prod and dev admin hosts", () => {
    expect(isAdminHost("admin.reelate.org")).toBe(true);
    expect(isAdminHost("ADMIN.REELATE.ORG")).toBe(true);
    expect(isAdminHost("admin.localhost:3000")).toBe(true);
    expect(isAdminHost("reelate.org")).toBe(false);
    expect(isAdminHost("www.reelate.org")).toBe(false);
  });
});

describe("decideAdminRoute — main host", () => {
  it("passes normal traffic through", () => {
    expect(decideAdminRoute("reelate.org", "/dashboard", false)).toEqual({ action: "next" });
    expect(decideAdminRoute("reelate.org", "/", false)).toEqual({ action: "next" });
  });
  it("hides /admin on the main host", () => {
    expect(decideAdminRoute("reelate.org", "/admin", false)).toEqual({ action: "rewrite", path: "/404" });
    expect(decideAdminRoute("reelate.org", "/admin/users", true)).toEqual({ action: "rewrite", path: "/404" });
  });
});

describe("decideAdminRoute — admin host", () => {
  it("redirects unauthenticated traffic to /login", () => {
    expect(decideAdminRoute(HOST, "/", false)).toEqual({ action: "redirect", path: "/login" });
    expect(decideAdminRoute(HOST, "/users", false)).toEqual({ action: "redirect", path: "/login" });
  });
  it("rewrites /login to the login page", () => {
    expect(decideAdminRoute(HOST, "/login", false)).toEqual({ action: "rewrite", path: "/admin/login" });
  });
  it("sends an already-authenticated /login visit home", () => {
    expect(decideAdminRoute(HOST, "/login", true)).toEqual({ action: "redirect", path: "/" });
  });
  it("rewrites authenticated paths under /admin", () => {
    expect(decideAdminRoute(HOST, "/", true)).toEqual({ action: "rewrite", path: "/admin" });
    expect(decideAdminRoute(HOST, "/users/abc", true)).toEqual({ action: "rewrite", path: "/admin/users/abc" });
    expect(decideAdminRoute(HOST, "/jobs", true)).toEqual({ action: "rewrite", path: "/admin/jobs" });
  });
  it("404s direct /admin, /api and /dashboard access on the admin host", () => {
    expect(decideAdminRoute(HOST, "/admin/users", true)).toEqual({ action: "rewrite", path: "/404" });
    expect(decideAdminRoute(HOST, "/api/jobs", true)).toEqual({ action: "rewrite", path: "/404" });
    expect(decideAdminRoute(HOST, "/dashboard", true)).toEqual({ action: "rewrite", path: "/404" });
  });
});
