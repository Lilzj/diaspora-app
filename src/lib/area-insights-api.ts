// ─────────────────────────────────────────────────────────────────────────────
// What members say about the area around a point — 14 Oct 2026
//
// `POST /housing/area/insights` and `GET /housing/area/insights`, the
// point-keyed successors of the catalogue neighbourhood's insight routes, which
// keep answering old app builds and are no longer called here.
//
// An insight is moderated before it appears: a submission comes back
// `Pending`, and the list shows approved insights (plus the member's own, so
// they can see theirs is waiting). The place name is the Google place the member
// picked, sent as they picked it; it is never derived from the point here.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from '@/lib/apiClient';

interface Envelope<T> {
  data: T;
}

/** `NeighborhoodInsightCategory`, by name. */
export const AREA_INSIGHT_CATEGORIES = [
  'Safety',
  'Transport',
  'CostOfLiving',
  'Community',
  'Noise',
  'Utilities',
  'Amenities',
  'Schools',
  'Nightlife',
  'Accessibility',
  'Healthcare',
  'Other',
] as const;

export type AreaInsightCategory = (typeof AREA_INSIGHT_CATEGORIES)[number];

/** What a member reads for each category. */
export const AREA_INSIGHT_CATEGORY_LABELS: Record<AreaInsightCategory, string> = {
  Safety: 'Safety',
  Transport: 'Getting around',
  CostOfLiving: 'Cost of living',
  Community: 'Community',
  Noise: 'Noise',
  Utilities: 'Utilities',
  Amenities: 'Shops and amenities',
  Schools: 'Schools',
  Nightlife: 'Nightlife',
  Accessibility: 'Accessibility',
  Healthcare: 'Healthcare',
  Other: 'Other',
};

/** The longest insight the server accepts. */
export const AREA_INSIGHT_MAX_LENGTH = 400;

/** `NeighborhoodInsightResponse`, as the area routes return it. */
export interface AreaInsight {
  id: string;
  /** Null for an insight filed at a point rather than a catalogue area. */
  areaId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  placeName?: string | null;
  placeId?: string | null;
  countryCode?: string | null;
  /** How far the insight's point is from the point asked about. */
  distanceKm?: number | null;
  category: string;
  body: string;
  label?: string | null;
  /** `Pending`, `Approved`, `Rejected`. */
  status: string;
  endorsementCount: number;
  hasEndorsed: boolean;
  isAuthor: boolean;
  decisionNote?: string | null;
  createdAt: string;
}

export interface AreaInsightQuery {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  category?: AreaInsightCategory;
  mineOnly?: boolean;
  cursor?: string;
  limit?: number;
}

export interface SubmitAreaInsightInput {
  latitude: number;
  longitude: number;
  /** The Google place name the member picked. Omitted for "around here". */
  placeName?: string | null;
  placeId?: string | null;
  countryCode?: string | null;
  category: AreaInsightCategory;
  body: string;
  label?: string | null;
}

/** `GET /housing/area/insights`: insights within `radiusKm` of a point. */
export async function fetchAreaInsights(
  query: AreaInsightQuery,
  options: { signal?: AbortSignal } = {}
): Promise<AreaInsight[]> {
  const response = await apiClient.get<Envelope<AreaInsight[]>>('/housing/area/insights', {
    params: {
      latitude: query.latitude,
      longitude: query.longitude,
      radiusKm:
        query.radiusKm !== undefined && Number.isFinite(query.radiusKm) && query.radiusKm > 0
          ? Math.min(query.radiusKm, 10)
          : undefined,
      category: query.category,
      mineOnly: query.mineOnly || undefined,
      cursor: query.cursor,
      limit: query.limit,
    },
    signal: options.signal,
  });

  const rows = response.data?.data;
  return Array.isArray(rows) ? rows : [];
}

/** `POST /housing/area/insights`. Comes back `Pending`: a moderator reads it first. */
export async function submitAreaInsight(input: SubmitAreaInsightInput): Promise<AreaInsight> {
  const placeName = input.placeName?.trim();
  const label = input.label?.trim();

  const response = await apiClient.post<Envelope<AreaInsight>>('/housing/area/insights', {
    latitude: input.latitude,
    longitude: input.longitude,
    placeName: placeName ? placeName : undefined,
    placeId: input.placeId || undefined,
    countryCode: input.countryCode ? input.countryCode.toUpperCase() : undefined,
    category: input.category,
    body: input.body.trim(),
    label: label ? label : undefined,
  });

  return response.data.data;
}
