// ─────────────────────────────────────────────────────────────────────────────
// Street-address search, with the session and the debounce in one place.
//
// See `lib/maps/address-search.ts` for why the session token is owned here.
// Every request spends one unit of a monthly allowance shared by all members, so
// three things keep the count down: a 400 ms debounce, a three-character floor,
// and no request at all when the deployment has said it has no address search.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { newIdempotencyKey } from '@/lib/idempotency';
import {
  MINIMUM_ADDRESS_INPUT,
  resolveAddress,
  suggestAddresses,
  type AddressSuggestion,
  type ResolvedAddress,
} from '@/lib/maps/address-search';
import type { GeoCoordinate } from '@/types/maps';

const DEBOUNCE_MS = 400;

export interface AddressSearchState {
  suggestions: AddressSuggestion[];
  isSearching: boolean;
  isResolving: boolean;
  /** The server's sentence when it could not help. Never a raw error. */
  notice: string | null;
  /** Set once the deployment says it has no address search; the field then hides itself. */
  isUnavailable: boolean;
  attribution: string | null;
}

export function useAddressSearch(
  text: string,
  options: {
    near?: GeoCoordinate;
    countryCodes?: string[];
    enabled?: boolean;
    /** Countries, regions, towns and districts rather than street addresses (14 Oct 2026). */
    regionsOnly?: boolean;
  } = {}
) {
  const { near, countryCodes, enabled = true, regionsOnly = false } = options;
  const session = useRef<string | null>(null);
  const [state, setState] = useState<AddressSearchState>({
    suggestions: [],
    isSearching: false,
    isResolving: false,
    notice: null,
    isUnavailable: false,
    attribution: null,
  });

  const countryKey = countryCodes?.join(',') ?? '';
  const nearLatitude = near?.latitude;
  const nearLongitude = near?.longitude;

  useEffect(() => {
    const trimmed = text.trim();

    if (!enabled || state.isUnavailable || trimmed.length < MINIMUM_ADDRESS_INPUT) {
      setState((current) => ({ ...current, suggestions: [], isSearching: false }));
      return;
    }

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      session.current ??= newIdempotencyKey();
      setState((current) => ({ ...current, isSearching: true }));

      try {
        const page = await suggestAddresses({
          text: trimmed,
          sessionToken: session.current,
          near:
            nearLatitude !== undefined && nearLongitude !== undefined
              ? { latitude: nearLatitude, longitude: nearLongitude }
              : undefined,
          countryCodes: countryKey ? countryKey.split(',') : undefined,
          regionsOnly: regionsOnly || undefined,
          signal: controller.signal,
        });

        setState((current) => ({
          ...current,
          isSearching: false,
          suggestions: page.suggestions,
          attribution: page.attribution,
          notice: page.status === 'Success' ? null : page.message,
          isUnavailable: page.status === 'NotConfigured',
        }));
      } catch {
        if (controller.signal.aborted) return;
        setState((current) => ({
          ...current,
          isSearching: false,
          suggestions: [],
          notice: 'Address search could not be reached. Check your connection and try again.',
        }));
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, enabled, state.isUnavailable, countryKey, nearLatitude, nearLongitude, regionsOnly]);

  /** Resolves a pick to a coordinate, and closes the session whatever the answer. */
  const pick = useCallback(async (suggestion: AddressSuggestion): Promise<ResolvedAddress | null> => {
    const token = session.current ?? newIdempotencyKey();
    session.current = null;

    setState((current) => ({ ...current, isResolving: true }));

    try {
      const answer = await resolveAddress({ placeId: suggestion.placeId, sessionToken: token });

      setState((current) => ({
        ...current,
        isResolving: false,
        suggestions: [],
        notice: answer.place ? null : answer.message,
      }));

      return answer.place;
    } catch {
      setState((current) => ({
        ...current,
        isResolving: false,
        notice: 'That address could not be looked up just now. Please try again.',
      }));
      return null;
    }
  }, []);

  return { ...state, pick };
}
