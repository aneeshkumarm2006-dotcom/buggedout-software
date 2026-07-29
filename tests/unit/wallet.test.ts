import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import {
  DAILY_BONUS_INTERVAL_MS,
  WalletError,
  applyWalletMovement,
  claimDailyBonus,
  creditSignupBonus,
  getWalletSummary,
  nextDailyBonusAt,
} from "@/lib/wallet";
import { Transaction, User, type ITransaction } from "@/models";

import { balanceOf, ledgerTotal, user } from "../helpers/factories";

/**
 * Phase 9.2 — the wallet service.
 *
 * The invariant under test throughout is the one Phase 2 designed the ledger
 * around: `sum(Transaction.amount) === User.coinBalance`, for every account,
 * after every movement. Everything else here is a way of trying to break it —
 * spending coins that aren't there, claiming the same bonus twice, racing two
 * writes at one document.
 */

async function expectWalletError(promise: Promise<unknown>, code: string): Promise<WalletError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );

  expect(error, `expected a WalletError(${code})`).toBeInstanceOf(WalletError);
  expect((error as WalletError).code).toBe(code);

  return error as WalletError;
}

describe("applyWalletMovement", () => {
  it("credits the balance and writes one signed ledger row", async () => {
    const account = await user();

    const movement = await applyWalletMovement({
      userId: account._id,
      type: "admin_credit",
      amount: 500,
      note: "Goodwill",
    });

    expect(movement.amount).toBe(500);
    expect(movement.balanceAfter).toBe(500);
    expect(await balanceOf(account._id)).toBe(500);

    const rows = await Transaction.find({ userId: account._id }).lean<ITransaction[]>();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "admin_credit", amount: 500, balanceAfter: 500 });
    expect(await ledgerTotal(account._id)).toBe(500);
  });

  it("stores a debit as a negative amount, so the ledger still sums to the balance", async () => {
    const account = await user({ balance: 1_000 });

    const movement = await applyWalletMovement({
      userId: account._id,
      type: "bet_place",
      amount: 250,
      note: "Bet: Alpha",
    });

    expect(movement.amount).toBe(-250);
    expect(movement.balanceAfter).toBe(750);
    expect(await balanceOf(account._id)).toBe(750);
    expect(await ledgerTotal(account._id)).toBe(750);
  });

  it("refuses a debit larger than the balance and leaves nothing behind", async () => {
    const account = await user({ balance: 100 });

    await expectWalletError(
      applyWalletMovement({ userId: account._id, type: "bet_place", amount: 101 }),
      "insufficient_funds",
    );

    expect(await balanceOf(account._id)).toBe(100);
    // One row — the opening credit. The rejected debit wrote nothing.
    expect(await Transaction.countDocuments({ userId: account._id })).toBe(1);
    expect(await ledgerTotal(account._id)).toBe(100);
  });

  it("allows a debit that takes the balance to exactly zero", async () => {
    const account = await user({ balance: 100 });

    const movement = await applyWalletMovement({
      userId: account._id,
      type: "bet_place",
      amount: 100,
    });

    expect(movement.balanceAfter).toBe(0);
    expect(await ledgerTotal(account._id)).toBe(0);
  });

  it.each([0, -50, 12.5, Number.NaN])("rejects %s as an amount", async (amount) => {
    const account = await user({ balance: 1_000 });

    await expectWalletError(
      applyWalletMovement({ userId: account._id, type: "admin_credit", amount }),
      "invalid_amount",
    );

    expect(await balanceOf(account._id)).toBe(1_000);
  });

  it("reports a missing account rather than creating one", async () => {
    await expectWalletError(
      applyWalletMovement({ userId: new Types.ObjectId(), type: "admin_credit", amount: 10 }),
      "user_not_found",
    );
  });

  it("honours an extra precondition in the same atomic update", async () => {
    const account = await user({ balance: 1_000, status: "banned" });

    await expectWalletError(
      applyWalletMovement({
        userId: account._id,
        type: "bet_place",
        amount: 10,
        userFilter: { status: "active" },
        preconditionCode: "user_inactive",
      }),
      "user_inactive",
    );

    expect(await balanceOf(account._id)).toBe(1_000);
  });

  it("cannot be raced past the balance floor", async () => {
    const account = await user({ balance: 1_000 });

    // Five concurrent 300-coin debits against 1,000 coins: three can be paid.
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        applyWalletMovement({ userId: account._id, type: "bet_place", amount: 300 }),
      ),
    );

    const paid = results.filter((result) => result.status === "fulfilled");
    expect(paid).toHaveLength(3);

    expect(await balanceOf(account._id)).toBe(100);
    expect(await ledgerTotal(account._id)).toBe(100);
    // Every `balanceAfter` is distinct — no two debits read the same pre-image.
    const landings = paid.map((result) => result.value.balanceAfter).sort((a, b) => a - b);
    expect(landings).toEqual([100, 400, 700]);
  });
});

