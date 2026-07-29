import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FormState } from "@/lib/form";
import { Bet, GameCategory, Match, Question, Team, Transaction, User, type IUser } from "@/models";

/**
 * Phase 9.3 — the whole loop, through the code a browser actually reaches.
 *
 * Everything below goes through the **server actions**, not the service layer
 * beneath them, so each step pays for its own Zod parse, its own permission
 * re-check and its own audit row. Four thin mocks stand in for the parts of
 * Next that only exist inside a request:
 *
 *  - `@/auth` — who is calling. Swapping `currentSession` is how this file
 *    changes hats between the admin, the player and a signed-out visitor, and
 *    it is deliberately *only* a session: `requirePermission` still re-reads
 *    the role and permissions from the database, which is the thing under test.
 *  - `next/navigation` — `redirect()` works by throwing; here it throws
 *    something the test can read the new URL off.
 *  - `next/cache` and `next/headers` — no request, nothing to revalidate.
 */

const { currentSession, RedirectSignal } = vi.hoisted(() => ({
  currentSession: { value: null as { user: { id: string } } | null },
  RedirectSignal: class RedirectSignal extends Error {
    constructor(readonly url: string) {
      super(`NEXT_REDIRECT ${url}`);
      this.name = "RedirectSignal";
    }
  },
}));

vi.mock("@/auth", () => ({
  auth: async () => currentSession.value,
  signIn: async () => undefined,
  signOut: async () => undefined,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  unstable_cache: <T>(fn: T) => fn,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
  cookies: async () => ({ get: () => undefined, set: () => undefined }),
}));

const { signupAction } = await import("@/app/(auth)/actions");
const {
  createCategoryAction,
  createTournamentAction,
  createTeamAction,
  createMatchAction,
  createQuestionAction,
} = await import("@/app/(admin)/catalog-actions");
const { resolveQuestionAction, settlementPreviewAction, setQuestionLockAction } = await import(
  "@/app/(admin)/actions"
);
const { placeBetsAction, claimDailyBonusAction } = await import("@/app/(user)/actions");

/* ------------------------------------------------------------------ *
 * Harness
 * ------------------------------------------------------------------ */

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const EMPTY_STATE: FormState = { status: "idle" };

/** Runs an action that ends in `redirect()` and hands back the id it redirected to. */
async function redirectedId(
  run: () => Promise<FormState>,
  pattern: RegExp,
): Promise<string> {
  const outcome = await run().then(
    (state) => state,
    (error: unknown) => error,
  );

  if (!(outcome instanceof RedirectSignal)) {
    throw new Error(
      `expected a redirect, got ${JSON.stringify(outcome, Object.getOwnPropertyNames(outcome ?? {}))}`,
    );
  }

  const matched = pattern.exec(outcome.url);
  if (!matched?.[1]) throw new Error(`redirected to an unexpected URL: ${outcome.url}`);

  return matched[1];
}

function signedInAs(user: { _id: Types.ObjectId } | null): void {
  currentSession.value = user ? { user: { id: user._id.toString() } } : null;
}

/** ISO instants, exactly as `DateTimeField` (6.7) posts them. */
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  currentSession.value = null;
});

/* ------------------------------------------------------------------ *
 * The lifecycle
 * ------------------------------------------------------------------ */

