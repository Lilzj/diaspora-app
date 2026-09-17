/**
 * The live alert map's cell grid — 16 Sep 2026.
 *
 * The server announces on these cells and the phone listens on the cells it
 * computes here. Both sides are pinned to the same published geohash vectors
 * (`GeoCellsTests` on the server), so a disagreement about where a cell is
 * fails a test instead of producing a map that silently never hears anything.
 */
import {
  ALERT_CHANNEL_PREFIX,
  MAX_LIVE_ALERT_CELLS,
  alertCellsForBounds,
  alertChannel,
  encodeGeohash,
} from '../maps/alert-cells';

describe('encodeGeohash', () => {
  it.each([
    [57.64911, 10.40744, 11, 'u4pruydqqvj'],
    [42.605, -5.603, 5, 'ezs42'],
    [51.5074, -0.1278, 4, 'gcpv'],
  ])('matches the published geohash for %p, %p', (latitude, longitude, precision, expected) => {
    expect(encodeGeohash(latitude, longitude, precision)).toBe(expected);
  });

  it('defaults to the four characters the server announces on', () => {
    expect(encodeGeohash(51.4742, -0.0691)).toHaveLength(4);
  });
});

describe('alertCellsForBounds', () => {
  it('covers a city viewport with a handful of cells, sorted so panning is stable', () => {
    const cells = alertCellsForBounds({ north: 51.55, south: 51.4, east: 0.1, west: -0.25 });

    expect(cells).not.toBeNull();
    expect(cells!.length).toBeGreaterThan(0);
    expect(cells!.length).toBeLessThanOrEqual(MAX_LIVE_ALERT_CELLS);
    expect(cells).toEqual([...cells!].sort());
    expect(cells).toContain(encodeGeohash(51.4742, -0.0691));
    expect(cells).toContain(encodeGeohash(51.4742, 0.08));
  });

  it('refuses a viewport too wide to watch, rather than joining hundreds of channels', () => {
    expect(alertCellsForBounds({ north: 58.6, south: 49.9, east: 1.8, west: -8.2 })).toBeNull();
  });

  it('refuses bounds that are not numbers, instead of looping for ever', () => {
    // A cold start into the alerts map built its first viewport before the
    // location store loaded; this loop never ended and the screen stayed blank.
    expect(alertCellsForBounds({ north: NaN, south: NaN, east: NaN, west: NaN })).toBeNull();
    expect(alertCellsForBounds({ north: 51.5, south: 51.4, east: Infinity, west: -0.2 })).toBeNull();
  });

  it('names channels the way the server does', () => {
    expect(alertChannel('gcpv')).toBe('geo:alerts:gcpv');
    expect(ALERT_CHANNEL_PREFIX).toBe('geo:alerts:');
  });
});
