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

import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', '..');

/**
 * `app/_layout.tsx` renders `<AppProvider>`, which is what mounts the
 * NotificationProvider — so `RootLayout` itself sits *outside* it, and
 * `useNotification` throws when there is no provider above it. Its one call is
 * the location-permission prompt at startup.
 *
 * Moving that prompt inside the provider tree would let it use the designed
 * modal too, and is the right long-term fix; it is recorded rather than
 * hidden.
 */
const ALLOWED = new Set(['app/_layout.tsx']);

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
      if (/Alert\.alert/.test(stripComments(fs.readFileSync(file, 'utf8')))) {
        offenders.push(rel);
      }
    }
  });

  it('raises alerts through the designed modal, not the Android system dialog', () => {
    expect(offenders).toEqual([]);
  });

  it('keeps the documented exception to exactly one file', () => {
    // If this list grows, the growth was a decision — make it a visible one.
    expect([...ALLOWED]).toEqual(['app/_layout.tsx']);
  });
});