describe("admin builds a market, a new user bets on it, the admin settles it", () => {
  it("moves the coins the engine promised and nothing else", async () => {
    /* --- an operator exists ------------------------------------------ */

    const [admin] = await User.create([
      {
        email: "ops@buggedout.test",
        username: "ops",
        passwordHash: "$2b$12$klKojGQ.z8/wg3eRN7uc0.jtn5VZsImCVpkPjKwmL7JQbq1/LDmle",
        role: "superadmin",
        referralCode: "OPS12345",
      },
    ]);

    signedInAs(admin);

    /* --- catalogue: game → tournament → teams → match ---------------- */

    const categoryId = await redirectedId(
      () =>
        createCategoryAction(
          EMPTY_STATE,
          form({
            title: "Lane Races",
            slug: "lane-races",
            cardImage: "/game-cards/lane-races.webp",
            animatedCard: "/game-cards/lane-races.mp4",
            status: "active",
            sortOrder: "1",
            marketTemplates: JSON.stringify([
              { question: "Which lane wins?", options: ["Lane 1", "Lane 2"], defaultRatio: 2 },
            ]),
          }),
        ),
      /\/admin\/categories\/([0-9a-f]{24})/,
    );

    const tournamentId = await redirectedId(
      () =>
        createTournamentAction(
          EMPTY_STATE,
          form({
            title: "Lane Race Series",
            categoryId,
            startDate: iso(-24 * HOUR),
            endDate: iso(24 * HOUR),
            status: "ongoing",
          }),
        ),
      /\/admin\/tournaments\/([0-9a-f]{24})/,
    );

    const teamIds: string[] = [];
    for (const name of ["Lane 1", "Lane 2"]) {
      teamIds.push(
        await redirectedId(
          () =>
            createTeamAction(
              EMPTY_STATE,
              form({
                name,
                categoryId,
                image: "data:image/svg+xml;base64,PHN2Zy8+",
                status: "active",
              }),
            ),
          /\/admin\/teams\/([0-9a-f]{24})/,
        ),
      );
    }

    const matchId = await redirectedId(
      () =>
        createMatchAction(
          EMPTY_STATE,
          form({
            title: "Lane Races — Heat 1",
            categoryId,
            tournamentId,
            startTime: iso(HOUR),
            status: "live",
            teamIds: JSON.stringify(teamIds),
          }),
        ),
      /\/admin\/matches\/([0-9a-f]{24})\/questions/,
    );

    await redirectedId(
      () =>
        createQuestionAction(
          matchId,
          EMPTY_STATE,
          form({
            text: "Which lane wins?",
            endDate: iso(2 * HOUR),
            status: "active",
            minStakePerBet: "10",
            maxStakePerBet: "5000",
            options: JSON.stringify([
              { name: "Lane 1", ratio: 2.5, status: "active" },
              { name: "Lane 2", ratio: 1.6, status: "active" },
            ]),
          }),
        ),
      /\/admin\/matches\/([0-9a-f]{24})\/questions/,
    );

    expect(await GameCategory.countDocuments()).toBe(1);
    expect(await Team.countDocuments()).toBe(2);
    expect(await Match.countDocuments()).toBe(1);

    const question = (await Question.findOne({ matchId }).lean())!;
    expect(question.options.map((option) => option.name)).toEqual(["Lane 1", "Lane 2"]);

    /* --- a visitor signs up ------------------------------------------ */

    signedInAs(null);

    const signup = await signupAction(
      EMPTY_STATE,
      form({
        email: "punter@example.test",
        username: "punter",
        password: "correct horse battery",
      }),
    ).catch((error: unknown) => error);

    // Signup ends by redirecting to the lobby.
    expect(signup).toBeInstanceOf(RedirectSignal);
    expect((signup as InstanceType<typeof RedirectSignal>).url).toBe("/");

    const punter = (await User.findOne({ email: "punter@example.test" }).lean<IUser>())!;
    expect(punter.coinBalance).toBe(1_000); // SIGNUP_BONUS_COINS
    expect(await Transaction.countDocuments({ userId: punter._id, type: "signup_bonus" })).toBe(1);

    /* --- and claims the daily bonus ---------------------------------- */

    signedInAs(punter);

    const bonus = await claimDailyBonusAction();
    expect(bonus).toMatchObject({ ok: true, amount: 100, balance: 1_100 });

    /* --- and bets on both options of the same market (4.2) ----------- */

    const [laneOne, laneTwo] = question.options;

    const placement = await placeBetsAction({
      selections: [
        { questionId: question._id.toString(), optionId: laneOne!._id.toString(), stake: 400 },
        { questionId: question._id.toString(), optionId: laneTwo!._id.toString(), stake: 200 },
      ],
    });

    expect(placement.ok).toBe(true);
    if (!placement.ok) throw new Error(placement.message);

    expect(placement.placed).toHaveLength(2);
    expect(placement.totalStake).toBe(600);
    expect(placement.balance).toBe(500); // 1,100 − 600

    // Odds and names are the server's, not the client's.
    expect(placement.placed.map((bet) => [bet.optionName, bet.ratio, bet.potentialWin])).toEqual([
      ["Lane 1", 2.5, 1_000],
      ["Lane 2", 1.6, 320],
    ]);

    /* --- the market closes ------------------------------------------- */

    signedInAs(admin);

    const locked = await setQuestionLockAction(question._id.toString(), true);
    expect(locked.ok).toBe(true);

    // A locked market takes no more bets.
    signedInAs(punter);
    const late = await placeBetsAction({
      selections: [
        { questionId: question._id.toString(), optionId: laneOne!._id.toString(), stake: 100 },
      ],
    });
    expect(late.ok).toBe(false);
    expect(await Bet.countDocuments({ userId: punter._id })).toBe(2);

    /* --- the admin checks the damage, then settles ------------------- */

    signedInAs(admin);

    const preview = await settlementPreviewAction({
      questionId: question._id.toString(),
      winningOptionIds: [laneOne!._id.toString()],
    });

    expect(preview.ok).toBe(true);
    if (!preview.ok) throw new Error(preview.message);
    expect(preview.data).toMatchObject({ pendingBets: 2, totalStake: 600, totalPayout: 1_000 });

    const resolved = await resolveQuestionAction({
      questionId: question._id.toString(),
      winningOptionIds: [laneOne!._id.toString()],
    });

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error(resolved.message);
    expect(resolved.data).toMatchObject({ betsSettled: 2, winners: 1, losers: 1, totalPayout: 1_000 });

    /* --- the balance is exactly what the engine promised ------------- */

    // 1,000 signup + 100 daily − 600 staked + 1,000 payout = 1,500.
    const settled = (await User.findById(punter._id).lean<IUser>())!;
    expect(settled.coinBalance).toBe(1_500);

    const ledger = await Transaction.find({ userId: punter._id }).sort({ createdAt: 1 }).lean();
    expect(ledger.map((row) => row.type)).toEqual([
      "signup_bonus",
      "daily_bonus",
      "bet_place",
      "bet_place",
      "bet_win",
    ]);
    expect(ledger.reduce((sum, row) => sum + row.amount, 0)).toBe(1_500);
    expect(ledger.at(-1)).toMatchObject({ amount: 1_000, balanceAfter: 1_500 });

    const bets = await Bet.find({ userId: punter._id }).sort({ createdAt: 1 }).lean();
    expect(bets.map((bet) => [bet.status, bet.payout])).toEqual([
      ["won", 1_000],
      ["lost", 0],
    ]);

    // The match had one market and it is settled, so the match is done too.
    expect((await Match.findById(matchId).lean())?.status).toBe("resolved");
  });
});

