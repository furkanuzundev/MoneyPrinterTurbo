import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/admin/session";
import { decideAdminRoute, isAdminHost } from "@/lib/admin/routing";

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { pathname } = request.nextUrl;
  const adminHost = isAdminHost(host);
  const hasValidSession = adminHost
    ? await verifySessionToken(request.cookies.get(ADMIN_COOKIE)?.value)
    : false;

  const decision = decideAdminRoute(host, pathname, hasValidSession);
  if (decision.action === "redirect") {
    return NextResponse.redirect(new URL(decision.path, request.url));
  }
  if (decision.action === "rewrite") {
    const res = NextResponse.rewrite(new URL(decision.path, request.url));
    if (adminHost) res.headers.set("x-robots-tag", "noindex, nofollow");
    return res;
  }

  // Ana host, normal akış — mevcut /dashboard gating'i aynen korunur.
  // Database-session stratejisinde adapter'sız NextAuth örneği session çerezini
  // JWT sanıp JWTSessionError üretir (bilinen v5 tuzağı). Edge'de yalnızca
  // çerez VARLIĞI kontrol edilir; gerçek doğrulama sayfalarda auth() ile yapılır.
  if (pathname.startsWith("/dashboard")) {
    const hasSessionCookie =
      request.cookies.has("authjs.session-token") ||
      request.cookies.has("__Secure-authjs.session-token");
    if (!hasSessionCookie) {
      const url = new URL("/signin", request.url);
      url.searchParams.set("callbackUrl", request.nextUrl.href);
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  // Statik dosyalar ve Next iç yolları hariç her istek (admin host rewrite'ı
  // için genişletildi; eski matcher yalnızca /dashboard idi).
  matcher: ["/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)"],
};
