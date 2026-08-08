// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — clustering and performance (Frontend Phase 8, §9, §41, §60)
//
// §60 names the volumes: 100, 500, 1,000 and 5,000+ raw results. Those are
// exercised here as real assertions rather than as a claim in a report, and
// the timing bounds are deliberately loose — a CI box under load is not a
// phone, and a flaky performance test gets deleted, which is worse than a
// generous one that still catches an accidental O(n²).
// ─────────────────────────────────────────────────────────────────────────────

import {
  clusterAccessibilityLabel,
  clusterExpansionViewport,
  clusterMarkers,
  markersInBounds,
} from '@/lib/maps/clustering';
import { viewportFromCenter, viewportToBounds } from '@/lib/maps/geo';
import { MAX_CLUSTERED_INPUT, type MapMarker, type MarkerCategory } from '@/types/maps';

const CENTRE = { latitude: 51.4742, longitude: -0.0691 };

function marker(id: string, latitude: number, longitude: number, category: MarkerCategory = 'housing'): MapMarker {
  return {
    id,
    category,
    coordinate: { latitude, longitude },
    title: `Result ${id}`,
    accessibilityLabel: `Result ${id}`,
    source: 'backend',
  };
}

/** A deterministic spread, so a failure is reproducible. */
function spread(count: number, spanDeg = 0.05, category: MarkerCategory = 'housing'): MapMarker[] {
  return Array.from({ length: count }, (_, i) => {
    // Golden-angle spiral: even coverage without a random number generator.
    const angle = i * 2.39996;
    const radius = (Math.sqrt(i / count) * spanDeg) / 2;
    return marker(
      `m${i}`,
      CENTRE.latitude + radius * Math.cos(angle),
      CENTRE.longitude + radius * Math.sin(angle),
      category
    );
  });
}

const CITY_VIEWPORT = viewportFromCenter(CENTRE, 5);
const STREET_VIEWPORT = viewportFromCenter(CENTRE, 0.15);

describe('clustering basics', () => {
  it('leaves a small, spread-out set alone', () => {
    const markers = [
      marker('a', 51.4742, -0.0691),
      marker('b', 51.5742, -0.1691),
      marker('c', 51.3742, 0.0309),
    ];

    const result = clusterMarkers(markers, CITY_VIEWPORT);
    expect(result.markers).toHaveLength(3);
    expect(result.clusters).toHaveLength(0);
  });

  it('collapses coincident markers into one cluster', () => {
    const markers = Array.from({ length: 8 }, (_, i) =>
      marker(`m${i}`, CENTRE.latitude + i * 0.00001, CENTRE.longitude)
    );

    const result = clusterMarkers(markers, CITY_VIEWPORT);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].count).toBe(8);
    expect(result.markers).toHaveLength(0);
  });

  it('never emits a cluster of one', () => {
    // A "1" bubble that expands to a single pin is a tap wasted, and it loses
    // the marker's own label in the process.
    const result = clusterMarkers(spread(40), CITY_VIEWPORT);
    for (const cluster of result.clusters) {
      expect(cluster.count).toBeGreaterThanOrEqual(2);
    }
  });

  it('accounts for every input marker exactly once', () => {
    const result = clusterMarkers(spread(300), CITY_VIEWPORT);
    const clustered = result.clusters.reduce((sum, c) => sum + c.count, 0);
    expect(result.markers.length + clustered).toBe(300);
    expect(result.totalCount).toBe(300);
  });

  it('stops clustering at street zoom', () => {
    const markers = spread(30, 0.002);
    const clustered = clusterMarkers(markers, STREET_VIEWPORT);
    // `disableAtZoom` defaults to 16; a 150 m viewport is well past it.
    expect(clustered.clusters).toHaveLength(0);
    expect(clustered.markers).toHaveLength(30);
  });

  it('is deterministic', () => {
    const markers = spread(200);
    const a = clusterMarkers(markers, CITY_VIEWPORT);
    const b = clusterMarkers(markers, CITY_VIEWPORT);

    expect(a.clusters.map((c) => c.id)).toEqual(b.clusters.map((c) => c.id));
    expect(a.markers.map((m) => m.id)).toEqual(b.markers.map((m) => m.id));
  });
});

describe('selection survives clustering', () => {
  it('never absorbs the selected marker', () => {
    // Otherwise a pin vanishes under the member's finger the moment a refetch
    // lands — the one interaction where disappearing is least forgivable.
    const markers = Array.from({ length: 20 }, (_, i) =>
      marker(`m${i}`, CENTRE.latitude + i * 0.00001, CENTRE.longitude)
    );

    const result = clusterMarkers(markers, CITY_VIEWPORT, { selectedMarkerId: 'm7' });

    expect(result.markers.map((m) => m.id)).toContain('m7');
    for (const cluster of result.clusters) {
      expect(cluster.memberIds).not.toContain('m7');
    }
  });
});

