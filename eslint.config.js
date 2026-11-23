// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — ESLint (FSEC-007, FARCH-001, FSOLID-006)
//
// Until 18 Nov 2026 the only static analysis over 400,000+ lines of TypeScript
// was `tsc --noEmit`. That is a good first line and this project uses it well —
// `strict: true`, clean, zero `@ts-ignore` — but it does not see the defect
// classes below, and two of them are correctness rather than style:
//
//   * a hook that closes over stale auth state, across 398 `useMemo`,
//     319 `useCallback` and 52 hook modules;
//   * an unawaited `signOut()` or `refreshSession()`, which is a silently
//     incomplete security operation that no type checker can report.
//
// ── Two rules are errors and the rest are warnings, deliberately ────────────
//
// `react-hooks/exhaustive-deps` and `@typescript-eslint/no-floating-promises`
// are the two the audit asks to be errors with zero violations, because they
// are the two that produce wrong behaviour rather than untidy code. Everything
// else is a warning so the baseline is adoptable on the day it lands: a
// configuration that fails the build on 117 `any` usages is a configuration
// somebody turns off, and `npm run lint` would then be a script nobody runs.
//
// The warning count is a backlog, and `lint:strict` is how it gets worked down
// without anybody having to remember the flag.
//
// ── Type-aware, which is not the default and is the point ───────────────────
//
// `no-floating-promises` needs type information: whether an expression is a
// Promise is not a syntactic question. `projectService` gives typescript-eslint
// the same program `tsc` builds, so the rule sees what the type checker sees —
// at the cost of a slower run, which is why CI runs it and a watch mode does
// not.
// ─────────────────────────────────────────────────────────────────────────────

const expoConfig = require('eslint-config-expo/flat');
const tseslint = require('typescript-eslint');
const security = require('eslint-plugin-security');

module.exports = tseslint.config(
  ...expoConfig,

  // ── ESLint 10, and the React version eslint-config-expo asks for ─────────
  //
  // eslint-config-expo sets `settings.react.version: 'detect'`, and
  // eslint-plugin-react's detection calls `context.getFilename()`, which
  // ESLint 10 removed. Every React rule then failed to load, and lint died
  // with exit code 2 before reporting anything: "Error while loading rule
  // 'react/display-name': contextOrFilename.getFilename is not a function".
  //
  // The installed React version, read here, is what 'detect' would have found,
  // so nothing about any rule changes: on this tree, ESLint 10 with this line
  // and ESLint 9.39.5 with it produce byte-identical output. Read rather than
  // written down, so it cannot drift from the React the app actually ships.
  //
  // Not fixed upstream yet: eslint-plugin-react 7.37.5 declares ESLint ^9.7
  // at most, and ESLint 10 installs over that only because `.npmrc` sets
  // `legacy-peer-deps`. Its other uses of the removed context methods are
  // guarded, except in `react/forward-ref-uses-ref` and
  // `react/jsx-filename-extension`, which this config does not enable and
  // which would crash lint if it did. Delete this block when a release of the
  // plugin declares ESLint 10.
  { settings: { react: { version: require('react/package.json').version } } },

  {
    // Build output, native projects, coverage and the Expo cache. Linting
    // generated or vendored code reports defects nobody can fix in this
    // repository, which is the fastest way to make a lint script ignorable.
    ignores: [
      'node_modules/**',
      'android/**',
      'ios/**',
      'dist/**',
      'coverage/**',
      '.expo/**',
      'runtime-validation/**',
      'runtime-remediation/**',
      'scripts/**',
      '*.config.js',
      'global-css.d.ts',
      'nativewind-env.d.ts',
    ],
  },

  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    plugins: { security },
    rules: {
      // ── The two that are errors ─────────────────────────────────────────
      //
      // A dependency array that lies produces a component rendering last
      // render's auth state — the authorization-display defect this codebase
      // is shaped to have, with 23 stores and 52 hook modules.
      'react-hooks/exhaustive-deps': 'error',

      // An unawaited promise on a security path completes after the screen
      // that started it has gone. Type-aware; see the header.
      '@typescript-eslint/no-floating-promises': 'error',

      // ── The third, since FSOLID-006 ─────────────────────────────────────
      //
      // `any` is the one annotation that gets an unchecked value through a
      // checked door, and the row that reviewed all 105 of them found two
      // live defects doing exactly that: the housing page's nearby-providers
      // section read the development fixture's field names off a real
      // `ProviderSummary` and threw on `item.rating.average`, and the
      // organisation page's events tab read wire names off rows that
      // `fetchEvents` had already mapped, so every one of them navigated to
      // `/community-life/event/undefined`.
      //
      // 34 remain, suppressed by rule rather than silenced here, so a new one
      // fails the build and a stale suppression fails it too. What they are
      // and why they stay is in `suppression-ceilings.test.ts`.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        // An async handler passed to `onPress` is the React Native idiom and
        // is not a defect; the dangerous form is an async function where a
        // boolean is expected, which silently reads as `true`.
        { checksVoidReturn: false },
      ],

      // ── The backlog ─────────────────────────────────────────────────────
      //
      // `no-explicit-any` used to be here, with a note saying 117 of them
      // could not be reviewed in the change that turned the linter on. They
      // have been (FSOLID-006) and it is an error above.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/await-thenable': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',

      // eslint-plugin-security is heuristic by nature — it flags any
      // non-literal index into an object as a possible prototype-pollution
      // sink, which in a codebase that keys catalogues by string is mostly
      // noise. The two below are the ones that are rarely wrong.
      'security/detect-unsafe-regex': 'warn',
      'security/detect-eval-with-expression': 'error',
    },
  },

  {
    // Tests may be loose where production may not: a fixture cast to `any` is
    // how a test states "the shape does not matter here", and a floating
    // promise inside a test body fails the test rather than hiding.
    files: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx', 'jest.setup.js'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  }
);
