// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — noticing, quietly, that somebody may have moved
//
// ── Why this is a suggestion and never an action ─────────────────────────────
//
// **Travel is not relocation, and this audience travels.** Someone from Nigeria
// living in Mauritius spends three weeks in Lagos at Christmas. For those three
// weeks the device reports NG on every reading, and there is no signal that
// separates a holiday from a move except how long it lasts. Anything that acted
// on a single reading — or a week of them — would ask a member to re-verify
// every time they went home, and anything that acted *automatically* would close
// a standing they spent two years building because they visited their mother.
//
// So this module decides one thing only: whether to show a dismissible line
// asking "living in X now?". It never writes, never verifies, never closes a
// standing and never revokes anything. The member taps through to
// `profile/residence` and records the move themselves, or dismisses it.
//
// ── Why it is off by default ─────────────────────────────────────────────────
//
// §55 forbids inferring sensitive identity characteristics without explicit
// product authorization, and where somebody lives is exactly that. The same rule
// is why onboarding never pre-ticks a community from location, and why
// `multi-community-gaps.ts` refuses to derive suggestions on-device: "made in
// the one place nobody can audit it."
//
// A prompt is a weaker thing than an assignment — it asks rather than asserts,
// which is the line `no-inferred-labels` draws — but it is still an inference,
// so it waits for the authorization rather than assuming it. Set
// `EXPO_PUBLIC_ENABLE_RELOCATION_HINT=1` to turn it on.
//
// ── Why it never asks for permission ─────────────────────────────────────────
//
// `detectCountry()` defaults to reading the grant that already exists and never
// prompting, because `detect-country.ts` is explicit that a permission dialogue
// raised by mounting a screen is the pattern that teaches people to press Deny
// without reading. A member who has not granted location gets no hint, for ever,
// and the whole flow works without it.
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';

import { detectCountry } from '@/lib/location/detect-country';

/** The environment variable name, exported so tests and tooling do not drift. */
export const RELOCATION_HINT_ENV_VAR = 'EXPO_PUBLIC_ENABLE_RELOCATION_HINT';

const SIGHTINGS_KEY = 'diaspora.relocation.sightings.v1';
const DISMISSED_KEY = 'diaspora.relocation.dismissed.v1';

/** How long a sighting is worth keeping. Older ones say nothing about now. */
export const WINDOW_DAYS = 120;

/**
 * How long the member has to have been somewhere else.
 *
 * Thirty days is longer than almost any trip home and shorter than almost any
 * move. It will still be wrong for a long sabbatical, which is why the answer is
 * a question rather than a change.
 */
export const MIN_SPAN_DAYS = 30;

/** Below this, the window is a handful of app opens and proves nothing. */
export const MIN_SIGHTINGS = 8;

/** How much of the window has to agree before it is worth asking about. */
export const MAJORITY = 0.7;

/** A dismissal is respected for this long before the question can return. */
export const DISMISSAL_DAYS = 180;

export interface Sighting {
  /** ISO 3166-1 alpha-2, upper case. */
  countryCode: string;
  /** Epoch milliseconds. */
  at: number;
}

/**
 * Whether this build may notice at all.
 *
 * Compared against the exact string `'1'` rather than for truthiness, and
 * written as a static member access so Babel inlines it at build time — the
 * same shape as `areSimulatedFeaturesEnabled`, for the same reasons. Unlike that
 * flag this one does **not** default on in development: a hint that only ever
 * appears on developer machines is a hint nobody has reviewed.
 */
export function isRelocationHintEnabled(): boolean {
  return process.env.EXPO_PUBLIC_ENABLE_RELOCATION_HINT === '1';
}

async function readSightings(): Promise<Sighting[]> {
  try {
    const raw = await AsyncStorage.getItem(SIGHTINGS_KEY);

    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (entry): entry is Sighting =>
        typeof (entry as Sighting)?.countryCode === 'string' &&
        typeof (entry as Sighting)?.at === 'number'
    );
  } catch {
    // A corrupt or unreadable store means no history, not a crash on launch.
    return [];
  }
}

/**
 * Records where the device says it is, if it is willing to say.
 *
 * Safe to call on every foreground: it writes at most one row a day, so a member
 * who opens the app forty times in an afternoon contributes one sighting and
 * cannot outvote a member who opens it once.
 */
export async function recordSighting(now: Date = new Date()): Promise<void> {
  if (!isRelocationHintEnabled()) return;

  const detection = await detectCountry();

  if (detection.status !== 'detected') return;

  const sightings = prune(await readSightings(), now);
  const today = startOfDay(now);

  if (sightings.some((sighting) => startOfDay(new Date(sighting.at)) === today)) {
    return;
  }

  sightings.push({ countryCode: detection.countryCode.toUpperCase(), at: now.getTime() });

  try {
    await AsyncStorage.setItem(SIGHTINGS_KEY, JSON.stringify(sightings));
  } catch {
    // Losing a sighting costs a day of evidence and nothing else.
  }
}

/**
 * The country worth asking about, or null.
 *
 * `openResidences` is where the member says they live. A country already on that
 * list is not news however often the device reports it — which is what stops the
 * hint firing at somebody who correctly lives in two places.
 */
export async function suggestRelocation(
  openResidences: readonly string[],
  now: Date = new Date()
): Promise<string | null> {
  if (!isRelocationHintEnabled()) return null;

  const sightings = prune(await readSightings(), now);

  if (sightings.length < MIN_SIGHTINGS) return null;

  const span = now.getTime() - Math.min(...sightings.map((sighting) => sighting.at));

  if (span < MIN_SPAN_DAYS * DAY_MS) return null;

  const declared = new Set(openResidences.map((code) => code.toUpperCase()));
  const counts = new Map<string, number>();

  for (const sighting of sightings) {
    counts.set(sighting.countryCode, (counts.get(sighting.countryCode) ?? 0) + 1);
  }

  const [leader, count] = [...counts.entries()].reduce((best, entry) =>
    entry[1] > best[1] ? entry : best
  );

  if (declared.has(leader)) return null;
  if (count / sightings.length < MAJORITY) return null;

  return (await isDismissed(leader, now)) ? null : leader;
}

/**
 * Remembers that the member said no.
 *
 * Asking again next week is how a suggestion becomes nagging, and a member who
 * declines is usually declining a fact about their life rather than a button.
 */
export async function dismissSuggestion(
  countryCode: string,
  now: Date = new Date()
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_KEY);
    const dismissed: Record<string, number> =
      raw ? (JSON.parse(raw) as Record<string, number>) : {};

    dismissed[countryCode.toUpperCase()] = now.getTime();

    await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
  } catch {
    // A dismissal that does not persist shows the hint again. Annoying, not wrong.
  }
}

/**
 * Forgets everything.
 *
 * Called when a member records a move, so the evidence that produced the hint
 * cannot go on producing it against the country they have just declared.
 */
export async function clearSightings(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SIGHTINGS_KEY);
    await AsyncStorage.removeItem(DISMISSED_KEY);
  } catch {
    // Nothing downstream depends on this having happened.
  }
}

// ── Internals ────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function prune(sightings: Sighting[], now: Date): Sighting[] {
  const floor = now.getTime() - WINDOW_DAYS * DAY_MS;

  return sightings.filter((sighting) => sighting.at >= floor);
}

async function isDismissed(countryCode: string, now: Date): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_KEY);

    if (!raw) return false;

    const dismissed = JSON.parse(raw) as Record<string, number>;
    const at = dismissed[countryCode];

    return typeof at === 'number' && now.getTime() - at < DISMISSAL_DAYS * DAY_MS;
  } catch {
    return false;
  }
}
