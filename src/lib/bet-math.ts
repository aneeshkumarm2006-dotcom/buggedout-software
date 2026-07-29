/**
 * The two bits of bet arithmetic the browser and the server both need. Kept out
 * of `src/lib/betting.ts` because that module is `server-only` — the bet slip
 * must be able to show the same potential win the engine will store, without
 * dragging Mongoose into the client bundle.
 */

/** Coins a winning bet returns. Rounded once so the slip and the Bet agree. */
export function potentialWinFor(stake: number, ratio: number): number {
  return Math.round(stake * ratio);
}

/** Identifies a slip row in both directions, so errors land on the right button. */
export function selectionKey(questionId: string, optionId: string): string {
  return `${questionId}:${optionId}`;
}
