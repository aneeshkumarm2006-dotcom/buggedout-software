import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/auth.config";
import { connectDB } from "@/lib/db";
import { burnPasswordComparison, verifyPassword } from "@/lib/password";
import { User, type IUser } from "@/models";
import { loginSchema } from "@/schemas";

/**
 * Full Auth.js instance — safe to import from server components, route handlers
 * and server actions (but NOT from `src/proxy.ts`, which uses `authConfig`).
 */

/**
 * Auth.js puts `code` in the sign-in error, so it must never say more than the
 * caller is allowed to know. "Wrong password" and "no such account" share one
 * code on purpose; only a ban is called out, because the user can't fix it by
 * retrying.
 */
export class InvalidCredentialsError extends CredentialsSignin {
  code = "invalid_credentials";
}

export class AccountBannedError extends CredentialsSignin {
  code = "account_banned";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        identifier: { label: "Email or username", type: "text" },
        password: { label: "Password", type: "password" },
        rememberMe: { label: "Remember me", type: "checkbox" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) throw new InvalidCredentialsError();

        const { identifier, password, rememberMe } = parsed.data;

        await connectDB();

        // One field, two possible meanings — an "@" is the only thing that can
        // tell an email from a username, since usernames can't contain one.
        const query = identifier.includes("@")
          ? { email: identifier.toLowerCase() }
          : { username: identifier };

        const user = await User.findOne(query)
          .select("+passwordHash email username avatar role permissions coinBalance status")
          .lean<IUser>();

        if (!user) {
          // Hash anyway: without this, "unknown account" would answer in a
          // fraction of the time a real password check takes, which is enough
          // to enumerate who has an account here.
          await burnPasswordComparison(password);
          throw new InvalidCredentialsError();
        }

        const passwordMatches = await verifyPassword(password, user.passwordHash);
        if (!passwordMatches) throw new InvalidCredentialsError();

        if (user.status === "banned") throw new AccountBannedError();

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.username,
          image: user.avatar,
          role: user.role,
          permissions: user.permissions,
          coinBalance: user.coinBalance,
          rememberMe,
        };
      },
    }),
  ],
});
