import "server-only";

import { Types } from "mongoose";

import { connectDB } from "@/lib/db";
import { env } from "@/lib/env";
import { hashPassword, verifyPassword } from "@/lib/password";
import { discardReplacedAsset } from "@/lib/storage";
import { nextDailyBonusAt } from "@/lib/wallet";
import { User, type IUser } from "@/models";
import type { UpdateProfileInput } from "@/schemas/user";

/**
 * The signed-in account: what the shell header needs on every page (5.1) and
 * what the profile screen edits (5.11).
 *
 * One read serves both. The header needs balance and bonus state, the profile
 * needs name, avatar and referral code, and splitting them would mean two round
 * trips to the same document on every navigation.
 */
export type AccountSummary = {
  id: string;
  email: string;
  username: string;
  avatar: string | null;
  coinBalance: number;
  referralCode: string;
  /** ISO 8601; `null` when the bonus is claimable right now. */
  nextDailyBonusAt: string | null;
  dailyBonusAmount: number;
  joinedAt: string;
};

export async function getAccountSummary(
  userId: string | Types.ObjectId,
): Promise<AccountSummary | null> {
  await connectDB();

  const user = await User.findById(toObjectId(userId))
    .select("email username avatar coinBalance referralCode lastDailyBonusAt createdAt")
    .lean<
      Pick<
        IUser,
        | "_id"
        | "email"
        | "username"
        | "avatar"
        | "coinBalance"
        | "referralCode"
        | "lastDailyBonusAt"
        | "createdAt"
      >
    >();

  if (!user) return null;

  const nextAt = nextDailyBonusAt(user.lastDailyBonusAt);
  const claimable = env.DAILY_BONUS_COINS > 0 && (!nextAt || nextAt.getTime() <= Date.now());

  return {
    id: user._id.toString(),
    email: user.email,
    username: user.username,
    avatar: user.avatar,
    coinBalance: user.coinBalance,
    referralCode: user.referralCode,
    nextDailyBonusAt: claimable ? null : (nextAt?.toISOString() ?? null),
    dailyBonusAmount: env.DAILY_BONUS_COINS,
    joinedAt: user.createdAt.toISOString(),
  };
}

/* ------------------------------------------------------------------ *
 * 5.11 — profile edits
 * ------------------------------------------------------------------ */

export type ProfileUpdateResult =
  | { ok: true }
  | { ok: false; field?: "username" | "avatar"; message: string };

/**
 * Username and avatar only. Role, status, permissions and — above all —
 * `coinBalance` are not editable from here; the balance moves through the
 * wallet service and nowhere else.
 */
export async function updateProfile(
  userId: string | Types.ObjectId,
  input: UpdateProfileInput,
): Promise<ProfileUpdateResult> {
  await connectDB();

  const changes: Partial<Pick<IUser, "username" | "avatar">> = {};
  if (input.username !== undefined) changes.username = input.username;
  if (input.avatar !== undefined) changes.avatar = input.avatar;

  if (Object.keys(changes).length === 0) return { ok: true };

  try {
    const previous = await User.findOneAndUpdate(
      { _id: toObjectId(userId) },
      { $set: changes },
      // Explicit rather than relying on Mongoose's default, because the whole
      // point of this read is the avatar as it was a moment ago.
      { returnDocument: "before" },
    )
      .select("avatar")
      .lean<Pick<IUser, "_id" | "avatar">>();

    if (!previous) return { ok: false, message: "That account no longer exists." };

    // The picture they just replaced is no longer referenced by anything.
    if (changes.avatar !== undefined) {
      await discardReplacedAsset(previous.avatar, changes.avatar);
    }
  } catch (error) {
    // The unique index is the real check — a pre-read would still race.
    if (isDuplicateKey(error, "username")) {
      return { ok: false, field: "username", message: "That username is taken" };
    }
    throw error;
  }

  return { ok: true };
}

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; field?: "currentPassword"; message: string };

/**
 * Requires the current password: a session left open on a shared phone must not
 * be enough to lock the owner out of their own account.
 */
export async function changePassword(
  userId: string | Types.ObjectId,
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResult> {
  await connectDB();

  const user = await User.findById(toObjectId(userId))
    .select("+passwordHash")
    .lean<Pick<IUser, "_id" | "passwordHash">>();

  if (!user) return { ok: false, message: "That account no longer exists." };

  const matches = await verifyPassword(currentPassword, user.passwordHash);
  if (!matches) {
    return { ok: false, field: "currentPassword", message: "That isn't your current password" };
  }

  const passwordHash = await hashPassword(newPassword);
  await User.updateOne({ _id: user._id }, { $set: { passwordHash } });

  return { ok: true };
}

function isDuplicateKey(error: unknown, field: string): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, keyPattern } = error as { code?: unknown; keyPattern?: Record<string, unknown> };
  return code === 11000 && !!keyPattern && field in keyPattern;
}

function toObjectId(value: string | Types.ObjectId): Types.ObjectId {
  return typeof value === "string" ? new Types.ObjectId(value) : value;
}
