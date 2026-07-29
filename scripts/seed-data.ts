/**
 * The content the seed writes (Phase 9.1) — kept apart from `seed.ts` so the
 * script is all mechanism and this file is all data.
 *
 * Slugs are the ones Phase 8 baked into `public/game-cards/`, so `cardImage`
 * and `animatedCard` are derived from the slug rather than typed out twice.
 * Marble Madness and aMAZEing Race have no clip in the delivery — `animated:
 * false` is what leaves `animatedCard` null and the hover layer off.
 */

export type SeedOption = { name: string; ratio: number };

export type SeedMarket = {
  question: string;
  options: SeedOption[];
  /** What the "insert from template" button (6.8) pre-fills every option with. */
  defaultRatio: number;
};

export type SeedGame = {
  slug: string;
  title: string;
  animated: boolean;
  /** Competitors on the match header — lanes, doors and tunnels count as teams. */
  teams: string[];
  tournament: string;
  match: string;
  /** `live` matches show on the lobby's Live tab; the rest are Upcoming. */
  live: boolean;
  markets: SeedMarket[];
};

export const SEED_GAMES: SeedGame[] = [
  {
    slug: "three-door-monty",
    title: "Three Door Monty",
    animated: true,
    teams: ["Door One", "Door Two", "Door Three"],
    tournament: "Monty Nights",
    match: "Three Door Monty — Round 14",
    live: true,
    markets: [
      {
        question: "Which door does the turtle choose?",
        defaultRatio: 2.8,
        options: [
          { name: "Door One", ratio: 2.7 },
          { name: "Door Two", ratio: 3.1 },
          { name: "Door Three", ratio: 2.6 },
        ],
      },
      {
        question: "Does it pick the middle door?",
        defaultRatio: 1.9,
        options: [
          { name: "Yes", ratio: 3.1 },
          { name: "No", ratio: 1.35 },
        ],
      },
      {
        question: "How long until a door is chosen?",
        defaultRatio: 2.6,
        options: [
          { name: "Under 60 seconds", ratio: 2.4 },
          { name: "60 to 120 seconds", ratio: 2.5 },
          { name: "Over 120 seconds", ratio: 3.2 },
        ],
      },
    ],
  },
  {
    slug: "lane-races",
    title: "Lane Races",
    animated: true,
    teams: ["Lane 1", "Lane 2", "Lane 3", "Lane 4"],
    tournament: "Lane Race Series",
    match: "Lane Races — Heat 7",
    live: true,
    markets: [
      {
        question: "Which lane wins?",
        defaultRatio: 3.5,
        options: [
          { name: "Lane 1", ratio: 3.2 },
          { name: "Lane 2", ratio: 4.1 },
          { name: "Lane 3", ratio: 3.4 },
          { name: "Lane 4", ratio: 3.9 },
        ],
      },
      {
        question: "Does the winner finish under two minutes?",
        defaultRatio: 1.9,
        options: [
          { name: "Yes", ratio: 1.75 },
          { name: "No", ratio: 2.05 },
        ],
      },
      {
        question: "Which lane finishes last?",
        defaultRatio: 3.5,
        options: [
          { name: "Lane 1", ratio: 3.8 },
          { name: "Lane 2", ratio: 3.3 },
          { name: "Lane 3", ratio: 3.7 },
          { name: "Lane 4", ratio: 3.4 },
        ],
      },
    ],
  },
  {
    slug: "roulette",
    title: "Roulette",
    animated: true,
    teams: ["Red Section", "Green Section", "Gold Section", "Blue Section"],
    tournament: "Wheelhouse Weekly",
    match: "Roulette — Spin 22",
    live: true,
    markets: [
      {
        question: "Which section does the turtle settle on?",
        defaultRatio: 3.6,
        options: [
          { name: "Red Section", ratio: 3.5 },
          { name: "Green Section", ratio: 3.8 },
          { name: "Gold Section", ratio: 4.2 },
          { name: "Blue Section", ratio: 3.4 },
        ],
      },
      {
        question: "Does the wheel stop on green?",
        defaultRatio: 2.0,
        options: [
          { name: "Yes", ratio: 3.8 },
          { name: "No", ratio: 1.25 },
        ],
      },
    ],
  },
  {
    slug: "chicken-bingo",
    title: "Chicken 💩 Bingo",
    animated: true,
    teams: ["Grid A", "Grid B", "Grid C", "Grid D"],
    tournament: "Coop Classic",
    match: "Chicken 💩 Bingo — Board 5",
    live: false,
    markets: [
      {
        question: "Which quadrant takes the first drop?",
        defaultRatio: 3.6,
        options: [
          { name: "Grid A", ratio: 3.6 },
          { name: "Grid B", ratio: 3.5 },
          { name: "Grid C", ratio: 3.7 },
          { name: "Grid D", ratio: 3.6 },
        ],
      },
      {
        question: "Is the first square an even number?",
        defaultRatio: 1.9,
        options: [
          { name: "Yes", ratio: 1.9 },
          { name: "No", ratio: 1.9 },
        ],
      },
      {
        question: "Time to the first drop",
        defaultRatio: 2.6,
        options: [
          { name: "Under 5 minutes", ratio: 2.9 },
          { name: "5 to 15 minutes", ratio: 2.1 },
          { name: "Over 15 minutes", ratio: 3.3 },
        ],
      },
    ],
  },
  {
    slug: "split-decision",
    title: "Split Decision",
    animated: true,
    teams: ["Left Path", "Right Path"],
    tournament: "Split Decision Cup",
    match: "Split Decision — Trial 9",
    live: false,
    markets: [
      {
        question: "Which way does the turtle go?",
        defaultRatio: 1.95,
        options: [
          { name: "Left Path", ratio: 1.95 },
          { name: "Right Path", ratio: 1.85 },
        ],
      },
      {
        question: "Does it hesitate for more than 30 seconds?",
        defaultRatio: 2.0,
        options: [
          { name: "Yes", ratio: 2.3 },
          { name: "No", ratio: 1.6 },
        ],
      },
    ],
  },
  {
    slug: "forked-fate",
    title: "Forked Fate",
    animated: true,
    teams: ["North Fork", "South Fork", "East Fork"],
    tournament: "Forked Fate Invitational",
    match: "Forked Fate — Run 3",
    live: false,
    markets: [
      {
        question: "Which fork does it take?",
        defaultRatio: 2.9,
        options: [
          { name: "North Fork", ratio: 2.8 },
          { name: "South Fork", ratio: 3.0 },
          { name: "East Fork", ratio: 2.9 },
        ],
      },
      {
        question: "Does it backtrack at least once?",
        defaultRatio: 2.0,
        options: [
          { name: "Yes", ratio: 2.2 },
          { name: "No", ratio: 1.65 },
        ],
      },
    ],
  },
  {
    slug: "tunnel-vision",
    title: "Tunnel Vision",
    animated: true,
    teams: ["Tunnel A", "Tunnel B", "Tunnel C"],
    tournament: "Tunnel Vision Open",
    match: "Tunnel Vision — Exit 11",
    live: true,
    markets: [
      {
        question: "Which tunnel does it emerge from?",
        defaultRatio: 2.9,
        options: [
          { name: "Tunnel A", ratio: 2.7 },
          { name: "Tunnel B", ratio: 3.2 },
          { name: "Tunnel C", ratio: 2.85 },
        ],
      },
      {
        question: "Does it emerge within three minutes?",
        defaultRatio: 1.9,
        options: [
          { name: "Yes", ratio: 1.7 },
          { name: "No", ratio: 2.1 },
        ],
      },
    ],
  },
  {
    slug: "the-great-escape",
    title: "The Great Escape",
    animated: true,
    teams: ["Houdini", "Bandit"],
    tournament: "Escape Head to Head",
    match: "The Great Escape — Houdini vs Bandit",
    live: false,
    markets: [
      {
        question: "Who escapes first?",
        defaultRatio: 1.9,
        options: [
          { name: "Houdini", ratio: 1.75 },
          { name: "Bandit", ratio: 2.05 },
        ],
      },
      {
        question: "Does either escape within five minutes?",
        defaultRatio: 1.9,
        options: [
          { name: "Yes", ratio: 1.55 },
          { name: "No", ratio: 2.35 },
        ],
      },
    ],
  },
  {
    slug: "marble-madness",
    title: "Marble Madness",
    animated: false,
    teams: ["Red Marble", "Blue Marble", "Gold Marble", "Green Marble"],
    tournament: "Marble Madness League",
    match: "Marble Madness — Drop 18",
    live: false,
    markets: [
      {
        question: "Which marble crosses first?",
        defaultRatio: 3.5,
        options: [
          { name: "Red Marble", ratio: 3.3 },
          { name: "Blue Marble", ratio: 3.6 },
          { name: "Gold Marble", ratio: 4.0 },
          { name: "Green Marble", ratio: 3.5 },
        ],
      },
      {
        question: "Is it a photo finish?",
        defaultRatio: 2.4,
        options: [
          { name: "Yes", ratio: 2.9 },
          { name: "No", ratio: 1.4 },
        ],
      },
    ],
  },
  {
    slug: "amazeing-race",
    title: "aMAZEing Race",
    animated: false,
    teams: ["Dash", "Nova"],
    tournament: "aMAZEing Head to Head",
    match: "aMAZEing Race — Dash vs Nova",
    live: false,
    markets: [
      {
        question: "Who completes the maze first?",
        defaultRatio: 1.9,
        options: [
          { name: "Dash", ratio: 1.8 },
          { name: "Nova", ratio: 2.0 },
        ],
      },
      {
        question: "Does the winner finish under four minutes?",
        defaultRatio: 1.9,
        options: [
          { name: "Yes", ratio: 2.15 },
          { name: "No", ratio: 1.65 },
        ],
      },
      {
        question: "How many wrong turns in total?",
        defaultRatio: 2.6,
        options: [
          { name: "0 to 2", ratio: 3.1 },
          { name: "3 to 5", ratio: 2.2 },
          { name: "6 or more", ratio: 2.8 },
        ],
      },
    ],
  },
];
