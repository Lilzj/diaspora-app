/**
 * Every list that pages is a FlashList (FARCH-004, 27 Nov 2026).
 *
 * The audit counted FlatList in 36 files and FlashList in 4, although FlashList
 * was a declared dependency. Worse than the FlatLists were the lists drawn with
 * `.map()` inside a ScrollView: Discover's six tabs, most of Community Life,
 * the profile and comment lists. Nothing there was virtualised, so every page a
 * member asked for stayed mounted with its photographs.
 *
 * A list pages when its rows grow as the member asks for more. Such a list is
 * long by construction, so it is a FlashList, which draws what is near the
 * screen and recycles the rows that scroll away. A list read in one go stays a
 * FlatList, the right tool for a short list (the audit's own advice).
 *
 * These tests hold the tree to that, and to the two things recycling needs:
 * a renderer that does not change on every render (FlashList redraws a row
 * only when its item or its renderer changes), and photographs keyed to the
 * row they belong to.
 */
import { filesUnder } from './support/screen-files';
import { withoutComments } from './support/source-text';

const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
const path = require('path') as {
  join(...parts: string[]): string;
  relative(from: string, to: string): string;
  sep: string;
};

const SRC = path.join(process.cwd(), 'src');
const FILES = [...filesUnder(path.join(SRC, 'app')), ...filesUnder(path.join(SRC, 'components'))]
  .filter((file) => file.endsWith('.tsx'))
  .map((file) => ({
    name: path.relative(SRC, file).split(path.sep).join('/'),
    text: withoutComments(fs.readFileSync(file, 'utf8')),
  }));
const named = (name: string) => FILES.find((file) => file.name === name);

/** Asks for the next page of a list. Not `loadMoreFailed`, which says how the last ask went. */
const PAGES = /\b(?:fetchNextPage|loadMore\w*|onEndReached)\b(?<!Failed)|<ShowMoreButton\b/;

/** Each `<Tag …>` opening tag, read past `=>` and `>` inside braces and strings. */
function openingTags(text: string, tag: string): string[] {
  const found: string[] = [];
  const start = new RegExp('<' + tag + '(?=[\\s/>])', 'g');
  for (let match = start.exec(text); match; match = start.exec(text)) {
    let depth = 0;
    let quote: string | null = null;
    for (let i = match.index + match[0].length; i < text.length; i++) {
      const ch = text[i];
      if (quote) {
        if (ch === '\\') i++;
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
      else if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) {
        found.push(text.slice(match.index, i + 1));
        break;
      }
    }
  }
  return found;
}

/**
 * Each list in a file that recycles its rows: a FlashList, its scroll-end form,
 * or an area shell handed `list` (however it is written: some screens hand it
 * one only when the member may see the list).
 */
