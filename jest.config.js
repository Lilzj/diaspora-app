/**
 * Diaspora Platform — test configuration (Frontend Phase 5)
 *
 * `jest-expo` supplies the React Native transform, the module mocks and the
 * Hermes-shaped globals. `transformIgnorePatterns` has to allow the RN
 * ecosystem through Babel: those packages ship untranspiled ESM, and the
 * default "ignore everything in node_modules" turns that into a syntax error on
 * the first import.
 */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    // `@microsoft/signalr` is here for the same reason as everything else on
    // this line: it ships untranspiled ESM, and the default "ignore everything
    // in node_modules" turns that into a syntax error on the first import. It
    // is reached transitively — `lib/realtime.ts` imports it, `conversation-hub`
    // imports that, and a dozen screens import the hub.
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|nativewind|react-native-css-interop|@shopify/flash-list|@gorhom/.*|react-native-reanimated|@tanstack/.*|@microsoft/signalr)',
  ],
  // ── Never run tests out of a nested worktree (UAT-028) ────────────────────
  //
  // `testMatch` below is a bare `**` glob, and Claude Code creates git
  // worktrees under `.claude/worktrees/`. Those are *whole checkouts of this
  // repository at other commits*, and they are hidden from `git status` by
  // `.git/info/exclude`, so nothing about the working tree looks unusual.
  //
  // Without this, `npm test` walked into one and ran a second copy of the
  // project alongside this one: 295 suites and 8,604 tests reported, of which
  // 162 suites belonged to commit `c31e767` rather than to HEAD, and three of
  // those failed — so the documented command exited 1 for reasons unrelated to
  // this codebase. The true figure is 151 suites and 4,408 tests.
  //
  // Both directions of that are dangerous: a stale copy can fail a green
  // codebase, and it can just as easily pass for code that no longer exists and
  // inflate the count anybody quotes.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.claude/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // ── What is measured, and what is not (FBL-006, 19 Nov 2026) ─────────────
  //
  // This was an allow-list naming individual `lib` modules, individual `config`
  // files and a `components/{area}` glob per phase, accumulated over eleven
  // phases. It had no entry for `src/hooks` and none for `src/app`.
  //
  // An allow-list of files has the failure the backend's seeder registry had
  // before ADR-018: a module added later is invisible until somebody remembers
  // to list it, and nothing says so. `lib`, `hooks` and `config` are globbed now
  // for that reason, and the one thing that
  // keeps them globbed is `src/config/__tests__/coverage-scope.test.ts`.
  //
  // ── The hooks decision, which the row asked to be stated either way ──────
  //
  // **Hooks are measured.** Their exclusion carried no reasoning, and the
  // screens' reasoning does not extend to them: a hook is not a composition of
  // anything. 36 files and 21,974 lines hold the React Query keys, the cache
  // invalidation, the optimistic updates and the mutation error handling — the
  // logic a wrong answer is most likely to come from.
  //
  // Measured for the first time on 19 Nov 2026: **14.4% of 4,246 statements.**
  // That is the number the row asked to be looked at before anything else was
  // decided, and it is the argument for measuring rather than against it.
  //
  // ── The screens stay out, and the original reasoning stands ──────────────
  //
  // 298 files and 97,364 lines, deliberately excluded, in the words this file
  // has used since Phase 5: "they are compositions of these, and covering them
  // would measure how much of a `ScrollView` was rendered rather than whether a
  // price, an entitlement or a gap boundary is right."
  //
  // ── The headline moved and nothing got worse ─────────────────────────────
  //
  // 72.25% of 10,178 statements before this change; **59.5% of 20,270 after**.
  // The same tests pass; the denominator nearly doubled. A coverage figure is
  // only as meaningful as what it is over, and the old one was over a list that
  // happened to name the files somebody had already tested.
  //
  // No `coverageThreshold` yet, deliberately. A threshold chosen before anybody
  // has seen the number is a threshold chosen to pass — the same argument the
  // bundle-size job makes. The number is now visible, so that is a decision
  // somebody can make on evidence.
  //
  // `components/{area}` stays a list. Globbing it would add 289 components in
  // one step, which is a bigger decision than this row asks for and not one to
  // make silently.
  collectCoverageFrom: [
    // Discovered, not listed.
    'src/lib/**/*.ts',
    'src/lib/**/*.tsx',
    'src/hooks/**/*.ts',
    // `.tsx` too. `usePullToRefresh.tsx` is 190 lines of hook imported by ten
    // screens, and a `.ts`-only glob missed it: globbing a directory while
    // pinning an extension is the same failure one level down. It covered 0 of
    // 41 statements the first time it appeared in the denominator.
    'src/hooks/**/*.tsx',
    'src/config/**/*.ts',

    // `utils` was outside the list too, and is the same omission as `hooks` in
    // miniature: 258 lines of date, format and geography logic that already
    // has its own `__tests__` directory. Tested and unmeasured.
    'src/utils/**/*.ts',

    // Included despite being state rather than logic: its §75 fallback chain is
    // real logic, and a store that failed to drop an archived active community
    // would leave the app pointed at one that no longer answers.
    'src/store/community-context.ts',

    // Per-phase reusable surfaces. See the note above on why this is still a
    // list rather than `src/components/**`.
    'src/components/financial/**/*.tsx',
    'src/components/monetization/**/*.tsx',
    'src/components/creator-economy/**/*.tsx',
    'src/components/community/**/*.tsx',
    'src/components/maps/**/*.tsx',
    'src/components/community-directory/**/*.tsx',
    'src/components/analytics/**/*.tsx',
    'src/components/integrations/**/*.tsx',
    'src/components/automation/**/*.tsx',

    // Fixture data carrying a safety property a later edit could break with
    // nothing else noticing: analytics determinism (§60), the government
    // fixtures that must never read `official`, and the automation records that
    // must always read `isSimulated`.
    'src/mocks/analytics-data.ts',
    'src/mocks/integrations-gap-data.ts',
    'src/mocks/automation-gap-data.ts',

    // Tests are not the subject, and the production twins are generated — their
    // coverage would measure the generator rather than the register.
    '!**/__tests__/**',
    '!src/config/*.production.ts',
  ],
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
};