describe("the permission gate holds against a direct POST", () => {
  it("refuses a signed-out caller", async () => {
    signedInAs(null);

    const result = await createCategoryAction(
      EMPTY_STATE,
      form({ title: "Sneaky", slug: "sneaky", cardImage: "/x.webp", status: "active", sortOrder: "0" }),
    );

    expect(result).toMatchObject({ status: "error" });
    expect(await GameCategory.countDocuments()).toBe(0);
  });

  it("refuses a plain user posting at an admin action", async () => {
    const [punter] = await User.create([
      {
        email: "nobody@example.test",
        username: "nobody",
        passwordHash: "$2b$12$klKojGQ.z8/wg3eRN7uc0.jtn5VZsImCVpkPjKwmL7JQbq1/LDmle",
        referralCode: "NOBODY01",
      },
    ]);

    signedInAs(punter);

    const result = await resolveQuestionAction({
      questionId: new Types.ObjectId().toString(),
      winningOptionIds: [new Types.ObjectId().toString()],
    });

    expect(result).toMatchObject({ ok: false });
  });

  it("refuses staff who hold the view permission but not the resolve one", async () => {
    const [staff] = await User.create([
      {
        email: "desk@buggedout.test",
        username: "desk",
        passwordHash: "$2b$12$klKojGQ.z8/wg3eRN7uc0.jtn5VZsImCVpkPjKwmL7JQbq1/LDmle",
        role: "staff",
        permissions: ["results.view"],
        referralCode: "DESK0001",
      },
    ]);

    signedInAs(staff);

    // They can look…
    const preview = await settlementPreviewAction({ questionId: new Types.ObjectId().toString() });
    expect(preview).not.toMatchObject({ message: "You don't have permission to do that." });

    // …but not touch.
    const resolved = await resolveQuestionAction({
      questionId: new Types.ObjectId().toString(),
      winningOptionIds: [new Types.ObjectId().toString()],
    });
    expect(resolved).toMatchObject({ ok: false, message: "You don't have permission to do that." });
  });

  it("refuses an admin whose account was banned after the session was issued", async () => {
    const [admin] = await User.create([
      {
        email: "revoked@buggedout.test",
        username: "revoked",
        passwordHash: "$2b$12$klKojGQ.z8/wg3eRN7uc0.jtn5VZsImCVpkPjKwmL7JQbq1/LDmle",
        role: "superadmin",
        status: "banned",
        referralCode: "REVOKED1",
      },
    ]);

    signedInAs(admin);

    const result = await createCategoryAction(
      EMPTY_STATE,
      form({ title: "Nope", slug: "nope", cardImage: "/x.webp", status: "active", sortOrder: "0" }),
    );

    expect(result).toMatchObject({ status: "error" });
    expect(await GameCategory.countDocuments()).toBe(0);
  });
});

