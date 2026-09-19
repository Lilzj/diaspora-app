/**
 * Noticing that somebody may have moved — 19 Sep 2026.
 *
 * The proposal was that the app detect a location change and prompt the member
 * to verify the new country. The shape it had to take instead is the whole
 * subject of these tests: **travel is not relocation, and this audience
 * travels.** Somebody from Nigeria living in Mauritius spends three weeks in
 * Lagos at Christmas, and for those three weeks the device says NG on every
 * reading. Nothing distinguishes a holiday from a move except how long it lasts.
 *
 * So the rules are deliberately slow — thirty days, eight sightings, a 70%
 * majority — and the outcome is a dismissible question rather than a write. The
 * tests below are mostly about what does *not* happen.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DISMISSAL_DAYS,
  MIN_SIGHTINGS,
  MIN_SPAN_DAYS,
  WINDOW_DAYS,
  dismissSuggestion,
  isRelocationHintEnabled,
  suggestRelocation,
  type Sighting,
} from '../location/relocation-hint';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-19T12:00:00Z');
const SIGHTINGS_KEY = 'diaspora.relocation.sightings.v1';
const DISMISSED_KEY = 'diaspora.relocation.dismissed.v1';

/** Daily sightings of one country, ending `endingDaysAgo` days before NOW. */
function run(countryCode: string, days: number, endingDaysAgo = 0): Sighting[] {
  return Array.from({ length: days }, (_, index) => ({
    countryCode,
    at: NOW.getTime() - (endingDaysAgo + index) * DAY,
  }));
}

async function seed(sightings: Sighting[]): Promise<void> {
  await AsyncStorage.setItem(SIGHTINGS_KEY, JSON.stringify(sightings));
}

beforeEach(async () => {
  process.env.EXPO_PUBLIC_ENABLE_RELOCATION_HINT = '1';
  await AsyncStorage.removeItem(SIGHTINGS_KEY);
  await AsyncStorage.removeItem(DISMISSED_KEY);
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_ENABLE_RELOCATION_HINT;
});

describe('the flag', () => {
  /**
   * §55 forbids inferring sensitive identity characteristics without explicit
   * product authorization, and where somebody lives is exactly that. Off is the
   * state this ships in until that authorization is given.
   */
  it('is off unless the build says otherwise', () => {
    delete process.env.EXPO_PUBLIC_ENABLE_RELOCATION_HINT;
    expect(isRelocationHintEnabled()).toBe(false);

    process.env.EXPO_PUBLIC_ENABLE_RELOCATION_HINT = 'true';
    expect(isRelocationHintEnabled()).toBe(false);

    process.env.EXPO_PUBLIC_ENABLE_RELOCATION_HINT = '';
    expect(isRelocationHintEnabled()).toBe(false);

    process.env.EXPO_PUBLIC_ENABLE_RELOCATION_HINT = '1';
    expect(isRelocationHintEnabled()).toBe(true);
  });

  it('suggests nothing at all when it is off, however strong the evidence', async () => {
    delete process.env.EXPO_PUBLIC_ENABLE_RELOCATION_HINT;
    await seed(run('KE', 60));

    await expect(suggestRelocation(['MU'], NOW)).resolves.toBeNull();
  });
});

