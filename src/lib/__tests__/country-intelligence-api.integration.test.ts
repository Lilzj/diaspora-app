// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Country Intelligence against the real contract
// (Remediation Wave D-5)
//
// Runs the real `lib/country-intelligence-api.ts` against the real
// `mocks/handlers/country-intelligence.ts`, which was written from
// `Diaspora.Modules.Guides`'s intelligence endpoints rather than from what this
// client expects.
//
// **The headline case is the third describe.** `GET /intelligence/search`
// returns `OfficialNoticeSearchResponse`, whose rows are named **`results`**.
// `readPage` keys on `items`, so it returns an empty page for it — silently, with
// no error. That is the same failure mode that made every comment thread in this
// application render "no comments yet", and it is pinned here in both
// directions: that `readPage` really does lose the rows, and that the explicit
// adapter really does not.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '@/lib/apiClient';
import { readPage, resetBespokeEnvelopeWarnings } from '@/lib/platform-envelope';
import {
  DEV_INTELLIGENCE_IDS,
  setupCountryIntelligenceMocks,
} from '@/mocks/handlers/country-intelligence';
import {
  HOLIDAY_HORIZON_DAYS,
  INTELLIGENCE_DEFAULT_PAGE_SIZE,
  INTELLIGENCE_MAX_PAGE_SIZE,
  SEVERITY_ORDER,
  clampIntelligenceLimit,
  fetchCountryIntelligence,
  fetchEmbassies,
  fetchEmbassy,
  fetchEmergencyContacts,
  fetchIntelligenceCapabilities,
  fetchIssuingAuthorities,
  fetchNoticeCategories,
  fetchOfficialNotices,
  fetchPublicHolidays,
  fetchVisaAdvisories,
  fetchVisaAdvisory,
  intelligenceErrorMessage,
  isEmergencyDirectoryMissing,
  isUrgentSeverity,
  searchOfficialNotices,
  searchOfficialNoticesRaw,
  toNoticeSearchPage,
} from '@/lib/country-intelligence-api';
import type { OfficialNoticeCardResponse } from '@/types/country-intelligence';

let mock: MockAdapter;

beforeAll(() => {
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
  setupCountryIntelligenceMocks(mock);
  mock.onAny().reply(404);
});

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  mock.resetHistory();
});

// ── Trap 1: two country codes, two questions ─────────────────────────────────

describe('locatedIn and serving are different questions', () => {
  it('neither defaults to the other, and the two answers barely overlap', async () => {
    const inGb = await fetchEmbassies({ locatedIn: 'GB' });
    const servingGb = await fetchEmbassies({ serving: 'GB' });

    expect(inGb.items.map((row) => row.embassyId)).toEqual([
      DEV_INTELLIGENCE_IDS.embassyInGbServingMu,
    ]);
    expect(servingGb.items.map((row) => row.embassyId)).toEqual([
      DEV_INTELLIGENCE_IDS.embassyInMuServingGb,
    ]);

    // A single `country` parameter would have answered whichever the last caller
    // had in mind. These two lists share nothing.
    expect(inGb.items[0].embassyId).not.toBe(servingGb.items[0].embassyId);
  });

  it('sends only the parameter it was asked for', async () => {
    await fetchEmbassies({ serving: 'GB' });
    const call = mock.history.get[mock.history.get.length - 1];

    expect(call.params).toMatchObject({ serving: 'GB' });
    expect(call.params).not.toHaveProperty('locatedIn');
    expect(call.params).not.toHaveProperty('country');
  });

  it('carries both codes on every row, because neither is derivable', async () => {
    const embassy = await fetchEmbassy(DEV_INTELLIGENCE_IDS.embassyInGbServingMu);
    expect(embassy.countryCode).toBe('GB');
    expect(embassy.servesCountryCode).toBe('MU');
  });
});

// ── Trap 2: appliesTo widens rather than narrows ─────────────────────────────

