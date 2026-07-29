import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import {
  SettlementError,
  cancelMatch,
  previewQuestionSettlement,
  resolveQuestion,
  voidQuestion,
} from "@/lib/settlement";
import { applyWalletMovement } from "@/lib/wallet";
import {
  AuditLog,
  Bet,
  Match,
  Question,
  ReferralSetting,
  Transaction,
  type IBet,
  type IQuestion,
  type IUser,
} from "@/models";

import * as make from "../helpers/factories";

/**
 * Phase 9.2 — settlement.
 *
 * The four properties worth guarding, in the order the money can go wrong:
 *
 *  1. winners are paid the `stake × ratio` **snapshot**, never a fresh
 *     multiplication against odds that may have moved since;
 *  2. resolving twice pays once (4.6) — and a second run *finishes* an
 *     interrupted first one rather than starting over;
 *  3. a void refunds every stake and a resolved market is never clawed back;
 *  4. the ledger still sums to the balance afterwards.
 */

/** Places a bet the way the engine would: stake off the balance, Bet row on. */
async function stake(
  account: IUser,
  fixture: { category: { _id: Types.ObjectId }; match: { _id: Types.ObjectId } },
  question: IQuestion,
  optionIndex: number,
  amount: number,
): Promise<IBet> {
  const bet = await make.bet({
    userId: account._id,
    categoryId: fixture.category._id,
    matchId: fixture.match._id,
    question,
    optionIndex,
    stake: amount,
  });

  await applyWalletMovement({
    userId: account._id,
    type: "bet_place",
    amount,
    refId: bet._id,
    note: `Bet: ${bet.optionName}`,
  });

  return bet;
}

const winningIdsOf = (question: IQuestion, ...indexes: number[]) =>
  indexes.map((index) => question.options[index]!._id.toString());

