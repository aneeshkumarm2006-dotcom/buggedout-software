# BuggedOut

A betting platform for live real-world animal events, played with **free virtual coins only** —
no real money, no deposits, no withdrawals. One Next.js codebase carries the player site, the
admin panel and the API.

- **Stack** — Next.js 16 (App Router) · TypeScript · MongoDB via Mongoose · Tailwind v4 ·
  shadcn/ui · Auth.js (credentials) · Zod · Vitest
- **Currency** — 1,000 coins at signup, 100 more per day on request. Every movement is written by
  one wallet service and mirrored into an append-only ledger.
- **Games** — ten game categories, each a template for `Tournament → Teams → Match → Questions`.
  Users bet on a question's options; an admin enters the result and every bet is settled at the
  odds it was placed at.

---

## Getting started

```bash
npm install
cp .env.example .env.local     # then fill it in — see below
npm run seed                   # ten games, a super-admin and a test player
npm run dev                    # http://localhost:3000
```

The seed prints the two logins it created. By default:

| Account | Email | Password | Lands on |
| --- | --- | --- | --- |
| Super-admin | `admin@buggedout.com` | `BuggedOut!2026` | `/admin` |
| Test player | `player@buggedout.com` | `TestPlayer!2026` | `/` with 1,000 coins |

Override either password with `SEED_ADMIN_PASSWORD` / `SEED_PLAYER_PASSWORD` before running the
seed. **Change the admin password before any deployment reachable from the internet** — these
defaults are written down in a README.

### Requirements

- Node.js 20.9+ (developed on 24)
- A MongoDB 6+ database. A **replica set** — which every Atlas cluster is — is recommended: the
  wallet and settlement paths run their writes inside a multi-document transaction where one is
  available, and fall back to a compensating undo where it is not. Both work; only the first is
  atomic.

---

## Environment

Copy `.env.example` to `.env.local`. Everything is validated at startup by `src/lib/env.ts`, which
throws with a list of what is missing rather than failing later at a query.

| Variable | Required | What it does |
| --- | --- | --- |
| `MONGODB_URI` | yes | Connection string. Local: `mongodb://127.0.0.1:27017/buggedout`. Atlas: `mongodb+srv://…/buggedout?retryWrites=true&w=majority`. |
| `AUTH_SECRET` | yes | Signs the session JWT. Generate with `npx auth secret`. |
| `AUTH_TRUST_HOST` | off Vercel | `true` for local dev and any non-Vercel host. |
| `AUTH_URL` | no | Absolute origin. Builds password-reset links outside a request, and is the `metadataBase` for OG tags. Falls back to `VERCEL_PROJECT_PRODUCTION_URL`, then `https://buggedout.com`. |
| `SIGNUP_BONUS_COINS` | no (1000) | Credited once, immediately after signup. |
| `DAILY_BONUS_COINS` | no (100) | Claimable once per 24 hours. `0` switches the bonus off. |
| `CRON_SECRET` | production | Guards `/api/cron/*`. With none set the route answers only outside production. |
| `CLOUDINARY_CLOUD_NAME` | no | Image storage. All three or none — half-configured fails at startup. |
| `CLOUDINARY_API_KEY` | no | ↑ |
| `CLOUDINARY_API_SECRET` | no | ↑ |
| `CLOUDINARY_FOLDER` | no (`buggedout`) | Root folder every upload nests under. |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | no | Same value as `CLOUDINARY_CLOUD_NAME`. Not a secret. |
| `NEXT_PUBLIC_CLOUDINARY_FOLDER` | no (`buggedout`) | Same value as `CLOUDINARY_FOLDER`. Not a secret. |
| `SEED_ADMIN_PASSWORD` | no | Seed only. |
| `SEED_PLAYER_PASSWORD` | no | Seed only. |

Both `NEXT_PUBLIC_` copies exist because the browser has to build URLs the server never sends it:
the upload field picks a resize target from whether cloud storage is on, and `lib/site-assets.ts`
names chrome URLs without a database lookup. Startup fails if a copy disagrees with its original.

### Asset storage

