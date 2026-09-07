// ─────────────────────────────────────────────────────────────────────────────
// A deadline is not "Just now"
//
// ── The defect ──────────────────────────────────────────────────────────────
//
// `formatRelativeTime` computed `now - then`, so any date ahead of now came out
// negative and fell into the first branch. Every future timestamp in the
// application read the same way:
//
//   "This offer runs out Just now."        the sign-up bonus
//   "Stops showing Just now"               a map alert's expiry
//   "Clears Just now"                      an earning held for thirty days
//
// plus grant deadlines and challenge end dates. Eight call sites, one formatter.
//
// Found on a creator's revenue screen: an earning that clears after a thirty-day
// wait said it had already cleared, beside a balance the member could not
// withdraw. Seven of the eight understate a deadline; that one promises somebody
// their money.
//
// ── Why the past cases are pinned too ───────────────────────────────────────
//
// The fix adds a branch above sixty-four existing callers that read the past
// tense, and every one of them would have been silently reworded by a mistake in
// the boundary. The past assertions below are not new behaviour being specified
// — they are the old behaviour being held still while the new branch was added.
// ─────────────────────────────────────────────────────────────────────────────

import { formatRelativeTime } from '../format';

/** A fixed now, so the boundaries are exact rather than raced. */
const NOW = new Date('2026-09-07T12:00:00.000Z').getTime();

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** A timestamp `seconds` in the future (negative for the past). */
function at(seconds: number): string {
  return new Date(NOW + seconds * 1000).toISOString();
}

describe('a date in the future', () => {
  it('does not say it has already happened', () => {
    // The whole defect, in one assertion. Anything ahead of now used to be
    // "Just now" because the difference was negative.
    expect(formatRelativeTime(at(30 * 24 * 3600))).not.toBe('Just now');
  });

  it('reads as a wait, in the caller’s sentence', () => {
    // Lower case on purpose: every call site writes it into a sentence, and the
    // one that found this bug renders `Clears {formatRelativeTime(...)}`.
    expect(formatRelativeTime(at(120))).toBe('in 2 mins');
    expect(formatRelativeTime(at(2 * 3600))).toBe('in 2 hours');
    expect(formatRelativeTime(at(3 * 24 * 3600))).toBe('in 3 days');
  });

  it('says tomorrow rather than in 1 days', () => {
    expect(formatRelativeTime(at(25 * 3600))).toBe('tomorrow');
  });

  it('gives a date once a count stops being useful', () => {
    // Thirty days out, "in 30 days" is a number somebody has to convert. The
    // clearing date is what they will actually look for.
    const result = formatRelativeTime(at(30 * 24 * 3600));

    expect(result).toMatch(/^on /);
    expect(result).not.toMatch(/days/);
  });

  it('handles the singulars', () => {
    expect(formatRelativeTime(at(60))).toBe('in 1 min');
    expect(formatRelativeTime(at(3600))).toBe('in 1 hour');
  });
});

describe('a date in the past is unchanged', () => {
  // Sixty-four callers read these. The new branch sits above them, and a
  // mistake in its boundary would have reworded every one.
  it('still says Just now for the moment that has just gone', () => {
    expect(formatRelativeTime(at(-1))).toBe('Just now');
    expect(formatRelativeTime(at(-44))).toBe('Just now');
  });

  it('still counts minutes, hours and days backwards', () => {
    expect(formatRelativeTime(at(-120))).toBe('2 mins ago');
    expect(formatRelativeTime(at(-2 * 3600))).toBe('2 hours ago');
    expect(formatRelativeTime(at(-25 * 3600))).toBe('Yesterday');
    expect(formatRelativeTime(at(-3 * 24 * 3600))).toBe('3 days ago');
  });

  it('still falls back to a bare date beyond a week', () => {
    const result = formatRelativeTime(at(-30 * 24 * 3600));

    expect(result).not.toMatch(/^on /);
    expect(result).not.toMatch(/ago/);
  });
});

describe('the boundary between them', () => {
  it('treats exactly now as the past, not the future', () => {
    // `seconds === 0` must not fall into the future branch, or the most common
    // timestamp in the application — something that just happened — would read
    // "in a moment".
    expect(formatRelativeTime(at(0))).toBe('Just now');
  });
});

describe('what it refuses to touch', () => {
  it('passes an unparseable string through unchanged', () => {
    // Deliberate, and documented at the call site: the seeded notification store
    // holds display strings like "10 mins ago", and blanking them would empty
    // every row.
    expect(formatRelativeTime('10 mins ago')).toBe('10 mins ago');
  });

  it('answers empty for nothing', () => {
    expect(formatRelativeTime(null)).toBe('');
    expect(formatRelativeTime(undefined)).toBe('');
  });
});