describe("resolveQuestion", () => {
  it("pays the winners their snapshot and closes out the losers", async () => {
    const admin = await make.user({ role: "superadmin" });
    const winner = await make.user({ balance: 1_000 });
    const loser = await make.user({ balance: 1_000 });
    const fixture = await make.market({
      options: [
        { name: "Alpha", ratio: 2.5 },
        { name: "Beta", ratio: 3 },
      ],
    });

    await stake(winner, fixture, fixture.question, 0, 200);
    await stake(loser, fixture, fixture.question, 1, 200);

    const result = await resolveQuestion({
      questionId: fixture.question._id,
      winningOptionIds: winningIdsOf(fixture.question, 0),
      actor: make.actor(admin._id),
    });

    expect(result).toMatchObject({
      transitioned: true,
      betsSettled: 2,
      winners: 1,
      losers: 1,
      failed: 0,
      totalStake: 400,
      totalPayout: 500,
    });

    // 1,000 − 200 stake + 500 payout.
    expect(await make.balanceOf(winner._id)).toBe(1_300);
    expect(await make.balanceOf(loser._id)).toBe(800);
    expect(await make.ledgerTotal(winner._id)).toBe(1_300);
    expect(await make.ledgerTotal(loser._id)).toBe(800);

    const bets = await Bet.find({ questionId: fixture.question._id }).lean<IBet[]>();
    expect(bets.find((b) => b.userId.equals(winner._id))).toMatchObject({
      status: "won",
      payout: 500,
    });
    expect(bets.find((b) => b.userId.equals(loser._id))).toMatchObject({
      status: "lost",
      payout: 0,
    });

    const resolved = await Question.findById(fixture.question._id).lean<IQuestion>();
    expect(resolved?.status).toBe("resolved");
    expect(resolved?.options.map((option) => option.isWinner)).toEqual([true, false]);
    expect(resolved?.resolvedBy?.toString()).toBe(admin._id.toString());
  });

  it("pays the snapshot, not the odds as they stand at settlement", async () => {
    const admin = await make.user({ role: "superadmin" });
    const punter = await make.user({ balance: 1_000 });
    const fixture = await make.market({
      options: [
        { name: "Alpha", ratio: 4 },
        { name: "Beta", ratio: 2 },
      ],
    });

    await stake(punter, fixture, fixture.question, 0, 100); // priced at 4.0 → 400

    // The admin slashes the odds after the bet is on.
    await Question.updateOne(
      { _id: fixture.question._id },
      { $set: { "options.0.ratio": 1.05 } },
    );

    await resolveQuestion({
      questionId: fixture.question._id,
      winningOptionIds: winningIdsOf(fixture.question, 0),
      actor: make.actor(admin._id),
    });

    // 1,000 − 100 + 400 — the price the user was quoted, not 105.
    expect(await make.balanceOf(punter._id)).toBe(1_300);
  });

  it("pays every winning option when more than one is picked", async () => {
    const admin = await make.user({ role: "superadmin" });
    const first = await make.user({ balance: 1_000 });
    const second = await make.user({ balance: 1_000 });
    const third = await make.user({ balance: 1_000 });
    const fixture = await make.market({
      options: [
        { name: "Alpha", ratio: 2 },
        { name: "Beta", ratio: 2 },
        { name: "Gamma", ratio: 2 },
      ],
    });

    await stake(first, fixture, fixture.question, 0, 100);
    await stake(second, fixture, fixture.question, 1, 100);
    await stake(third, fixture, fixture.question, 2, 100);

    const result = await resolveQuestion({
      questionId: fixture.question._id,
      winningOptionIds: winningIdsOf(fixture.question, 0, 1),
      actor: make.actor(admin._id),
    });

    expect(result).toMatchObject({ winners: 2, losers: 1, totalPayout: 400 });
    expect(await make.balanceOf(first._id)).toBe(1_100);
    expect(await make.balanceOf(second._id)).toBe(1_100);
    expect(await make.balanceOf(third._id)).toBe(900);
  });

  it("never pays twice when the same resolve is replayed", async () => {
    const admin = await make.user({ role: "superadmin" });
    const punter = await make.user({ balance: 1_000 });
    const fixture = await make.market({ options: [{ name: "Alpha", ratio: 2 }, { name: "Beta", ratio: 2 }] });

    await stake(punter, fixture, fixture.question, 0, 500);

    const command = {
      questionId: fixture.question._id,
      winningOptionIds: winningIdsOf(fixture.question, 0),
      actor: make.actor(admin._id),
    };

    await resolveQuestion(command);
    const replay = await resolveQuestion(command);

    expect(replay.transitioned).toBe(false);
    expect(replay.betsSettled).toBe(0);
    expect(replay.totalPayout).toBe(0);

    expect(await make.balanceOf(punter._id)).toBe(1_500);
    expect(await Transaction.countDocuments({ userId: punter._id, type: "bet_win" })).toBe(1);
  });

  it("survives two admins resolving the same market at the same moment", async () => {
    const admin = await make.user({ role: "superadmin" });
    const punter = await make.user({ balance: 1_000 });
    const fixture = await make.market({ options: [{ name: "Alpha", ratio: 2 }, { name: "Beta", ratio: 2 }] });

    await stake(punter, fixture, fixture.question, 0, 500);

    const command = {
      questionId: fixture.question._id,
      winningOptionIds: winningIdsOf(fixture.question, 0),
      actor: make.actor(admin._id),
    };

    await Promise.all([resolveQuestion(command), resolveQuestion(command)]);

    expect(await make.balanceOf(punter._id)).toBe(1_500);
    expect(await Transaction.countDocuments({ userId: punter._id, type: "bet_win" })).toBe(1);
  });

  it("finishes a bet that landed microseconds after the market closed", async () => {
    const admin = await make.user({ role: "superadmin" });
    const punter = await make.user({ balance: 1_000 });
    const fixture = await make.market({ options: [{ name: "Alpha", ratio: 2 }, { name: "Beta", ratio: 2 }] });

    const command = {
      questionId: fixture.question._id,
      winningOptionIds: winningIdsOf(fixture.question, 0),
      actor: make.actor(admin._id),
    };

    await resolveQuestion(command);

    // A stray pending bet, as if placement had raced the status transition.
    await stake(punter, fixture, fixture.question, 0, 100);

    const second = await resolveQuestion(command);

    expect(second.transitioned).toBe(false);
    expect(second.betsSettled).toBe(1);
    expect(await make.balanceOf(punter._id)).toBe(1_100);
  });

  it("refuses a second resolve that names a different winner", async () => {
    const admin = await make.user({ role: "superadmin" });
    const fixture = await make.market({ options: [{ name: "Alpha", ratio: 2 }, { name: "Beta", ratio: 2 }] });

    await resolveQuestion({
      questionId: fixture.question._id,
      winningOptionIds: winningIdsOf(fixture.question, 0),
      actor: make.actor(admin._id),
    });

    await expect(
      resolveQuestion({
        questionId: fixture.question._id,
        winningOptionIds: winningIdsOf(fixture.question, 1),
        actor: make.actor(admin._id),
      }),
    ).rejects.toMatchObject({ name: "SettlementError", code: "already_resolved" });
  });

  it("rejects an option that is not on the question", async () => {
    const admin = await make.user({ role: "superadmin" });
    const fixture = await make.market();

    await expect(
      resolveQuestion({
        questionId: fixture.question._id,
        winningOptionIds: [new Types.ObjectId().toString()],
        actor: make.actor(admin._id),
      }),
    ).rejects.toMatchObject({ code: "invalid_options" });
  });

  it("rejects a resolve with no winner picked", async () => {
    const admin = await make.user({ role: "superadmin" });
    const fixture = await make.market();

    await expect(
      resolveQuestion({
        questionId: fixture.question._id,
        winningOptionIds: [],
        actor: make.actor(admin._id),
      }),
    ).rejects.toMatchObject({ code: "invalid_options" });
  });

  it("reports a market that no longer exists", async () => {
    const admin = await make.user({ role: "superadmin" });

    await expect(
      resolveQuestion({
        questionId: new Types.ObjectId(),
        winningOptionIds: [new Types.ObjectId().toString()],
        actor: make.actor(admin._id),
      }),
    ).rejects.toBeInstanceOf(SettlementError);
  });

  it("writes one audit row carrying the payout totals", async () => {
    const admin = await make.user({ role: "superadmin" });
    const punter = await make.user({ balance: 1_000 });
    const fixture = await make.market({ options: [{ name: "Alpha", ratio: 2 }, { name: "Beta", ratio: 2 }] });

    await stake(punter, fixture, fixture.question, 0, 300);

    await resolveQuestion({
      questionId: fixture.question._id,
      winningOptionIds: winningIdsOf(fixture.question, 0),
      actor: make.actor(admin._id),
    });

    const entry = await AuditLog.findOne({ action: "question.resolve" }).lean();

    expect(entry?.entityId?.toString()).toBe(fixture.question._id.toString());
    expect(entry?.metadata).toMatchObject({ betsSettled: 1, totalPayout: 600, winners: 1 });
  });

  it("moves the match to resolved once its last market is settled", async () => {
    const admin = await make.user({ role: "superadmin" });
    const fixture = await make.market();
    const second = await make.question(fixture.match._id);

    await resolveQuestion({
      questionId: fixture.question._id,
      winningOptionIds: winningIdsOf(fixture.question, 0),
      actor: make.actor(admin._id),
    });

    expect((await Match.findById(fixture.match._id).lean())?.status).toBe("live");

    await resolveQuestion({
      questionId: second._id,
      winningOptionIds: winningIdsOf(second, 0),
      actor: make.actor(admin._id),
    });

    expect((await Match.findById(fixture.match._id).lean())?.status).toBe("resolved");
  });
});

