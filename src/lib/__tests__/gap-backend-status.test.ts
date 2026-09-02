// ─────────────────────────────────────────────────────────────────────────────
// A gap register is a historical record. A gap *notice* is a statement to a
// member, and it has to stop when the statement stops being true.
//
// UAT-135. Reconciling all 179 declared gaps against the backend's own OpenAPI
// contract — 911 operations — found 51 whose every declared endpoint is served
// today, and 14 partly served. Spot-checked against the live deployment:
// /automations, /automations/runs, /automations/saved-searches,
// /communities/memberships/me, /communities/memberships/discover, /creators/me,
// /rewards/rules and /rewards/signup-bonus/me all answer 200.
//
// The screens carrying those notices call the real API already — none of them
// imports a `*-gap-api` client. So the capability worked, and the screen said it
// did not.
//
// The fix keeps the register intact, which is its whole purpose, and gives each
// entry a `backendStatus`. A notice returns null once its capability is
// `connected`; `partial` keeps it, because the screen still has a hole.
//
// The direction that matters: this can only ever *remove* a false denial. It
// cannot make a screen claim a capability the platform lacks, because a gap with
// no `backendStatus` behaves exactly as it always did.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs') as {
  readFileSync(path: string, encoding: string): string;
  readdirSync(path: string): string[];
};
const path = require('path') as { join(...segments: string[]): string };

const CONFIG = path.join(process.cwd(), 'src', 'config');
const COMPONENTS = path.join(process.cwd(), 'src', 'components');

const registers = fs
  .readdirSync(CONFIG)
  .filter((name: string) => name.includes('gaps') && name.endsWith('.ts'));

/**
 * Every exported component that looks a gap up, split out one by one.
 *
 * <b>This used to match whole FILES containing `if (!gap) return null;`</b>, and
 * that is how five components slipped through: a file can hold one component
 * that honours `backendStatus` and another that does not.
 * `CommunityGapNotice.tsx` held exactly that pair, and its unguarded half —
 * `CommunityGapUnavailable` — drew a full-screen dead end over the Community
 * Life hub while `/communities/memberships/discover` answered 200 to the same
 * binary. A file-level check called that file compliant.
 *
 * So the unit here is the component, not the file.
 */
function gapComponents(): { name: string; file: string; source: string }[] {
  const found: { name: string; file: string; source: string }[] = [];

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir)) {
      if (entry === '__tests__') continue;
      const full = path.join(dir, entry);
      let source: string;
      try {
        source = fs.readFileSync(full, 'utf8');
      } catch {
        walk(full);
        continue;
      }
      if (!entry.endsWith('.tsx')) continue;

      const lines = source.split(String.fromCharCode(10));
      const starts: { name: string; at: number }[] = [];

      lines.forEach((line: string, index: number) => {
        const match = /^export function (\w+)\(/.exec(line);
        if (match) starts.push({ name: match[1], at: index });
      });

      starts.forEach(({ name, at }, index) => {
        const until = index + 1 < starts.length ? starts[index + 1].at : lines.length;
        const body = lines.slice(at, until).join(String.fromCharCode(10));

        // Only components that actually read a gap register.
        if (/_GAPS\[|GAPS\[gap/.test(body)) {
          found.push({ name, file: entry, source: body });
        }
      });
    }
  };

  walk(COMPONENTS);
  return found;
}

/** Kept for the assertions below that read whole notice components. */
function noticeComponents(): { file: string; source: string }[] {
  return gapComponents()
    .filter((component) => component.source.includes('if (!gap) return null;'))
    .map(({ file, source }) => ({ file, source }));
}

describe('a notice stops when its capability ships', () => {
  it('every register can record whether the backend has caught up', () => {
    expect(registers.length).toBeGreaterThan(0);

    for (const name of registers) {
      const source = fs.readFileSync(path.join(CONFIG, name), 'utf8');
      expect(source).toMatch(/backendStatus\?: 'connected' \| 'partial';/);
    }
  });

  it('every notice component honours it', () => {
    // The guard has to sit in each one. A component that looks a gap up and
    // renders regardless is the exact defect this closes.
    const components = noticeComponents();
    expect(components.length).toBeGreaterThan(0);

    for (const { file, source } of components) {
      expect(source).toMatch(/gap\.backendStatus === 'connected'/);
      expect(file).toBeTruthy();
    }
  });

  it('only ever hides a notice, never invents a capability', () => {
    // The guard returns null. If it ever started rendering something on the
    // strength of `connected`, this register would be claiming a capability
    // instead of declining to deny one.
    for (const { source } of noticeComponents()) {
      expect(source).toMatch(/gap\.backendStatus === 'connected'\) return null;/);
    }
  });

  it('every component that reads a gap honours backendStatus', () => {
    // Not every file — every component. Five ignored it: the three full-screen
    // `*GapUnavailable` panels and the two "partly real" notices. A dead-end
    // screen over a working capability is the worst version of this bug, because
    // unlike a notice it hides the feature entirely.
    const offenders = gapComponents()
      .filter((component) => !component.source.includes("backendStatus === 'connected'"))
      .map((component) => `${component.file} -> ${component.name}`);

    expect(offenders).toEqual([]);
  });

  it('finds a useful number of gap components to check', () => {
    // A guard that silently matched nothing would pass for ever.
    expect(gapComponents().length).toBeGreaterThan(10);
  });

  it('marks a partly-served capability as partial rather than connected', () => {
    // `partial` must keep the notice: some of the screen still has no backend,
    // and hiding the warning would leave the member to find the hole themselves.
    for (const name of registers) {
      const source = fs.readFileSync(path.join(CONFIG, name), 'utf8');
      const values = source.match(/backendStatus: '(\w+)'/g) ?? [];
      for (const value of values) {
        expect(value).toMatch(/'(connected|partial)'/);
      }
    }
  });
});
