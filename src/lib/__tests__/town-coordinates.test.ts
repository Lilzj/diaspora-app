// ─────────────────────────────────────────────────────────────────────────────
// Filing by coordinates (14 Oct 2026)
//
// The place catalogue is retired: listings are filed by coordinates + the
// member's country + the typed town. Every form that picks a town in
// <TownPicker> sends that town's latitude/longitude (from Google place details)
// when it has them. These pin the shared rules (both or neither, in range,
// never required, a member's own pin beats a town centre) and the forms that
// apply them.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import { createEventSeries } from '../community-programme-api';
import { coordinatesOf, ownPinOrTown } from '../place-coordinates';

const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
const path = require('path') as { join(...segments: string[]): string };

function source(...segments: string[]): string {
  return fs
    .readFileSync(path.join(process.cwd(), 'src', ...segments), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
}

describe('coordinatesOf', () => {
  it('passes a whole, in-range pair through', () => {
    expect(coordinatesOf({ latitude: -20.16, longitude: 57.5 })).toEqual({ latitude: -20.16, longitude: 57.5 });
    expect(coordinatesOf({ latitude: 90, longitude: -180 })).toEqual({ latitude: 90, longitude: -180 });
  });

  it('sends neither for half a pair, an out-of-range value, or nothing', () => {
    const none = { latitude: null, longitude: null };
    expect(coordinatesOf({ latitude: 10, longitude: null })).toEqual(none);
    expect(coordinatesOf({ latitude: 91, longitude: 0 })).toEqual(none);
    expect(coordinatesOf({ latitude: 0, longitude: 181 })).toEqual(none);
    expect(coordinatesOf({ latitude: Number.NaN, longitude: 0 })).toEqual(none);
    expect(coordinatesOf(null)).toEqual(none);
    expect(coordinatesOf(undefined)).toEqual(none);
  });
});

describe('ownPinOrTown', () => {
  const town = { latitude: -20.2397, longitude: 57.4683 };
  const own = { latitude: -20.24, longitude: 57.49 };

  it('keeps the member’s own pin over the town centre', () => {
    expect(ownPinOrTown(own, 'Rose Hill', town)).toEqual(own);
  });

  it('uses the town’s coordinates when there is no pin of their own', () => {
    expect(ownPinOrTown(null, 'Rose Hill', town)).toEqual(town);
  });

  it('is nothing without a town or with a typed one', () => {
    expect(ownPinOrTown(null, '  ', town)).toBeUndefined();
    expect(ownPinOrTown(null, 'Rose Hill', { latitude: null, longitude: null })).toBeUndefined();
  });
});

describe('the forms that send a town’s coordinates', () => {
  it('organisation create sends latitude/longitude from the town choice, never an area id', () => {
    const org = source('app', 'community-life', 'org', 'create.tsx');
    expect(org).toContain('cityName: town.cityName, ...coordinatesOf(town)');
    expect(org).toContain('...townCoordinatesOf(formData)');
    expect(org).not.toMatch(/neighborhoodAreaId|areaId:/);
  });

  it('job create keeps the town’s coordinates with its name, and sends no area id', () => {
    const job = source('app', 'job', 'create.tsx');
    expect(job).toContain('...coordinatesOf(town)');
    expect(job).not.toMatch(/areaId/);
  });

  it('the business wizard and edit prefer the member’s own pin to the town', () => {
    const wizard = source('app', '(tabs)', 'post.tsx');
    expect(wizard).toContain('ownPinOrTown(pin, cityName, townPin)?.latitude');
    expect(wizard).toContain('setTownPin(coordinatesOf(town))');
    const edit = source('app', 'provider', 'edit', '[id].tsx');
    expect(edit).toMatch(/ownPinOrTown\(pin, /);
    expect(edit).toContain('setTownPin(coordinatesOf(town))');
  });

  it('event create sends the town’s coordinates as the venue’s', () => {
    const event = source('app', 'community-life', 'event', 'create.tsx');
    expect(event).toContain('cityName: town.cityName, ...coordinatesOf(town)');
    // Both the single event and the repeating one.
    expect(event.match(/\.\.\.venueCoordinates\(\)/g)).toHaveLength(2);
  });

  it('the guide wizard asks no town, so it sends no coordinates and no area id', () => {
    const guide = source('app', 'guide', 'create.tsx');
    expect(guide).not.toMatch(/latitude|longitude|areaId/);
  });
});

describe('createEventSeries', () => {
  let api: MockAdapter;
  beforeEach(() => {
    api = new MockAdapter(apiClient);
  });
  afterEach(() => api.restore());

  const request = {
    title: 'Sunday football',
    description: 'Every Sunday at the park.',
    category: 'sports',
    startDate: '2026-11-01',
    time: '10:00',
    endTime: '12:00',
    timezone: 'Indian/Mauritius',
    recurrence: { frequency: 'Weekly', interval: 1, byWeekday: [0], endKind: 'Never' },
    countryCode: 'MU',
    cityName: 'Rose Hill',
    areaName: '',
    addressLine: 'Royal Road',
    publish: false,
  } as unknown as Parameters<typeof createEventSeries>[0];

  function reply() {
    api.onPost(/\/events\/series$/).reply(201, { data: { seriesId: 's1' } });
  }

  it('files the venue at the picked town', async () => {
    reply();
    await createEventSeries({ ...request, latitude: -20.2397, longitude: 57.4683 }).catch(() => undefined);
    const body = JSON.parse(api.history.post[0].data);
    expect(body.venue).toMatchObject({ addressLine1: 'Royal Road', latitude: -20.2397, longitude: 57.4683 });
  });

  it('sends no venue coordinates for a typed town', async () => {
    reply();
    await createEventSeries(request).catch(() => undefined);
    const body = JSON.parse(api.history.post[0].data);
    expect(body.venue).not.toHaveProperty('latitude');
    expect(body.venue).not.toHaveProperty('longitude');
  });
});
