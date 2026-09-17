/**
 * The live alert map's channels — 16 Sep 2026.
 *
 * The server announces every change to a public alert on the map cells the
 * alert touches, as a `ResourceChanged` frame on `geo:alerts:{cell}`. A phone
 * joins the cells its viewport covers and, when a frame arrives, refetches the
 * alerts it is showing. The frame carries no content — it is a signal to ask
 * again, and the viewport query stays the only source of what is on the map.
 *
 * A cell is a four-character geohash, computed here exactly as
 * `Diaspora.Platform.Communication.GeoCells` computes it on the server. Both
 * sides are pinned to the same published vectors, so the two cannot drift into
 * disagreeing about where a cell is — which would fail silently, as a map that
 * never hears about anything.
 *
 * **Backfill is the client's.** The server does not replay what a cell announced
 * while a phone was away, so after joining — and after a reconnect — the map
 * refetches once. That is simpler than a replay and more correct: a replay could
 * only ever be a partial copy of the viewport query.
 */
import type { GeoBoundingBox } from '@/types/maps';

/** Characters in a cell name. About 39 km by 20 km at London's latitude. */
export const ALERT_CELL_PRECISION = 4;

/**
 * The most cells one map joins. A city takes a handful; a whole country takes
 * hundreds, and a map zoomed out that far says its alerts are periodic rather
 * than holding hundreds of subscriptions open.
 */
export const MAX_LIVE_ALERT_CELLS = 16;

export const ALERT_CHANNEL_PREFIX = 'geo:alerts:';

const ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz';

/** One cell's height in degrees: ten bits of latitude. */
const CELL_HEIGHT = 180 / 1024;

/** One cell's width in degrees: ten bits of longitude. */
const CELL_WIDTH = 360 / 1024;

/** The standard geohash of a point. */
export function encodeGeohash(
  latitude: number,
  longitude: number,
  precision: number = ALERT_CELL_PRECISION
): string {
  let latitudeLow = -90;
  let latitudeHigh = 90;
  let longitudeLow = -180;
  let longitudeHigh = 180;
  let hash = '';
  let bit = 0;
  let character = 0;
  let longitudeBit = true;

  while (hash.length < precision) {
    if (longitudeBit) {
      const middle = (longitudeLow + longitudeHigh) / 2;
      if (longitude >= middle) {
        character |= 1 << (4 - bit);
        longitudeLow = middle;
      } else {
        longitudeHigh = middle;
      }
    } else {
      const middle = (latitudeLow + latitudeHigh) / 2;
      if (latitude >= middle) {
        character |= 1 << (4 - bit);
        latitudeLow = middle;
      } else {
        latitudeHigh = middle;
      }
    }

    longitudeBit = !longitudeBit;

    if (bit < 4) {
      bit += 1;
    } else {
      hash += ALPHABET[character];
      bit = 0;
      character = 0;
    }
  }

  return hash;
}

/** The channel for one cell. */
export function alertChannel(cell: string): string {
  return `${ALERT_CHANNEL_PREFIX}${cell}`;
}

/**
 * The cells a viewport covers, or `null` when there are too many to watch.
 *
 * Samples the rectangle one cell apart with the last sample on each side clamped
 * to the edge, so no overlapped cell is stepped over. Sorted, so the same
 * viewport always yields the same list and panning within a cell subscribes to
 * nothing new.
 */
export function alertCellsForBounds(bounds: GeoBoundingBox): string[] | null {
  // Not a guard against bad data somewhere else — the loop below steps until a
  // comparison with the edge is true, and every comparison with NaN is false. A
  // screen's first viewport, built before the location store has loaded, froze
  // the whole JS thread on a cold start into the alerts map (17 Sep 2026).
  if (![bounds.north, bounds.south, bounds.east, bounds.west].every(Number.isFinite)) return null;

  const south = Math.max(Math.min(bounds.south, bounds.north), -90);
  const north = Math.min(Math.max(bounds.south, bounds.north), 90);
  const west = Math.max(bounds.west, -180);
  const east = Math.min(bounds.east, 180);

  // A viewport wider than the cap before sampling is refused without sampling it.
  const rows = Math.ceil((north - south) / CELL_HEIGHT) + 1;
  const columns = Math.ceil((east - west) / CELL_WIDTH) + 1;
  if (rows * columns > MAX_LIVE_ALERT_CELLS * 4) return null;

  const cells = new Set<string>();

  for (let row = south; ; row += CELL_HEIGHT) {
    const latitude = Math.min(row, north);

    for (let column = west; ; column += CELL_WIDTH) {
      const longitude = Math.min(column, east);
      cells.add(encodeGeohash(latitude, longitude));

      if (cells.size > MAX_LIVE_ALERT_CELLS) return null;
      if (longitude >= east) break;
    }

    if (latitude >= north) break;
  }

  return [...cells].sort();
}
