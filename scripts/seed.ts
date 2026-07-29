/**
 * Database seed (Phase 9.1).
 *
 *   npm run seed                     # idempotent — safe to run over an existing database
 *   npm run seed -- --reset          # drop every app collection first, then seed
 *   npm run seed -- --no-accounts    # games only; skip the two demo logins
 *
 * Writes a super-admin, a test player, the ten games with their market
 * templates and cards, and one tournament + match + markets per game, so a
 * fresh clone has something to log into and bet on.
 *
 * `--no-accounts` is for a *deployed* database, where the demo logins are a
 * liability rather than a convenience: their passwords default to the constants
 * below, which are in the repository. The game content needs no account behind
 * it, so it seeds identically either way.
 *
 * Idempotency is by natural key — email, slug, `(category, name)`,
 * `(match, question text)`. Content that is safe to refresh (titles, card
 * paths, templates) is `$set`; anything a human or a bet may have moved since
 * (passwords, match status, odds, market status) is `$setOnInsert`, so a second
 * run never rewrites live state.
 *
 * Coins move only through the wallet service, exactly as they do in the app —
 * the test player's opening balance is a real `signup_bonus` ledger row, not a
 * number written onto the user.
 *
 * Run with `--conditions=react-server` (see the npm script): the modules below
 * are `server-only`, and that condition is what resolves the guard to a no-op
 * outside Next.
 */
import mongoose, { Types } from "mongoose";

import { connectDB, disconnectDB } from "@/lib/db";
import { DEFAULT_STAFF_PERMISSIONS } from "@/lib/permissions";
import { hashPassword } from "@/lib/password";
import { creditSignupBonus } from "@/lib/wallet";
import {
  GameCategory,
  Match,
  Question,
  Team,
  Tournament,
  User,
  generateReferralCode,
  getReferralSetting,
  type IGameCategory,
  type IMatch,
  type ITeam,
  type ITournament,
  type IUser,
} from "@/models";

import { SEED_GAMES, type SeedGame } from "./seed-data";

/* ------------------------------------------------------------------ *
 * Accounts
 * ------------------------------------------------------------------ */

const ADMIN = {
  email: "admin@buggedout.com",
  username: "admin",
  password: process.env.SEED_ADMIN_PASSWORD ?? "BuggedOut!2026",
};

const PLAYER = {
  email: "player@buggedout.com",
  username: "testplayer",
  password: process.env.SEED_PLAYER_PASSWORD ?? "TestPlayer!2026",
};

/* ------------------------------------------------------------------ *
 * Timing
 *
 * Everything is relative to the moment the seed runs, so a database seeded
 * last week still opens on markets that are open today.
 * ------------------------------------------------------------------ */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const now = Date.now();
const at = (offsetMs: number) => new Date(now + offsetMs);

/**
 * A live match started a little while ago and its markets close within the
 * hour; an upcoming one is staggered a few hours out so the lobby countdown has
 * something to count. Betting needs `status ∈ {upcoming, live}` *and* an
 * `endDate` in the future, so both kinds are bettable the moment you log in.
 */
function scheduleFor(game: SeedGame, index: number): { startTime: Date; marketEnd: Date } {
  return game.live
    ? { startTime: at(-20 * MINUTE), marketEnd: at(45 * MINUTE + index * 5 * MINUTE) }
    : {
        startTime: at((index + 1) * 4 * HOUR),
        marketEnd: at((index + 1) * 4 * HOUR + 30 * MINUTE),
      };
}

/* ------------------------------------------------------------------ *
 * Team crests
 *
 * There is no file storage in the MVP — 6.6 stores a client-resized 64×64 as a
 * data URL, so the seed does the same rather than inventing an asset pipeline.
 * An inline SVG keeps every crest well under the 500-character cap that
 * `imagePath` (schemas/common.ts) puts on the field.
 * ------------------------------------------------------------------ */

const CREST_HUES = [140, 186, 43, 8, 265, 320, 100, 210];

