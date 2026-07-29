import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Types } from "mongoose";

import { connectDB } from "@/lib/db";
import { PasswordResetToken, type IPasswordResetToken } from "@/models";

/**
 * Password-reset tokens (Phase 3.2). The raw token only ever exists in the
 * emailed link; the database holds its SHA-256 hash. SHA-256 is the right tool
 * here rather than bcrypt — the token is 256 bits of entropy, so there is
 * nothing to brute-force, and the lookup has to be an indexed equality match.
 */
const TOKEN_BYTES = 32;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Issues a fresh token and drops any earlier ones for the account, so only the
 * most recent email works.
 */
export async function createPasswordResetToken(
  userId: Types.ObjectId | string,
): Promise<{ token: string; expiresAt: Date }> {
  await connectDB();

  const id = typeof userId === "string" ? new Types.ObjectId(userId) : userId;

  await PasswordResetToken.deleteMany({ userId: id });

  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

  await PasswordResetToken.create({
    userId: id,
    tokenHash: hashResetToken(token),
    expiresAt,
  });

  return { token, expiresAt };
}

/**
 * Marks the token spent and hands back whose account it belongs to. The
 * "unused and unexpired" check lives in the update filter, so two submits of
 * the same link can't both go through — the second matches nothing.
 */
export async function consumePasswordResetToken(
  token: string,
): Promise<Types.ObjectId | null> {
  await connectDB();

  const consumed = await PasswordResetToken.findOneAndUpdate(
    {
      tokenHash: hashResetToken(token),
      usedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { usedAt: new Date() } },
    { returnDocument: "after" },
  ).lean<IPasswordResetToken>();

  return consumed?.userId ?? null;
}

/**
 * Read-only check used to decide whether the reset form is worth rendering.
 * Compared in constant time out of habit — the value came from a URL.
 */
export async function isPasswordResetTokenValid(token: string): Promise<boolean> {
  await connectDB();

  const tokenHash = hashResetToken(token);

  const candidate = await PasswordResetToken.findOne({
    tokenHash,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .select("tokenHash")
    .lean<Pick<IPasswordResetToken, "tokenHash">>();

  if (!candidate) return false;

  const a = Buffer.from(candidate.tokenHash);
  const b = Buffer.from(tokenHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Clears every outstanding token for an account (after a successful reset). */
export async function clearPasswordResetTokens(
  userId: Types.ObjectId | string,
): Promise<void> {
  await connectDB();
  await PasswordResetToken.deleteMany({
    userId: typeof userId === "string" ? new Types.ObjectId(userId) : userId,
  });
}
