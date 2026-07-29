import "server-only";

import { compare, hash } from "bcryptjs";

/**
 * Password hashing. bcryptjs is pure JS (no native build step), so it runs on
 * Vercel's Node runtime unchanged — but it is deliberately slow, which is why
 * nothing that touches it may run in the proxy/edge bundle.
 */

/** ~250ms per hash on a typical serverless CPU — slow enough to matter, fast enough to log in. */
const BCRYPT_COST = 12;

/** bcrypt only reads the first 72 bytes of input; `passwordSchema` caps signup input to match. */
export function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_COST);
}

/**
 * Constant-time-ish compare via bcrypt. A missing hash still burns the same
 * work as a real one (see `verifyPasswordAgainstDummy`) so that response timing
 * doesn't leak whether an account exists.
 */
export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}

/**
 * A valid bcrypt hash of a value nobody can supply. Login compares against this
 * when the identifier matches no user, so "unknown user" and "wrong password"
 * take the same amount of time.
 */
const DUMMY_HASH = "$2b$12$klKojGQ.z8/wg3eRN7uc0.jtn5VZsImCVpkPjKwmL7JQbq1/LDmle";

export async function burnPasswordComparison(password: string): Promise<void> {
  await compare(password, DUMMY_HASH);
}
