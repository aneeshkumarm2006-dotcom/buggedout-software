import type { DefaultSession } from "next-auth";

import type { Role } from "@/lib/roles";

declare module "next-auth" {
  interface User {
    role: Role;
    permissions: string[];
    coinBalance: number;
    /** Set by `authorize()` from the login form; drives the token's lifetime. */
    rememberMe?: boolean;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      permissions: string[];
    } & DefaultSession["user"];
  }
}

// `next-auth/jwt` only re-exports `@auth/core/jwt`, so the JWT interface has to
// be augmented at its source module for the callbacks to see these fields.
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
    permissions: string[];
    /** Chosen at sign-in; `jwt.encode` reads it to pick the token lifetime. */
    rememberMe?: boolean;
  }
}
