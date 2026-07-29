import "server-only";

import type { QueryFilter } from "mongoose";

import {
  ADMIN_PAGE_SIZE,
  pageSlice,
  searchRegex,
  totalPages,
  type Paged,
} from "@/lib/admin/list-params";
import {
  duplicateKeyField,
  isValidObjectId,
  toObjectId,
  type MutationResult,
} from "@/lib/admin/shared";
import type { Actor } from "@/lib/authz";
import { connectDB } from "@/lib/db";
import type { BetStatus, TransactionType, UserStatus } from "@/lib/enums";
import { hashPassword } from "@/lib/password";
import { grantablePermissions, type Permission } from "@/lib/permissions";
import { ADMIN_PANEL_ROLES, type Role } from "@/lib/roles";
import { WalletError, applyWalletMovement } from "@/lib/wallet";
import { Bet, Transaction, User, type IBet, type ITransaction, type IUser } from "@/models";
import type { CreateUserInput, UpdateUserInput } from "@/schemas/user";

/**
 * Accounts, admin side: staff and their permissions (Phase 6.3), and the user
 * list, detail, ban switch and manual coin adjustments (Phase 6.13).
 *
 * Two rules run through everything here, because this is the file where
 * privilege escalation would live if it were possible:
 *
 *  1. nobody edits their own role, permissions or status — that is what stops
 *     an admin promoting themselves and what stops them locking themselves out;
 *  2. a permission can only be granted or revoked by someone who holds it, so
 *     an admin cannot hand out access they were never given. Permissions
 *     outside the editor's reach are carried over untouched rather than
 *     silently dropped by a form that could not show them.
 *
 * Superadmin is the exception the model already grants: it holds everything
 * implicitly and only another superadmin can edit one.
 */
export type StaffRow = {
  id: string;
  username: string;
  email: string;
  role: Role;
  status: UserStatus;
  permissionCount: number;
  createdAt: string;
  isSelf: boolean;
};

export type StaffDetail = {
  id: string;
  username: string;
  email: string;
  role: Role;
  status: UserStatus;
  permissions: string[];
  createdAt: string;
};

export type StaffListParams = { page?: number; q?: string; role?: Role };

export async function listStaff(
  actorId: string,
  params: StaffListParams = {},
): Promise<Paged<StaffRow>> {
  await connectDB();

  const { skip, limit } = pageSlice(params.page ?? 1);

  const filter: QueryFilter<IUser> = {
    role: params.role ?? { $in: ADMIN_PANEL_ROLES },
  };

  if (params.q) {
    const term = searchRegex(params.q);
    filter.$or = [{ username: term }, { email: term }];
  }

  const [total, staff] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean<IUser[]>(),
  ]);

  return {
    rows: staff.map((user) => ({
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      permissionCount: user.permissions.length,
      createdAt: user.createdAt.toISOString(),
      isSelf: user._id.toString() === actorId,
    })),
    page: params.page ?? 1,
    total,
    totalPages: totalPages(total, ADMIN_PAGE_SIZE),
  };
}