function recyclingLists(text: string): string[] {
  return [
    ...openingTags(text, 'FlashList'),
    ...openingTags(text, 'ScrollEndFlashList'),
    ...['CommunityScreen', 'CreatorScreen']
      .flatMap((shell) => openingTags(text, shell))
      .filter((tag) => /\blist=\{/.test(tag)),
  ];
}

const recycles = (text: string) => recyclingLists(text).length > 0;

/**
 * A part that asks for the next page of a list other files draw: each host
 * named here holds the FlashList and draws the part's rows.
 */
const PARTS: Record<string, string[]> = {
  'components/screens/discover/ProviderResults.tsx': ['app/(tabs)/discover.tsx'],
  'components/screens/discover/JobResults.tsx': ['app/(tabs)/discover.tsx'],
  'components/screens/discover/GuideResults.tsx': ['app/(tabs)/discover.tsx'],
  'components/screens/discover/HousingResults.tsx': ['app/(tabs)/discover.tsx'],
  'components/screens/discover/MarketplaceResults.tsx': ['app/(tabs)/discover.tsx'],
  'components/knowledge/ContributorDirectory.tsx': ['app/(tabs)/knowledge/contributors.tsx', 'app/country/[code].tsx'],
  'components/community-social/CommentThread.tsx': [
    'app/guide/[id].tsx',
    'app/intelligence/notice/[id].tsx',
    'app/update/[id].tsx',
  ],
  'components/creator/sections/WorkspaceSection.tsx': ['app/creator/index.tsx'],
  'components/creator/organization/EventsTab.tsx': ['components/creator/organization/OrganizationManagementSheet.tsx'],
  'components/creator/organization/MembersTab.tsx': ['components/creator/organization/OrganizationManagementSheet.tsx'],
  'components/creator/organization/PostsTab.tsx': ['components/creator/organization/OrganizationManagementSheet.tsx'],
};

/** Asks for pages, and draws no list that grows: each says what it reads them for. */
const PAGES_WITHOUT_A_LIST: Record<string, string> = {
  'app/wallet/transactions/[id].tsx':
    'walks up to four statement pages to find one transaction’s own entries; the member never asks for more',
};

it('reads the files it holds to the rule', () => {
  // Canary: a walk that read nothing, or matched nothing, would pass everything below.
  expect(FILES.length).toBeGreaterThan(500);
  expect(FILES.filter((file) => PAGES.test(file.text)).length).toBeGreaterThanOrEqual(40);
  expect(FILES.filter((file) => recycles(file.text)).length).toBeGreaterThanOrEqual(30);
  // The readers, on the shapes they have to get past.
  expect(openingTags('<FlashList renderItem={({ item }) => <Row a={item} />} data={x}>', 'FlashList')).toEqual([
    '<FlashList renderItem={({ item }) => <Row a={item} />} data={x}>',
  ]);
  expect(recyclingLists('<CommunityScreen title="x" list={open ? undefined : { data: rows, renderItem: renderRow }}>x</CommunityScreen>')).toEqual([
    '<CommunityScreen title="x" list={open ? undefined : { data: rows, renderItem: renderRow }}>',
  ]);
  expect(recyclingLists('<CommunityScreen title="x">x</CommunityScreen>')).toEqual([]);
  expect(PAGES.test('const { loadMoreHousing } = listings;')).toBe(true);
  expect(PAGES.test('loadingMore')).toBe(false);
  expect(PAGES.test('list: { isFetchingMore: boolean; loadMoreFailed: boolean }')).toBe(false);
});

describe('a list that pages', () => {
  it('is drawn by a FlashList', () => {
    const unrecycled = FILES.filter(
      (file) =>
        PAGES.test(file.text) &&
        !recycles(file.text) &&
        !(file.name in PARTS) &&
        !(file.name in PAGES_WITHOUT_A_LIST)
    ).map((file) => file.name);

    // Each is a list whose every page stays mounted once the member has asked for it.
    expect(unrecycled).toEqual([]);
  });

  it('is never a FlatList, which is for a list read in one go', () => {
    const paged = FILES.flatMap((file) =>
      ['FlatList', 'ScrollEndFlatList', 'SectionList']
        .flatMap((tag) => openingTags(file.text, tag))
        .filter((tag) => /\bonEndReached=/.test(tag))
        .map(() => file.name)
    );

    expect(paged).toEqual([]);
  });

  it('names only parts that still ask for a page their hosts draw', () => {
    for (const [part, hosts] of Object.entries(PARTS)) {
      const partFile = named(part);
      expect([part, Boolean(partFile)]).toEqual([part, true]);
      expect([part, PAGES.test(partFile?.text ?? ''), recycles(partFile?.text ?? '')]).toEqual([part, true, false]);
      expect(hosts.length).toBeGreaterThan(0);
      for (const host of hosts) {
        const hostFile = named(host);
        expect([host, Boolean(hostFile), recycles(hostFile?.text ?? '')]).toEqual([host, true, true]);
      }
    }
  });

  it('names only files that still ask for pages and still draw no list', () => {
    for (const name of Object.keys(PAGES_WITHOUT_A_LIST)) {
      const file = named(name);
      expect([name, Boolean(file), PAGES.test(file?.text ?? ''), recycles(file?.text ?? '')]).toEqual([
        name,
        true,
        true,
        false,
      ]);
    }
  });
});

describe('a FlashList', () => {
  /** A renderer written in place: a new function on every render, so every visible row redraws. */
  const inline = /renderItem[=:]\s*\{?\s*(?:\(|async\b|function\b|[A-Za-z_$][\w$]*\s*=>)/;

  it('is handed a renderer that keeps its identity between renders', () => {
    expect(inline.test('renderItem={({ item }) => <Row />}')).toBe(true);
    expect(inline.test('renderItem: (info) => <Row />')).toBe(true);
    expect(inline.test('renderItem={item => <Row />}')).toBe(true);
    expect(inline.test('renderItem={renderRow}')).toBe(false);
    expect(inline.test('renderItem: renderSeries,')).toBe(false);

    const unstable = FILES.flatMap((file) =>
      recyclingLists(file.text)
        .filter((tag) => inline.test(tag))
        .map(() => file.name)
    );

    expect(unstable).toEqual([]);
  });

  /** Rows another file's FlashList draws, which show a photograph. */
  const ROWS_WITH_PHOTOGRAPHS = [
    'components/Avatar.tsx',
    'components/ListingPhoto.tsx',
    'components/community/CommunityCards.tsx',
    'components/community/CommunityPrimitives.tsx',
    'components/conversation/ConversationCard.tsx',
    'components/conversation/MessageBubble.tsx',
    'components/screens/discover/ProviderResults.tsx',
  ];

  /** The names a file gives expo-image's `Image`. */
  const expoImageNames = (text: string): string[] => {
    const imports = text.match(/import\s*\{([^}]*)\}\s*from\s*'expo-image'/);
    if (!imports) return [];
    return imports[1]
      .split(',')
      .map((part) => part.trim())
      .filter((part) => /^Image\b/.test(part))
      .map((part) => (part.match(/^Image\s+as\s+(\w+)$/)?.[1] ?? 'Image'));
  };

  it('shows a recycled row’s photograph only once it is that row’s', () => {
    const files = FILES.filter((file) => recycles(file.text) || ROWS_WITH_PHOTOGRAPHS.includes(file.name));
    const unkeyed = files.flatMap((file) =>
      expoImageNames(file.text)
        .flatMap((name) => openingTags(file.text, name))
        .filter((tag) => !/\brecyclingKey=/.test(tag))
        .map(() => file.name)
    );

    // Each would show the last item's photograph while the next one's loads.
    expect(unkeyed).toEqual([]);
  });

  it('names only rows that still show a photograph', () => {
    for (const name of ROWS_WITH_PHOTOGRAPHS) {
      expect([name, expoImageNames(named(name)?.text ?? '').length > 0]).toEqual([name, true]);
    }
  });
});
