/**
 * No screen grows past 600 lines, and a composed screen stays composed (FSOLID-001).
 *
 * The audit found fifteen screens over 800 lines, and nineteen were by the time
 * the finding was fixed: `(tabs)/discover.tsx` the longest at 2,283 (2,253 when
 * the audit counted). Each held everything its route did, rendering, fetching,
 * domain logic, navigation, gating and error handling, in one component with no
 * reviewable unit smaller than itself. expo-router makes the route file the unit
 * of work, and nothing said how large one could get.
 *
 * The audit asked for the shape and a ceiling rather than a sweep. The three
 * largest, `(tabs)/discover.tsx`, `housing/create.tsx` and
 * `community-life/events.tsx`, are composed now: each route calls one hook per
 * concern and renders one section per part of the page, from
 * `src/components/screens/<screen>/`. The screens still over the budget are
 * listed at their length when the finding was fixed, so the list only shrinks.
 */
import { APP_ROOT, SCREEN_PARTS_ROOT, filesUnder } from './support/screen-files';

const fs = require('fs') as { readFileSync(path: string, encoding: string): string };

/** The most any screen file may hold: a route, or a part of a composed screen. */
const BUDGET = 600;

/**
 * The routes over the budget when FSOLID-001 was fixed, each at its length then.
 *
 * Lower an entry as its screen shrinks and delete it once the screen is within
 * the budget. Nothing is added: a screen that would outgrow the budget is
 * composed instead, the way the three were.
 */
const OVER_BUDGET: Record<string, number> = {
  'marketplace/create.tsx': 1291,
  'community-life/org/[id].tsx': 1402,
  'community-life/event/[id].tsx': 1276,
  '(tabs)/post.tsx': 1226,
  'community-life/event/create.tsx': 1184,
  'housing/[id].tsx': 1204,
  'guide/[id].tsx': 1038,
  'marketplace/[id].tsx': 1005,
  'guide/create.tsx': 891,
  'automation/create.tsx': 911,
  'verification/diaspora.tsx': 848,
  'job/[id].tsx': 854,
  'creator/index.tsx': 843,
  'community/[slug]/index.tsx': 828,
  'community-life/campaign/[id].tsx': 812,
  'conversation/[id].tsx': 803,
  'community-life/org/create.tsx': 766,
  '(tabs)/index.tsx': 693,
  '(tabs)/search.tsx': 712,
  'creator/profile.tsx': 698,
  'job/create.tsx': 683,
  'creator/grants/[id].tsx': 676,
  'creator/analytics.tsx': 675,
  'monetization/campaigns/create.tsx': 601,
  'monetization/promotions/[id].tsx': 634,
  'community/onboarding.tsx': 610,
};

/** The routes that compose their screen from `src/components/screens`. */
const COMPOSED = ['(tabs)/discover.tsx', 'community-life/events.tsx', 'housing/create.tsx'];

/** How long a composed route may be: composition, and the comments that say what it composes. */
const COMPOSED_CEILING = 250;

/** State, effects and memoised values belong to a composed screen's hooks, not its route. */
const HOLDS_STATE = [
  /^\s*(?:const|let)\b[^=\n]*=\s*use(?:State|Reducer|Ref|Memo|Callback)\s*[<(]/m,
  /^\s*use(?:Effect|LayoutEffect|FocusEffect)\s*\(/m,
];

/** Lines as an editor numbers them: a final newline does not start another line. */
function lineCount(file: string): number {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n').length;
  return text.endsWith('\n') ? lines - 1 : lines;
}

const named = (root: string, file: string) => file.slice(root.length + 1).split(/[\\/]/).join('/');

const ROUTES = filesUnder(APP_ROOT).map((file) => ({ name: named(APP_ROOT, file), file, lines: lineCount(file) }));
const PARTS = filesUnder(SCREEN_PARTS_ROOT).map((file) => ({
  name: named(SCREEN_PARTS_ROOT, file),
  file,
  lines: lineCount(file),
}));
const route = (name: string) => ROUTES.find((entry) => entry.name === name);

it('finds the screens it holds to the budget', () => {
  // Canary: a walk that found nothing, or stopped at the top level, would hold nothing.
  expect(ROUTES.length).toBeGreaterThanOrEqual(250);
  expect(ROUTES.map((entry) => entry.name)).toEqual(
    expect.arrayContaining([...COMPOSED, 'marketplace/create.tsx', '(tabs)/index.tsx', 'community-life/org/[id].tsx'])
  );
  expect(PARTS.length).toBeGreaterThanOrEqual(60);
  expect(PARTS.map((entry) => entry.name)).toEqual(
    expect.arrayContaining([
      'discover/useDiscoverSearch.ts',
      'housing-create/useHousingDraft.ts',
      'community-life-events/EventsTab.tsx',
    ])
  );
});

it(`holds every screen file to ${BUDGET} lines, unless it is listed`, () => {
  const over = [
    ...ROUTES.filter((entry) => entry.lines > BUDGET && !(entry.name in OVER_BUDGET)).map(
      (entry) => `src/app/${entry.name} has ${entry.lines} lines`
    ),
    ...PARTS.filter((entry) => entry.lines > BUDGET).map(
      (entry) => `src/components/screens/${entry.name} has ${entry.lines} lines`
    ),
  ];

  // Every offender at once, not the first: a list is what the fix needs.
  expect(over).toEqual([]);
});

it('lets no listed screen grow', () => {
  const grown = Object.entries(OVER_BUDGET)
    .filter(([name, ceiling]) => (route(name)?.lines ?? 0) > ceiling)
    .map(([name, ceiling]) => `${name} has ${route(name)?.lines} lines, more than its ${ceiling}`);

  expect(grown).toEqual([]);
});

it('lowers a listed length as its screen shrinks, and drops a screen once it is within the budget', () => {
  // The other half of the ratchet. A ceiling left above its screen admits growth
  // back up to it without failing; a screen within the budget no longer needs
  // an entry; and an entry for a screen that is gone is guarding nothing.
  const stale = Object.entries(OVER_BUDGET).flatMap(([name, ceiling]) => {
    const found = route(name);
    if (!found) return [`${name} no longer exists`];
    if (found.lines <= BUDGET) return [`${name} has ${found.lines} lines, within the budget: delete it`];
    return found.lines < ceiling ? [`${name} has ${found.lines} lines: lower its entry from ${ceiling}`] : [];
  });

  expect(stale).toEqual([]);
});

describe('a composed screen', () => {
  it('is named here whenever a route composes from src/components/screens', () => {
    // Derived, not listed: a route split later is held to the same rules
    // without anyone remembering to add it.
    const composing = ROUTES.filter((entry) =>
      fs.readFileSync(entry.file, 'utf8').includes("from '@/components/screens/")
    ).map((entry) => entry.name);

    expect(composing.sort()).toEqual([...COMPOSED].sort());
  });

  it.each(COMPOSED)('%s holds no state, effect or memoised value of its own', (name) => {
    const source = fs.readFileSync(route(name)?.file ?? '', 'utf8');

    expect(source).toContain("from '@/components/screens/");
    for (const pattern of HOLDS_STATE) expect(source).not.toMatch(pattern);
  });

  it.each(COMPOSED)(`%s is no longer than ${COMPOSED_CEILING} lines`, (name) => {
    expect(route(name)?.lines ?? Infinity).toBeLessThanOrEqual(COMPOSED_CEILING);
  });
});
