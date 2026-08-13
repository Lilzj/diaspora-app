/**
 * The alert a member sees must be the application's own, not Android's.
 *
 * `providers/notification-provider` renders a designed alert modal — themed
 * surface, typed icon and accent, the app's button styling. `Alert.alert`
 * renders the *operating system's* dialog, which shares none of that. The audit
 * found 95 calls to it across 33 files, so roughly half the alerts in the
 * product looked like they belonged to a different application.
 *
 * This is a source-level test rather than a render test because the defect is
 * "somebody reached for the wrong API", and that is visible in the source
 * without needing to drive every screen that can raise an alert.
 */

// `@types/node` is not a dependency of this app, so these are pulled in through
// `require` rather than an import — the test runs under Jest, where they exist,
// while `tsc --noEmit` stays clean without adding a type package for one file.
/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs') as {
  readdirSync: (p: string, o: { withFileTypes: true }) => Array<{ name: string; isDirectory: () => boolean }>;
  readFileSync: (p: string, enc: string) => string;
};
const path = require('path') as {
  join: (...parts: string[]) => string;
  relative: (from: string, to: string) => string;
};

const SRC: string = path.join(__filename, '..', '..', '..');

/**
 * Empty, deliberately.
 *
 * There was one exception: `app/_layout.tsx` renders `<AppProvider>`, so
 * `RootLayout` sat *outside* the NotificationProvider it mounts, and
 * `useNotification` throws with no provider above it. Rather than leave the
 * startup location prompt as Android's dialog for ever, the effect moved into
 * `components/StartupLocationPrompt`, which is rendered *inside* the provider.
 *
 * So the rule is now absolute: no file raises the operating system's dialog.
 */
const ALLOWED = new Set<string>([]);

declare const __filename: string;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Strips comments so a mention of the old API in prose is not a violation. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('alert consistency', () => {
  const offenders: string[] = [];

  beforeAll(() => {
    for (const file of walk(SRC)) {
      const rel = path.relative(SRC, file).replace(/\\/g, '/');
      if (ALLOWED.has(rel)) continue;
      // Any member of the API, not just `alert`. The first version of this
      // test looked for `Alert.alert` alone, and missed an `Alert.prompt` in
      // the conversation screen — which was worse than an inconsistent dialog,
      // because `prompt` is iOS-only and did nothing whatsoever on Android.
      // "Edit message" was a menu item that opened no dialog at all.
      const match = stripComments(fs.readFileSync(file, 'utf8')).match(/\bAlert\.(\w+)\s*\(/);
      if (match) offenders.push(`${rel} — Alert.${match[1]}`);
    }
  });

  it('raises alerts through the designed modal, not the Android system dialog', () => {
    expect(offenders).toEqual([]);
  });

  it('has no exceptions at all', () => {
    // If an exception is ever added back, the addition should be a decision
    // someone made on purpose, not a quiet edit to a set literal.
    expect([...ALLOWED]).toEqual([]);
  });
});