describe("the ledger is append-only", () => {
  it("rejects an update to a transaction row", async () => {
    const account = await user({ balance: 100 });
    const row = await Transaction.findOne({ userId: account._id }).lean<ITransaction>();

    await expect(
      Transaction.updateOne({ _id: row!._id }, { $set: { amount: 999_999 } }),
    ).rejects.toThrow(/immutable/i);
  });

  it("rejects a delete", async () => {
    const account = await user({ balance: 100 });

    await expect(Transaction.deleteMany({ userId: account._id })).rejects.toThrow(/immutable/i);
  });
});

describe("creditSignupBonus", () => {
  it("credits SIGNUP_BONUS_COINS once, tagged as a signup bonus", async () => {
    const account = await user();

    const movement = await creditSignupBonus(account._id);

    expect(movement?.balanceAfter).toBe(1_000);
    expect(await balanceOf(account._id)).toBe(1_000);

    const row = await Transaction.findOne({ userId: account._id }).lean<ITransaction>();
    expect(row?.type).toBe("signup_bonus");
    expect(row?.refId?.toString()).toBe(account._id.toString());
  });
});

describe("claimDailyBonus", () => {
  it("pays the bonus and stamps the claim", async () => {
    const account = await user();

    const movement = await claimDailyBonus(account._id);

    expect(movement.amount).toBe(100);
    expect(await balanceOf(account._id)).toBe(100);

    const after = await User.findById(account._id).lean();
    expect(after?.lastDailyBonusAt).toBeInstanceOf(Date);
  });

  it("refuses a second claim inside the 24h window", async () => {
    const account = await user();
    await claimDailyBonus(account._id);

    await expectWalletError(claimDailyBonus(account._id), "daily_bonus_not_ready");

    expect(await balanceOf(account._id)).toBe(100);
    expect(await ledgerTotal(account._id)).toBe(100);
  });

  it("pays again once the window has passed", async () => {
    const account = await user();
    await claimDailyBonus(account._id);

    await User.updateOne(
      { _id: account._id },
      { $set: { lastDailyBonusAt: new Date(Date.now() - DAILY_BONUS_INTERVAL_MS - 1_000) } },
    );

    const movement = await claimDailyBonus(account._id);

    expect(movement.balanceAfter).toBe(200);
    expect(await ledgerTotal(account._id)).toBe(200);
  });

  it("pays exactly once when the button is double-tapped", async () => {
    const account = await user();

    const results = await Promise.allSettled([
      claimDailyBonus(account._id),
      claimDailyBonus(account._id),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await balanceOf(account._id)).toBe(100);
    expect(await Transaction.countDocuments({ userId: account._id, type: "daily_bonus" })).toBe(1);
  });

  it("refuses a banned account", async () => {
    const account = await user({ status: "banned" });

    await expectWalletError(claimDailyBonus(account._id), "daily_bonus_not_ready");

    expect(await balanceOf(account._id)).toBe(0);
  });
});

describe("getWalletSummary", () => {
  it("reports the bonus as claimable before the first claim", async () => {
    const account = await user({ balance: 42 });

    const summary = await getWalletSummary(account._id);

    expect(summary).toMatchObject({
      coinBalance: 42,
      canClaimDailyBonus: true,
      nextDailyBonusAt: null,
      dailyBonusAmount: 100,
    });
  });

  it("reports when the next claim opens after one is taken", async () => {
    const account = await user();
    await claimDailyBonus(account._id);

    const summary = await getWalletSummary(account._id);

    expect(summary?.canClaimDailyBonus).toBe(false);
    expect(summary?.nextDailyBonusAt).toEqual(nextDailyBonusAt(summary!.lastDailyBonusAt));
  });

  it("is null for an account that no longer exists", async () => {
    expect(await getWalletSummary(new Types.ObjectId())).toBeNull();
  });
});
