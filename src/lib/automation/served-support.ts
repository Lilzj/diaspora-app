// ─────────────────────────────────────────────────────────────────────────────
// Support status, as the deployment states it
//
// ── The claim this replaces ──────────────────────────────────────────────────
//
// A template's badge came entirely from this build's static `triggers.ts`,
// `conditions.ts` and `actions.ts` tables, combined by `weakestSupport`. Those
// tables declare 65 parts `BACKEND_GAP` and 5 `PARTIAL`.
//
// Measured against `GET /automations/catalog` on 22 Aug 2026:
//
//     client parts the deployment also names                : 83
//     client says not-connected, deployment says available  : 59
//     client says connected, deployment says unavailable    :  0
//
// **Fifty-nine.** Not a stale entry or two — the client was telling members that
// most of the automation feature was still being built while the deployment was
// running it. Sampled end to end, six of eight of those triggers created a real
// automation returning `support: CONNECTED`, `isSimulated: false`, with a row in
// `automation.automations`. The two refusals were `automation.owner_not_allowed`
// — a scope rule the catalogue already states in `allowedOwners` — not a gap.
//
// And the direction matters: **zero over-claims.** The static table was never
// optimistic, only obsolete, which is exactly the failure mode a table that
// ships separately from the deployment it describes will always have.
//
// ── Why the catalogue and not the template list ──────────────────────────────
//
// `GET /automations/templates` also carries a `support`, and keying off it looks
// simpler. It is wrong: **the two catalogues share ids without sharing
// definitions.** The deployment's `event-reminder` fires on `event.rsvpConfirmed`
// and calls `reminder.schedule`; this build's `event-reminder` fires on
// `event.startingSoon` and calls `notify.self`. Copying one status onto the other
// is asserting something about an automation nobody evaluated — it happened to
// be right for that pair, and being right by coincidence is not a basis for a
// capability claim.
//
// The catalogue answers per *part*, which is the granularity the client's own
// templates are assembled at, so the answer is about the thing being badged.
//
// ── What is deliberately not inferred ────────────────────------------------
//
// A part the deployment does not name keeps its declared status. Absence is not
// evidence in either direction, and the static table remains the only thing
// anybody knows about it.
// ─────────────────────────────────────────────────────────────────────────────

import type { AutomationCatalog } from './certified-client';
import type { AutomationSupportStatus } from '@/types/automation';

export type CatalogPartKind = 'trigger' | 'condition' | 'action';

/** What the deployment says about one part, or `undefined` if it does not name it. */
export type ServedSupportLookup = (
  kind: CatalogPartKind,
  key: string
) => AutomationSupportStatus | undefined;

const EMPTY: ServedSupportLookup = () => undefined;

/**
 * A lookup over a fetched catalogue.
 *
 * `isAvailable` maps to `CONNECTED` / `BACKEND_GAP` and nothing else. The
 * catalogue has no third state, so inventing `PARTIAL` from it would be putting
 * a word in the deployment's mouth — a part it says it cannot run is a gap,
 * whatever this build believed about how far along it was.
 */
export function servedSupportLookup(catalog: AutomationCatalog | null): ServedSupportLookup {
  if (!catalog) return EMPTY;

  const index = new Map<string, boolean>();
  const add = (kind: CatalogPartKind, entries: { key: string; isAvailable: boolean }[]) => {
    for (const entry of entries ?? []) index.set(`${kind}:${entry.key}`, entry.isAvailable);
  };

  add('trigger', catalog.triggers);
  add('condition', catalog.conditions);
  add('action', catalog.actions);

  return (kind, key) => {
    const available = index.get(`${kind}:${key}`);
    if (available === undefined) return undefined;
    return available ? 'CONNECTED' : 'BACKEND_GAP';
  };
}

/** Who the deployment lets use one part, or `undefined` if it does not say. */
export type ServedOwnersLookup = (kind: CatalogPartKind, key: string) => readonly string[] | undefined;

const NOBODY_SAID: ServedOwnersLookup = () => undefined;

/**
 * The owner kinds each part is served to — the catalogue's `allowedOwners`.
 *
 * **Fetched since the catalogue was, and never read.** The builder decided who
 * may use a part from this build's own table, and on 11 Sep 2026 it offered a
 * community's administrator "Tell me" on a community automation — `EVERY_OWNER`
 * here, `EveryBusinessOwner` on the platform, which leaves the community out —
 * so the rule was refused only when they pressed Save. The deployment had been
 * publishing the answer the whole time.
 */
export function servedOwnersLookup(catalog: AutomationCatalog | null): ServedOwnersLookup {
  if (!catalog) return NOBODY_SAID;

  const index = new Map<string, readonly string[]>();
  const add = (kind: CatalogPartKind, entries: { key: string; allowedOwners: string[] | null }[]) => {
    for (const entry of entries ?? []) {
      if (entry.allowedOwners) index.set(`${kind}:${entry.key}`, entry.allowedOwners);
    }
  };

  add('trigger', catalog.triggers);
  add('condition', catalog.conditions);
  add('action', catalog.actions);

  return (kind, key) => index.get(`${kind}:${key}`);
}

/**
 * Whether the deployment lets this owner use the part.
 *
 * A part it does not name, or names without saying who may use it, is left to
 * this build's own table — the same rule as support: absence is not evidence.
 */
export function servedToOwner(
  lookup: ServedOwnersLookup,
  kind: CatalogPartKind,
  key: string,
  ownerKind: string
): boolean {
  const owners = lookup(kind, key);
  return owners === undefined || owners.includes(ownerKind);
}

/**
 * One part's status: the deployment's answer when it has one, this build's
 * declaration otherwise.
 */
export function resolvePartSupport(
  lookup: ServedSupportLookup,
  kind: CatalogPartKind,
  key: string,
  declared: AutomationSupportStatus
): AutomationSupportStatus {
  return lookup(kind, key) ?? declared;
}
