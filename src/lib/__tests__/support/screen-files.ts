/**
 * The files a screen is made of (FSOLID-001).
 *
 * A route under `src/app` used to be its whole screen. Composed screens split it:
 * the route calls one hook per concern and renders one section per part of the
 * page, and those live in `src/components/screens/<screen>/`. A check about what
 * screens do has to read both, or it stops seeing whatever moved out of the route.
 */
const fs = require('fs') as {
  readdirSync(path: string, options: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
  readFileSync(path: string, encoding: string): string;
};
const path = require('path') as { join(...parts: string[]): string };

export const APP_ROOT = path.join(process.cwd(), 'src', 'app');
export const SCREEN_PARTS_ROOT = path.join(process.cwd(), 'src', 'components', 'screens');

/** Every production `.ts` and `.tsx` file under a directory, at any depth, in name order. */
export function filesUnder(root: string): string[] {
  const found: string[] = [];
  const walk = (directory: string) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(full);
        continue;
      }
      if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) found.push(full);
    }
  };
  walk(root);
  return found;
}

/** Every file a screen is made of: the routes, and the parts of the composed screens. */
export function screenFiles(): string[] {
  return [...filesUnder(APP_ROOT), ...filesUnder(SCREEN_PARTS_ROOT)];
}

/** The parts directories a route composes from: each `@/components/screens/<name>/` it imports. */
export function partsOf(route: string): string[] {
  const source = fs.readFileSync(route, 'utf8');
  const names = new Set<string>();
  for (const match of source.matchAll(/from '@\/components\/screens\/([\w-]+)\//g)) names.add(match[1]);
  return [...names].sort().map((name) => path.join(SCREEN_PARTS_ROOT, name));
}

/**
 * A route's source followed by the source of every part it composes from: the
 * whole screen, for a check that asks what a screen does rather than what one
 * file says. A route that composes nothing is returned alone.
 */
export function screenSource(route: string): string {
  const parts = partsOf(route).flatMap((directory) => filesUnder(directory));
  return [route, ...parts].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
}