describe("bet placement rejects what the client should not be able to buy", () => {
  async function bettableMarket() {
    const [category] = await GameCategory.create([
      {
        title: "Roulette",
        slug: "roulette",
        cardImage: "/game-cards/roulette.webp",
        status: "active",
      },
    ]);
    const teamIds = (
      await Team.create([
        { categoryId: category._id, name: "A", image: "/a.webp" },
        { categoryId: category._id, name: "B", image: "/b.webp" },
      ])
    ).map((team) => team._id);

    const [match] = await Match.create([
      {
        title: "Spin 1",
        categoryId: category._id,
        teamIds,
        startTime: new Date(Date.now() + HOUR),
        status: "live",
      },
    ]);

    const [question] = await Question.create([
      {
        matchId: match._id,
        text: "Where does it stop?",
        options: [
          { name: "Red", ratio: 2, status: "active" },
          { name: "Black", ratio: 2, status: "inactive" },
        ],
        status: "active",
        endDate: new Date(Date.now() + HOUR),
        minStakePerBet: 50,
        maxStakePerBet: 500,
      },
    ]);

    return { question: question.toObject() };
  }

  async function punterWith(balance: number) {
    const [account] = await User.create([
      {
        email: `p${Date.now()}@example.test`,
        username: `p${Date.now().toString(36)}`,
        passwordHash: "$2b$12$klKojGQ.z8/wg3eRN7uc0.jtn5VZsImCVpkPjKwmL7JQbq1/LDmle",
        referralCode: Math.random().toString(36).slice(2, 10).toUpperCase(),
      },
    ]);

    if (balance > 0) {
      const { applyWalletMovement } = await import("@/lib/wallet");
      await applyWalletMovement({
        userId: account._id,
        type: "admin_credit",
        amount: balance,
        note: "Test float",
      });
    }

    return account;
  }

  it.each([
    ["a stake below the minimum", 10, /Minimum stake/],
    ["a stake above the maximum", 900, /Maximum stake/],
  ])("rejects %s", async (_label, stake, message) => {
    const { question } = await bettableMarket();
    const punter = await punterWith(5_000);
    signedInAs(punter);

    const result = await placeBetsAction({
      selections: [
        { questionId: question._id.toString(), optionId: question.options[0]!._id.toString(), stake },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(message);
    expect(await Bet.countDocuments()).toBe(0);
    expect((await User.findById(punter._id).lean())?.coinBalance).toBe(5_000);
  });

  it("rejects a suspended option", async () => {
    const { question } = await bettableMarket();
    const punter = await punterWith(5_000);
    signedInAs(punter);

    const result = await placeBetsAction({
      selections: [
        {
          questionId: question._id.toString(),
          optionId: question.options[1]!._id.toString(),
          stake: 100,
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/suspended/i);
  });

  it("places nothing when the slip costs more than the balance", async () => {
    const { question } = await bettableMarket();
    const punter = await punterWith(300);
    signedInAs(punter);

    const result = await placeBetsAction({
      selections: [
        {
          questionId: question._id.toString(),
          optionId: question.options[0]!._id.toString(),
          stake: 400,
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(await Bet.countDocuments()).toBe(0);
    expect((await User.findById(punter._id).lean())?.coinBalance).toBe(300);
  });

  it("rejects the same option twice in one slip", async () => {
    const { question } = await bettableMarket();
    const punter = await punterWith(5_000);
    signedInAs(punter);

    const optionId = question.options[0]!._id.toString();

    const result = await placeBetsAction({
      selections: [
        { questionId: question._id.toString(), optionId, stake: 100 },
        { questionId: question._id.toString(), optionId, stake: 100 },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/twice/i);
  });

  it("refuses a signed-out caller", async () => {
    const { question } = await bettableMarket();
    signedInAs(null);

    const result = await placeBetsAction({
      selections: [
        {
          questionId: question._id.toString(),
          optionId: question.options[0]!._id.toString(),
          stake: 100,
        },
      ],
    });

    expect(result).toMatchObject({ ok: false });
    expect(await Bet.countDocuments()).toBe(0);
  });
});
