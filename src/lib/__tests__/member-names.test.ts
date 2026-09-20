/**
 * A member's name is never their identifier — 20 Sep 2026.
 *
 * The organisation roll and the volunteer applicant list both rendered
 * `wire.userId` as the person's name. A GUID appeared in the member list, in
 * accessibility labels, and in the alert an administrator reads before
 * declining somebody: *"Decline 3f2a…?"*. The comment above it argued the
 * platform sent no name and inventing one would be worse, which was true and
 * was not the only alternative: there is a sanctioned batch source,
 * `IMemberProfileService`, and the community members route already used it.
 *
 * The backend now resolves a page of names in one call and sends `displayName`,
 * null when it cannot say. These tests pin both halves: what the client does
 * with an answer, and the guard that fails if anybody wires a name back to an
 * id field.
 */
import { UNNAMED_MEMBER, nameOrNeutral } from '../community-programme-api';

// `require`, as the other source-reading guards in this folder do: the tsconfig
// declares only the jest types, so a node import does not typecheck here.
const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
const path = require('path') as { join(...segments: string[]): string };

const SOURCE = path.join(process.cwd(), 'src', 'lib', 'community-programme-api.ts');

describe('the name a member is shown by', () => {
  it('uses the name the platform resolved', () => {
    expect(nameOrNeutral('Joshua Gbogodor')).toBe('Joshua Gbogodor');
  });

  /**
   * Null is a real answer: the platform saying it cannot tell us who this is.
   * The honest rendering is a label that does not pretend to be a name.
   */
  it('falls back to a neutral label when the platform cannot say', () => {
    expect(nameOrNeutral(null)).toBe(UNNAMED_MEMBER);
    expect(nameOrNeutral(undefined)).toBe(UNNAMED_MEMBER);
  });

  /**
   * A name of spaces is the same absence as no name, and would render as an
   * empty row that looks like a rendering bug rather than a missing name.
   */
  it('treats a blank name as no name', () => {
    expect(nameOrNeutral('   ')).toBe(UNNAMED_MEMBER);
  });

  it('never answers with something that looks like an identifier', () => {
    const guid = '3f2ab1c4-55d6-4e7f-8a90-1b2c3d4e5f60';

    // The fallback is the only thing a caller gets when there is no name, and it
    // is not the argument it was handed.
    expect(nameOrNeutral(null)).not.toContain('-');
    expect(nameOrNeutral(guid)).toBe(guid); // a real name is passed through untouched
  });
});

describe('the guard', () => {
  /**
   * **The defect this file exists for.** `displayName: wire.userId` shipped
   * twice in this module and read as a deliberate decision both times, because
   * a comment above each one explained why no name was available. A reviewer
   * agreeing with the comment agrees with the bug.
   */
  it('no display name is assigned from an id field', () => {
    const source = fs.readFileSync(SOURCE, 'utf8');

    const offenders = source
      .split('\n')
      .map((line: string, index: number) => ({ line: line.trim(), number: index + 1 }))
      // Prose may discuss the defect; only an assignment can be one.
      .filter(({ line }) => !line.startsWith('//') && !line.startsWith('*'))
      .filter(({ line }) => /displayName\s*:\s*[\w.]*\w*[Ii]d\b/.test(line));

    expect(offenders).toEqual([]);
  });

  /**
   * The mappers must read the field the platform actually sends. A mapper that
   * reads nothing is how the id got there in the first place.
   */
  it('both member mappers read displayName from the wire', () => {
    const source = fs.readFileSync(SOURCE, 'utf8');

    const resolved = source.match(/displayName:\s*nameOrNeutral\(wire\.displayName\)/g) ?? [];

    expect(resolved).toHaveLength(2);
  });
});
