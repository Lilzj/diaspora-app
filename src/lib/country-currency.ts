// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the currency a country's prices are written in
//
// A mirror of the countries the server seeds with a currency
// (`DefaultCountryMetadataContributor` in diaspora-backend). Seven of the thirty
// used to live in `job-postings-api.ts`, and every other country fell back to
// USD — harmless as a default on a form that offers the others, and wrong as the
// currency of a search, where it matches nothing.
//
// Nothing here converts. A price filter names one currency because the platform
// compares amounts only within one.
// ─────────────────────────────────────────────────────────────────────────────

const CURRENCY_BY_COUNTRY: Readonly<Record<string, string>> = {
  GB: 'GBP',
  MU: 'MUR',
  NG: 'NGN',
  GH: 'GHS',
  KE: 'KES',
  ZA: 'ZAR',
  US: 'USD',
  CA: 'CAD',
  FR: 'EUR',
  DE: 'EUR',
  IE: 'EUR',
  NL: 'EUR',
  ES: 'EUR',
  IT: 'EUR',
  PT: 'EUR',
  AU: 'AUD',
  NZ: 'NZD',
  AE: 'AED',
  IN: 'INR',
  CI: 'XOF',
  SN: 'XOF',
  CM: 'XAF',
  ET: 'ETB',
  TZ: 'TZS',
  UG: 'UGX',
  ZW: 'ZWL',
  JM: 'JMD',
  TT: 'TTD',
  BR: 'BRL',
  PH: 'PHP',
};

/** The country's currency, or null when the platform does not know it. */
export function countryCurrency(countryCode: string | null | undefined): string | null {
  return CURRENCY_BY_COUNTRY[(countryCode ?? '').trim().toUpperCase()] ?? null;
}