Everything the app serves goes through `src/lib/storage/`, and nothing outside it knows which
provider answered:

- **Cloudinary** when the three credentials are set. Delivery URLs carry their transformation, so
  the CDN does the resizing and the AVIF/WebP negotiation and `AssetImage` needs no optimiser.
- **Inline data URLs** when they are not — the image rides along on the document. Fine for a 64×64
  crest, refused for a 16:9 game card, which is why that one needs real storage.

Swapping in S3 or UploadThing is a new file implementing `StorageProvider` plus a branch in
`src/lib/storage/index.ts`. No call site changes.

**Uploads** (`POST /api/uploads`) are named by a **preset** — `team-crest`, `game-card`, `avatar`
in `src/lib/storage/shared.ts`. A preset decides the crop, the folder and the permission required,
so adding an image field to a screen means naming one, not writing another upload path.

**Site chrome** — logo, win banner, empty-state icons, the marble wash — is named in
`src/lib/site-assets.ts` instead, because it ships with the app rather than being managed through
the panel. `siteAsset("logo")` returns a CDN URL when Cloudinary is configured and the `public/`
path when it is not, so where chrome is served from is one decision in one place. The files stay in
`public/` as that fallback.

Replacing or deleting an asset hands the old one back to the provider, so the account doesn't
collect a crest for every edit ever made. Uploading and then *abandoning* a form does leave an
orphan — the file is stored the moment it is picked, which is what makes the preview instant.

### Migrating existing assets

`npm run migrate:assets` moves everything the app already had onto the configured provider: game
cards and hover videos out of `public/`, team crests and avatars out of the inline data URLs they
were stored as, and the site chrome.

```bash
npm run migrate:assets              # dry run — prints the plan, writes nothing
npm run migrate:assets -- --commit
```

Safe to re-run. Every upload gets a deterministic public ID derived from the row it belongs to
(`buggedout/games/lane-races`) with `overwrite`, so a second run replaces its own output instead of
duplicating it, and anything already pointing at the provider is skipped — a half-finished run
resumes rather than starting over. Source files under `public/` are never deleted.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on :3000. |
| `npm run build` / `npm start` | Production build and server. |
| `npm run typecheck` | `tsc --noEmit` across app, scripts and tests. |
| `npm run lint` | ESLint. The repo is kept at zero warnings. |
| `npm test` | Vitest, once. |
| `npm run test:watch` | Vitest, watching. |
| `npm run migrate:assets` | Move existing assets to the storage provider. Dry run; add `-- --commit` to write. |
| `npm run seed` | Seed the database. Safe to re-run. |
| `npm run seed -- --reset` | Drop every collection first. Refuses to run with `NODE_ENV=production` unless `--force` is passed too. |

### The seed

`scripts/seed.ts` writes a super-admin, a test player, the ten games with their market templates
and card art, and one tournament + match + markets per game. Some matches are `live` and the rest
`upcoming`, with market end times a little way ahead, so there is something bettable the moment you
sign in.

It is **idempotent** — keyed on email, slug, `(category, name)` and `(match, question text)`.
Content that is safe to refresh (titles, card paths, templates) is overwritten; anything a person
or a bet may have moved since (passwords, match status, odds, market status) is only written on
insert. The test player's opening balance goes through the wallet service, so the ledger is
consistent from the first coin.

It runs under `tsx --conditions=react-server`, which is what resolves the `server-only` guard in
`src/lib/*` to a no-op outside Next.

---

## Tests

```bash
npm test
```

Three suites, all against a **real MongoDB**: `tests/global-setup.ts` starts a single-node replica
set with `mongodb-memory-server` (a real `mongod`, downloaded and cached on first run). A replica
set rather than a standalone, because that is what Atlas is, and it is the only way the
transactional half of the wallet and settlement code gets exercised at all.

- `tests/unit/wallet.test.ts` — the invariant `sum(Transaction.amount) === User.coinBalance`, held
  against insufficient funds, concurrent debits, a double-tapped bonus claim, and the append-only
  hooks on the ledger.
