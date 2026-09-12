// ─────────────────────────────────────────────────────────────────────────────
// The thirty days, counted — 12 Sep 2026
//
// Written because the first run on a real device rendered "31 days to go" for a
// thirty-day wait, under copy promising thirty. The cause was `Math.ceil` on a
// millisecond difference and a phone clock a little behind the server's; the
// skew case is the first test here, because it is the one that shipped.
// ─────────────────────────────────────────────────────────────────────────────

import { daysLeftLabel, daysUntil } from '../community/closure';

/** What the platform stamps: exactly thirty days after the request. */
const REQUESTED = '2026-09-12T00:59:22.686Z';
const EFFECTIVE = '2026-10-12T00:59:22.686Z';

describe('counting the wait', () => {
  it('is thirty, not thirty-one, when the phone clock lags the server', () => {
    // The device believes it is a minute and a half before the server stamped
    // the request. `Math.ceil` on the difference answered 31 here.
    const deviceNow = new Date('2026-09-12T00:57:50.000Z');

    expect(daysUntil(EFFECTIVE, deviceNow)).toBe(30);
  });

  it('is thirty when the phone clock runs ahead of the server', () => {
    const deviceNow = new Date('2026-09-12T01:04:00.000Z');

    expect(daysUntil(EFFECTIVE, deviceNow)).toBe(30);
  });

  it('agrees with the promise the screen makes at the moment of asking', () => {
    // The copy says "Thirty days pass before anything can close." The count
    // beside it has to say thirty on the day it is asked for, or one of them is
    // lying to the owner.
    expect(daysUntil(EFFECTIVE, new Date(REQUESTED))).toBe(30);
  });

  it('counts down exactly one a day, all the way to zero', () => {
    // Stepped in whole days from the moment it was asked for, so every `now`
    // here sits at the same clock time as `EFFECTIVE`. That keeps the
    // expectations true in any time zone — the first draft of this test walked
    // backwards from `EFFECTIVE` in hours and failed under BST, asserting the
    // runner's zone rather than the behaviour.
    const asked = new Date(REQUESTED).getTime();
    const day = 86_400_000;

    for (let elapsed = 0; elapsed <= 30; elapsed += 1) {
      expect(daysUntil(EFFECTIVE, new Date(asked + elapsed * day))).toBe(30 - elapsed);
    }
  });

  it('floors at zero rather than counting backwards', () => {
    // A sweep that has not run yet leaves a due request sitting there. "-3 days
    // to go" would read as a community that closed on the ninth.
    const asked = new Date(REQUESTED).getTime();

    expect(daysUntil(EFFECTIVE, new Date(asked + 33 * 86_400_000))).toBe(0);
  });

  it('answers null for something that is not a date', () => {
    expect(daysUntil('not a date')).toBeNull();
    expect(daysUntil('')).toBeNull();
  });

  it('reads as a sentence, and never as "1 days"', () => {
    expect(daysLeftLabel(30)).toBe('30 days to go.');
    expect(daysLeftLabel(1)).toBe('1 day to go.');
    expect(daysLeftLabel(0)).toBe('The wait is over.');
  });
});
