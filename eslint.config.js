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
      '@typescript-eslint/no-misused-promises': [
        'error',
        // An async handler passed to `onPress` is the React Native idiom and
        // is not a defect; the dangerous form is an async function where a
        // boolean is expected, which silently reads as `true`.
        { checksVoidReturn: false },
      ],

      // ── The backlog ─────────────────────────────────────────────────────
      //
      // Warnings, not because they do not matter but because 117 `any` usages
      // cannot be reviewed in the change that turns the linter on. FSOLID-006
      // is the row that works them down.
      '@typescript-eslint/no-explicit-any': 'warn',
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
