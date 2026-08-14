/**
 * "Launch Live Walkthrough" — the route, and why it looked like a logout
 *
 * Reported on device: tapping Launch Live Walkthrough inside an Explore article
 * signed the member out. It did not. Both launchers ended with
 *
 *     router.replace('/');
 *
 * and `'/'` is ambiguous in this app, because a group directory contributes
 * nothing to the URL. Two files claim it:
 *
 *     app/(auth)/index.tsx   →  '/'   the Welcome screen: "Get Started", "Sign in"
 *     app/(tabs)/index.tsx   →  '/'   the home dashboard
 *
 * The session was intact the whole time — `useAuthStore` still held it, and the
 * root layout's guard permits `(auth)` for anyone. The member was simply looking
 * at the sign-in screen, and `replace` had thrown away the history that Back
 * would have used to escape. That is indistinguishable from being logged out.
 *
 * These tests are about the route, not the rendering: the defect was entirely a
 * string, and a string is what can regress.
 */

import { FEATURE_TOURS, getTourConfig } from '@/config/featureRegistry';

// `@types/node` is not a dependency of this app, so these are pulled in through
// `require` rather than an import — the test runs under Jest, where they exist,
// while `tsc --noEmit` stays clean without adding a type package for one file.
// Same idiom as `components/__tests__/palette-classes.test.ts`.
/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs') as {
  existsSync: (p: string) => boolean;
  readdirSync: (p: string, o: { withFileTypes: true }) => Array<{ name: string; isDirectory: () => boolean }>;
  readFileSync: (p: string, enc: string) => string;
};
const path = require('path') as { join: (...parts: string[]) => string };

declare const __filename: string;
declare const require: (id: string) => unknown;

const SRC_DIR: string = path.join(__filename, '..', '..', '..', '..');
const APP_DIR: string = path.join(SRC_DIR, 'app');

/**
 * Whether expo-router has a file for this href.
 *
 * Only handles the static shapes the tour registry uses — a literal path,
 * optionally naming a group. Dynamic segments would need the real matcher; no
 * tour starts on one, and a test that quietly passed them would be worse than
 * one that cannot express them.
 */
function routeExists(href: string): boolean {
  const segments = href.split('/').filter(Boolean);
  const candidates = [
    path.join(APP_DIR, ...segments) + '.tsx',
    path.join(APP_DIR, ...segments, 'index.tsx'),
  ];
  return candidates.some((candidate) => fs.existsSync(candidate));
}

describe('every tour has somewhere to start', () => {
  it('declares an entry route', () => {
    for (const tour of FEATURE_TOURS) {
      expect(typeof tour.entryRoute).toBe('string');
      expect(tour.entryRoute.length).toBeGreaterThan(1);
    }
  });

  it('never uses a bare "/" — the ambiguity that caused the report', () => {
    // The whole defect, as an assertion. `'/'` resolves to `(auth)/index`
    // because `(auth)` is declared first in the root `Stack`.
    for (const tour of FEATURE_TOURS) {
      expect(tour.entryRoute).not.toBe('/');
    }
  });

  it('never sends a member into the auth group', () => {
    // Broader than the check above: any `(auth)` route would read as a logout,
    // not only the index.
    for (const tour of FEATURE_TOURS) {
      expect(tour.entryRoute).not.toMatch(/\(auth\)/);
    }
  });

  it('names its group when it targets the home dashboard', () => {
    // `(tabs)` is the only unambiguous way to say "the home dashboard". A tour
    // whose targets are the navigation tabs must say so explicitly.
    const home = FEATURE_TOURS.filter((tour) => /^\/(\(tabs\))?$/.test(tour.entryRoute));
    for (const tour of home) {
      expect(tour.entryRoute).toBe('/(tabs)');
    }
  });

  it('points every tour at a route file that exists', () => {
    // Guards the other half of the defect: a well-formed route that no file
    // serves is an unmatched-route screen, which reads as a crash rather than
    // as a logout.
    //
    // Resolved against `src/app` rather than against a list written out here.
    // A hand-kept list was the first version of this test, and it was already
    // wrong when it was written — it omitted `/(tabs)/discover`, which three
    // tours use. A list of routes maintained beside the routes is a second
    // place to forget.
    for (const tour of FEATURE_TOURS) {
      const path = tour.entryRoute.split('?')[0];
      expect({ tour: tour.id, path, exists: routeExists(path) }).toEqual({
        tour: tour.id,
        path,
        exists: true,
      });
    }
  });
});

describe('tour steps point at elements that exist', () => {
  /**
   * Every `spotlightKey` registered anywhere in the app.
   *
   * Read out of the source rather than listed here, for the same reason the
   * route check is: a list kept beside the thing it describes is a second place
   * to forget.
   */
  function registeredSpotlightKeys(): Set<string> {
    const keys = new Set<string>();

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (full.endsWith('.tsx')) {
          const src = fs.readFileSync(full, 'utf8');
          for (const m of src.matchAll(/spotlightKey="([a-zA-Z0-9_]+)"/g)) keys.add(m[1]);
          // `app/(tabs)/_layout.tsx` registers one per destination through a
          // template literal, so the six tab keys are not matchable literally.
          for (const m of src.matchAll(/spotlightKey=\{`\$\{([a-zA-Z.]+)\}_tab`\}/g)) {
            for (const dest of ['home', 'discover', 'create', 'messages', 'knowledge', 'profile']) {
              keys.add(`${dest}_tab`);
            }
            void m;
          }
        }
      }
    };

    walk(SRC_DIR);
    return keys;
  }

  it('registers every targetKey the tours ask to spotlight', () => {
    // The defect this closes: 19 of 27 steps referenced keys registered
    // nowhere, so six of the eight tours spotlighted nothing and fell through
    // to the centred "no target" card. A tour that highlights nothing is a
    // slideshow, and nothing failed to tell us.
    const registered = registeredSpotlightKeys();

    const orphans = FEATURE_TOURS.flatMap((tour) =>
      tour.steps
        .filter((step) => step.targetKey && !registered.has(step.targetKey))
        .map((step) => `${tour.id}: ${step.targetKey}`)
    );

    expect(orphans).toEqual([]);
  });

  it('routes a step whose target is on another screen', () => {
    // A step can only spotlight what is on screen. If a tour's step names a
    // route, it is because its target lives somewhere the previous step did
    // not — the driver navigates there before showing it.
    for (const tour of FEATURE_TOURS) {
      for (const step of tour.steps) {
        if (!step.route) continue;
        expect(step.route).not.toBe('/');
        expect(step.route).not.toMatch(/\(auth\)/);
        expect(routeExists(step.route.split('?')[0])).toBe(true);
      }
    }
  });
});

describe('tour steps', () => {
  it('are resolvable by id, so a tutorial can name one', () => {
    for (const tour of FEATURE_TOURS) {
      expect(getTourConfig(tour.id)).toBe(tour);
    }
  });

  it('have at least one step, so launching one shows something', () => {
    for (const tour of FEATURE_TOURS) {
      expect(tour.steps.length).toBeGreaterThan(0);
    }
  });

  it('give every step a title and an explanation', () => {
    for (const tour of FEATURE_TOURS) {
      for (const step of tour.steps) {
        expect(step.title.trim()).not.toHaveLength(0);
        expect(step.description.trim()).not.toHaveLength(0);
      }
    }
  });
});