describe('a visa advisory naming nobody applies to everybody', () => {
  it('filtering by nationality returns the universal rules as well', async () => {
    const forMauritians = await fetchVisaAdvisories('GB', { appliesTo: 'MU' });
    const ids = forMauritians.items.map((row) => row.visaAdvisoryId);

    expect(ids).toContain(DEV_INTELLIGENCE_IDS.targetedVisa);
    // **The row a post-filtering client would have discarded.** Dropping it
    // tells most members that no rules exist for them, which is both wrong and
    // the most dangerous kind of wrong this surface can be.
    expect(ids).toContain(DEV_INTELLIGENCE_IDS.universalVisa);
  });

  it('a nationality with no named rules still sees the universal ones', async () => {
    const forGhanaians = await fetchVisaAdvisories('GB', { appliesTo: 'GH' });
    const ids = forGhanaians.items.map((row) => row.visaAdvisoryId);

    expect(ids).toContain(DEV_INTELLIGENCE_IDS.universalVisa);
    expect(ids).not.toContain(DEV_INTELLIGENCE_IDS.targetedVisa);
  });

  it('null appliesToCountryCode is the wire signal, and it is preserved', async () => {
    const advisory = await fetchVisaAdvisory(DEV_INTELLIGENCE_IDS.universalVisa);
    expect(advisory.appliesToCountryCode).toBeNull();
  });

  it('activeOnly defaults to true on the server, so a lapsed rule is absent', async () => {
    const active = await fetchVisaAdvisories('GB');
    expect(active.items.map((row) => row.visaAdvisoryId)).not.toContain(
      DEV_INTELLIGENCE_IDS.expiredVisa
    );

    const all = await fetchVisaAdvisories('GB', { activeOnly: false });
    expect(all.items.map((row) => row.visaAdvisoryId)).toContain(
      DEV_INTELLIGENCE_IDS.expiredVisa
    );
  });
});

// ── Trap 3: the page shape readPage cannot see ───────────────────────────────

describe('notice search names its rows `results`, and readPage cannot find them', () => {
  it('the envelope really carries `results` and no `items`', async () => {
    const response = await apiClient.get('/intelligence/search');
    const body = response.data as { data: Record<string, unknown> };

    expect(Array.isArray(body.data.results)).toBe(true);
    expect((body.data.results as unknown[]).length).toBeGreaterThan(0);
    expect(body.data).not.toHaveProperty('items');
  });

  it('readPage still returns an EMPTY page for it, but no longer silently', async () => {
    // **This title used to end "— no error, no warning", and that is no longer
    // true.** Wave N added a development warning to `toPage` for exactly this
    // signature: an object with no `items` and precisely one array-valued
    // property. The rows are still lost — deliberately, because the fix is the
    // named adapter below and not a wider normaliser — but the loss now
    // announces itself, and `wrong.shape` says `unrecognised` rather than
    // presenting as a page that happens to be empty.
    const original = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(String(args[0]));
    };

    try {
      const response = await apiClient.get('/intelligence/search');

      // The defect, reproduced. A screen built on `readPage` here renders "no
      // official notices" over a full result set, which is indistinguishable
      // from a country that genuinely has none.
      const wrong = readPage<OfficialNoticeCardResponse>(response.data);
      expect(wrong.items).toEqual([]);
      expect(wrong.hasMore).toBe(false);
      expect(wrong.totalCount).toBeNull();

      // The part that is new, and the part that would have caught this in a
      // day rather than in two waves.
      expect(wrong.shape).toBe('unrecognised');
      expect(warnings.some((line) => line.includes('"results"'))).toBe(true);
    } finally {
      console.warn = original;
      resetBespokeEnvelopeWarnings();
    }
  });

  it('toNoticeSearchPage does not lose them', async () => {
    const raw = await searchOfficialNoticesRaw({});
    const page = toNoticeSearchPage(raw);

    expect(page.items.length).toBe(raw.results.length);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.totalCount).toBe(raw.totalCount);
  });

  it('and the exported search helper goes through the adapter', async () => {
    const page = await searchOfficialNotices({ q: 'fees' });
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items[0].title).toContain('fees');
  });

  it('carries the engine name, which Page has nowhere to put', async () => {
    const raw = await searchOfficialNoticesRaw({});
    // Diagnostic, and the reason `searchOfficialNoticesRaw` is exported at all:
    // "why did search behave differently in production" is almost always "a
    // different engine is registered there".
    expect(raw.engine).toBe('EfOfficialNoticeSearchEngine');
  });

  it('a null response degrades to an empty page rather than throwing', () => {
    expect(toNoticeSearchPage(null).items).toEqual([]);
    expect(toNoticeSearchPage(undefined).totalCount).toBeNull();
  });
});

// ── Trap 4: every other list, through readPage ───────────────────────────────

describe('readPage absorbs the rest of this surface correctly', () => {
  it('embassies and visas are CursorPagedResult', async () => {
    for (const page of [await fetchEmbassies({}), await fetchVisaAdvisories('GB')]) {
      expect(Array.isArray(page.items)).toBe(true);
      expect(page.totalCount).not.toBeNull();
    }
  });

  it('holidays, categories and authorities are bare arrays with no cursor', async () => {
    const holidays = await fetchPublicHolidays('GB');
    const categories = await fetchNoticeCategories();
    const authorities = await fetchIssuingAuthorities('GB');

    for (const page of [holidays, categories, authorities]) {
      expect(page.items.length).toBeGreaterThan(0);
      expect(page.nextCursor).toBeNull();
      expect(page.hasMore).toBe(false);
      // A bare array declares no total; its length is what came back.
      expect(page.totalCount).toBeNull();
    }
  });

  it('the notice list really is `items`', async () => {
    const response = await apiClient.get('/intelligence/notices');
    const body = response.data as { data: Record<string, unknown> };

    // The list and the search are two different shapes on one surface, which is
    // exactly why each is asserted rather than assumed from the other.
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data).not.toHaveProperty('results');
    expect(readPage(response.data).items.length).toBeGreaterThan(0);
  });
});

