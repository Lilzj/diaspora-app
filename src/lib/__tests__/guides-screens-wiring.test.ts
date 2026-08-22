// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the guide screens are wired, and stay wired
// (Remediation Wave D-3 / D-5)
//
// These are source-level assertions, and that is deliberate. The defect this
// wave removed was **not** a wrong request — it was the absence of one. A screen
// that renders a spinner, validates its inputs and shows a confirmation looks
// entirely healthy from the outside, and a rendering test would have passed
// against the old `guide/create.tsx` exactly as it passes against the new one.
//
// So the assertions are about what the file *does*: which client it imports,
// where the success message sits relative to the mutation, and which fixture
// modules it no longer reads. The same technique `community-directory-boundary`
// uses, for the same reason.
//
// The second half of the file is a regression guard. `guide/[id].tsx` was wired
// to Community's comment thread and report sheet in Wave D-2b; D-3 rewrote the
// screen around it, and these cases exist so a future edit cannot quietly take
// the discussion back to local state.
// ─────────────────────────────────────────────────────────────────────────────

// Node's globals are declared locally rather than by adding `"node"` to the
// project's `types` — that change is global and would surface pre-existing
// errors in other suites. `community-directory-boundary.test.ts` takes the same
// approach for the same reason.
declare const __dirname: string;

const readFileSync: (path: string, encoding: string) => string = require('fs').readFileSync;
const join: (...parts: string[]) => string = require('path').join;

function source(relative: string): string {
  return readFileSync(join(__dirname, '..', '..', relative), 'utf8');
}

/**
 * The file with its comments removed.
 *
 * Every screen in this wave carries a header explaining what it used to do, and
 * those explanations name the very fixtures and controls the assertions below
 * check are gone — `mockGuides`, `mockComments`, "Confirm Details", the audio
 * player. Asserting against the raw text would therefore fail on the
 * documentation, and the obvious "fix" would be to delete the paragraph that
 * says why the code changed. So the comments come out first, and the assertions
 * are about executable code only.
 */
