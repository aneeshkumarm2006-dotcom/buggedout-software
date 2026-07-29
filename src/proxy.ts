import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/auth.config";
import { canAccessAdminPanel } from "@/lib/roles";

// Uses `authConfig` (not `@/auth`) so no Mongoose/bcrypt code is pulled into the proxy.
const { auth } = NextAuth(authConfig);

/** Reachable while signed out. Everything else redirects to /login. */
const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const isSignedIn = !!req.auth?.user;

  if (!isSignedIn) {
    if (isPublicPath(pathname)) return NextResponse.next();

    const loginUrl = new URL("/login", req.nextUrl);
    // `/` is the lobby, which is also where a fresh login lands — no need to round-trip it.
    if (pathname !== "/") {
      loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Signed in: the auth pages have nothing left to offer.
  if (isPublicPath(pathname)) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  if (pathname.startsWith("/admin") && !canAccessAdminPanel(req.auth?.user?.role)) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Everything except:
     * - api/auth (Auth.js handlers)
     * - api/cron (scheduled jobs — no session, guarded by CRON_SECRET instead)
     * - _next/static, _next/image (build output)
     * - metadata + static assets served from public/
     */
    "/((?!api/auth|api/cron|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|mp4|webm|woff|woff2|ttf)$).*)",
  ],
};
