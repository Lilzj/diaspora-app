// ─────────────────────────────────────────────────────────────────────────────
// A screen may not hold a fetched payload as `any`
//
// ── What `any` cost ─────────────────────────────────────────────────────────
//
// `EventDetailScreen` fetched the event itself and put the raw payload into
// `useState<any>`. Everything downstream then typechecked, whatever it read:
//
//   event.host.type              no such object — crashed the process
//   event.date / .time           the wire sends schedule.startsAt
//   event.location.areaName      the wire says neighborhoodName
//   event.timeZoneId             no such field — every reminder fell back to
//                                UTC, four hours out for a Mauritius event
//
// Four defects, one of them fatal, and `tsc` had nothing to say about any of
// them. The repository already had a contract-drift check for exactly this
// family; it could not help either, because the drift was invisible at the
// point where the payload entered the screen.
//
// Giving that one state a real type surfaced the timezone bug immediately, in
// a screen that had been read through several times without anyone seeing it.
//
// ── Why a ratchet rather than a ban ─────────────────────────────────────────
//
// Two screens still do this. Fixing them means reading every field each one
// touches against its contract, which is a real piece of work and a separate
// one. What must not happen is a fourth appearing while those two wait, so the
// list below may shrink and may not grow.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs') as {
  readFileSync(path: string, encoding: string): string;
  readdirSync(path: string, options: { withFileTypes: true }): Array<{
    name: string;
    isDirectory(): boolean;
  }>;
};
const path = require('path') as { join(...parts: string[]): string };

declare const __dirname: string;

const APP_ROOT = path.join(__dirname, '..', '..', 'app');

/**
 * Screens still holding a fetched payload as `any`, and what each one is.
 *
 * Shrink this list; never add to it. A new entry means a new screen whose every
 * field access is unchecked against the route that fills it.
 */
const KNOWN: Record<string, string> = {
  'community-life/org/[id].tsx':
    'the organisation payload — the screen `org.openingHours` crashed, and the drift check registered it without the `any` being removed',
  'marketplace/[id].tsx': 'the listing payload',
  'marketplace/donation-causes.tsx': 'a cause chosen from a list, not a fetched payload',
};

function screenFiles(dir: string, prefix = ''): string[] {
  const found: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;

    if (entry.isDirectory()) {
      found.push(...screenFiles(path.join(dir, entry.name), relative));
    } else if (entry.name.endsWith('.tsx')) {
      found.push(relative);
    }
  }

  return found;
}

describe('screens do not hold payloads as any', () => {
  const offenders = screenFiles(APP_ROOT).filter((file) =>
    fs.readFileSync(path.join(APP_ROOT, ...file.split('/')), 'utf8').includes('useState<any>')
  );

  it('has no instance that is not already known about', () => {
    const fresh = offenders.filter((file) => !(file in KNOWN)).sort();

    expect(
      fresh.length === 0
        ? ''
        : `${fresh.length} screen(s) hold state as \`any\`.\n` +
            'Every field read off it is unchecked against the route that fills it,\n' +
            'which is how `event.host.type` crashed the application on every event.\n' +
            'Give it the response type, or map the wire through an adapter.\n\n' +
            fresh.map((file) => `  ${file}`).join('\n')
    ).toBe('');
  });

  it('does not keep names on the list after they are fixed', () => {
    // A stale allowance is how a list like this stops meaning anything.
    const fixed = Object.keys(KNOWN).filter((file) => !offenders.includes(file)).sort();

    expect(
      fixed.length === 0
        ? ''
        : `${fixed.length} entr(y/ies) no longer need listing — remove them:\n\n` +
            fixed.map((file) => `  ${file}`).join('\n')
    ).toBe('');
  });

  it('no longer lists the event screen', () => {
    // The one this was written for. It now holds `Event`, which is what turned
    // up the reminder timezone.
    expect(offenders).not.toContain('community-life/event/[id].tsx');
  });
});
