// ─────────────────────────────────────────────────────────────────────────────
// Where a hook module's source is (FSOLID-003)
//
// The ten largest hook modules are directories: `src/hooks/<name>/` holds a
// barrel `index.ts`, one file per subject and, where more than one of those
// needs it, an internal `shared.ts`. No import path changed, because
// `@/hooks/<name>` resolves to the directory's `index.ts`. A test that reads
// source by path is not an import, though, and it has to know where to look.
//
// Three kinds of check read hook source, and each needs a different read:
//
//   - **A check about one hook** reads the file that hook lives in, by path.
//   - **A check about a whole module** ("nothing in the analytics hooks reads
//     the gap client") reads every file of the module, through
//     `hookModuleSource`. Reading one file there would pass while checking a
//     fraction of the module.
//   - **A check about the whole layer** walks it with `hookFiles`. A scan of
//     `src/hooks` that lists one directory level sees none of the split
//     modules, and still passes.
// ─────────────────────────────────────────────────────────────────────────────

interface DirectoryEntry {
  name: string;
  isDirectory(): boolean;
}

const fs = require('fs') as {
  readFileSync(path: string, encoding: string): string;
  readdirSync(path: string, options: { withFileTypes: true }): DirectoryEntry[];
  existsSync(path: string): boolean;
};
const path = require('path') as { join(...segments: string[]): string };

export const HOOKS_ROOT = path.join(process.cwd(), 'src', 'hooks');

const isSource = (name: string): boolean => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name);
const byName = (a: DirectoryEntry, b: DirectoryEntry): number =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

/** Every production source file under `dir` (all of `src/hooks` by default), at any depth, in name order. */
export function hookFiles(dir: string = HOOKS_ROOT): string[] {
  const found: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort(byName)) {
    if (entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...hookFiles(full));
    else if (isSource(entry.name)) found.push(full);
  }

  return found;
}

/** The files of one hook module: `src/hooks/<name>.ts`, or every file under `src/hooks/<name>/`. */
export function hookModuleFiles(name: string): string[] {
  const single = path.join(HOOKS_ROOT, `${name}.ts`);
  if (fs.existsSync(single)) return [single];

  const directory = path.join(HOOKS_ROOT, name);
  if (!fs.existsSync(directory)) throw new Error(`There is no hook module called ${name}.`);
  return hookFiles(directory);
}

/** The source of one hook module: every file of it, joined in name order. */
export function hookModuleSource(name: string): string {
  return hookModuleFiles(name)
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
}
