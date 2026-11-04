/**
 * Saving a guide shows that it is saved, and saved things have one home
 * (UAT, 3 Nov 2026, item 19). Tapping "Save guide" showed an alert and left
 * the button as it was, because the button only ever sent `saved: true` and
 * read nothing back; and the member could not find what they had saved: one
 * `/saved` screen listed hand-written folders, a second one on the same route
 * read a field the server never sends, and Profile linked to neither.
 */
import { saveControlFor, viewerStateOf } from '@/lib/guide-viewer';
import { savedContentTypeOf } from '@/lib/bookmarks-api';

declare const process: { cwd(): string };
const fs: { readFileSync(path: string, encoding: string): string; existsSync(path: string): boolean } =
  require('fs');
const path: { join(...parts: string[]): string } = require('path');

const root = path.join(process.cwd(), 'src');

function code(relative: string): string {
  return fs
    .readFileSync(path.join(root, relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

describe('the guide’s save control', () => {
  it('reads the viewer’s state from the guide the server sent', () => {
    expect(viewerStateOf({ viewer: { isSaved: true, vote: 'Helpful' } })).toEqual({
      isSaved: true,
      vote: 'Helpful',
    });
    expect(viewerStateOf({ viewer: null })).toEqual({ isSaved: false, vote: null });
    expect(viewerStateOf(null)).toEqual({ isSaved: false, vote: null });
  });

  it('says Saved once saved, and a second tap removes it', () => {
    expect(saveControlFor({ isSaved: true, vote: null }, false)).toMatchObject({
      label: 'Saved',
      nextSaved: false,
    });
    expect(saveControlFor({ isSaved: false, vote: null }, false)).toMatchObject({
      label: 'Save guide',
      nextSaved: true,
    });
  });

  it('says what it is doing while the request runs', () => {
    expect(saveControlFor({ isSaved: false, vote: null }, true).label).toBe('Saving…');
    expect(saveControlFor({ isSaved: true, vote: null }, true).label).toBe('Removing…');
  });

  it('is what the guide screen draws, not a fixed label', () => {
    const reader = code('app/guide/[id].tsx');

    expect(reader).toContain('saveControlFor(');
    expect(reader).not.toMatch(/saved:\s*true/);
    expect(reader).not.toContain("'Save guide'");
    // The helpful vote is the server's too, not a flag that resets on unmount.
    expect(reader).not.toMatch(/useState\(false\);\s*\n\s*const handleHelpfulPress/);
  });
});

describe('saved things have one home', () => {
  it('has one /saved screen, with no hand-written folders', () => {
    expect(fs.existsSync(path.join(root, 'app/(tabs)/saved.tsx'))).toBe(false);

    const saved = code('app/saved/index.tsx');
    expect(saved).not.toContain('London Housing Search');
    expect(saved).not.toContain('Visa Documents');
    expect(saved).not.toContain('setCustomCollections');
  });

  it('lists saved guides from the guides the member saved with the button', () => {
    expect(code('app/saved/index.tsx')).toContain('useBookmarkedGuides');
    expect(code('app/saved/[category].tsx')).toContain('useBookmarkedGuides');
  });

  it('is linked from the Profile tab', () => {
    expect(code('app/(tabs)/profile.tsx')).toMatch(/['"]\/saved['"]/);
  });

  it('keeps a saved item’s type when the server sends it in lower case', () => {
    expect(savedContentTypeOf('job')).toBe('Job');
    expect(savedContentTypeOf('Housing')).toBe('Housing');
    expect(savedContentTypeOf('communityupdate')).toBe('CommunityUpdate');
    expect(savedContentTypeOf('something-new')).toBeNull();
  });
});
