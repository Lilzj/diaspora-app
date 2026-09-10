// ─────────────────────────────────────────────────────────────────────────────
// Which clock an event is on
//
// ── The defect ──────────────────────────────────────────────────────────────
//
// The create form takes the event's timezone from the **device**
// (`Intl.DateTimeFormat().resolvedOptions().timeZone`) and its country from the
// member's **residence**. Those are two different questions and they can
// disagree — and when they do, nothing says so.
//
// It happened on the first event this platform ever published: created in Port
// Louis, on a handset set to `Africa/Lagos`, and stored as 18:00 Lagos time —
// 21:00 where the event actually is. The screen renders the stored zone
// faithfully, so it shows 18:00 with an AFRICA/LAGOS chip beside it, and every
// reminder and calendar export counts from the wrong instant.
//
// ── Why this offers a choice rather than deriving one ───────────────────────
//
// The obvious fix is a country-to-timezone table. This repository has none, and
// writing one from memory is inventing data: most countries have one zone, some
// have five, and being confidently wrong about somebody's event time is worse
// than the device default it replaces.
//
// So the zone becomes **visible where the place is entered**, and changeable.
// A silent wrong assumption becomes a stated one the organiser can correct,
// which is the honest version of what is knowable here.
// ─────────────────────────────────────────────────────────────────────────────

/** The zone this handset is set to, or UTC where there is no `Intl` to ask. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Whether this runtime's ICU knows the zone.
 *
 * The only validation worth doing on a typed zone: a name it cannot resolve
 * would be stored and then silently ignored by every reader.
 */
export function isKnownTimeZone(zone: string): boolean {
  if (!zone.trim()) {
    return false;
  }

  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone }).format(0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Every zone this runtime knows, when it will say.
 *
 * `Intl.supportedValuesOf` is recent and Hermes ships a partial `Intl`, so this
 * returns an empty list rather than assuming. A caller with nothing to list
 * should let the organiser type instead of pretending there is nothing to
 * choose.
 */
export function knownTimeZones(): string[] {
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf;

    return typeof supported === 'function' ? supported('timeZone') : [];
  } catch {
    return [];
  }
}

/**
 * Zones plausible for a two-letter country code, best effort.
 *
 * Matched on the zone's own region prefix and city segment, which is all an
 * IANA name actually encodes — `Indian/Mauritius` names the island, not `MU`.
 * So this is a *shortlist to choose from*, never an answer: a country with no
 * match simply offers the full list.
 */
export function suggestTimeZones(countryCode: string, cityName?: string): string[] {
  const zones = knownTimeZones();

  if (zones.length === 0) {
    return [];
  }

  const city = cityName?.trim().toLowerCase().replace(/\s+/g, '_');

  if (!city) {
    return [];
  }

  return zones.filter((zone) => zone.toLowerCase().endsWith(`/${city}`));
}

// ── A note on what is deliberately absent ───────────────────────────────────
//
// A `describeTimeZoneRisk(timezone, countryCode, residenceCountry)` was written
// here and removed before it shipped. It compared the member's residence
// country against the event's country and warned when they differed — and it
// would not have fired on the case that prompted it. That event was created by
// a member resident in Mauritius, for a place in Mauritius, on a handset set to
// Africa/Lagos: residence and event country agreed, and only the device
// disagreed with both.
//
// Detecting that needs a zone-to-country mapping, which an IANA name does not
// carry. So there is no warning, and instead the zone is stated plainly at the
// point the place is entered, where an organiser can see it and change it. A
// check that cannot fire in the case it was written for is worse than none:
// it reads like the case is covered.
