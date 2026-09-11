// ─────────────────────────────────────────────────────────────────────────────
// A support badge states what the deployment can run, not what this build believed
//
// ── The measurement ──────────────────────────────────────────────────────────
//
// A template's badge was derived entirely from this build's static
// `triggers.ts` / `conditions.ts` / `actions.ts` tables via `weakestSupport`.
// Compared with `GET /automations/catalog` on 22 Aug 2026:
//
//     client parts the deployment also names               : 83
//     client says not-connected, deployment says available : 59
//     client says connected, deployment says unavailable   :  0
//
// **Fifty-nine.** The client was telling members most of the automation feature
// was still being built while the deployment was running it. And the drift is
// entirely in one direction: the table was never optimistic, only obsolete —
// which is what a table shipped separately from the deployment it describes will
// always eventually be.
//
// ── Proved, not inferred ─────────────────────────────────────────────────────
//
// `isAvailable: true` is the deployment's own claim, so it was exercised. Eight
// of the drifted triggers were sent to `POST /automations`; six were created
// with `support: CONNECTED`, `isSimulated: false` and a row in
// `automation.automations`. The two refusals were `automation.owner_not_allowed`
// — a scope rule the catalogue already publishes in `allowedOwners` — not a gap.
//
// ── Why per part, and not per template ───────────────────────────────────────
//
// `GET /automations/templates` also carries a `support`, and the first fix used
// it. That was wrong: **the two catalogues share ids without sharing
// definitions.** The deployment's `event-reminder` fires on
// `event.rsvpConfirmed` and calls `reminder.schedule`; this build's fires on
// `event.startingSoon` and calls `notify.self`. It gave the right answer for
// that pair by coincidence, and a coincidence is not a basis for a capability
// claim. The catalogue answers per part — the granularity the client's own
// templates are assembled at.
// ─────────────────────────────────────────────────────────────────────────────

import {
  resolvePartSupport,
  servedOwnersLookup,
  servedSupportLookup,
  servedToOwner,
} from '@/lib/automation/served-support';
import { templateSupportFrom, TEMPLATE_CATALOG } from '@/lib/automation/templates';
import { noAutomationAccess } from '@/types/automation';
import type { AutomationCatalog } from '@/lib/automation/certified-client';

declare const __dirname: string;
declare const require: (id: string) => unknown;
const { readFileSync } = require('fs') as { readFileSync: (p: string, e: string) => string };
const { join } = require('path') as { join: (...p: string[]) => string };

function entry(key: string, isAvailable: boolean) {
  return { key, domain: null, isAvailable, unavailableReason: null, requiredCapability: null, allowedOwners: null };
}

function catalog(partial: Partial<AutomationCatalog> = {}): AutomationCatalog {
  return { triggers: [], conditions: [], actions: [], ...partial };
}

describe('the deployment’s catalogue decides a part’s status', () => {
  it('reports a part the deployment can run as connected', () => {
    const lookup = servedSupportLookup(
      catalog({ triggers: [entry('savedSearch.newMatch', true)] }),
    );

    // This build declares `savedSearch.newMatch` as BACKEND_GAP. The deployment
    // creates automations on it.
    expect(lookup('trigger', 'savedSearch.newMatch')).toBe('CONNECTED');
  });

  it('reports a part the deployment cannot run as a gap', () => {
    // The catalogue publishes the whole vocabulary annotated with what it cannot
    // do — `location.enteredArea` is in it with `isAvailable: false`. This must
    // not be quietly upgraded.
    const lookup = servedSupportLookup(
      catalog({ triggers: [entry('location.enteredArea', false)] }),
    );

    expect(lookup('trigger', 'location.enteredArea')).toBe('BACKEND_GAP');
  });

  it('says nothing about a part the deployment does not name', () => {
    const lookup = servedSupportLookup(catalog({ triggers: [entry('a.b', true)] }));

    expect(lookup('trigger', 'not.published')).toBeUndefined();
  });

  it('knows nothing at all before the catalogue arrives', () => {
    // Every badge keeps its declared status rather than flickering through a
    // wrong one on the way to the right one.
    expect(servedSupportLookup(null)('trigger', 'savedSearch.newMatch')).toBeUndefined();
  });

  it('keeps the declared status where the deployment is silent', () => {
    const lookup = servedSupportLookup(catalog());

    expect(resolvePartSupport(lookup, 'trigger', 'unknown.key', 'PARTIAL')).toBe('PARTIAL');
  });

  it('lets the deployment override the declaration in both directions', () => {
    const up = servedSupportLookup(catalog({ actions: [entry('notify.push', true)] }));
    const down = servedSupportLookup(catalog({ actions: [entry('notify.push', false)] }));

    expect(resolvePartSupport(up, 'action', 'notify.push', 'BACKEND_GAP')).toBe('CONNECTED');
    expect(resolvePartSupport(down, 'action', 'notify.push', 'CONNECTED')).toBe('BACKEND_GAP');
  });
});

