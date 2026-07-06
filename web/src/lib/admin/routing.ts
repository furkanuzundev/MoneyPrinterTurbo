const ADMIN_HOSTS = new Set([
  "admin.reelate.org",
  "admin.localhost",
  "admin.localhost:3000",
]);

export type RouteDecision =
  | { action: "next" }
  | { action: "rewrite"; path: string }
  | { action: "redirect"; path: string };

export function isAdminHost(host: string): boolean {
  return ADMIN_HOSTS.has(host.toLowerCase());
}

export function decideAdminRoute(
  host: string,
  pathname: string,
  hasValidSession: boolean,
): RouteDecision {
  if (!isAdminHost(host)) {
    // Panel yalnızca subdomain'den erişilir; ana domainde /admin görünmez.
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      return { action: "rewrite", path: "/404" };
    }
    return { action: "next" };
  }
  // Admin host'ta iç route'lara/ana ürün route'larına doğrudan erişim yok.
  if (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/dashboard")
  ) {
    return { action: "rewrite", path: "/404" };
  }
  if (pathname === "/login") {
    return hasValidSession
      ? { action: "redirect", path: "/" }
      : { action: "rewrite", path: "/admin/login" };
  }
  if (!hasValidSession) return { action: "redirect", path: "/login" };
  return {
    action: "rewrite",
    path: pathname === "/" ? "/admin" : `/admin${pathname}`,
  };
}
