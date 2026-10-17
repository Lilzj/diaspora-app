import { SEE_ALL_BY_KEY, seeAllDestination } from '../see-all-routes';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs') as { existsSync(path: string): boolean };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path') as { join(...segments: string[]): string };

/** The screen file expo-router would render for a pathname, if there is one. */
function screenExists(pathname: string): boolean {
  const app = path.join(process.cwd(), 'src', 'app');
  const relative = pathname.replace(/^\//, '');
  return [`${relative}.tsx`, path.join(relative, 'index.tsx')].some((candidate) =>
    fs.existsSync(path.join(app, candidate))
  );
}

describe('Home rail "See all"', () => {
  // The defect (17 Oct 2026): six server routes named folders that hold only
  // `[id].tsx`, and the router showed "Unmatched Route".
  it.each(Object.entries(SEE_ALL_BY_KEY))('sends %s to a screen this app has', (_key, destination) => {
    expect(screenExists(destination.pathname)).toBe(true);
  });

  it('opens Discover on the rail’s own tab for the four kinds Discover lists', () => {
    expect(seeAllDestination({ key: 'trusted-providers', seeAllRoute: '/provider' })).toEqual({
      pathname: '/(tabs)/discover',
      params: { tab: 'Providers' },
    });
    expect(seeAllDestination({ key: 'marketplace-near-you', seeAllRoute: '/marketplace' })?.params).toEqual({
      tab: 'Marketplace',
    });
  });

  it('offers no "See all" for an unknown section whose route the app lacks', () => {
    expect(seeAllDestination({ key: 'something-new', seeAllRoute: '/nowhere' })).toBeNull();
  });
});
