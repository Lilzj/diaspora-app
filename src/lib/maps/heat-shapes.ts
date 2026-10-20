// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — a heat layer as shapes on the map (20 Oct 2026)
//
// Every cell of `GET /geo/heatmap` is a square on the server's world grid, and
// the server sends its edges. So a layer is drawn as those squares — the same
// polygons both renderers already draw — rather than as blurred circles the
// native map never drew at all.
//
// **Withheld squares are drawn too, and differently.** A square below its
// layer's minimum holds something; leaving it blank would read as "nothing
// here", which is the one thing it does not mean. It is grey and outlined, and
// the legend names it.
//
// **No square is labelled.** The server's `areaName` describes a position, and
// a home's neighbourhood is inferred from its pin: neither is anybody's word
// for the place, so nothing here carries a name.
// ─────────────────────────────────────────────────────────────────────────────

import type { GeoBoundingBox, GeoCoordinate, HeatMapLayerData } from '@/types/maps';
import type { MapPolygonOverlay } from './providers/types';

/** The legend's five steps, low to high. The squares use the same five. */
export const HEAT_GRADIENT = ['#FDE68A', '#FBBF24', '#F59300', '#EA580C', '#DC2626'] as const;

/** A withheld square: grey, so it can never be read as a low value on the gradient. */
export const WITHHELD_FILL = 'rgba(107, 114, 128, 0.22)';
export const WITHHELD_STROKE = 'rgba(75, 85, 99, 0.85)';

const FILL_ALPHA = 0.5;

function hexToRgba(hex: string, alpha: number): string {
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** The gradient step an intensity falls in. A non-finite intensity is treated as the bottom. */
export function heatColour(intensity: number): string {
  const clamped = Number.isFinite(intensity) ? Math.min(Math.max(intensity, 0), 1) : 0;
  const index = Math.min(HEAT_GRADIENT.length - 1, Math.floor(clamped * HEAT_GRADIENT.length));
  return HEAT_GRADIENT[index];
}

function isFiniteBox(box: GeoBoundingBox | undefined): box is GeoBoundingBox {
  return (
    !!box &&
    Number.isFinite(box.north) &&
    Number.isFinite(box.south) &&
    Number.isFinite(box.east) &&
    Number.isFinite(box.west) &&
    box.north > box.south
  );
}

function squarePath(box: GeoBoundingBox): GeoCoordinate[] {
  return [
    { latitude: box.north, longitude: box.west },
    { latitude: box.north, longitude: box.east },
    { latitude: box.south, longitude: box.east },
    { latitude: box.south, longitude: box.west },
  ];
}

/** A square of the given side around a point, for a cell sent without its edges. */
function squareAround(point: GeoCoordinate, sideDegrees: number): GeoBoundingBox {
  const half = sideDegrees / 2;
  return {
    north: point.latitude + half,
    south: point.latitude - half,
    east: point.longitude + half,
    west: point.longitude - half,
  };
}

/**
 * The polygons a layer draws: drawn squares on the gradient, withheld squares
 * in grey. An unavailable layer draws nothing — its reason is shown instead.
 */
export function heatLayerPolygons(
  layer: HeatMapLayerData & { cellSizeDegrees?: number | null }
): MapPolygonOverlay[] {
  if (layer.isAvailable === false) return [];

  const polygons: MapPolygonOverlay[] = [];
  const side = layer.cellSizeDegrees;

  layer.points.forEach((point, index) => {
    const box =
      point.cellBounds ??
      (typeof side === 'number' && side > 0 ? squareAround(point.coordinate, side) : undefined);
    if (!isFiniteBox(box)) return;

    const colour = heatColour(point.intensity);
    polygons.push({
      id: `heat-${layer.layer.id}-${index}`,
      path: squarePath(box),
      fillColor: hexToRgba(colour, FILL_ALPHA),
      strokeColor: hexToRgba(colour, 0.9),
    });
  });

  (layer.withheldCells ?? []).forEach((cell) => {
    if (!isFiniteBox(cell.cellBounds)) return;
    polygons.push({
      id: `heat-withheld-${cell.cellKey}`,
      path: squarePath(cell.cellBounds),
      fillColor: WITHHELD_FILL,
      strokeColor: WITHHELD_STROKE,
    });
  });

  return polygons;
}