- `tests/unit/settlement.test.ts` — payouts at the snapshot odds, the double-settle and
  concurrent-settle guards, void and refund, match cancellation, referral commission.
- `tests/integration/lifecycle.test.ts` — the whole loop through the real server actions: an admin
  builds game → tournament → teams → match → market, a visitor signs up, claims the daily bonus,
  bets on two options, the market locks, the admin resolves it, and the balance and ledger are
  checked coin for coin. Plus the permission gate against a direct POST from a signed-out caller, a
  plain user, under-permissioned staff, and an admin banned after their session was issued.

Point `MONGODB_TEST_URI` at your own replica set to skip the binary download.

---

## Deployment (Vercel + MongoDB Atlas)

1. **Atlas** — create a cluster and a database user, name the database `buggedout`, and allow
   access from anywhere (`0.0.0.0/0`) or from Vercel's ranges. Copy the `mongodb+srv://…` string.
2. **Vercel** — import the repository and set **Root Directory** to `site`. The framework and build
   command are detected.
3. **Environment variables** — add `MONGODB_URI`, `AUTH_SECRET` and `CRON_SECRET`, plus `AUTH_URL`
   if the site answers on a domain other than the Vercel production URL. `AUTH_TRUST_HOST` is not
   needed on Vercel. Set `SIGNUP_BONUS_COINS` / `DAILY_BONUS_COINS` if the defaults are wrong.
4. **Deploy**, then seed once against the production database — from a machine, not from the
   deployment; the seed is a script, not a route:

   ```bash
   MONGODB_URI="<the Atlas string>" SEED_ADMIN_PASSWORD="<something else>" npm run seed
   ```

5. **Sign in** as the admin and change the password.

### The auto-lock cron

`vercel.json` schedules `GET /api/cron/lock-questions` every ten minutes. It moves every market
past its end time to `locked`, which is what keeps the admin's Pending Results queue filling up on
its own. It is *not* what keeps a late bet out — every read path that can be bet against locks its
own expired markets first — so a late sweep is a cosmetic problem rather than a financial one.

The route has no session. `CRON_SECRET` is the only gate (which is why `src/proxy.ts` excludes
`/api/cron` from its matcher), and Vercel Cron sends it as `Authorization: Bearer $CRON_SECRET`.
**Vercel's Hobby plan runs crons once a day** — on Hobby, either live with the daily sweep or point
an external scheduler at the same URL with the same header.

---

## How it fits together

```
src/
  app/(auth)      login · signup · forgot/reset password        → actions.ts
  app/(user)      lobby · game · match · my bets · wallet ·
                  leaderboard · referrals · support · profile   → actions.ts
  app/(admin)     /admin/*                                      → actions.ts, catalog-actions.ts,
                                                                  people-actions.ts, ops-actions.ts
  app/api/cron    the auto-lock sweep
  lib/            wallet · betting · settlement · referral · audit · authz,
                  one read model per screen, and lib/admin/* for the panel
  models/         Mongoose schemas — import from the `@/models` barrel
  schemas/        Zod input schemas, one file per model
  proxy.ts        route guard (Next 16's name for middleware)
```

Three rules the codebase does not bend on:

1. **`User.coinBalance` is written by `src/lib/wallet.ts` and nowhere else.** Every movement is one
   guarded update plus one ledger row carrying the balance it landed on, which makes
   `sum(Transaction.amount) === coinBalance` an auditable invariant. `Transaction` and `AuditLog`
   reject updates and deletes outright — a correction is a compensating entry.
2. **A bet is paid at the odds it was placed at.** `optionName`, `ratio` and `potentialWin` are
   snapshotted onto the Bet row and settlement never re-reads the live question, so editing odds
   cannot change what an outstanding bet is worth.
3. **A server action is a public POST.** Every one re-checks permissions against the database
   rather than trusting the session's copy of them, and parses its payload with Zod before
   anything reaches Mongo.

## Not in scope

Real money, payments or withdrawals · streaming UI · RNG/casino games · parlays · social login ·
captcha · landing pages, blog, raffle or chat · native apps.
