/**
 * A failure is not an absence — 16 Sep 2026.
 *
 * The home and item pages both told the member a listing "may have been rented,
 * expired, or archived" whenever the read failed, including when the phone never
 * reached Diaspora at all.
 */
import { readOutcome, readOutcomeMessage } from '../read-outcome';

describe('what a failed read established', () => {
  it('is "gone" only when the platform said so', () => {
    expect(readOutcome({ response: { status: 404 } })).toBe('gone');
    expect(readOutcome({ response: { status: 410 } })).toBe('gone');
  });

  it('is "unreachable" for every failure that answered nothing', () => {
    // No response at all: a dropped connection, a timeout, an aeroplane.
    expect(readOutcome(new Error('Network Error'))).toBe('unreachable');
    expect(readOutcome(undefined)).toBe('unreachable');
    expect(readOutcome(null)).toBe('unreachable');
    expect(readOutcome({ response: { status: 500 } })).toBe('unreachable');
    expect(readOutcome({ response: { status: 401 } })).toBe('unreachable');
  });
});

describe('what the member reads', () => {
  it('names the thing, and never claims a removal it did not see', () => {
    expect(readOutcomeMessage('gone', 'home').title).toBe('This home is no longer listed');
    expect(readOutcomeMessage('unreachable', 'item')).toEqual({
      title: 'We could not load this item',
      detail:
        'Diaspora could not be reached just now, so we cannot say whether this item is still listed. Check your connection and try again.',
    });
    expect(readOutcomeMessage('unreachable', 'home').detail).not.toMatch(/rented|archived|removed/);
  });
});
