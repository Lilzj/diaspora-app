/**
 * Town totals from the platform — 16 Sep 2026.
 *
 * FRONTEND-MAPS-GAP-002. The map used to count a page of pins; zoomed out, it
 * now asks `GET /location/map/clusters`. These hold the request it makes, what
 * it does with a cell, and that it asks only when the view is wide.
 */
import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import {
  fetchServerClusters,
  resourceTypesFor,
  toMapCluster,
  wantsServerClusters,
} from '../maps/server-clusters';

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
});

afterEach(() => {
  mock.restore();
});

const ROSE_HILL = {
  areaId: 'a-rose-hill',
  name: 'Rose Hill',
  slug: 'rose-hill',
  level: 'City',
  latitude: -20.2417,
  longitude: 57.4806,
  counts: { housing: 1, jobs: 1, marketplace: 3 },
  total: 5,
};

describe('asking for town totals', () => {
  it('asks at town level, with the viewport and the categories the platform counts', async () => {
    mock.onGet('/location/map/clusters').reply(200, {
      data: { clusters: [ROSE_HILL], level: 'City', resourceTypes: ['housing'], minimumCellCount: 1 },
    });

    const page = await fetchServerClusters(
      { north: -20.0, south: -20.5, east: 57.8, west: 57.3 },
      ['housing', 'jobs', 'marketplace']
    );

    expect(mock.history.get[0].params).toEqual({
      bounds: '-20.0000,-20.5000,57.8000,57.3000',
      level: 'City',
      resourceTypes: 'housing,jobs,marketplace',
    });
    expect(page.clusters).toHaveLength(1);
  });

  it('raises on a refusal, so the map keeps counting on the device instead of showing nothing', async () => {
    mock.onGet('/location/map/clusters').reply(403, {});

    await expect(
      fetchServerClusters({ north: 1, south: 0, east: 1, west: 0 }, ['housing'])
    ).rejects.toBeTruthy();
  });

  it('only asks for categories the platform counts', () => {
    expect(resourceTypesFor(['housing', 'job', 'alert', 'organization', 'provider'])).toEqual([
      'housing',
      'jobs',
      'providers',
    ]);
  });

  it('only asks when the view is wide', () => {
    expect(wantsServerClusters({ center: { latitude: 0, longitude: 0 }, latitudeDelta: 0.05, longitudeDelta: 0.05 })).toBe(false);
    expect(wantsServerClusters({ center: { latitude: 0, longitude: 0 }, latitudeDelta: 0.6, longitudeDelta: 0.6 })).toBe(true);
  });
});

describe('a town total on the map', () => {
  it('carries its count, what it is made of, and says so aloud', () => {
    const cluster = toMapCluster(ROSE_HILL)!;

    expect(cluster.count).toBe(5);
    expect(cluster.breakdown).toEqual({ housing: 1, job: 1, marketplace: 3 });
    expect(cluster.memberIds).toEqual([]);
    expect(cluster.accessibilityLabel).toContain('Rose Hill');
    expect(cluster.accessibilityLabel).toContain('3 items for sale');
    expect(cluster.bounds.north).toBeGreaterThan(ROSE_HILL.latitude);
    expect(cluster.bounds.south).toBeLessThan(ROSE_HILL.latitude);
  });

  it('draws nothing for a cell with nothing in it', () => {
    expect(toMapCluster({ ...ROSE_HILL, counts: {}, total: 0 })).toBeNull();
  });
});
