/**
 * The events screen filters what it says it filters (UAT, 3 Nov 2026, item 2).
 * It carried a banner, "Diaspora cannot filter events by Nearby · Distance
 * radius · Recommended · AI recommendations…". The route has taken a point and
 * a radius since 14 Oct, and since 4 Nov it keeps to the circle, sorts nearest
 * first and narrows to the member's communities, so the controls are back and
 * the banner and the AI line are gone.
 */
import { toEventBrowseQuery } from '@/lib/community-life-api';
import { eventDistanceLabel, nearbyPointOf } from '@/lib/events-nearby';

declare const process: { cwd(): string };
const fs: { readFileSync(path: string, encoding: string): string } = require('fs');
const path: { join(...parts: string[]): string } = require('path');

function code(relative: string): string {
  return fs
    .readFileSync(path.join(process.cwd(), 'src', relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

describe('the events query', () => {
  it('asks for events around a point, nearest first', () => {
    expect(
      toEventBrowseQuery({ latitude: -4.02, longitude: 39.71, radiusKm: 10, sortBy: 'nearest' }),
    ).toMatchObject({ latitude: -4.02, longitude: 39.71, radiusKm: 10, sort: 'Nearest' });
  });

  it('asks for events from the member’s communities', () => {
    expect(toEventBrowseQuery({ joinedCommunities: true })).toMatchObject({ joinedCommunities: true });
    expect(toEventBrowseQuery({})).not.toHaveProperty('joinedCommunities', true);
  });
});

describe('nearby', () => {
  it('measures from a real place, never a country’s middle', () => {
    expect(nearbyPointOf({ latitude: -4.02, longitude: 39.71, precision: 'device' })).toEqual({
      latitude: -4.02,
      longitude: 39.71,
    });
    expect(nearbyPointOf({ latitude: -4.02, longitude: 39.71, precision: 'area' })).not.toBeNull();
    expect(nearbyPointOf({ latitude: -1.3, longitude: 36.8, precision: 'country' })).toBeNull();
    expect(nearbyPointOf({ latitude: 0, longitude: 0 })).toBeNull();
  });

  it('says how far an event is', () => {
    expect(eventDistanceLabel(0.4)).toBe('400 m away');
    expect(eventDistanceLabel(2.06)).toBe('2.1 km away');
    expect(eventDistanceLabel(14)).toBe('14 km away');
    expect(eventDistanceLabel(undefined)).toBeNull();
  });
});

describe('the events screen', () => {
  const screen = code('app/community-life/events.tsx');

  it('no longer says it cannot filter, or offers AI', () => {
    expect(screen).not.toContain('Diaspora cannot filter events by');
    expect(screen).not.toContain('UNSUPPORTED_EVENT_BROWSE_FILTERS');
    expect(screen).not.toMatch(/\bAI\b/);
  });

  it('offers Nearby with a radius, Nearest, and events from my communities', () => {
    expect(screen).toContain("'nearby'");
    expect(screen).toContain("'communities'");
    expect(screen).toContain('joinedCommunities');
    expect(screen).toMatch(/radiusKm:\s*eventRadiusKm/);
    expect(screen).toContain("'nearest'");
    expect(screen).toContain('eventDistanceLabel(');
  });
});