function crestFor(name: string, index: number): string {
  const hue = CREST_HUES[index % CREST_HUES.length];
  const label = initialsFor(name);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" rx="14" fill="hsl(${hue},32%,14%)"/>` +
    `<text x="32" y="42" font-family="sans-serif" font-size="24" font-weight="700" ` +
    `text-anchor="middle" fill="hsl(${hue},85%,62%)">${label}</text></svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

/** "Lane 1" → "L1", "Houdini" → "HO". Two characters is all that fits at 64px. */
function initialsFor(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);

  const initials =
    words.length > 1
      ? words[0]!.charAt(0) + words[words.length - 1]!.charAt(0)
      : name.slice(0, 2);

  return initials.toUpperCase();
}

/* ------------------------------------------------------------------ *
 * The seed
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const flags = new Set(process.argv.slice(2));

  await connectDB();
  // The database name only — the URI carries the Atlas password.
  log(`connected to database "${mongoose.connection.name}"`);

  if (flags.has("--reset")) await resetDatabase(flags.has("--force"));

  const withAccounts = !flags.has("--no-accounts");
  const admin = withAccounts ? await seedAdmin() : null;
  const player = withAccounts ? await seedPlayer() : null;
  if (!withAccounts) log("--no-accounts: skipped the demo admin and player");
  await getReferralSetting(); // materialises the singleton with its defaults

  let categories = 0;
  let teams = 0;
  let tournaments = 0;
  let matches = 0;
  let questions = 0;

  for (const [index, game] of SEED_GAMES.entries()) {
    const category = await seedCategory(game, index);
    categories += 1;

    const teamIds = await seedTeams(game, category._id);
    teams += teamIds.length;

    const tournament = await seedTournament(game, category._id);
    tournaments += 1;

    const { startTime, marketEnd } = scheduleFor(game, index);
    const match = await seedMatch(game, category._id, tournament._id, teamIds, startTime);
    matches += 1;

    questions += await seedQuestions(game, match._id, marketEnd);
  }

  log("");
  log(`games ${categories} · teams ${teams} · tournaments ${tournaments} · matches ${matches} · markets ${questions}`);
  if (!admin || !player) return;

  log("");
  log("Sign in with:");
  log(`  admin   ${ADMIN.email}  /  ${ADMIN.password}   (superadmin → /admin)`);
  log(`  player  ${PLAYER.email}  /  ${PLAYER.password}   (${player.coinBalance.toLocaleString()} coins)`);
  log(`  referral code: ${player.referralCode}`);
  log("");
  log(`admin id ${admin._id.toString()}`);
}

/**
 * `--reset` drops every collection in the target database. Deliberately not the
 * default and deliberately not reachable in production without saying so twice:
 * pointed at Atlas by accident this is the whole platform.
 */
async function resetDatabase(force: boolean): Promise<void> {
  if (process.env.NODE_ENV === "production" && !force) {
    throw new Error("--reset refuses to run with NODE_ENV=production. Add --force if you mean it.");
  }

  const db = mongoose.connection.db;
  if (!db) throw new Error("No database handle on the connection.");

  const collections = await db.listCollections({}, { nameOnly: true }).toArray();

  for (const { name } of collections) {
    // Not `Model.deleteMany` — Transaction and AuditLog reject that by design
    // (both are append-only), and a reset is the one moment that has to win.
    await db.collection(name).drop();
  }

  log(`--reset: dropped ${collections.length} collection(s)`);
}

async function seedAdmin(): Promise<IUser> {
  const existing = await User.findOne({ email: ADMIN.email }).lean<IUser>();

  if (existing) {
    // Never silently rewrite an existing account's password or permissions —
    // this may be a real operator's login by now.
    log(`admin ${ADMIN.email} already exists (unchanged)`);
    return existing;
  }

  const [created] = await User.create([
    {
      email: ADMIN.email,
      username: ADMIN.username,
      passwordHash: await hashPassword(ADMIN.password),
      role: "superadmin",
      // A superadmin bypasses the matrix (`hasPermission`), so the list is
      // cosmetic — it is here so the 6.3 matrix renders ticked rather than empty.
      permissions: [...DEFAULT_STAFF_PERMISSIONS],
      status: "active",
      referralCode: generateReferralCode(),
    },
  ]);

  log(`admin ${ADMIN.email} created`);

  return created.toObject() as IUser;
}

async function seedPlayer(): Promise<IUser> {
  const existing = await User.findOne({ email: PLAYER.email }).lean<IUser>();

  if (existing) {
    log(`player ${PLAYER.email} already exists (unchanged)`);
    return existing;
  }

  const [created] = await User.create([
    {
      email: PLAYER.email,
      username: PLAYER.username,
      passwordHash: await hashPassword(PLAYER.password),
      role: "user",
      status: "active",
      referralCode: generateReferralCode(),
    },
  ]);

  // Through the wallet service, so the opening balance has a ledger row behind
  // it and `sum(Transaction.amount) === coinBalance` holds from the first coin.
  const movement = await creditSignupBonus(created._id);

  log(`player ${PLAYER.email} created with ${(movement?.balanceAfter ?? 0).toLocaleString()} coins`);

  return { ...(created.toObject() as IUser), coinBalance: movement?.balanceAfter ?? 0 };
}

async function seedCategory(game: SeedGame, index: number): Promise<IGameCategory> {
  const category = await GameCategory.findOneAndUpdate(
    { slug: game.slug },
    {
      $set: {
        title: game.title,
        // Phase 8 named every asset after the slug, so nothing is typed twice.
        cardImage: `/game-cards/${game.slug}.webp`,
        animatedCard: game.animated ? `/game-cards/${game.slug}.mp4` : null,
        sortOrder: index,
        marketTemplates: game.markets.map((market) => ({
          question: market.question,
          options: market.options.map((option) => option.name),
          defaultRatio: market.defaultRatio,
        })),
      },
      $setOnInsert: { slug: game.slug, status: "active" },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ).lean<IGameCategory>();

  return category;
}

async function seedTeams(game: SeedGame, categoryId: Types.ObjectId): Promise<Types.ObjectId[]> {
  const ids: Types.ObjectId[] = [];

  for (const [index, name] of game.teams.entries()) {
    const team = await Team.findOneAndUpdate(
      { categoryId, name },
      {
        // The crest is `$setOnInsert`: an admin may have uploaded a real one
        // through 6.6 since, and a re-seed has no business overwriting it.
        $setOnInsert: {
          categoryId,
          name,
          image: crestFor(name, index),
          status: "active",
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    ).lean<ITeam>();

    ids.push(team._id);
  }

  return ids;
}

async function seedTournament(
  game: SeedGame,
  categoryId: Types.ObjectId,
): Promise<ITournament> {
  return Tournament.findOneAndUpdate(
    { categoryId, title: game.tournament },
    {
      $set: { startDate: at(-7 * DAY), endDate: at(30 * DAY) },
      $setOnInsert: { categoryId, title: game.tournament, status: "ongoing" },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ).lean<ITournament>();
}

async function seedMatch(
  game: SeedGame,
  categoryId: Types.ObjectId,
  tournamentId: Types.ObjectId,
  teamIds: Types.ObjectId[],
  startTime: Date,
): Promise<IMatch> {
  const existing = await Match.findOne({ categoryId, title: game.match }).lean<IMatch>();

  // A match that already exists may have been resolved, cancelled or rescheduled
  // by an admin, and may have bets against it — leave all of that alone.
  if (existing) return existing;

  const [created] = await Match.create([
    {
      title: game.match,
      categoryId,
      tournamentId,
      teamIds,
      startTime,
      status: game.live ? "live" : "upcoming",
      streamUrl: null,
    },
  ]);

  return created.toObject() as IMatch;
}

async function seedQuestions(
  game: SeedGame,
  matchId: Types.ObjectId,
  endDate: Date,
): Promise<number> {
  let written = 0;

  for (const market of game.markets) {
    const existing = await Question.exists({ matchId, text: market.question });
    // Odds, status and the winner flags are all things settlement and the admin
    // own once a market exists. Only ever insert.
    if (existing) continue;

    await Question.create({
      matchId,
      text: market.question,
      options: market.options.map((option) => ({
        name: option.name,
        ratio: option.ratio,
        status: "active",
        isWinner: false,
      })),
      status: "active",
      endDate,
      minStakePerBet: 10,
      maxStakePerBet: 10_000,
    });

    written += 1;
  }

  return written;
}

function log(message: string): void {
  console.log(message ? `[seed] ${message}` : "");
}

main()
  .then(async () => {
    await disconnectDB();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("[seed] failed:", error);
    await disconnectDB().catch(() => {});
    process.exit(1);
  });
