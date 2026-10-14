// ─────────────────────────────────────────────────────────────────────────────
// Where the member is, as a point the area routes can be asked about.
//
// The area around a point (14 Oct 2026) needs a coordinate and a country. Both
// come from the member's location store; the country falls back to their
// country of residence. A location known only to country precision carries a
// national centroid, which is never a member position, so it is not offered as
// "around you": the screen asks the member to pick a place instead.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import { getActiveLocation, useLocationStore } from '@/store/location';
import { useAuthStore } from '@/store/auth';

export interface MemberPoint {
  latitude: number;
  longitude: number;
  /** Upper-case ISO 3166-1 alpha-2. Empty when nothing is known. */
  countryCode: string;
}

export interface MemberPointState {
  /** Null when the member's position is not known below the country. */
  point: MemberPoint | null;
  /** The member's country, from their location or else their residence. Empty when unknown. */
  countryCode: string;
}

export function useMemberPoint(): MemberPointState {
  const active = useLocationStore(getActiveLocation);
  const residenceCountry = useAuthStore((s) => s.user?.residenceCountry);

  return useMemo(() => {
    const countryCode = (active.countryCode || residenceCountry || '').toUpperCase();
    const isPlaced =
      active.precision !== 'country' &&
      Number.isFinite(active.latitude) &&
      Number.isFinite(active.longitude) &&
      // An unset location is stored as 0, 0, which is the Gulf of Guinea, not a place.
      !(active.latitude === 0 && active.longitude === 0);

    return {
      point:
        isPlaced && countryCode
          ? { latitude: active.latitude, longitude: active.longitude, countryCode }
          : null,
      countryCode,
    };
  }, [active.countryCode, active.latitude, active.longitude, active.precision, residenceCountry]);
}
