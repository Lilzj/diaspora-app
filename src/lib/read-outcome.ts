// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — "gone" and "we could not ask" are different answers
//
// A home's page and an item's page both caught every failure into one panel:
//
//     Listing Not Found
//     This property listing may have been rented, expired, or archived.
//
// A dropped connection, a 500, an expired token and a genuinely deleted home
// all produced that sentence — so the app told members a home had been rented
// when it had simply failed to ask. It is the same shape as the refusals in
// [[diaspora-unanswered-is-not-no]]: a transport failure read as an answer.
//
// Only 404 and 410 are the platform saying the thing is not there. Everything
// else is unknown, and the screen says so and offers to try again.
// ─────────────────────────────────────────────────────────────────────────────

export type ReadOutcome = 'gone' | 'unreachable';

/** What a failed read actually established. Anything but "not there" is unknown. */
export function readOutcome(cause: unknown): ReadOutcome {
  const status = (cause as { response?: { status?: number } } | null)?.response?.status;

  return status === 404 || status === 410 ? 'gone' : 'unreachable';
}

/**
 * The two sentences a failed read shows: what happened, and what to do.
 *
 * `noun` is the thing being read — "home", "item" — so the panel names it
 * rather than saying "listing" on a screen that says "home" everywhere else.
 */
export function readOutcomeMessage(
  outcome: ReadOutcome,
  noun: string
): { title: string; detail: string } {
  return outcome === 'gone'
    ? {
        title: `This ${noun} is no longer listed`,
        detail: `It may have been taken down by whoever listed it. Nothing has gone wrong on your phone.`,
      }
    : {
        title: `We could not load this ${noun}`,
        detail: `Diaspora could not be reached just now, so we cannot say whether this ${noun} is still listed. Check your connection and try again.`,
      };
}