// ── Trap 5: enum spellings ───────────────────────────────────────────────────

describe('the wire spellings', () => {
  it('severity is `Informational`, not `Info`', async () => {
    const capabilities = await fetchIntelligenceCapabilities();

    expect(capabilities.severities).toEqual([
      'Informational',
      'Low',
      'Medium',
      'High',
      'Critical',
    ]);
    expect(capabilities.severities).not.toContain('Info');
    // The order is load-bearing on the server, so the client's copy must match.
    expect(capabilities.severities).toEqual([...SEVERITY_ORDER]);
  });

  it('there is no Expired status — expiry is a computed boolean', async () => {
    const notices = await fetchOfficialNotices({});
    const statuses = new Set(notices.items.map((row) => row.status));

    expect(statuses).not.toContain('Expired');
    expect(notices.items.every((row) => typeof row.isExpired === 'boolean')).toBe(true);
  });

  it('a superseded notice is still readable and points at its replacement', async () => {
    const notices = await fetchOfficialNotices({});
    const superseded = notices.items.find((row) => row.status === 'Superseded');

    expect(superseded).toBeDefined();
    expect(superseded?.supersededById).not.toBeNull();
  });

  it('emergency contact kinds are the one lower-case vocabulary here', async () => {
    const emergency = await fetchEmergencyContacts('GB');

    expect(emergency.contacts.map((row) => row.kind)).toEqual(['police', 'ambulance', 'fire']);
    // The label is what **this country** calls it, and is not the kind.
    expect(emergency.contacts[0].label).toBe('Police');
  });

  it('sort options are kebab, because they travel in a query string', async () => {
    const capabilities = await fetchIntelligenceCapabilities();
    expect(capabilities.sortOptions).toContain('most-viewed');
    expect(capabilities.sortOptions).toContain('effective-soonest');
    expect(capabilities.holidayHorizonDays).toBe(HOLIDAY_HORIZON_DAYS);
  });

  it('isUrgentSeverity is High and above, as the dashboard counts it', () => {
    expect(isUrgentSeverity('Critical')).toBe(true);
    expect(isUrgentSeverity('High')).toBe(true);
    expect(isUrgentSeverity('Medium')).toBe(false);
    expect(isUrgentSeverity('Informational')).toBe(false);
  });
});

// ── Trap 6: a country with no emergency directory ────────────────────────────

describe('emergency numbers', () => {
  it('a country with no directory is a coded 404, not an empty document', async () => {
    const failure = await fetchEmergencyContacts(
      DEV_INTELLIGENCE_IDS.countryWithoutEmergencyDirectory
    ).catch((cause: unknown) => cause);

    expect(isEmergencyDirectoryMissing(failure)).toBe(true);
    expect(intelligenceErrorMessage(failure)).toBe(
      'We have not recorded emergency numbers for this country yet.'
    );
  });

  it('needs no second call to render — no identifier to resolve anywhere on it', async () => {
    const emergency = await fetchEmergencyContacts('GB');

    // Shaped to be cached offline: everything somebody needs while frightened,
    // in one document.
    expect(emergency.guidance).not.toBeNull();
    expect(emergency.resolvedLocale).toBe('en');
    for (const contact of emergency.contacts) {
      expect(contact.number).toBeTruthy();
      expect(contact).not.toHaveProperty('contactId');
      expect(contact).not.toHaveProperty('mediaId');
    }
  });
});

// ── Trap 7: the one-call dashboard ───────────────────────────────────────────

