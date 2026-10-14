// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — street-address search (Phase 8, 27 Sep 2026)
//
// `POST /location/places/autocomplete` and `/details`, which the backend answers
// through its configured vendor (Google Maps, free tier only). POST, not GET, so
// what a member types, usually where they live, stays out of access logs.
//
// ── A session is billing, not bookkeeping ────────────────────────────────────
//
// Google bills a run of keystrokes that ends in a pick more cheaply than the
// same keystrokes sent alone, and only when every request carries the same
// token and the pick closes it. So the token belongs to the search field, not to
// a request: it is minted on the first keystroke, reused until a pick, and
// thrown away after the pick, because reusing a closed token is billed as if
// there were none. `useAddressSearch` owns that lifecycle so no screen has to.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from '@/lib/apiClient';
import type { GeoCoordinate } from '@/types/maps';

interface Envelope<T> {
  data: T;
}

/** `Success`, `NotConfigured`, `Unavailable`, `RateLimited`, `AllowanceExhausted`, … */
export type AddressSearchStatus = string;

export interface AddressSuggestion {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string | null;
  types: string[];
}

export interface AddressSuggestionPage {
  status: AddressSearchStatus;
  provider: string;
  suggestions: AddressSuggestion[];
  /** Credit the provider requires beside its results. Must be shown when present. */
  attribution: string | null;
  message: string | null;
}

export interface ResolvedAddress {
  placeId: string;
  latitude: number;
  longitude: number;
  name: string | null;
  formattedAddress: string | null;
  countryCode: string | null;
  locality: string | null;
  postalCode: string | null;
}

export interface ResolvedAddressAnswer {
  status: AddressSearchStatus;
  provider: string;
  place: ResolvedAddress | null;
  attribution: string | null;
  message: string | null;
}

/** Below this the server refuses, and so does the field. */
export const MINIMUM_ADDRESS_INPUT = 3;

export async function suggestAddresses(input: {
  text: string;
  sessionToken: string;
  near?: GeoCoordinate;
  countryCodes?: string[];
  /** Towns and cities only (14 Oct 2026): the shared town picker. */
  townsOnly?: boolean;
  signal?: AbortSignal;
}): Promise<AddressSuggestionPage> {
  const response = await apiClient.post<Envelope<AddressSuggestionPage>>(
    '/location/places/autocomplete',
    {
      input: input.text,
      sessionToken: input.sessionToken,
      near: input.near ? { latitude: input.near.latitude, longitude: input.near.longitude } : undefined,
      countryCodes: input.countryCodes,
      townsOnly: input.townsOnly || undefined,
    },
    { signal: input.signal }
  );

  return response.data.data;
}

export async function resolveAddress(input: {
  placeId: string;
  sessionToken: string;
}): Promise<ResolvedAddressAnswer> {
  const response = await apiClient.post<Envelope<ResolvedAddressAnswer>>('/location/places/details', {
    placeId: input.placeId,
    sessionToken: input.sessionToken,
  });

  return response.data.data;
}