describe('what does not count as moving', () => {
  /**
   * The case the whole design exists for. Three weeks at home is not a move, and
   * a rule that fired on it would ask a member to re-verify every Christmas.
   */
  it('a three-week trip home is not a move', async () => {
    await seed([...run('NG', 21), ...run('MU', 60, 21)]);

    await expect(suggestRelocation(['MU'], NOW)).resolves.toBeNull();
  });

  it('a handful of app opens proves nothing, however recent', async () => {
    await seed(run('KE', MIN_SIGHTINGS - 1));

    await expect(suggestRelocation(['MU'], NOW)).resolves.toBeNull();
  });

  it('a long history that is mostly somewhere else is not a majority', async () => {
    // Half and half: whichever way it tips, it is not 70% of anything.
    await seed([...run('KE', 30), ...run('MU', 30, 30)]);

    await expect(suggestRelocation(['MU'], NOW)).resolves.toBeNull();
  });

  /**
   * Plenty of members split their time between two countries and have declared
   * both. A device that keeps reporting one of them is reporting something the
   * member already told us.
   */
  it('a country the member has already declared is not news', async () => {
    await seed(run('KE', 60));

    await expect(suggestRelocation(['MU', 'KE'], NOW)).resolves.toBeNull();
  });

  it('matches the declared country whatever case it arrives in', async () => {
    await seed(run('KE', 60));

    await expect(suggestRelocation(['ke'], NOW)).resolves.toBeNull();
  });

  /**
   * Sightings from last year say nothing about now. Without the window, a member
   * who moved to Kenya and then home again would still be asked about Kenya.
   */
  it('forgets sightings older than the window', async () => {
    await seed(run('KE', 60, WINDOW_DAYS + 1));

    await expect(suggestRelocation(['MU'], NOW)).resolves.toBeNull();
  });
});

describe('what does count', () => {
  it('asks after a long, consistent run somewhere undeclared', async () => {
    await seed(run('KE', MIN_SPAN_DAYS + 10));

    await expect(suggestRelocation(['MU'], NOW)).resolves.toBe('KE');
  });

  /**
   * Enough sightings but crammed into a fortnight is a holiday, not a move. Both
   * the count and the span have to clear, which is why they are separate rules.
   */
  it('needs the span and not only the count', async () => {
    await seed(run('KE', MIN_SPAN_DAYS - 5));

    await expect(suggestRelocation(['MU'], NOW)).resolves.toBeNull();
  });

  it('tolerates a trip away during the new residence', async () => {
    // Two months in Kenya with a week in Mauritius in the middle: still Kenya.
    await seed([...run('KE', 25), ...run('MU', 7, 25), ...run('KE', 28, 32)]);

    await expect(suggestRelocation(['MU'], NOW)).resolves.toBe('KE');
  });
});

describe('when the member says no', () => {
  it('does not ask again about the same country', async () => {
    await seed(run('KE', 60));

    await expect(suggestRelocation(['MU'], NOW)).resolves.toBe('KE');

    await dismissSuggestion('KE', NOW);

    await expect(suggestRelocation(['MU'], NOW)).resolves.toBeNull();
  });

  /**
   * A dismissal is about the country, not about hints. Somebody who said no to
   * Kenya in March and genuinely moved to Ghana in August should be asked.
   */
  it('still asks about a different country', async () => {
    await dismissSuggestion('KE', NOW);
    await seed(run('GH', 60));

    await expect(suggestRelocation(['MU'], NOW)).resolves.toBe('GH');
  });

  it('lets the question return once the dismissal has aged out', async () => {
    const longAgo = new Date(NOW.getTime() - (DISMISSAL_DAYS + 1) * DAY);

    await dismissSuggestion('KE', longAgo);
    await seed(run('KE', 60));

    await expect(suggestRelocation(['MU'], NOW)).resolves.toBe('KE');
  });
});

describe('when the stored history is unusable', () => {
  /**
   * This runs at launch. A corrupt store has to mean "no history", never a crash
   * on the path every member walks.
   */
  it('treats unparseable storage as no history', async () => {
    await AsyncStorage.setItem(SIGHTINGS_KEY, 'not json at all');

    await expect(suggestRelocation(['MU'], NOW)).resolves.toBeNull();
  });

  it('ignores rows that are not sightings', async () => {
    await AsyncStorage.setItem(
      SIGHTINGS_KEY,
      JSON.stringify([{ nonsense: true }, null, 42, ...run('KE', 60)])
    );

    await expect(suggestRelocation(['MU'], NOW)).resolves.toBe('KE');
  });
});
