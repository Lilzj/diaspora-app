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
// Both remaining screens were fixed on 9 Sep 2026, and each was carrying live
// defects that `any` had hidden:
//
//   org/[id].tsx        `org.id` (the wire says `organizationId`) made the
//                       Message button return early on every organisation;
//                       `org.contact.facebook` and its three siblings live on
//                       `socialLinks`, so all four social buttons could only
//                       apologise; `org.location.addressLine` is not a field.
//
//   marketplace/[id].tsx  `listing.intent` was never mapped from `listingType`,
//                       so the kind-of-listing label was blank and the buy gate
//                       — `intent !== 'Swap'`, a value the platform never
//                       sends — was true on every listing, including a
//                       `Wanted` one, which is somebody else's request.
//
// What must not happen is a new one appearing, so the list below may shrink
// and may not grow.
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
 * Screens still holding a payload as `any`, and what each one is.
 *
 * **No fetched payload is on this list any more.** The one entry left holds a
 * cause the member picked out of a list already in memory, which never came
 * off a route and has no contract to drift from.
 *
 * Shrink this list; never add to it. A new entry means a new screen whose every
 * field access is unchecked against the route that fills it.
 */
const KNOWN: Record<string, string> = {
  'marketplace/donation-causes.tsx':
    'a cause chosen from a list already in memory, not a fetched payload',
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

  it.each([
    ['community-life/event/[id].tsx', 'turned up the reminder scheduled in UTC'],
    ['community-life/org/[id].tsx', 'turned up a Message button that did nothing'],
    ['marketplace/[id].tsx', 'turned up a buy gate that was true on every listing'],
  ])('no longer lists %s (typing it %s)', (screen) => {
    expect(offenders).not.toContain(screen);
  });
});