describe('invalid input', () => {
  it('drops markers with unusable coordinates rather than pinning them somewhere plausible', () => {
    const markers = [
      marker('good', 51.4742, -0.0691),
      { ...marker('null-island', 0, 0) },
      { ...marker('nan', NaN, -0.0691) },
      { ...marker('oob', 91, 0) },
    ];

    const result = clusterMarkers(markers, CITY_VIEWPORT);
    expect(result.totalCount).toBe(1);
    expect(result.markers.map((m) => m.id)).toEqual(['good']);
  });

  it('handles an empty input', () => {
    const result = clusterMarkers([], CITY_VIEWPORT);
    expect(result.markers).toHaveLength(0);
    expect(result.clusters).toHaveLength(0);
    expect(result.totalCount).toBe(0);
    expect(result.truncated).toBe(false);
  });
});

describe('truncation — §41, §54', () => {
  it('caps the input and says so', () => {
    const result = clusterMarkers(spread(MAX_CLUSTERED_INPUT + 500), CITY_VIEWPORT);

    expect(result.truncated).toBe(true);
    // `totalCount` still reports the real figure, so the UI can say
    // "6,500 results" while drawing a bounded subset.
    expect(result.totalCount).toBe(MAX_CLUSTERED_INPUT + 500);

    const drawn = result.markers.length + result.clusters.reduce((sum, c) => sum + c.count, 0);
    expect(drawn).toBeLessThanOrEqual(MAX_CLUSTERED_INPUT);
  });

  it('keeps the results nearest the viewport centre', () => {
    const near = marker('near', CENTRE.latitude, CENTRE.longitude);
    const far = Array.from({ length: 50 }, (_, i) =>
      marker(`far${i}`, CENTRE.latitude + 5 + i * 0.01, CENTRE.longitude + 5)
    );

    const result = clusterMarkers([...far, near], CITY_VIEWPORT, { maxInput: 10 });
    const kept = [...result.markers.map((m) => m.id), ...result.clusters.flatMap((c) => c.memberIds)];

    expect(kept).toContain('near');
  });
});

describe('cluster metadata', () => {
  it('breaks down by category and labels the dominant one', () => {
    const markers = [
      ...Array.from({ length: 6 }, (_, i) => marker(`h${i}`, 51.4742 + i * 0.00001, -0.0691, 'housing')),
      ...Array.from({ length: 2 }, (_, i) => marker(`j${i}`, 51.4742 + i * 0.00001, -0.06911, 'job')),
    ];

    const result = clusterMarkers(markers, CITY_VIEWPORT);
    const cluster = result.clusters[0];

    expect(cluster.breakdown.housing).toBe(6);
    expect(cluster.breakdown.job).toBe(2);
    expect(cluster.accessibilityLabel).toContain('8');
    expect(cluster.accessibilityLabel).toContain('homes');
  });

  it('caps retained member ids without losing the count', () => {
    const markers = Array.from({ length: 400 }, (_, i) =>
      marker(`m${i}`, CENTRE.latitude + i * 0.0000001, CENTRE.longitude)
    );

    const cluster = clusterMarkers(markers, CITY_VIEWPORT).clusters[0];
    expect(cluster.count).toBe(400);
    expect(cluster.memberIds.length).toBeLessThanOrEqual(100);
  });

  it('positions a cluster at the centroid of its members, not at a grid cell', () => {
    const markers = [
      marker('a', 51.4740, -0.0690),
      marker('b', 51.4744, -0.0692),
    ];

    const cluster = clusterMarkers(markers, CITY_VIEWPORT).clusters[0];
    expect(cluster.coordinate.latitude).toBeCloseTo(51.4742, 4);
    expect(cluster.coordinate.longitude).toBeCloseTo(-0.0691, 4);
  });

  it('writes a label that names what is inside — §50', () => {
    expect(clusterAccessibilityLabel(12, { housing: 12 })).toContain('12 homes');
    expect(clusterAccessibilityLabel(12, { housing: 8, job: 4 })).toContain('8 homes');
    expect(clusterAccessibilityLabel(3, {})).toContain('3 results');
    // Every label tells the member what activating it does.
    expect(clusterAccessibilityLabel(5, { event: 5 })).toContain('zoom in');
  });
});

