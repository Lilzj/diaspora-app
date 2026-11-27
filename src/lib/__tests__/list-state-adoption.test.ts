/**
 * Every list says loading, could-not-load and empty through ListState (FARCH-007, 27 Nov 2026).
 *
 * List screens drew these themselves, and about forty of them said "nothing
 * here" after a read that had failed, because the empty branch was the only
 * branch they had. ListState draws exactly one of the three, in that order.
 * These tests hold the tree to it: every virtualised list uses it, and a list
 * that can say it is empty can also say it could not be read. A file that is
 * different on purpose is named with the reason, and each list of exceptions
 * fails when an entry stops needing to be there.
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
const FILES = filesUnder(SRC)
  .filter((file) => file.endsWith('.tsx'))
  .map((file) => ({
    name: path.relative(SRC, file).split(path.sep).join('/'),
    text: withoutComments(fs.readFileSync(file, 'utf8')),
  }));
const named = (names: readonly string[]) => FILES.filter((file) => names.includes(file.name));

/** A virtualised list, or a shell told to draw one (FARCH-004). */
const VIRTUALISED = /<(?:FlatList|FlashList|SectionList|ScrollEndFlatList|ScrollEndFlashList)\b|\blist=\{\{/;
const USES_PRIMITIVE = /\b(?:ListState|ListEmpty)\b/;
const SHELL = /<(?:CommunityScreen|CreatorScreen|AnalyticsScreen)\b/;

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

/** A ListState that can say the list is empty, and cannot say it failed. */
const silentOnFailure = (tag: string) => /\bisEmpty\b/.test(tag) && !/\berror=/.test(tag);

it('reads the screens it holds to the rule', () => {
  // Canary: a walk that read nothing would pass everything below.
  expect(FILES.length).toBeGreaterThan(500);
  expect(FILES.filter((file) => VIRTUALISED.test(file.text)).length).toBeGreaterThanOrEqual(30);
  expect(FILES.filter((file) => USES_PRIMITIVE.test(file.text)).length).toBeGreaterThanOrEqual(100);
  // The tag reader, on the shapes it has to get past.
  expect(openingTags('<ListState a={() => b > c} d="e>f">', 'ListState')).toEqual([
    '<ListState a={() => b > c} d="e>f">',
  ]);
  // A FlatList prop is not the primitive.
  expect(USES_PRIMITIVE.test('ListEmptyComponent={<Text />}')).toBe(false);
});

describe('virtualised lists', () => {
  /** Lists of things the app already holds: nothing is read, so nothing can be loading or fail. */
  const NOTHING_TO_READ: Record<string, string> = {
    'app/(auth)/choose-country.tsx': 'a picker over the countries the app ships with',
    'app/(auth)/choose-language.tsx': 'a picker over the languages the app ships with',
    'app/(auth)/choose-origin.tsx': 'a picker over the countries the app ships with',
    'app/settings/location.tsx': 'a picker over the countries the app ships with',
    'app/settings/origin.tsx': 'a picker over the countries the app ships with',
    'app/verification/diaspora.tsx': 'its country picker, over the countries the app ships with',
    'app/gallery.tsx': 'the photographs it was opened with',
    'components/DatePickerInput.tsx': 'a picker’s days, months and years',
  };

  /** A list other files render: they decide its states. */
  const DEFINES_A_LIST: Record<string, string> = {
    'components/ScrollEndNavigationMenu.tsx': 'defines ScrollEndFlatList and ScrollEndFlashList',
    'components/layout/screen-list.tsx': 'the shells’ list: a screen passing `list` gives it the empty state, and the shell draws loading and the error',
    'components/maps/MapResultList.tsx': 'the map screens that render it pass its empty state and draw loading and the error',
  };

  /** States decided in order in one place, and drawn by the area's own panel, which says more than three things. */
  const ORDERED_BY_ITS_AREA: Record<string, string> = {
    'app/community/index.tsx': 'loading, offline, an error, empty and switched off, drawn by CommunityUnavailablePanel',
  };

  /** A composed screen whose list's states are drawn by its parts, each through ListState. */
  const DRAWN_BY_ITS_PARTS: Record<string, string> = {
    'app/(tabs)/discover.tsx': 'DiscoverResultsEmpty draws the locked card, the first read, and each tab’s own ListState',
  };

  const EXEMPT = { ...NOTHING_TO_READ, ...DEFINES_A_LIST, ...ORDERED_BY_ITS_AREA, ...DRAWN_BY_ITS_PARTS };

  it('say loading, could-not-load and empty through ListState', () => {
    const own = FILES.filter(
      (file) => VIRTUALISED.test(file.text) && !USES_PRIMITIVE.test(file.text) && !(file.name in EXEMPT)
    ).map((file) => file.name);

    expect(own).toEqual([]);
  });

  it('name only lists that still need the exception', () => {
    for (const file of named(Object.keys(EXEMPT))) {
      expect(VIRTUALISED.test(file.text)).toBe(true);
      expect(USES_PRIMITIVE.test(file.text)).toBe(false);
    }
    for (const file of named(Object.keys(DRAWN_BY_ITS_PARTS))) {
      // The parts draw the empty slot, and each tab's part says its states through the primitive.
      expect(file.text).toMatch(/ListEmptyComponent=\{<DiscoverResultsEmpty\b/);
      const parts = FILES.filter((part) => part.name.startsWith('components/screens/discover/') && /Results\.tsx$/.test(part.name));
      expect(parts.map((part) => part.name)).toEqual(
        expect.arrayContaining(['components/screens/discover/DiscoverResults.tsx', 'components/screens/discover/HousingResults.tsx'])
      );
      for (const part of parts.filter((p) => !/(DiscoverResults|UpdatesResults)\.tsx$/.test(p.name))) {
        expect([part.name, /<ListState\b/.test(part.text)]).toEqual([part.name, true]);
      }
    }
    for (const file of named(Object.keys(ORDERED_BY_ITS_AREA))) {
      // The panel draws the list's empty slot, whatever reason it is given.
      expect(file.text).toMatch(/ListEmptyComponent=\{[\s\S]{0,80}?<CommunityUnavailablePanel\b/);
    }
    expect(named(Object.keys(EXEMPT))).toHaveLength(Object.keys(EXEMPT).length);
  });
});

describe('a list that can say it is empty', () => {
  /** The screen returns its error for the whole screen before the list is drawn. */
  const WHOLE_SCREEN_ERROR: Record<string, string> = {
    'app/monetization/change-plan.tsx': 'without the plans there is nothing to move to',
    'app/monetization/index.tsx': 'nearly every section reads the same overview',
    'app/monetization/plans.tsx': 'the plans are the screen',
    'app/monetization/promotions/index.tsx': 'the tab counts come from the same read',
    'app/wallet/donate.tsx': 'the causes are the form',
  };

  /** The empty sits inside a card; a ListState around the card says loading and the error. */
  const NESTED: Record<string, string> = {
    'app/profile/residence.tsx': 'the move and add buttons stay below an empty country list',
  };

  /** Whether the screen's shell is told when the read fails: it then draws the error itself. */
  const shellWatchesError = (text: string) => SHELL.test(text) && /load=\{\{[\s\S]*?\berror:/.test(text);

  it('can also say the list could not be read', () => {
    const silent: string[] = [];
    for (const file of FILES) {
      if (file.name in WHOLE_SCREEN_ERROR || file.name in NESTED || shellWatchesError(file.text)) continue;
      for (const tag of openingTags(file.text, 'ListState')) {
        if (silentOnFailure(tag)) silent.push(`${file.name}: ${tag.replace(/\s+/g, ' ').slice(0, 80)}`);
      }
    }

    // Every one of these is a list that would say "nothing here" over a read that failed.
    expect(silent).toEqual([]);
  });

  it('names only screens that still need the exception', () => {
    for (const file of named(Object.keys(WHOLE_SCREEN_ERROR))) {
      expect(file.text).toMatch(/<FinancialErrorView\b/);
      expect(openingTags(file.text, 'ListState').some(silentOnFailure)).toBe(true);
    }
    for (const file of named(Object.keys(NESTED))) {
      const tags = openingTags(file.text, 'ListState');
      expect(tags.some(silentOnFailure)).toBe(true);
      expect(tags.some((tag) => /\berror=/.test(tag))).toBe(true);
    }
    expect(named(Object.keys(WHOLE_SCREEN_ERROR))).toHaveLength(Object.keys(WHOLE_SCREEN_ERROR).length);
    expect(named(Object.keys(NESTED))).toHaveLength(Object.keys(NESTED).length);
  });
});

describe('the area states', () => {
  /** Each area's empty state, drawn through the shared one: its words, the one look. */
  const AREA_EMPTIES: [file: string, component: string][] = [
    ['components/community/CommunityPrimitives.tsx', 'EmptyState'],
    ['components/creator-economy/CreatorPrimitives.tsx', 'CreatorEmptyState'],
    ['components/analytics/AnalyticsPrimitives.tsx', 'AnalyticsEmptyState'],
    ['components/monetization/MonetizationLayout.tsx', 'MonetizationEmpty'],
    ['components/conversation/ConversationEmptyState.tsx', 'ConversationEmptyState'],
  ];

  it.each(AREA_EMPTIES)('%s draws %s through ListEmpty', (file, component) => {
    const source = named([file])[0]?.text ?? '';
    const start = source.indexOf(`export function ${component}(`);
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf('\n}\n', start));
    expect(body).toMatch(/<ListEmpty\b/);
  });

  it.each([
    'components/community/CommunityScreen.tsx',
    'components/creator-economy/CreatorScreen.tsx',
    'components/analytics/AnalyticsScreen.tsx',
  ])('%s draws its loading through ListState', (file) => {
    expect(named([file])[0]?.text ?? '').toMatch(/<ListState\s+loading=\{isLoading\}/);
  });
});
