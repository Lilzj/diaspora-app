// ─────────────────────────────────────────────────────────────────────────────
// Location for "I arrive in an area I chose", without a settings screen
//
// The arrival trigger (`location.enteredArea`) fires only while the member's
// presence setting is on: the app reports a coarse area while it is open, and
// the server matches it against the areas their automations watch. That
// setting had its own screen, "Location while the app is open", which members
// found and could not place (UAT, 3 Nov 2026, item 5: "do we really need
// that"). The setting stays; the screen goes:
//
//   * saving an arrival automation asks the phone for location and switches
//     presence on;
//   * deleting the last one switches it off, which also forgets the last area.
//
// So presence is on exactly while something uses it, and the builder says so
// in one line where the trigger is chosen.
// ─────────────────────────────────────────────────────────────────────────────

export const ARRIVAL_TRIGGER_KEY = 'location.enteredArea';

/** The line shown under the trigger in the builder. */
export const ARRIVAL_PRIVACY_NOTE =
  'Saving this asks to use your location while Diaspora is open. It is rounded to an area, no history is kept, and it switches off when you delete your last arrival automation.';

/** Whether this list still has an automation that watches for an arrival. */
export function watchesArrivals(
  automations: readonly { trigger?: { key?: string | null } | null }[],
): boolean {
  return automations.some((automation) => automation.trigger?.key === ARRIVAL_TRIGGER_KEY);
}

export type ArrivalPresenceOutcome = 'on' | 'already-on' | 'denied' | 'failed';

export interface ArrivalPresencePorts {
  isEnabled: () => Promise<boolean>;
  requestPermission: () => Promise<'granted' | 'denied' | 'undetermined'>;
  setEnabled: (enabled: boolean) => Promise<unknown>;
}

/**
 * Switches presence on for an arrival automation: the phone's permission
 * first, then the setting. Never throws; the automation saves either way, and
 * the outcome says whether arrivals will be noticed.
 */
export async function switchPresenceOn(ports: ArrivalPresencePorts): Promise<ArrivalPresenceOutcome> {
  try {
    const permission = await ports.requestPermission();
    if (permission !== 'granted') return 'denied';
    if (await ports.isEnabled()) return 'already-on';
    await ports.setEnabled(true);
    return 'on';
  } catch {
    return 'failed';
  }
}

/**
 * Switches presence off once nothing watches for an arrival. A list that
 * cannot be read, or that has more pages than were read, leaves it on: a
 * member's automation silently going deaf is worse than a setting staying on.
 */
export async function releasePresenceIfUnused(
  ports: Pick<ArrivalPresencePorts, 'isEnabled' | 'setEnabled'>,
  remaining: () => Promise<{ items: readonly { trigger?: { key?: string | null } | null }[]; hasMore: boolean }>,
): Promise<boolean> {
  try {
    const page = await remaining();
    if (page.hasMore || watchesArrivals(page.items)) return false;
    if (!(await ports.isEnabled())) return false;
    await ports.setEnabled(false);
    return true;
  } catch {
    return false;
  }
}