function code(relative: string): string {
  return source(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

const CREATE = code('app/guide/create.tsx');
const READER = code('app/guide/[id].tsx');
const VERSIONS = code('app/guide/[id]/versions.tsx');
const LIST = code('app/(tabs)/knowledge/guides.tsx');
const COUNTRY = code('app/country/[code].tsx');

// ═════════════════════════════════════════════════════════════════════════════
// The one that mattered most
// ═════════════════════════════════════════════════════════════════════════════

describe('guide/create.tsx publishes to the server', () => {
  it('imports the publish mutation and calls it', () => {
    expect(CREATE).toContain("from '@/hooks/guides'");
    expect(CREATE).toContain('usePublishNewGuide');
    expect(CREATE).toContain('publish.mutate(');
  });

  it('reads no fixture module at all', () => {
    // It used to read `mockAuthors['user-123']` for the country picker and
    // `mockCategories` — the *marketplace* taxonomy — for the category chips.
    expect(CREATE).not.toContain("from '@/mocks/community-data'");
    expect(CREATE).not.toContain("from '@/mocks/data'");
  });

  it('takes its categories from the guide catalogue and sends the key', () => {
    expect(CREATE).toContain('useGuideCategories');
    expect(CREATE).toContain('setSelectedCategory(category.key)');
    expect(CREATE).toContain('categoryKey: selectedCategory');
  });

  it('takes its countries from Trust and sends the ISO code', () => {
    expect(CREATE).toContain('profile?.countryReputations');
    expect(CREATE).toContain('setSelectedCountry(c.countryCode)');
    expect(CREATE).toContain('countryCode: selectedCountry');
  });

  it('announces success only inside the mutation’s onSuccess', () => {
    const successIndex = CREATE.indexOf("title: 'Guide Published'");
    const onSuccessIndex = CREATE.indexOf('onSuccess: ({ guide, warnings })');
    const onErrorIndex = CREATE.indexOf('onError: (error)');

    expect(onSuccessIndex).toBeGreaterThan(-1);
    expect(successIndex).toBeGreaterThan(onSuccessIndex);
    // And before the error handler, i.e. still inside the success callback.
    expect(successIndex).toBeLessThan(onErrorIndex);
  });

  it('never claims the guide is live from the error path', () => {
    const errorBlock = CREATE.slice(CREATE.indexOf('onError: (error)'));

    expect(errorBlock).not.toContain("type: 'success'");
    // The two honest sentences, one per failure mode.
    expect(errorBlock).toContain('Guide not created');
    expect(errorBlock).toContain('saved as a draft');
  });

  it('clears the local draft only after the server confirmed', () => {
    // It used to be cleared *before* anything was attempted, so a member whose
    // publish failed lost the text as well as the guide. There is exactly one
    // clearing assignment inside `handlePublish`, and it is inside `onSuccess`.
    const publishBlock = CREATE.slice(CREATE.indexOf('const handlePublish'));
    const clearIndex = publishBlock.indexOf('globalGuideDraft = null;');
    const onSuccessIndex = publishBlock.indexOf('onSuccess: ({ guide, warnings })');

    expect(onSuccessIndex).toBeGreaterThan(-1);
    expect(clearIndex).toBeGreaterThan(onSuccessIndex);
  });

  it('writes to the trust store from the server’s response, not from form state', () => {
    expect(CREATE).toContain('`Published guide "${guide.title}"');
    expect(CREATE).toContain('eventId: `je-firstguide-${guide.guideId}`');
  });

  it('no longer prints an unconditional AI quality verdict', () => {
    // Two rows printed "PASSED" and "EXCELLENT" over an empty guide as readily
    // as a finished one. Nothing computed them and no server field backed them.
    expect(CREATE).not.toContain('AI Grammar Review');
    expect(CREATE).not.toContain('Guide Quality Level');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// The reader
// ═════════════════════════════════════════════════════════════════════════════

describe('guide/[id].tsx renders the server’s guide', () => {
  it('reads no fixture module', () => {
    expect(READER).not.toContain("from '@/mocks/community-data'");
  });

  it('takes the document, the versions and the counters from the module', () => {
    expect(READER).toContain('useGuide(');
    expect(READER).toContain('useGuideVersions(');
    expect(READER).toContain('useCastGuideVote');
    expect(READER).toContain('useRecordGuideView');
    expect(READER).toContain('<GuideBody');
  });

  it('carries no in-file version fixture', () => {
    // Four hard-coded entries naming two fixture authors and describing edits to
    // a guide about Brixton market used to be declared in this file and rendered
    // under every guide on the platform.
    expect(READER).not.toContain('const mockVersions');
    expect(READER).not.toContain('Emmanuel Owusu');
  });

  it('resolves the hero through Media rather than from a URL field', () => {
    expect(READER).toContain('useMediaAsset(');
    expect(READER).not.toContain('guide.coverImageUrl');
  });

  it('no longer offers an audio player that plays nothing', () => {
    expect(READER).not.toContain('Listen to Audio Guide');
    expect(READER).not.toContain('audioPlaying');
  });

  it('no longer offers a "Confirm Details" button with no route behind it', () => {
    expect(READER).not.toContain('Confirm Details');
    expect(READER).toContain('useSetGuideBookmark');
  });

  // ── The D-2b regression guard ──────────────────────────────────────────────

  it('still reads its discussion from Community’s content thread', () => {
    expect(READER).toContain("useContentComments('guide'");
    expect(READER).toContain('<CommentThread');
  });

  it('still reports through Community’s report sheet', () => {
    expect(READER).toContain('<ReportContentSheet');
    expect(READER).toContain("contentType: 'guide'");
    expect(READER).toContain("contentType: 'comment'");
  });

  it('does not reimplement comments locally', () => {
    expect(READER).not.toContain('mockComments');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// The rest of the wave's screens
// ═════════════════════════════════════════════════════════════════════════════

describe('the remaining guide screens', () => {
  it('the version history is the server’s', () => {
    expect(VERSIONS).not.toContain('mockGuideVersions');
    expect(VERSIONS).toContain('useGuideVersions(');
    expect(VERSIONS).toContain('useGuideVersionDiff(');
  });

  it('the Knowledge Hub list searches the server and does not sort on the device', () => {
    expect(LIST).not.toContain("from '@/mocks/community-data'");
    expect(LIST).toContain('useGuideSearch(');
    // Re-sorting accumulated cursor pages makes rows jump as you scroll.
    expect(LIST).not.toContain('.sort(');
  });

  it('the Hub sends the wire sort keys rather than its own chip labels', () => {
    expect(LIST).toContain("helpful: 'most-helpful'");
    expect(LIST).toContain("updated: 'recently-updated'");
  });

  it('the country page takes trending guides from the server', () => {
    expect(COUNTRY).toContain('useTrendingGuides(');
    expect(COUNTRY).not.toContain('trendingGuideIds');
  });

  it('the country page reaches the Country Intelligence Platform', () => {
    expect(COUNTRY).toContain('useCountryIntelligence(');
    expect(COUNTRY).toContain('/intelligence/embassies?country=');
    expect(COUNTRY).toContain('/intelligence/visas?country=');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D-5 — screens that did not exist before this wave
// ═════════════════════════════════════════════════════════════════════════════

describe('the country intelligence screens', () => {
  const EMBASSIES = code('app/intelligence/embassies.tsx');
  const VISAS = code('app/intelligence/visas.tsx');

  it('the embassy directory asks which of the two questions the member means', () => {
    // `locatedIn` and `serving` are different questions and neither defaults to
    // the other, so the lens is a visible control rather than an assumption.
    expect(EMBASSIES).toContain("lens === 'locatedIn' ? (country ?? undefined) : undefined");
    expect(EMBASSIES).toContain("lens === 'serving' ? (country ?? undefined) : undefined");
  });

  it('the visa screen never hides the universal rules', () => {
    expect(VISAS).toContain('results.universal');
    expect(VISAS).toContain('Rules that apply to everybody');
    // A post-filter on the member's own nationality is exactly what must not
    // happen — it discards the rules that apply to everybody.
    expect(VISAS).not.toContain('appliesToCountryCode ===');
  });

  it('the visa screen states that this platform does not process applications', () => {
    expect(VISAS).toContain('does not process applications');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// The handler that answered a route the backend does not have
// ═════════════════════════════════════════════════════════════════════════════

describe('mocks/handlers/discovery.ts', () => {
  const DISCOVERY = code('mocks/handlers/discovery.ts');

  it('no longer answers GET /discovery/search', () => {
    // There is no `/api/v1/discovery` prefix on the platform. A route that
    // answers in development and 404s in production is how a screen gets built
    // on it in the first place.
    expect(DISCOVERY).not.toContain('/discovery\\/search');
    expect(DISCOVERY).not.toContain('onGet(/\\/discovery');
  });

  it('serves no guide fixtures', () => {
    expect(DISCOVERY).not.toContain('mockGuides');
  });
});
