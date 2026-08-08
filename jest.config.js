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
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|nativewind|react-native-css-interop|@shopify/flash-list|@gorhom/.*|react-native-reanimated|@tanstack/.*)',
  ],
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
  ],
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
};
