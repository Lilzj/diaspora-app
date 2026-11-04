/**
 * A route the server sends opens a screen the app has (UAT, 3 Nov 2026).
 * "Publish something", the verification checklist and a challenge sent members
 * to `/knowledge/create`, which the app does not have; a lesson's "Report
 * something" and an events challenge pointed at two more. The server now sends
 * the app's routes, but rows it stored before keep the old ones, so every place
 * that follows a served route rewrites them first.
 */
import { appRouteFor } from '@/lib/server-route';

declare const process: { cwd(): string };
const fs: { readFileSync(path: string, encoding: string): string } = require('fs');
const path: { join(...parts: string[]): string } = require('path');

/** The raw source: these files carry JSX comments a naive comment-stripper eats code with. */
function code(relative: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'src', relative), 'utf8');
}

describe('appRouteFor', () => {
  it('rewrites the routes the server once sent and the app never had', () => {
    expect(appRouteFor('/knowledge/create')).toBe('/guide/create');
    expect(appRouteFor('/community-life/events/create')).toBe('/community-life/event/create');
    expect(appRouteFor('/community/report')).toBe('/safety/trading');
  });

  it('leaves every other route alone', () => {
    expect(appRouteFor('/creator/verification')).toBe('/creator/verification');
    expect(appRouteFor('/creator/grants/abc')).toBe('/creator/grants/abc');
  });
});

describe('every place that follows a served route', () => {
  it.each([
    'app/creator/index.tsx',
    'app/creator/verification.tsx',
    'app/creator/signup-bonus.tsx',
    'app/creator/grants/[id].tsx',
    'app/creator/challenges/[id].tsx',
    'app/creator/academy/lesson/[id].tsx',
  ])('%s rewrites it first', (file) => {
    const source = code(file);
    expect(source).toContain('appRouteFor(');
    expect(source).not.toMatch(/router\.push\((requirement|recommendation)\.actionRoute as never\)/);
    expect(source).not.toMatch(/onAction=\{\(route\) => router\.push\(route as never\)\}/);
  });
});
