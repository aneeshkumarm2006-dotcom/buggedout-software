import type { NextAuthConfig } from "next-auth";
import { encode as encodeJwt } from "next-auth/jwt";

/**
 * Config shared between the full Auth.js instance (`src/auth.ts`) and the proxy
 * (`src/proxy.ts`). It must stay free of Mongoose/bcrypt imports so the proxy
 * bundle only carries JWT verification.
 *
 * The credentials provider lives in `src/auth.ts` (Phase 3).
 */

/** "Remember me" ticked — the session survives closing the browser for a month. */
export const REMEMBERED_SESSION_MAX_AGE = 30 * 24 * 60 * 60;

/** Not ticked: a working day, refreshed on each request while the user is active. */
export const SESSION_MAX_AGE = 12 * 60 * 60;

export const authConfig = {
  session: {
    strategy: "jwt",
    // Cookie lifetime. How long the session is actually *valid* comes from the
    // token's own expiry (see `jwt.encode`), which is what makes "remember me"
    // work — Auth.js has no per-sign-in cookie lifetime.
    maxAge: REMEMBERED_SESSION_MAX_AGE,
    // Re-issue the token at most hourly, so a 12h session keeps rolling forward
    // while it is being used instead of dying mid-visit.
    updateAge: 60 * 60,
  },
  jwt: {
    /**
     * Auth.js derives the token's `exp` from `maxAge` and ignores anything the
     * callbacks put on `token.exp`, so the remember-me choice is applied here —
     * it rides along on the token as a flag set by the `jwt` callback below.
     */
    encode(params) {
      return encodeJwt({
        ...params,
        maxAge: params.token?.rememberMe ? REMEMBERED_SESSION_MAX_AGE : SESSION_MAX_AGE,
      });
    },
  },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
        token.permissions = user.permissions ?? [];
        // `authorize()` copies the checkbox onto the user it returns — the raw
        // credentials never reach this callback.
        token.rememberMe = user.rememberMe ?? false;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.permissions = token.permissions ?? [];
      return session;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
