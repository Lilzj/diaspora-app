// ─────────────────────────────────────────────────────────────────────────────
// The currency every price a member enters is in
//
// Decided by the owner on 13 Oct 2026: members never choose a currency. A
// member living in Mauritius prices in Mauritian rupees, so the "Currency"
// chip rows (GBP, MUR, USD, EUR, NGN, GHS) on every create form are gone and
// this decides instead — from the country of RESIDENCE on the account, not the
// discovery location, which changes in travel mode.
//
// Six of those forms defaulted to GBP, so a member in Mauritius who did not
// notice the chips published rents and menus in pounds.
// ─────────────────────────────────────────────────────────────────────────────

import { countryCurrency } from '@/lib/country-currency';
import { useAuthStore } from '@/store/auth';

/** Used only for a country the platform has no currency for. Said on screen. */
export const FALLBACK_CURRENCY = 'USD';

export interface MemberCurrency {
  /** ISO 4217, e.g. `MUR`. */
  code: string;
  /** The residence country, ISO alpha-2, when the account has one. */
  countryCode: string | null;
  /** False when the country is unknown to the platform and {@link FALLBACK_CURRENCY} is used. */
  isKnown: boolean;
}

export function currencyForResidence(countryCode: string | null | undefined): MemberCurrency {
  const code = countryCurrency(countryCode);
  return {
    code: code ?? FALLBACK_CURRENCY,
    countryCode: countryCode ? countryCode.toUpperCase() : null,
    isKnown: code !== null,
  };
}

/** The signed-in member's currency. */
export function useMemberCurrency(): MemberCurrency {
  const residence = useAuthStore((state) => state.user?.residenceCountry ?? null);
  return currencyForResidence(residence);
}