describe("voidQuestion", () => {
  it("refunds every stake and marks the bets refunded", async () => {
    const admin = await make.user({ role: "superadmin" });
    const first = await make.user({ balance: 1_000 });
    const second = await make.user({ balance: 1_000 });
    const fixture = await make.market({ options: [{ name: "Alpha", ratio: 2 }, { name: "Beta", ratio: 5 }] });

    await stake(first, fixture, fixture.question, 0, 300);
    await stake(second, fixture, fixture.question, 1, 450);

    const result = await voidQuestion({
      questionId: fixture.question._id,
      reason: "Event abandoned",
      actor: make.actor(admin._id),
    });

    expect(result).toMatchObject({ refunds: 2, winners: 0, losers: 0, totalPayout: 750 });

    expect(await make.balanceOf(first._id)).toBe(1_000);
    expect(await make.balanceOf(second._id)).toBe(1_000);
    expect(await make.ledgerTotal(first._id)).toBe(1_000);

    const bets = await Bet.find({ questionId: fixture.question._id }).lean<IBet[]>();
    expect(bets.every((bet) => bet.status === "refunded")).toBe(true);
    expect(bets.map((bet) => bet.payout).sort((a, b) => a - b)).toEqual([300, 450]);

    expect((await Question.findById(fixture.question._id).lean())?.status).toBe("void");
  });

  it("refuses to void a market that has already paid out", async () => {
    const admin = await make.user({ role: "superadmin" });
    const fixture = await make.market();

    await resolveQuestion({
      questionId: fixture.question._id,
      winningOptionIds: winningIdsOf(fixture.question, 0),
      actor: make.actor(admin._id),
    });

    await expect(
      voidQuestion({ questionId: fixture.question._id, actor: make.actor(admin._id) }),
    ).rejects.toMatchObject({ code: "wrong_status" });
  });

  it("refuses to resolve a market that was voided", async () => {
    const admin = await make.user({ role: "superadmin" });
    const fixture = await make.market();

    await voidQuestion({ questionId: fixture.question._id, actor: make.actor(admin._id) });

    await expect(
      resolveQuestion({
        questionId: fixture.question._id,
        winningOptionIds: winningIdsOf(fixture.question, 0),
        actor: make.actor(admin._id),
      }),
    ).rejects.toMatchObject({ code: "wrong_status" });
  });

  it("refunds once when two admins void at the same moment", async () => {
    const admin = await make.user({ role: "superadmin" });
    const punter = await make.user({ balance: 1_000 });
    const fixture = await make.market();

    await stake(punter, fixture, fixture.question, 0, 400);

    await Promise.all([
      voidQuestion({ questionId: fixture.question._id, actor: make.actor(admin._id) }),
      voidQuestion({ questionId: fixture.question._id, actor: make.actor(admin._id) }),
    ]);

    expect(await make.balanceOf(punter._id)).toBe(1_000);
    expect(await Transaction.countDocuments({ userId: punter._id, type: "bet_refund" })).toBe(1);
  });

  it("refunds once when voided twice", async () => {
    const admin = await make.user({ role: "superadmin" });
    const punter = await make.user({ balance: 1_000 });
    const fixture = await make.market();

    await stake(punter, fixture, fixture.question, 0, 400);

    await voidQuestion({ questionId: fixture.question._id, actor: make.actor(admin._id) });
    const replay = await voidQuestion({
      questionId: fixture.question._id,
      actor: make.actor(admin._id),
    });

    expect(replay.refunds).toBe(0);
    expect(await make.balanceOf(punter._id)).toBe(1_000);
    expect(await Transaction.countDocuments({ userId: punter._id, type: "bet_refund" })).toBe(1);
  });
});