describe('a template’s badge is the weakest of its parts, resolved', () => {
  const template = TEMPLATE_CATALOG.find((t) => t.id === 'event-reminder')!;

  it('finds the template this was measured on', () => {
    // Pins the pair the id collision was discovered through: if this build ever
    // changes which trigger `event-reminder` uses, the comment above is stale and
    // this test says so.
    expect(template.trigger.key).toBe('event.startingSoon');
    expect(template.actions.map((a) => a.key)).toEqual(['notify.self']);
  });

  it('reads connected when the deployment runs every part', () => {
    const lookup = servedSupportLookup(
      catalog({
        triggers: [entry('event.startingSoon', true)],
        actions: [entry('notify.self', true)],
      }),
    );

    expect(templateSupportFrom(template, lookup)).toBe('CONNECTED');
  });

  it('is dragged down by a single part the deployment cannot run', () => {
    // The weakest link, which is the rule the badge has always used — applied to
    // the deployment's answers rather than to a table that ships separately.
    const lookup = servedSupportLookup(
      catalog({
        triggers: [entry('event.startingSoon', true)],
        actions: [entry('notify.self', false)],
      }),
    );

    expect(templateSupportFrom(template, lookup)).not.toBe('CONNECTED');
  });

  it('falls back to the declared status with no catalogue', () => {
    expect(templateSupportFrom(template, servedSupportLookup(null))).toBe(template.support);
  });
});

describe('an unloaded capability set is not an empty gallery', () => {
  // Found on a cold deep link to the templates screen: it rendered
  //
  //     Nothing here yet
  //     There are no ready-made automations for "For me" yet.
  //
  // while the deployment was publishing five. `useAutomationAccess` returns
  // `noAutomationAccess()` while its query is in flight; that placeholder grants
  // nothing, so `templatesFor` filtered the whole gallery away and the empty
  // state spoke for it. The screen already had the discriminator and was
  // discarding it — the same shape as the catalogue it was also discarding.
  it('marks a placeholder capability set as not from the server', () => {
    const placeholder = noAutomationAccess();

    expect(placeholder.provenance).toBe('unavailable');
    expect(placeholder.canCreatePersonal).toBe(false);
  });

  it('the screen distinguishes the two before claiming an absence', () => {
    const screen = readFileSync(
      join(__dirname, '..', '..', 'app', 'automation', 'templates.tsx'),
      'utf8',
    );

    expect(screen).toContain("access.provenance === 'server'");

    // The definite claim is guarded by the discriminator; the indefinite one is
    // guarded by its negation.
    expect(screen).toContain('templates.length === 0 && accessIsKnown');
    expect(screen).toContain('templates.length === 0 && !accessIsKnown');
  });

  it('the gallery badge comes from the catalogue, not the static table', () => {
    const screen = readFileSync(
      join(__dirname, '..', '..', 'app', 'automation', 'templates.tsx'),
      'utf8',
    );

    expect(screen).toContain('useAutomationCatalog()');
    expect(screen).toContain('templateSupportFrom(template, servedSupport)');

    // And the superseded per-template-id copy is gone, not merely unused.
    expect(screen).not.toContain('published.servedSupport');
  });
});

// ── Who each part is served to — 11 Sep 2026 ────────────────────────────────
//
// The catalogue has published `allowedOwners` for every part since it shipped,
// and the builder decided who may use a part from this build's own table. On
// the device a community's administrator was offered "Tell me" on a community
// automation: `EVERY_OWNER` here, `EveryBusinessOwner` on the platform. The rule
// was refused only when they pressed Save.

describe('who each part is served to', () => {
  const catalog = {
    triggers: [
      {
        key: 'community.milestoneReached',
        domain: 'community',
        isAvailable: true,
        unavailableReason: null,
        requiredCapability: 'automations.community',
        allowedOwners: ['community'],
      },
    ],
    conditions: [],
    actions: [
      {
        key: 'notify.self',
        domain: 'notifications',
        isAvailable: true,
        unavailableReason: null,
        requiredCapability: null,
        allowedOwners: ['user', 'creator', 'provider', 'employer', 'landlord', 'seller'],
      },
      {
        key: 'notify.community',
        domain: 'community',
        isAvailable: true,
        unavailableReason: null,
        requiredCapability: 'automations.community',
        allowedOwners: null,
      },
    ],
  };

  const owners = servedOwnersLookup(catalog);

  it('follows the deployment where it says who may use a part', () => {
    expect(servedToOwner(owners, 'action', 'notify.self', 'community')).toBe(false);
    expect(servedToOwner(owners, 'action', 'notify.self', 'user')).toBe(true);
    expect(servedToOwner(owners, 'trigger', 'community.milestoneReached', 'community')).toBe(true);
    expect(servedToOwner(owners, 'trigger', 'community.milestoneReached', 'user')).toBe(false);
  });

  it('leaves a part to this build when the deployment does not say', () => {
    // Named without owners, and not named at all: absence is not evidence.
    expect(servedToOwner(owners, 'action', 'notify.community', 'community')).toBe(true);
    expect(servedToOwner(owners, 'action', 'calendar.add', 'user')).toBe(true);
  });

  it('knows nothing before the catalogue answers', () => {
    expect(servedToOwner(servedOwnersLookup(null), 'action', 'notify.self', 'community')).toBe(true);
  });

  it('is what the builder filters triggers and actions by', () => {
    const fs = require('fs') as { readFileSync(p: string, e: string): string };
    const path = require('path') as { join(...s: string[]): string };
    const screen = fs.readFileSync(
      path.join(process.cwd(), 'src', 'app', 'automation', 'create.tsx'),
      'utf8'
    );

    expect(screen).toMatch(/servedToOwner\(servedOwners, 'trigger', entry\.key, scope\.ownerKind\)/);
    expect(screen).toMatch(/servedToOwner\(servedOwners, 'action', entry\.key, scope\.ownerKind\)/);
  });
});