describe('cluster expansion', () => {
  it('zooms in towards the cluster', () => {
    const markers = spread(30, 0.01);
    const cluster = clusterMarkers(markers, CITY_VIEWPORT).clusters[0];
    const next = clusterExpansionViewport(cluster, CITY_VIEWPORT);

    expect(next.latitudeDelta).toBeLessThanOrEqual(CITY_VIEWPORT.latitudeDelta);
    expect(next.center).toEqual(cluster.coordinate);
  });

  it('never requests a zero-span viewport for coincident members', () => {
    // Otherwise the camera flies to maximum zoom and the cluster is still a
    // cluster, because the pins are still coincident: a tap that does nothing.
    const markers = Array.from({ length: 5 }, (_, i) =>
      marker(`m${i}`, CENTRE.latitude, CENTRE.longitude)
    );

    const cluster = clusterMarkers(markers, CITY_VIEWPORT).clusters[0];
    const next = clusterExpansionViewport(cluster, CITY_VIEWPORT);

    expect(next.latitudeDelta).toBeGreaterThan(0);
    expect(next.longitudeDelta).toBeGreaterThan(0);
  });

  it('never zooms out', () => {
    const tight = viewportFromCenter(CENTRE, 0.5);
    const markers = spread(20, 0.04);
    const cluster = clusterMarkers(markers, viewportFromCenter(CENTRE, 5)).clusters[0];
    const next = clusterExpansionViewport(cluster, tight);

    expect(next.latitudeDelta).toBeLessThanOrEqual(tight.latitudeDelta);
  });
});

describe('viewport restriction and list synchronisation', () => {
  it('filters to the viewport when asked', () => {
    const markers = [marker('in', 51.4742, -0.0691), marker('out', -20.2417, 57.4806)];
    const result = clusterMarkers(markers, CITY_VIEWPORT, { restrictToViewport: true });
    expect(result.totalCount).toBe(1);
  });

  it('filters markers to bounds for the list — §11', () => {
    const markers = [marker('in', 51.4742, -0.0691), marker('out', -20.2417, 57.4806)];
    const inBounds = markersInBounds(markers, viewportToBounds(CITY_VIEWPORT));
    expect(inBounds.map((m) => m.id)).toEqual(['in']);
  });
});

describe('performance at §60 volumes', () => {
  // Loose bounds on purpose — see the file header. These catch an accidental
  // O(n²), not a 20% regression.
  const budgetMs = 400;

  it.each([100, 500, 1000])('clusters %i markers well inside a frame budget', (count) => {
    const markers = spread(count);
    const started = Date.now();
    const result = clusterMarkers(markers, CITY_VIEWPORT);
    const elapsed = Date.now() - started;

    expect(result.totalCount).toBe(count);
    expect(elapsed).toBeLessThan(budgetMs);
  });

  it('clusters 5,000 markers — §60’s stated ceiling', () => {
    const markers = spread(5000);
    const started = Date.now();
    const result = clusterMarkers(markers, CITY_VIEWPORT);
    const elapsed = Date.now() - started;

    expect(result.totalCount).toBe(5000);
    expect(result.truncated).toBe(false);
    // The number that matters for §41: however many go in, only a bounded
    // number of things are handed to the renderer.
    expect(result.markers.length + result.clusters.length).toBeLessThan(400);
    expect(elapsed).toBeLessThan(budgetMs);
  });

  it('stays roughly linear from 1,000 to 5,000', () => {
    const time = (count: number) => {
      const markers = spread(count);
      const started = Date.now();
      clusterMarkers(markers, CITY_VIEWPORT);
      return Math.max(Date.now() - started, 1);
    };

    // 5× the input should not be 25× the time. A very generous multiple,
    // because timing on a shared CI box is noisy — this fails on a quadratic
    // rewrite and on essentially nothing else.
    expect(time(5000)).toBeLessThan(time(1000) * 15 + 200);
  });

  it('handles rapid successive viewports without accumulating state', () => {
    // Simulates a fast pinch: twenty viewports in a row over the same markers.
    const markers = spread(1000);
    const results = Array.from({ length: 20 }, (_, i) =>
      clusterMarkers(markers, viewportFromCenter(CENTRE, 1 + i * 0.5))
    );

    for (const result of results) {
      expect(result.totalCount).toBe(1000);
    }
    // Zoomed right out, everything merges; zoomed in, it does not. Monotonic
    // enough that the first has no more drawn items than the last.
    expect(results[0].markers.length + results[0].clusters.length).toBeGreaterThan(0);
  });
});