describe("cancelMatch", () => {
  it("voids every open market, refunds the stakes and leaves settled ones alone", async () => {
    const admin = await make.user({ role: "superadmin" });
    const punter = await make.user({ balance: 2_000 });
    const fixture = await make.market({ options: [{ name: "Alpha", ratio: 2 }, { name: "Beta", ratio: 2 }] });
    const alreadyPaid = await make.question(fixture.match._id);
    const stillOpen = await make.question(fixture.match._id);

    await stake(punter, fixture, alreadyPaid, 0, 100);
    await stake(punter, fixture, fixture.question, 0, 500);
    await stake(punter, fixture, stillOpen, 1, 400);

    await resolveQuestion({
      questionId: alreadyPaid._id,
      winningOptionIds: winningIdsOf(alreadyPaid, 0),
      actor: make.actor(admin._id),
    });

    const balanceAfterPayout = await make.balanceOf(punter._id);

    const result = await cancelMatch({
      matchId: fixture.match._id,
      reason: "Venue flooded",
      actor: make.actor(admin._id),
    });

    expect(result.transitioned).toBe(true);
    expect(result.skippedResolved).toBe(1);
    expect(result.betsRefunded).toBe(2);
    expect(result.totalRefunded).toBe(900);

    expect(await make.balanceOf(punter._id)).toBe(balanceAfterPayout + 900);
    expect(await make.ledgerTotal(punter._id)).toBe(balanceAfterPayout + 900);

    expect((await Match.findById(fixture.match._id).lean())?.status).toBe("cancelled");
    expect((await Question.findById(alreadyPaid._id).lean())?.status).toBe("resolved");
    expect((await Question.findById(stillOpen._id).lean())?.status).toBe("void");
  });

  it("reports a match that no longer exists", async () => {
    const admin = await make.user({ role: "superadmin" });

    await expect(
      cancelMatch({ matchId: new Types.ObjectId(), actor: make.actor(admin._id) }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("referral commission on settlement (4.7)", () => {
  it("pays the referrer a cut of the stake on every settled bet", async () => {
    await ReferralSetting.updateOne(
      { key: "referral" },
      {
        $set: { enabled: true, commissionPercent: 10, commissionBasis: "stake" },
        $setOnInsert: { key: "referral" },
      },
      { upsert: true },
    );

    const admin = await make.user({ role: "superadmin" });
    const referrer = await make.user();
    const punter = await make.user({ balance: 1_000, referredBy: referrer._id });
    const fixture = await make.market({ options: [{ name: "Alpha", ratio: 2 }, { name: "Beta", ratio: 2 }] });

    await stake(punter, fixture, fixture.question, 1, 300); // a losing bet

    const result = await resolveQuestion({
      questionId: fixture.question._id,
      winningOptionIds: winningIdsOf(fixture.question, 0),
      actor: make.actor(admin._id),
    });

    expect(result.commissionPaid).toBe(30);
    expect(await make.balanceOf(referrer._id)).toBe(30);

    const row = await Transaction.findOne({
      userId: referrer._id,
      type: "referral_commission",
    }).lean();
    expect(row?.amount).toBe(30);
  });

  it("pays nothing on a refund, because nothing was wagered", async () => {
    await ReferralSetting.updateOne(
      { key: "referral" },
      {
        $set: { enabled: true, commissionPercent: 10, commissionBasis: "stake" },
        $setOnInsert: { key: "referral" },
      },
      { upsert: true },
    );

    const admin = await make.user({ role: "superadmin" });
    const referrer = await make.user();
    const punter = await make.user({ balance: 1_000, referredBy: referrer._id });
    const fixture = await make.market();

    await stake(punter, fixture, fixture.question, 0, 300);

    const result = await voidQuestion({
      questionId: fixture.question._id,
      actor: make.actor(admin._id),
    });

    expect(result.commissionPaid).toBe(0);
    expect(await make.balanceOf(referrer._id)).toBe(0);
  });
});

describe("previewQuestionSettlement", () => {
  it("reports what a given set of winners would cost, per option", async () => {
    const first = await make.user({ balance: 1_000 });
    const second = await make.user({ balance: 1_000 });
    const fixture = await make.market({
      options: [
        { name: "Alpha", ratio: 2 },
        { name: "Beta", ratio: 4 },
      ],
    });

    await stake(first, fixture, fixture.question, 0, 100);
    await stake(second, fixture, fixture.question, 0, 250);
    await stake(second, fixture, fixture.question, 1, 50);

    const preview = await previewQuestionSettlement(fixture.question._id, [
      fixture.question.options[0]!._id.toString(),
    ]);

    expect(preview).toMatchObject({
      pendingBets: 3,
      uniqueBettors: 2,
      totalStake: 400,
      totalPayout: 700, // (100 + 250) × 2 — Beta is not a winner here
    });

    expect(preview.perOption).toEqual([
      expect.objectContaining({ optionName: "Alpha", isWinner: true, bets: 2, stake: 350, payout: 700 }),
      expect.objectContaining({ optionName: "Beta", isWinner: false, bets: 1, stake: 50, payout: 0 }),
    ]);
  });
});
