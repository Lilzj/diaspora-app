// The words the area screen (`app/map/area.tsx`) puts on a circle, kept here so
// they can be tested without rendering the screen (14 Oct 2026).

import type { AreaCostOfLiving, AreaPoint, AreaReport } from '@/lib/maps/geo-client';

export type AreaOrigin = 'place' | 'cell' | 'me';

/** A chosen point, with what the member called it when they picked it. */
export interface ChosenPoint extends AreaPoint {
  placeId?: string | null;
  origin: AreaOrigin;
}

/**
 * The sentence for a cost of living with no index.
 *
 * `InsufficientSample` is "not enough nearby listings yet", with the sample
 * sizes beside it, never an index guessed from a thin sample.
 */
export function costOfLivingUnavailableText(cost: AreaCostOfLiving): string {
  if (cost.unavailableReason === 'InsufficientSample') {
    return (
      `Not enough nearby listings yet to work out typical rent here. ` +
      `${cost.sampleSize} ${cost.sampleSize === 1 ? 'home is' : 'homes are'} listed to rent in this area ` +
      `and ${cost.countrySampleSize} in the country; an index needs at least 5 here and 20 in the country.`
    );
  }
  return 'Typical rent is not available for this area.';
}

/**
 * The page title: the place name the member picked, or a description of the
 * circle. Never a name the platform worked out from the point.
 */
export function areaTitle(report: AreaReport | null, chosen: ChosenPoint | null, radiusKm: number): string {
  if (chosen?.name?.trim()) return chosen.name.trim();
  if (chosen?.origin === 'cell') return `Within ${radiusKm} km of this point`;
  return report?.displayName ?? `Within ${radiusKm} km of you`;
}

/** A point from route params, or null when the params carry none. */
export function parseAreaPoint(
  params: Record<string, string | string[] | undefined>,
  fallbackCountry: string
): ChosenPoint | null {
  const one = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const latitudeText = one('latitude');
  const longitudeText = one('longitude');
  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  if (!latitudeText || !longitudeText || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const name = one('name') || null;
  const originText = one('origin');
  const origin: AreaOrigin =
    originText === 'cell' || originText === 'me' || originText === 'place' ? originText : name ? 'place' : 'me';

  return {
    latitude,
    longitude,
    countryCode: (one('countryCode') || fallbackCountry || '').toUpperCase(),
    name,
    placeId: one('placeId') || null,
    origin,
  };
}
