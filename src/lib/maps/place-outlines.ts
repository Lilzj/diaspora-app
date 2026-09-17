/**
 * Where a place ends, from the people who drew the line — 17 Sep 2026.
 *
 * FRONTEND-MAPS-GAP-016. The platform now stores the OpenStreetMap outline of
 * each catalogue place with an exact OSM match — Greater London, Greater
 * Manchester, Manchester, Plaines Wilhems, Port Louis, Quatre Bornes and
 * Curepipe at launch — and `GET /location/map/boundaries` answers which of them
 * a viewport overlaps. Neighbourhoods have none: no open dataset matches the
 * catalogue's neighbourhoods exactly, and a line nobody can source is a line
 * this app does not draw.
 *
 * **The credit is part of the outline.** The outlines are OpenStreetMap data
 * under the Open Database License, which requires "© OpenStreetMap
 * contributors" wherever they are shown. Every outline carries its credit, the
 * map shows it whenever it draws one, and an outline that arrives without a
 * credit is not drawn at all.
 *
 * **Lines, not areas.** An outline is drawn as a stroke with no fill: a town
 * inside a district inside a region would otherwise tint the view three times
 * over, and a filled shape reads as "this is the area that matters" when the
 * member asked about homes or jobs, not about the town.
 */
import { apiClient } from '@/lib/apiClient';
import type { MapPolygonOverlay } from '@/lib/maps/providers/types';
import type { GeoBoundingBox, GeoCoordinate, MapViewport } from '@/types/maps';
import { isPlacedViewport } from './geo';

/**
 * The widest view, in degrees of latitude, that asks for outlines: roughly a
 * region. The platform answers up to twelve degrees; past a region the lines are
 * too fine to read and the rings are the heaviest thing on the map.
 */
export const PLACE_OUTLINE_MAX_LATITUDE_DELTA = 6;

/** The platform's own limit on either side of the view (`MaxSpanDegrees`). */
const PLATFORM_MAX_SPAN_DEGREES = 12;

interface VertexWire {
  latitude: number;
  longitude: number;
}

interface BoundaryWire {
  vertices?: VertexWire[] | null;
  source?: string | null;
  licence?: string | null;
  attribution?: string | null;
  sourceReference?: string | null;
  retrievedOn?: string | null;
}

export interface MapBoundaryWire {
  areaId: string;
  name: string;
  slug: string;
  level: string;
  countryCode: string;
  boundary?: BoundaryWire | null;
}

interface MapBoundaryPageWire {
  boundaries?: MapBoundaryWire[] | null;
  attributions?: string[] | null;
  isComplete?: boolean;
}

/** One place's outline, ready to draw, with the credit that must be shown beside it. */
export interface PlaceOutline {
  id: string;
  areaId: string;
  name: string;
  /** `Region`, `District`, `City`. */
  level: string;
  countryCode: string;
  path: GeoCoordinate[];
  /** Verbatim, as the licence requires: "© OpenStreetMap contributors". */
  attribution: string;
  source: string | null;
  licence: string | null;
  /** The source's identifier for the shape, e.g. "relation/13476401". */
  sourceReference: string | null;
  retrievedOn: string | null;
}

export interface PlaceOutlinePage {
  outlines: PlaceOutline[];
  /** False when the platform did not send every outline in view. */
  isComplete: boolean;
}

/** Whether a view is somewhere, and close enough in, to draw place outlines. */
export function wantsPlaceOutlines(viewport: MapViewport): boolean {
  return (
    isPlacedViewport(viewport) &&
    viewport.latitudeDelta <= PLACE_OUTLINE_MAX_LATITUDE_DELTA &&
    viewport.longitudeDelta <= PLATFORM_MAX_SPAN_DEGREES
  );
}

/**
 * One outline from the wire, or null when it cannot be drawn honestly: fewer
 * than three usable points, or no credit to show with it.
 */
export function toPlaceOutline(wire: MapBoundaryWire): PlaceOutline | null {
  const attribution = wire.boundary?.attribution?.trim();
  if (!attribution) return null;

  const path = (wire.boundary?.vertices ?? [])
    .filter((vertex) => Number.isFinite(vertex?.latitude) && Number.isFinite(vertex?.longitude))
    .map((vertex) => ({ latitude: vertex.latitude, longitude: vertex.longitude }));

  if (path.length < 3) return null;

  return {
    id: `outline:${wire.areaId}`,
    areaId: wire.areaId,
    name: wire.name,
    level: wire.level,
    countryCode: wire.countryCode,
    path,
    attribution,
    source: wire.boundary?.source ?? null,
    licence: wire.boundary?.licence ?? null,
    sourceReference: wire.boundary?.sourceReference ?? null,
    retrievedOn: wire.boundary?.retrievedOn ?? null,
  };
}

/** `GET /location/map/boundaries` for a viewport. Throws on a refusal or failure. */
export async function fetchPlaceOutlines(
  bounds: GeoBoundingBox,
  options: { signal?: AbortSignal } = {}
): Promise<PlaceOutlinePage> {
  const response = await apiClient.get<{ data: MapBoundaryPageWire }>('/location/map/boundaries', {
    params: {
      bounds: [bounds.north, bounds.south, bounds.east, bounds.west]
        .map((value) => value.toFixed(4))
        .join(','),
    },
    signal: options.signal,
  });

  const page = response.data?.data;

  return {
    outlines: (page?.boundaries ?? []).flatMap((wire) => toPlaceOutline(wire) ?? []),
    isComplete: page?.isComplete ?? false,
  };
}

/**
 * The credits the drawn outlines require, once each. Read from the outlines
 * actually drawn, never from the page's list, so a credit is shown exactly when
 * the line it belongs to is.
 */
export function outlineAttributions(outlines: readonly PlaceOutline[]): string[] {
  return [...new Set(outlines.map((outline) => outline.attribution))];
}

/**
 * Outlines as map strokes. A town's line is firmer than a district's or a
 * region's, so the place a member is looking at reads first.
 */
export function outlinePolygons(
  outlines: readonly PlaceOutline[],
  strokeColor: string
): MapPolygonOverlay[] {
  return outlines.map((outline) => ({
    id: outline.id,
    path: outline.path,
    fillColor: 'transparent',
    strokeColor: `${strokeColor}${outline.level === 'City' ? 'B3' : '59'}`,
  }));
}
