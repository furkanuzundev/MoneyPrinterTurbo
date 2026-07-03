import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Database-session stratejisinde adapter'sız NextAuth örneği session çerezini
// JWT sanıp JWTSessionError üretir (bilinen v5 tuzağı). Edge'de yalnızca
// çerez VARLIĞI kontrol edilir; gerçek doğrulama sayfalarda auth() ile yapılır
// (dashboard layout + tüm API route'ları zaten auth() çağırıyor).
export function middleware(request: NextRequest) {
  const hasSessionCookie =
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token");
  if (!hasSessionCookie) {
    const url = new URL("/signin", request.url);
    url.searchParams.set("callbackUrl", request.nextUrl.href);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
