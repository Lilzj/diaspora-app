/**
 * A member's photo shows wherever their name does (UAT, 3 Nov 2026, item 21).
 * A member who added a profile photo still saw their initials on Home, on
 * Profile, beside their guides, posts and comments: the signed-in user was
 * mapped from `avatarStorageKey` (a media id, not an address), every `<Avatar>`
 * was handed a name and no picture, and the bylines drew initials by hand.
 */
declare const process: { cwd(): string };
const fs: {
  readFileSync(path: string, encoding: string): string;
  readdirSync(path: string, options: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
} = require('fs');
const path: { join(...parts: string[]): string; relative(from: string, to: string): string } = require('path');

const root = path.join(process.cwd(), 'src');

function code(relative: string): string {
  return fs
    .readFileSync(path.join(root, relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' || entry.name === 'mocks' ? [] : sources(full);
    return entry.name.endsWith('.tsx') ? [full] : [];
  });
}

describe('a member’s photo', () => {
  it('is read from the address /auth/me sends, not from the stored media id', () => {
    const store = code('store/auth.ts');
    expect(store).toMatch(/avatarUrl:\s*profile\.avatarUrl/);
    expect(code('types/auth.ts')).toMatch(/avatarUrl\?:\s*string \| null/);
  });

  it('is passed to every Avatar that draws a person', () => {
    const offenders = sources(root)
      .map((file) => ({ file: path.relative(root, file), text: code(path.relative(root, file)) }))
      .flatMap(({ file, text }) =>
        (text.match(/<Avatar\b[^>]*>/g) ?? [])
          .filter((tag) => !/\buri=/.test(tag))
          .map((tag) => `${file}: ${tag}`),
      );

    expect(offenders).toEqual([]);
  });

  it('shows beside a guide’s byline, a comment, and a contributor', () => {
    expect(code('app/guide/[id].tsx')).toMatch(/<Avatar[^>]*uri=\{[^}]*author\??\.avatarUrl/);
    expect(code('components/community-social/CommentThread.tsx')).toMatch(/<Avatar[^>]*uri=\{[^}]*avatarUrl/);
    expect(code('components/knowledge/ContributorHeader.tsx')).toMatch(/<Avatar[^>]*uri=\{[^}]*avatarUrl/);
    expect(code('components/knowledge/ContributorDirectory.tsx')).toMatch(/<Avatar[^>]*uri=\{[^}]*avatarUrl/);
  });
});
