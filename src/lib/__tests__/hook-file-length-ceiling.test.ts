/**
 * No hook file grows past the longest there is (FSOLID-003).
 *
 * The audit found eight hook modules over 1,000 lines, and ten were by the time
 * the finding was fixed: `hooks/community-life.ts` the longest at 3,189 lines
 * (3,235 when the audit counted). Each held a whole domain, every query and
 * mutation for its events, organisations, memberships, donations and hub in one
 * file. They are directories now, a file per subject behind an `index.ts` that
 * re-exports the module, so no import path changed. The longest of the new
 * files is 562 lines.
 *
 * A split with no ceiling grows back. This holds every production file under
 * `src/hooks`, at any depth, to the length of the longest file there today,
 * which is `maps.ts`: it was never over the line. The ceiling is a length a file
 * may not grow past, not a target, and it only comes down. A file that has to
 * grow beyond it is split by subject, the way the ten were.
 */
import { HOOKS_ROOT, hookFiles } from './support/hook-modules';

const fs = require('fs') as { readFileSync(path: string, encoding: string): string };

/** The longest file under `src/hooks` once FSOLID-003 landed: `maps.ts`. Lower it as files shrink. */
const CEILING = 995;

/** Lines as an editor numbers them: a final newline does not start another line. */
function lineCount(file: string): number {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n').length;
  return text.endsWith('\n') ? lines - 1 : lines;
}

const FOUND = hookFiles().map((file) => ({
  file: file.slice(HOOKS_ROOT.length + 1).split(/[\\/]/).join('/'),
  lines: lineCount(file),
}));

it('finds the hook files it holds to the ceiling', () => {
  // Canary: a walk that found nothing, or stopped at the top level, would hold nothing.
  expect(FOUND.length).toBeGreaterThanOrEqual(100);
  expect(FOUND.map((entry) => entry.file)).toEqual(
    expect.arrayContaining(['maps.ts', 'community-life/index.ts', 'community-life/hub.ts', 'trust/profile.ts'])
  );
});

it(`holds every hook file to ${CEILING} lines`, () => {
  const longer = FOUND.filter((entry) => entry.lines > CEILING).map(
    (entry) => `${entry.file} has ${entry.lines} lines`
  );

  // Every offender at once, not the first: a list is what the fix needs.
  expect(longer).toEqual([]);
});

it('keeps the ceiling at the longest file, so it cannot drift up unnoticed', () => {
  // A ceiling above every file would admit growth to it without failing. When
  // the longest file shrinks, lower CEILING with it.
  expect(Math.max(...FOUND.map((entry) => entry.lines))).toBe(CEILING);
});