export async function getStaffMember(id: string): Promise<StaffDetail | null> {
  await connectDB();

  if (!isValidObjectId(id)) return null;

  const user = await User.findById(toObjectId(id)).lean<IUser>();
  if (!user) return null;

  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    permissions: user.permissions,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function createStaff(
  actor: Actor,
  input: CreateUserInput,
): Promise<MutationResult<{ id: string; username: string }>> {
  await connectDB();

  const roleCheck = assertCanAssignRole(actor, input.role);
  if (roleCheck) return roleCheck;

  const grantable = new Set<string>(grantablePermissions(actor.role, actor.permissions));
  const refused = input.permissions.find((permission) => !grantable.has(permission));

  if (refused) {
    return {
      ok: false,
      field: "permissions",
      message: `You can't grant "${refused}" — you don't hold it yourself.`,
    };
  }

  try {
    const user = await User.create({
      email: input.email,
      username: input.username,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      permissions: input.permissions,
      status: input.status,
      // Balances move through the wallet service and nowhere else, so a new
      // account starts at zero and is credited from the user detail page if it
      // ever needs coins — that keeps sum(ledger) === balance true from row one.
      coinBalance: 0,
    });

    return { ok: true, data: { id: user._id.toString(), username: user.username } };
  } catch (error) {
    return accountWriteFailure(error);
  }
}

export async function updateStaff(
  actor: Actor,
  id: string,
  input: UpdateUserInput,
): Promise<MutationResult<{ id: string; username: string }>> {
  await connectDB();

  if (!isValidObjectId(id)) return { ok: false, message: "That account no longer exists." };

  const target = await User.findById(toObjectId(id)).lean<IUser>();
  if (!target) return { ok: false, message: "That account no longer exists." };

  // Only a superadmin may touch a superadmin.
  if (target.role === "superadmin" && actor.role !== "superadmin") {
    return { ok: false, message: "Only a super admin can edit another super admin." };
  }

  if (input.role) {
    const roleCheck = assertCanAssignRole(actor, input.role);
    if (roleCheck) return roleCheck;
  }

  const changes: Record<string, unknown> = { ...input };

  if (input.permissions) {
    changes.permissions = mergePermissions(actor, target.permissions, input.permissions);
  }

  // Editing yourself is allowed — but not the parts that decide what you can
  // do. Nobody promotes themselves, and nobody bans themselves out of the
  // panel by accident. Email and username go through untouched.
  if (id === actor.id) {
    const escalating =
      (input.role !== undefined && input.role !== target.role) ||
      (input.status !== undefined && input.status !== target.status) ||
      (changes.permissions !== undefined &&
        !sameSet(changes.permissions as string[], target.permissions));

    if (escalating) {
      return {
        ok: false,
        message: "You can't change your own role, status or permissions. Ask another admin.",
      };
    }

    delete changes.role;
    delete changes.status;
    delete changes.permissions;
  }

  try {
    const updated = await User.findByIdAndUpdate(
      target._id,
      { $set: changes },
      { returnDocument: "after", runValidators: true },
    ).lean<IUser>();

    if (!updated) return { ok: false, message: "That account no longer exists." };

    return { ok: true, data: { id: updated._id.toString(), username: updated.username } };
  } catch (error) {
    return accountWriteFailure(error);
  }
}

/**
 * The submitted grants, plus whatever the editor had no authority over.
 *
 * A form can only offer permissions the editor holds, so a plain overwrite
 * would quietly strip everything else the target had. Merging keeps those and
 * still refuses to add anything the editor can't give away.
 */
function mergePermissions(
  actor: Actor,
  current: string[],
  submitted: readonly string[],
): string[] {
  const grantable = new Set<string>(grantablePermissions(actor.role, actor.permissions));

  const preserved = current.filter((permission) => !grantable.has(permission));
  const granted = submitted.filter((permission) => grantable.has(permission));

  return [...new Set([...preserved, ...granted])];
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((value) => set.has(value));
}

function assertCanAssignRole(actor: Actor, role: Role): MutationResult<never> | null {
  if (role === "superadmin" && actor.role !== "superadmin") {
    return { ok: false, field: "role", message: "Only a super admin can create another one." };
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * 6.13 — user management
 * ------------------------------------------------------------------ */

export type UserRow = {
  id: string;
  username: string;
  email: string;
  role: Role;
  status: UserStatus;
  coinBalance: number;
  createdAt: string;
};

export type UserListParams = {
  page?: number;
  q?: string;
  role?: Role;
  status?: UserStatus;
};

export async function listUsers(params: UserListParams = {}): Promise<Paged<UserRow>> {
  await connectDB();

  const { skip, limit } = pageSlice(params.page ?? 1);
  const filter: QueryFilter<IUser> = {};

  if (params.role) filter.role = params.role;
  if (params.status) filter.status = params.status;

  if (params.q) {
    const term = searchRegex(params.q);
    filter.$or = [{ username: term }, { email: term }, { referralCode: term }];
  }

  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean<IUser[]>(),
  ]);

  return {
    rows: users.map((user) => ({
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      coinBalance: user.coinBalance,
      createdAt: user.createdAt.toISOString(),
    })),
    page: params.page ?? 1,
    total,
    totalPages: totalPages(total, ADMIN_PAGE_SIZE),
  };
}

export type UserBetRow = {
  id: string;
  optionName: string;
  ratio: number;
  stake: number;
  payout: number;
  status: BetStatus;
  placedAt: string;
  matchId: string;
};

export type UserLedgerRow = {
  id: string;
  type: TransactionType;
  amount: number;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
};

export type UserDetail = {
  id: string;
  username: string;
  email: string;
  avatar: string | null;
  role: Role;
  status: UserStatus;
  coinBalance: number;
  referralCode: string;
  referredByUsername: string | null;
  referredCount: number;
  lastDailyBonusAt: string | null;
  createdAt: string;
  stats: {
    bets: number;
    pending: number;
    staked: number;
    returned: number;
    /** Returned minus staked across settled bets: the account's lifetime result. */
    net: number;
  };
  recentBets: UserBetRow[];
  recentTransactions: UserLedgerRow[];
};

const RECENT_ROWS = 10;

export async function getUserDetail(id: string): Promise<UserDetail | null> {
  await connectDB();

  if (!isValidObjectId(id)) return null;

  const userId = toObjectId(id);
  const user = await User.findById(userId).lean<IUser>();
  if (!user) return null;

  const [totals, referredBy, referredCount, bets, transactions] = await Promise.all([
    Bet.aggregate<{
      _id: null;
      bets: number;
      pending: number;
      staked: number;
      returned: number;
    }>([
      { $match: { userId } },
      {
        $group: {
          _id: null,
          bets: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
          staked: { $sum: "$stake" },
          returned: { $sum: "$payout" },
        },
      },
    ]),
    user.referredBy
      ? User.findById(user.referredBy).select("username").lean<Pick<IUser, "username">>()
      : null,
    User.countDocuments({ referredBy: userId }),
    Bet.find({ userId }).sort({ createdAt: -1 }).limit(RECENT_ROWS).lean<IBet[]>(),
    Transaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(RECENT_ROWS)
      .lean<ITransaction[]>(),
  ]);

  const summary = totals[0];

  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    role: user.role,
    status: user.status,
    coinBalance: user.coinBalance,
    referralCode: user.referralCode,
    referredByUsername: referredBy?.username ?? null,
    referredCount,
    lastDailyBonusAt: user.lastDailyBonusAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    stats: {
      bets: summary?.bets ?? 0,
      pending: summary?.pending ?? 0,
      staked: summary?.staked ?? 0,
      returned: summary?.returned ?? 0,
      net: (summary?.returned ?? 0) - (summary?.staked ?? 0),
    },
    recentBets: bets.map((bet) => ({
      id: bet._id.toString(),
      optionName: bet.optionName,
      ratio: bet.ratio,
      stake: bet.stake,
      payout: bet.payout,
      status: bet.status,
      placedAt: bet.createdAt.toISOString(),
      matchId: bet.matchId.toString(),
    })),
    recentTransactions: transactions.map((transaction) => ({
      id: transaction._id.toString(),
      type: transaction.type,
      amount: transaction.amount,
      balanceAfter: transaction.balanceAfter,
      note: transaction.note,
      createdAt: transaction.createdAt.toISOString(),
    })),
  };
}