describe('the country dashboard is ten bands in one response', () => {
  it('carries the emergency numbers in full rather than as a count', async () => {
    const intelligence = await fetchCountryIntelligence('GB');

    // Every other band is a summary with a "see all" behind it. Making somebody
    // tap through to an ambulance number would be indefensible.
    expect(intelligence.emergency?.contacts.length).toBeGreaterThan(0);
    expect(intelligence.statistics.emergencyContactCount).toBe(
      intelligence.emergency?.contacts.length
    );
  });

  it('keeps safety alerts as their own band rather than filtering the latest', async () => {
    const intelligence = await fetchCountryIntelligence('GB');

    expect(intelligence.safetyAlerts.every((row) => isUrgentSeverity(row.severity))).toBe(true);
    // Not filtered out of `latestNotices` — a member scanning during a cyclone
    // should not have to notice that the third card is red.
    expect(intelligence.latestNotices.map((row) => row.officialNoticeId)).toEqual(
      expect.arrayContaining(intelligence.safetyAlerts.map((row) => row.officialNoticeId))
    );
  });

  it('includes missions both in the country and serving its nationals', async () => {
    const intelligence = await fetchCountryIntelligence('GB');
    const ids = intelligence.embassies.map((row) => row.embassyId);

    expect(ids).toContain(DEV_INTELLIGENCE_IDS.embassyInGbServingMu);
    expect(ids).toContain(DEV_INTELLIGENCE_IDS.embassyInMuServingGb);
  });

  it('reports a null lastPublishedAt for a country with nothing published', async () => {
    const empty = await fetchCountryIntelligence('ZW');

    // Null is an empty state, not a zero. A client that rendered it as a date
    // would be inventing one.
    expect(empty.statistics.lastPublishedAt).toBeNull();
    expect(empty.statistics.activeNoticeCount).toBe(0);
    expect(empty.emergency).toBeNull();
  });

  it('recordView defaults to the server’s own default and is not restated', async () => {
    await fetchCountryIntelligence('GB');
    const call = mock.history.get[mock.history.get.length - 1];
    expect(call.params).toBeUndefined();
  });
});

// ── Trap 8: holidays ─────────────────────────────────────────────────────────

describe('the holiday calendar', () => {
  it('has no cursor, because a country has ten to thirty holidays in a year', async () => {
    const page = await fetchPublicHolidays('GB');
    expect(page.nextCursor).toBeNull();
    expect(page.hasMore).toBe(false);
  });

  it('a range wins over a year when both are given', async () => {
    const byYear = await fetchPublicHolidays('GB', { year: 2027 });
    expect(byYear.items.map((row) => row.year)).toEqual([2027]);

    const byRange = await fetchPublicHolidays('GB', {
      year: 2027,
      from: '2026-01-01T00:00:00.000Z',
      until: '2026-12-31T00:00:00.000Z',
    });
    expect(byRange.items.map((row) => row.year)).toEqual([2026]);
  });

  it('the kind is not the same question as what closes', async () => {
    const page = await fetchPublicHolidays('GB');
    const closure = page.items.find((row) => row.kind === 'EmbassyClosure');

    // A religious holiday may close nothing and a national one may close
    // everything. The two closure flags are the payload; the kind is the label.
    expect(closure?.closesEmbassies).toBe(true);
    expect(closure?.closesGovernmentOffices).toBe(false);
  });
});

// ── Trap 9: media and revisions are references, not payloads ─────────────────

describe('the reader-facing shape', () => {
  it('an embassy photograph is a mediaId and never a URL', async () => {
    const embassy = await fetchEmbassy(DEV_INTELLIGENCE_IDS.embassyInGbServingMu);
    expect(embassy).not.toHaveProperty('imageUrl');
    expect(embassy.mediaId === null || !embassy.mediaId.startsWith('http')).toBe(true);
  });

  it('`revision` is an editor’s field and is null for a reader', async () => {
    const embassy = await fetchEmbassy(DEV_INTELLIGENCE_IDS.embassyInGbServingMu);
    const advisory = await fetchVisaAdvisory(DEV_INTELLIGENCE_IDS.universalVisa);

    expect(embassy.revision).toBeNull();
    expect(advisory.revision).toBeNull();
  });

  it('there is nothing about applying on a visa advisory', async () => {
    const advisory = await fetchVisaAdvisory(DEV_INTELLIGENCE_IDS.universalVisa);

    // Application processing is explicitly out of scope, and the contract is
    // where that is visible to every client author who might assume otherwise.
    expect(advisory).not.toHaveProperty('caseId');
    expect(advisory).not.toHaveProperty('applicationStatus');
    expect(advisory).not.toHaveProperty('fee');
    // What it does carry is where the authority takes them.
    expect(advisory.applicationUrl).toBeTruthy();
  });
});

// ── Clamping ─────────────────────────────────────────────────────────────────

describe('the client applies the server’s own clamp', () => {
  it('so two limits that mean one page are one cache entry', () => {
    expect(clampIntelligenceLimit(500)).toBe(INTELLIGENCE_MAX_PAGE_SIZE);
    expect(clampIntelligenceLimit(0)).toBe(1);
    expect(clampIntelligenceLimit(undefined)).toBe(INTELLIGENCE_DEFAULT_PAGE_SIZE);
  });
});
