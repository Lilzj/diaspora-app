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
  collectCoverageFrom: [
    'src/lib/money.ts',
    'src/lib/financial-errors.ts',
    'src/lib/financial-status.ts',
    'src/lib/financial-access.ts',
    'src/lib/idempotency.ts',
    'src/lib/notification-routes.ts',
    'src/lib/financial-api.ts',
    'src/components/financial/**/*.tsx',

    // Phase 6. The monetization domain layer and its reusable surfaces. Screens
    // are deliberately excluded, here as in Phase 5: they are compositions of
    // these, and covering them would measure how much of a `ScrollView` was
    // rendered rather than whether a price, an entitlement or a gap boundary is
    // right.
    'src/lib/entitlements.ts',
    'src/lib/pricing.ts',
    'src/lib/monetization-catalog.ts',
    'src/lib/monetization-gap-api.ts',
    'src/config/monetization-gaps.ts',
    'src/components/monetization/**/*.tsx',

    // Phase 7. The creator domain layer and its reusable surfaces. Screens are
    // excluded for the same reason as in Phases 5 and 6: they are compositions
    // of these, and covering them would measure how much of a `ScrollView`
    // rendered rather than whether a status, a progress figure, an access
    // decision or a gap boundary is right.
    'src/lib/creator-economy.ts',
    'src/lib/creator-access.ts',
    'src/lib/creator-analytics.ts',
    'src/lib/creator-gap-api.ts',
    'src/config/creator-gaps.ts',
    'src/components/creator-economy/**/*.tsx',

    // Phase 12. The Community Life domain layer, both API arms and the
    // reusable surfaces. Screens are excluded for the same reason as in Phases
    // 5, 6 and 7: they are compositions of these, and covering them would
    // measure how much of a `ScrollView` rendered rather than whether a state,
    // a provenance marker, an access decision or a gap boundary is right.
    //
    // `community-life-api.ts` is here despite being a *certified* client,
    // because it is the seam every Community Life screen now goes through and a
    // regression in its parameter binding would be invisible otherwise.
    'src/lib/community-state.ts',
    'src/lib/community-access.ts',
    'src/lib/community-analytics.ts',
    'src/lib/community-life-api.ts',
    'src/lib/community-gap-api.ts',
    'src/config/community-gaps.ts',
    'src/components/community/**/*.tsx',

    // Phase 8. The geographic domain layer, the provider adapters, both API
    // arms and the reusable surfaces. Screens are excluded for the same reason
    // as in every phase before it: they are compositions of these, and covering
    // them would measure how much of a `ScrollView` rendered rather than
    // whether a distance, a permission state, a provenance marker or a gap
    // boundary is right.
    //
    // `lib/maps/providers/canvas-map.tsx` is deliberately *included* despite
    // being a renderer, because its gesture-to-viewport arithmetic is real
    // logic — a map whose pan maths is untested is a map that drifts.
    'src/lib/maps/**/*.ts',
    'src/lib/maps/**/*.tsx',
    'src/lib/maps-api.ts',
    'src/lib/maps-gap-api.ts',
    'src/config/maps-gaps.ts',
    'src/config/map-provider-gaps.ts',
    'src/config/map-config.ts',
    'src/components/maps/**/*.tsx',

    // Phase 13. The multi-community domain layer, the scope resolver, both API
    // arms, the context store and the reusable surfaces. Screens are excluded for
    // the same reason as in every phase before it: they are compositions of these,
    // and covering them would measure how much of a `ScrollView` rendered rather
    // than whether a scope, a projection, a capability decision or a gap boundary
    // is right.
    //
    // `lib/community/scope.ts` is the one file in this phase where a bug would be
    // wrong everywhere at once — every community-sensitive query key and request in
    // the application derives from it — so it carries the most tests.
    //
    // `store/community-context.ts` is included despite being state rather than
    // logic, because its §75 fallback chain is real logic: a store that failed to
    // drop an archived active community would leave the app pointed at a community
    // that no longer answers.
    'src/lib/community/**/*.ts',
    'src/lib/community-directory-api.ts',
    'src/lib/community-gap-directory-api.ts',
    'src/config/multi-community-gaps.ts',
    'src/store/community-context.ts',
    'src/components/community-directory/**/*.tsx',

    // Phase 15. The analytics domain layer, both API arms, the adapters onto the
    // four surfaces that already existed, and the reusable dashboard primitives.
    // Screens are excluded for the same reason as in every phase before it: they
    // are compositions of these, and covering them would measure how much of a
    // `ScrollView` rendered rather than whether a range, a provenance marker, a
    // suppression or a cache key is right.
    //
    // Three files carry more weight than the rest and are worth naming:
    //
    //   `lib/analytics/time-range.ts` — a bug here is wrong on every screen at
    //   once, because every figure in the application is cut by it.
    //
    //   `lib/analytics/query-keys.ts` — the whole of §53's cache-isolation
    //   guarantee reduces to this file being right.
    //
    //   `mocks/analytics-data.ts` is deliberately *included* despite being mock
    //   data, because §60 makes its determinism a requirement rather than a
    //   convenience, and an internal inconsistency in it would make every
    //   analytics review unfalsifiable.
    'src/lib/analytics/**/*.ts',
    'src/lib/analytics-api.ts',
    'src/lib/analytics-gap-api.ts',
    'src/config/analytics-gaps.ts',
    'src/mocks/analytics-data.ts',
    'src/components/analytics/**/*.tsx',

    // Phase 16. The integration platform: the domain layer, the provider
    // adapters, both API arms and the reusable surfaces. Screens are excluded
    // for the same reason as in every phase before it — they are compositions
    // of these.
    //
    // Four files carry more weight than the rest and are worth naming:
    //
    //   `lib/integrations/calendar.ts` — §62's timezone conversion. A bug here
    //   is silent, plausible, and puts a member at an event an hour early.
    //
    //   `lib/integrations/push-lifecycle.ts` — §44's token isolation. A bug
    //   here routes one member's private notifications to another's phone.
    //
    //   `lib/integrations/payments.ts` — §26's authoritative-success rule. A bug
    //   here either double-charges somebody or tells them a payment failed when
    //   it did not.
    //
    //   `lib/integrations/query-keys.ts` — the whole of §43's cache-isolation
    //   guarantee reduces to this file being right.
    //
    // `mocks/integrations-gap-data.ts` is deliberately *included* despite being
    // fixture data, because the government fixtures carry a safety property —
    // never `official`, never a real authority, always `unverified` — that a
    // later edit could break without any other test noticing.
    'src/lib/integrations/**/*.ts',
    'src/lib/integrations-api.ts',
    'src/lib/integrations-gap-api.ts',
    'src/config/integration-gaps.ts',
    'src/config/integration-provider-gaps.ts',
    'src/config/integration-config.ts',
    'src/mocks/integrations-gap-data.ts',
    'src/components/integrations/**/*.tsx',

    // Phase 18. The automation domain layer, the three catalogues, both API
    // arms and the reusable surfaces. Screens are excluded for the same reason
    // as in every phase before it — they are compositions of these.
    //
    // Four files carry more weight than the rest and are worth naming:
    //
    //   `lib/automation/schedule.ts` — §42's timezone conversion, on top of
    //   Phase 16's. A bug here is silent, plausible, and fires a member's
    //   reminder an hour out twice a year in one timezone.
    //
    //   `lib/automation/access.ts` — §49's whole guarantee. A bug here offers
    //   an affordance the server will refuse, or worse, one it will not.
    //
    //   `lib/automation/query-keys.ts` — the whole of §58's cache-isolation
    //   guarantee reduces to this file being right.
    //
    //   `lib/automation/simulation.ts` — §35 and §57. A bug here produces a
    //   test result indistinguishable from a real run.
    //
    // `mocks/automation-gap-data.ts` is deliberately *included* despite being
    // fixture data, because it carries two safety properties a later edit could
    // break with nothing else noticing: every record is `isSimulated`, and the
    // development capability set never grants platform-wide authority.
    'src/lib/automation/**/*.ts',
    'src/lib/automation-api.ts',
    'src/lib/automation-gap-api.ts',
    'src/config/automation-gaps.ts',
    'src/mocks/automation-gap-data.ts',
    'src/components/automation/**/*.tsx',
  ],
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
};
