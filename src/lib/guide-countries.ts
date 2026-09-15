// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the countries a member can file a guide under
//
// **Writing a guide was locked at step one for every member.** The country
// picker offered only the countries Trust had *verified* a residency for, and
// nobody on the platform had one — so the first box was "🔒 LOCKED" with nothing
// in it, while the Guides service accepts any ISO country from a verified
// account (`guides.publish` is the Verified tier and nothing else).
//
// Decided 15 Sep 2026, with the other create screens: a verified account is
// enough. A member can write about where they live, where they are from, or any
// country Trust already holds a standing for; where they live comes first,
// because that is the guide the platform is for.
// ─────────────────────────────────────────────────────────────────────────────

import { countryByCode } from './calling-code';
import { countryFlagEmoji } from './knowledge-countries-api';

/** Why a country is on the list, so the picker can say so. */
export type GuideCountryTie = 'residence' | 'origin' | 'standing';

export interface GuideCountryOption {
  /** ISO 3166-1 alpha-2, upper case. What `CreateGuideRequest.countryCode` takes. */
  countryCode: string;
  countryName: string;
  flag: string;
  tie: GuideCountryTie;
}

interface StandingLike {
  countryCode?: string | null;
  countryName?: string | null;
  flag?: string | null;
}

function isoCode(value: string | null | undefined): string | null {
  const code = (value ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

/**
 * Residence first, then origin, then any other country Trust has a standing
 * for — each once. Anything that is not a two-letter code is left out rather
 * than offered, because the server refuses it with `guides.country.invalid`.
 */
export function guideCountryOptions(input: {
  residence?: string | null;
  origin?: string | null;
  standings?: readonly StandingLike[] | null;
}): GuideCountryOption[] {
  const options: GuideCountryOption[] = [];
  const seen = new Set<string>();

  const add = (code: string | null, tie: GuideCountryTie, standing?: StandingLike) => {
    if (!code || seen.has(code)) return;
    seen.add(code);
    options.push({
      countryCode: code,
      countryName: standing?.countryName?.trim() || countryByCode(code)?.name || code,
      flag: standing?.flag?.trim() || countryFlagEmoji(code),
      tie,
    });
  };

  add(isoCode(input.residence), 'residence');
  add(isoCode(input.origin), 'origin');
  for (const standing of input.standings ?? []) {
    add(isoCode(standing?.countryCode), 'standing', standing);
  }

  return options;
}

/** "Where you live", "Where you are from" — or nothing for a standing. */
export function guideCountryTieLabel(tie: GuideCountryTie): string {
  switch (tie) {
    case 'residence':
      return 'Where you live';
    case 'origin':
      return 'Where you are from';
    default:
      return '';
  }
}