export async function setUserStatus(
  actor: Actor,
  id: string,
  status: UserStatus,
): Promise<MutationResult<{ username: string; status: UserStatus }>> {
  await connectDB();

  if (!isValidObjectId(id)) return { ok: false, message: "That account no longer exists." };

  if (id === actor.id) {
    return { ok: false, message: "You can't ban your own account." };
  }

  const target = await User.findById(toObjectId(id)).select("role username").lean<
    Pick<IUser, "_id" | "role" | "username">
  >();

  if (!target) return { ok: false, message: "That account no longer exists." };

  if (target.role === "superadmin" && actor.role !== "superadmin") {
    return { ok: false, message: "Only a super admin can ban another super admin." };
  }

  const updated = await User.findByIdAndUpdate(
    target._id,
    { $set: { status } },
    { returnDocument: "after" },
  ).lean<Pick<IUser, "username" | "status">>();

  if (!updated) return { ok: false, message: "That account no longer exists." };

  return { ok: true, data: { username: updated.username, status: updated.status } };
}

export type CoinAdjustment = {
  username: string;
  amount: number;
  balanceAfter: number;
  direction: "credit" | "debit";
};

/**
 * Manual credit or debit (6.13).
 *
 * Goes through the wallet service like every other movement, so it lands in the
 * ledger with a `balanceAfter` and a reason attached. A debit that would take
 * the balance below zero is refused by the guarded update, not by a read here.
 */
export async function adjustUserCoins(input: {
  userId: string;
  direction: "credit" | "debit";
  amount: number;
  note: string;
}): Promise<MutationResult<CoinAdjustment>> {
  await connectDB();

  if (!isValidObjectId(input.userId)) {
    return { ok: false, message: "That account no longer exists." };
  }

  const user = await User.findById(toObjectId(input.userId)).select("username").lean<
    Pick<IUser, "_id" | "username">
  >();

  if (!user) return { ok: false, message: "That account no longer exists." };

  try {
    const movement = await applyWalletMovement({
      userId: user._id,
      type: input.direction === "credit" ? "admin_credit" : "admin_debit",
      amount: input.amount,
      refId: user._id,
      note: input.note,
    });

    return {
      ok: true,
      data: {
        username: user.username,
        amount: input.amount,
        balanceAfter: movement.balanceAfter,
        direction: input.direction,
      },
    };
  } catch (error) {
    if (error instanceof WalletError) {
      return {
        ok: false,
        field: error.code === "insufficient_funds" ? "amount" : undefined,
        message:
          error.code === "insufficient_funds"
            ? "That would take the balance below zero."
            : error.message,
      };
    }

    throw error;
  }
}

function accountWriteFailure(error: unknown): MutationResult<never> {
  const field = duplicateKeyField(error);

  if (field === "email") {
    return { ok: false, field: "email", message: "That email is already registered." };
  }

  if (field === "username") {
    return { ok: false, field: "username", message: "That username is taken." };
  }

  throw error;
}

/** Permission ids the actor may hand out, for rendering the matrix. */
export function grantableFor(actor: Actor): Permission[] {
  return grantablePermissions(actor.role, actor.permissions);
}

/** Roles the actor may assign — everyone but superadmin, unless they are one. */
export function assignableRoles(actor: Actor): Role[] {
  const roles: Role[] = ["user", "staff", "admin"];
  if (actor.role === "superadmin") roles.push("superadmin");
  return roles;
}
