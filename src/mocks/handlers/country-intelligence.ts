// ═════════════════════════════════════════════════════════════════════════════
// Diaspora Platform — Country Intelligence, development handlers for the REAL
// contract (Remediation Wave D-5)
//
// `/api/v1/intelligence` is the **third** URL space `Diaspora.Modules.Guides`
// serves, mapped by `IntelligenceEndpointContributor`. Every shape here was read
// from `Api/EmbassyEndpoints.cs`, `Api/VisaAdvisoryEndpoints.cs`,
// `Api/EmergencyEndpoints.cs`, `Api/PublicHolidayEndpoints.cs`,
// `Api/OfficialNoticeEndpoints.cs`, `Api/IntelligenceCatalogueEndpoints.cs`,
// `Api/IntelligenceDiscoveryEndpoints.cs` and `Contracts/V1/*`.
//
// ── There was nothing here before, and nothing to correct ───────────────────
//
// This is the first handler this surface has ever had, because it is the first
// client. No previous fixture served an embassy or a visa advisory, so there is
// no divergence to fix — only a contract to reproduce correctly the first time.
//
// ── The behaviours this file ENFORCES rather than describes ─────────────────
//
//   1. **`GET /intelligence/search` names its rows `results`, not `items`.**
//      Reproduced exactly, so that a client reaching for `readPage` gets the
//      silent empty page here rather than in production. The integration test
//      asserts both halves of that.
//   2. **`locatedIn` and `serving` are separate and neither defaults to the
//      other.** A request naming only one filters on only one, and the seed
//      contains a mission where the two answers differ.
//   3. **`appliesTo` widens.** Filtering visa advisories by nationality returns
//      advisories naming it **and** advisories naming nobody. The seed contains
//      one of each, so a handler that narrowed would visibly lose the universal
//      rule.
//   4. **`activeOnly` defaults to true for visas and false for notices.** The
//      seed contains an expired advisory that disappears unless it is asked for.
//   5. **Severity is `Informational`, not `Info`.** The wire spelling is the
//      enum member.
//   6. **The holiday calendar has no cursor.** A bare array, whatever `limit`
//      might be sent.
//   7. **A country with no emergency directory is 404
//      `intelligence.emergency.not-found`**, not an empty document. The seed has
//      one such country, because a screen that renders an empty ambulance list
//      as "no numbers" is a screen nobody tested.
//
// ── What this file deliberately does NOT do ─────────────────────────────────
//
// **No editorial writes.** Creating an embassy, publishing an advisory, saving a
// country's emergency numbers and the whole notice workflow all sit behind
// staff-only policies, no member-facing screen exists for any of them, and a
// development handler that accepted them would be an affordance waiting to be
// wired to something.
// ═════════════════════════════════════════════════════════════════════════════

import type MockAdapter from 'axios-mock-adapter';

import type {
  CountryIntelligenceResponse,
  EmbassyResponse,
  EmergencyContactsResponse,
  IntelligenceCapabilitiesResponse,
  IssuingAuthorityResponse,
  NoticeCategoryResponse,
  OfficialNoticeCardResponse,
  PublicHolidayResponse,
  VisaAdvisoryResponse,
} from '@/types/country-intelligence';

const ROOT = '/intelligence';

type Reply = [number, unknown];

function ok(data: unknown): Reply {
  return [200, { data, meta: { requestId: 'dev', correlationId: 'dev', timestamp: 'dev' } }];
}

function okPage(items: unknown[], nextCursor: string | null, totalCount: number | null): Reply {
  return ok({ items, nextCursor, hasMore: nextCursor !== null, totalCount });
}

function problem(status: number, code: string, detail: string): Reply {
  return [
    status,
    {
      type: `https://diaspora.app/errors/${code.toLowerCase()}`,
      title:
        status === 400
          ? 'Validation failed'
          : status === 404
            ? 'Not found'
            : status === 503
              ? 'Service unavailable'
              : 'Unexpected error',
      status,
      detail,
      code,
      correlationId: 'dev',
      traceId: 'dev',
      timestamp: '2026-08-01T09:00:00.000Z',
    },
  ];
}

function params(config: { params?: Record<string, unknown> }): Record<string, string> {
  const source = config.params ?? {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== null) result[key] = String(value);
  }
  return result;
}

function path(config: { url?: string }): string {
  return (config.url ?? '').split('?')[0];
}

function page<T>(rows: T[], query: Record<string, string>): Reply {
  const limit = Math.min(50, Math.max(1, Number(query.limit ?? 20) || 20));
  const offset = query.cursor ? Number(query.cursor) || 0 : 0;
  const slice = rows.slice(offset, offset + limit);
  const nextCursor = offset + limit < rows.length ? String(offset + limit) : null;
  return okPage(slice, nextCursor, rows.length);
}

// ── Seed ─────────────────────────────────────────────────────────────────────

const GB_EMBASSY_ID = '00000000-0000-4000-e100-000000000001';
const MU_EMBASSY_ID = '00000000-0000-4000-e100-000000000002';
const AUTHORITY_ID = '00000000-0000-4000-e200-000000000001';
const UNIVERSAL_VISA_ID = '00000000-0000-4000-e300-000000000001';
const TARGETED_VISA_ID = '00000000-0000-4000-e300-000000000002';
const EXPIRED_VISA_ID = '00000000-0000-4000-e300-000000000003';

/** The country the seed deliberately leaves with **no** emergency directory. */
export const COUNTRY_WITHOUT_EMERGENCY_DIRECTORY = 'ZA';

const EMBASSIES: EmbassyResponse[] = [
  {
    embassyId: GB_EMBASSY_ID,
    name: 'High Commission of Mauritius, London',
    description: 'Consular services for Mauritian nationals resident in the United Kingdom.',
    // **Located in** the United Kingdom…
    countryCode: 'GB',
    // …and **serving** Mauritians. Two different questions, and this row is the
    // reason a single `country` parameter could not have answered either.
    servesCountryCode: 'MU',
    city: 'London',
    address: '32-33 Elvaston Place, London SW7 5NW',
    latitude: 51.4954,
    longitude: -0.1806,
    telephone: '+44 20 7581 0294',
    emergencyTelephone: '+44 7911 123456',
    email: 'londonhc@govmu.org',
    website: 'https://mauritiushighcommission.uk',
    appointmentUrl: 'https://mauritiushighcommission.uk/appointments',
    requiresAppointment: true,
    offersPassportServices: true,
    offersVisaServices: false,
    offersConsularServices: true,
    offersEmergencyAssistance: true,
    mediaId: null,
    authorityId: AUTHORITY_ID,
    isVerified: true,
    isActive: true,
    officeHours: [
      { day: 'Monday', hours: '09:30–13:00, 14:00–16:30', isClosed: false },
      { day: 'Friday', hours: '09:30–13:00', isClosed: false },
      { day: 'Saturday', hours: null, isClosed: true },
    ],
    services: [
      {
        key: 'passport-renewal',
        name: 'Passport renewal',
        description: 'Bring the expiring passport and one photograph.',
        requiresAppointment: true,
      },
      {
        key: 'document-attestation',
        name: 'Document attestation',
        description: null,
        // Per service — a mission that takes walk-ins for one and not another is
        // normal, which is why this is not a property of the mission.
        requiresAppointment: false,
      },
    ],
    availableLocales: ['en', 'fr'],
    // Editors only. Null for a reader, which is what this handler answers as.
    revision: null,
  },
  {
    embassyId: MU_EMBASSY_ID,
    name: 'British High Commission, Port Louis',
    description: null,
    countryCode: 'MU',
    servesCountryCode: 'GB',
    city: 'Port Louis',
    address: '7th Floor, Cascades Building, Edith Cavell Street',
    latitude: -20.1609,
    longitude: 57.5012,
    telephone: '+230 202 9400',
    emergencyTelephone: '+230 202 9400',
    email: null,
    website: null,
    appointmentUrl: null,
    requiresAppointment: false,
    offersPassportServices: true,
    offersVisaServices: true,
    offersConsularServices: true,
    offersEmergencyAssistance: true,
    mediaId: null,
    authorityId: null,
    isVerified: false,
    isActive: true,
    officeHours: [{ day: 'Monday', hours: '08:30–16:00', isClosed: false }],
    services: [],
    availableLocales: ['en'],
    revision: null,
  },
];

const VISAS: VisaAdvisoryResponse[] = [
  {
    visaAdvisoryId: UNIVERSAL_VISA_ID,
    countryCode: 'GB',
    // **Null means everybody.** Behaviour 3: this row must survive a filter by
    // any nationality, and a client that post-filtered would lose it.
    appliesToCountryCode: null,
    title: 'Standard Visitor visa',
    summary: 'Up to six months for tourism, family visits and some business activity.',
    content: 'You must show you will leave at the end of your visit and can support yourself.',
    visaCategory: 'Visitor',
    status: 'Published',
    authorityId: AUTHORITY_ID,
    authorityName: 'UK Visas and Immigration',
    isOfficial: true,
    requirements: [
      'A passport valid for the whole of your stay',
      'Evidence of funds for the visit',
      'Evidence of your intention to leave',
    ],
    documents: ['Passport', 'Bank statements for six months', 'Travel itinerary'],
    processingTime: '3 weeks',
    applicationUrl: 'https://www.gov.uk/standard-visitor',
    officialReference: 'UKVI-SV-2026',
    sourceUrl: 'https://www.gov.uk/standard-visitor',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    expiresAt: null,
    publishedAt: '2026-01-05T09:00:00.000Z',
    lastReviewedAt: '2026-06-01T09:00:00.000Z',
    isActive: true,
    relatedGuideIds: [],
    availableLocales: ['en'],
    revision: null,
  },
  {
    visaAdvisoryId: TARGETED_VISA_ID,
    countryCode: 'GB',
    // Names a nationality. A member from anywhere else must still see the
    // universal row above, which is the whole point of behaviour 3.
    appliesToCountryCode: 'MU',
    title: 'Visa-free entry for Mauritian nationals',
    summary: 'Up to six months without a visa, subject to entry clearance at the border.',
    content: null,
    visaCategory: 'Visitor',
    status: 'Published',
    authorityId: AUTHORITY_ID,
    authorityName: 'UK Visas and Immigration',
    isOfficial: true,
    requirements: ['A passport valid for the whole of your stay'],
    documents: ['Passport'],
    processingTime: null,
    applicationUrl: null,
    officialReference: null,
    sourceUrl: 'https://www.gov.uk/check-uk-visa',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    expiresAt: null,
    publishedAt: '2026-01-05T09:00:00.000Z',
    lastReviewedAt: null,
    isActive: true,
    relatedGuideIds: ['00000000-0000-4000-b000-000000000001'],
    availableLocales: ['en'],
    revision: null,
  },
  {
    visaAdvisoryId: EXPIRED_VISA_ID,
    countryCode: 'GB',
    appliesToCountryCode: null,
    title: 'Temporary concession for 2025 arrivals',
    summary: 'A concession that has since lapsed.',
    content: null,
    visaCategory: 'Visitor',
    status: 'Published',
    authorityId: AUTHORITY_ID,
    authorityName: 'UK Visas and Immigration',
    isOfficial: true,
    requirements: [],
    documents: [],
    processingTime: null,
    applicationUrl: null,
    officialReference: null,
    sourceUrl: null,
    effectiveFrom: '2025-01-01T00:00:00.000Z',
    expiresAt: '2025-12-31T00:00:00.000Z',
    publishedAt: '2025-01-01T09:00:00.000Z',
    lastReviewedAt: null,
    // Behaviour 4: `activeOnly` defaults to **true**, so this row is absent
    // unless a caller explicitly asks for the inactive ones.
    isActive: false,
    relatedGuideIds: [],
    availableLocales: ['en'],
    revision: null,
  },
];

const EMERGENCY: Record<string, EmergencyContactsResponse> = {
  GB: {
    countryCode: 'GB',
    guidance: 'Dial 999 from any phone. 112 also works and is free from a mobile.',
    contacts: [
      {
        // The **only** lower-case vocabulary on this surface: a seeded catalogue
        // key, not an enum, and what a client switches on for an icon.
        kind: 'police',
        // What this country calls it. Never the platform's English name — the
        // body a Francophone country calls for police is the gendarmerie.
        label: 'Police',
        number: '999',
        alternateNumber: '101',
        note: 'Use 101 for non-emergencies.',
        isAvailableAllHours: true,
        position: 1,
      },
      {
        kind: 'ambulance',
        label: 'Ambulance',
        number: '999',
        alternateNumber: '111',
        note: 'NHS 111 for urgent but non-life-threatening advice.',
        isAvailableAllHours: true,
        position: 2,
      },
      {
        kind: 'fire',
        label: 'Fire and rescue',
        number: '999',
        alternateNumber: null,
        note: null,
        isAvailableAllHours: true,
        position: 3,
      },
    ],
    lastReviewedAt: '2026-05-01T09:00:00.000Z',
    resolvedLocale: 'en',
    revision: null,
  },
  MU: {
    countryCode: 'MU',
    guidance: null,
    contacts: [
      {
        kind: 'police',
        label: 'Police',
        number: '999',
        alternateNumber: '112',
        note: null,
        isAvailableAllHours: true,
        position: 1,
      },
      {
        kind: 'ambulance',
        label: 'SAMU',
        number: '114',
        alternateNumber: null,
        note: 'Hours vary outside Port Louis.',
        isAvailableAllHours: false,
        position: 2,
      },
    ],
    lastReviewedAt: null,
    resolvedLocale: 'en',
    revision: null,
  },
  // `ZA` is deliberately absent. Behaviour 7.
};

const HOLIDAYS: PublicHolidayResponse[] = [
  {
    publicHolidayId: '00000000-0000-4000-e400-000000000001',
    countryCode: 'GB',
    name: 'Summer bank holiday',
    description: null,
    kind: 'National',
    observedOn: '2026-08-31T00:00:00.000Z',
    observedUntil: '2026-08-31T00:00:00.000Z',
    year: 2026,
    region: 'England and Wales',
    closesGovernmentOffices: true,
    closesEmbassies: false,
    availableLocales: ['en'],
    revision: null,
  },
  {
    publicHolidayId: '00000000-0000-4000-e400-000000000002',
    countryCode: 'GB',
    name: 'Independence Day (Mauritius) — mission closed',
    description: 'The High Commission closes on its home country’s national day.',
    // The kind is not the same question as what closes: this one shuts a mission
    // and no government office.
    kind: 'EmbassyClosure',
    observedOn: '2027-03-12T00:00:00.000Z',
    observedUntil: '2027-03-12T00:00:00.000Z',
    year: 2027,
    region: null,
    closesGovernmentOffices: false,
    closesEmbassies: true,
    availableLocales: ['en'],
    revision: null,
  },
];

const AUTHORITIES: IssuingAuthorityResponse[] = [
  {
    issuingAuthorityId: AUTHORITY_ID,
    countryCode: 'GB',
    name: 'UK Visas and Immigration',
    shortName: 'UKVI',
    authorityType: 'ImmigrationDepartment',
    description: 'The body that decides entry, residence and status.',
    website: 'https://www.gov.uk/government/organisations/uk-visas-and-immigration',
    contactEmail: null,
    contactPhone: null,
    isVerified: true,
    verifiedAt: '2026-01-01T09:00:00.000Z',
    isActive: true,
    revision: null,
  },
];

const CATEGORIES: NoticeCategoryResponse[] = [
  {
    noticeCategoryId: '00000000-0000-4000-e500-000000000001',
    key: 'immigration',
    name: 'Immigration',
    description: 'Entry, residence and status.',
    icon: 'document-text-outline',
    order: 1,
    defaultSeverity: 'Medium',
    alertFamily: 'GovernmentAnnouncement',
    isActive: true,
    revision: null,
    availableLocales: ['en'],
  },
  {
    noticeCategoryId: '00000000-0000-4000-e500-000000000002',
    key: 'safety',
    name: 'Safety and security',
    description: null,
    icon: 'warning-outline',
    order: 2,
    defaultSeverity: 'High',
    alertFamily: 'Emergency',
    isActive: true,
    revision: null,
    availableLocales: ['en'],
  },
];

function notice(
  id: string,
  overrides: Partial<OfficialNoticeCardResponse>
): OfficialNoticeCardResponse {
  return {
    officialNoticeId: id,
    title: 'A notice',
    summary: 'Something official.',
    countryCode: 'GB',
    region: null,
    categoryKey: 'immigration',
    categoryName: 'Immigration',
    categoryIcon: 'document-text-outline',
    // Behaviour 5. `Informational`, spelled out — not `Info`.
    severity: 'Informational',
    status: 'Published',
    verificationStatus: 'Verified',
    authorityId: AUTHORITY_ID,
    authorityName: 'UK Visas and Immigration',
    authorityShortName: 'UKVI',
    authorityType: 'ImmigrationDepartment',
    isOfficial: true,
    publicationDate: '2026-07-01T00:00:00.000Z',
    publishedAt: '2026-07-02T09:00:00.000Z',
    effectiveFrom: '2026-07-15T00:00:00.000Z',
    expiresAt: null,
    isActive: true,
    isExpired: false,
    supersededById: null,
    lastReviewedAt: null,
    viewCount: 1240,
    referenceCount: 1,
    attachmentCount: 0,
    ...overrides,
  };
}

const NOTICES: OfficialNoticeCardResponse[] = [
  notice('00000000-0000-4000-e600-000000000001', {
    title: 'Application fees rise from 1 September',
    summary: 'The Standard Visitor fee increases to £127.',
    severity: 'Medium',
  }),
  notice('00000000-0000-4000-e600-000000000002', {
    title: 'Severe weather: coastal districts',
    summary: 'A red warning is in force until Friday.',
    categoryKey: 'safety',
    categoryName: 'Safety and security',
    categoryIcon: 'warning-outline',
    severity: 'Critical',
    viewCount: 8800,
  }),
  notice('00000000-0000-4000-e600-000000000003', {
    title: 'Biometric appointment centres relocating',
    summary: 'Three centres move in October.',
    severity: 'Low',
    // Superseded is **not** a way of being gone: still readable, and pointing at
    // what replaced it.
    status: 'Superseded',
    supersededById: '00000000-0000-4000-e600-000000000001',
    isActive: false,
  }),
];

const CAPABILITIES: IntelligenceCapabilitiesResponse = {
  categories: CATEGORIES,
  emergencyKinds: [
    { key: 'police', name: 'Police', icon: 'shield-outline', order: 1, isEssential: true },
    { key: 'ambulance', name: 'Ambulance', icon: 'medkit-outline', order: 2, isEssential: true },
    { key: 'fire', name: 'Fire', icon: 'flame-outline', order: 3, isEssential: true },
    {
      key: 'coastguard',
      name: 'Coastguard',
      icon: 'boat-outline',
      order: 4,
      isEssential: false,
    },
  ],
  authorityTypes: [
    'Embassy',
    'HighCommission',
    'Consulate',
    'GovernmentMinistry',
    'ImmigrationDepartment',
    'HealthMinistry',
    'Police',
    'EmergencyServices',
    'TaxAuthority',
    'EducationAuthority',
    'LaborDepartment',
    'Municipality',
    'Other',
  ],
  // Ascending order of urgency — the order is load-bearing on the server.
  severities: ['Informational', 'Low', 'Medium', 'High', 'Critical'],
  sortOptions: [
    'newest',
    'oldest',
    'effective-soonest',
    'expiring-soonest',
    'most-viewed',
    'priority',
  ],
  searchEngine: 'EfOfficialNoticeSearchEngine',
  searchAvailable: true,
  authorityVerificationAvailable: true,
  sourceValidators: ['Diaspora.Modules.Guides'],
  analyticsSinks: [],
  holidayHorizonDays: 90,
};

// ═════════════════════════════════════════════════════════════════════════════

export function setupCountryIntelligenceMocks(mock: MockAdapter): void {
  // ── Fixed paths first ─────────────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/capabilities$`)).reply(() => ok(CAPABILITIES));

  mock.onGet(new RegExp(`${ROOT}/categories$`)).reply(() => ok(CATEGORIES));

  /**
   * Behaviour 1. **`results`, not `items`.**
   *
   * Reproduced exactly so that a client reaching for `readPage` gets the silent
   * empty page here, in a test, rather than in production against a country page
   * that renders "no official notices" over a full result set.
   */
  mock.onGet(new RegExp(`${ROOT}/search$`)).reply((config) => {
    const query = params(config);
    const text = (query.q ?? '').toLowerCase();

    const rows = NOTICES.filter((row) =>
      text ? row.title.toLowerCase().includes(text) || row.summary.toLowerCase().includes(text) : true
    )
      .filter((row) => !query.countryCode || row.countryCode === query.countryCode)
      .filter((row) => !query.category || row.categoryKey === query.category)
      .filter((row) => !query.severity || row.severity === query.severity)
      .filter((row) => query.officialOnly !== 'true' || row.isOfficial)
      .filter((row) => query.activeOnly !== 'true' || row.isActive);

    const limit = Math.min(50, Math.max(1, Number(query.limit ?? 20) || 20));
    const offset = query.cursor ? Number(query.cursor) || 0 : 0;
    const slice = rows.slice(offset, offset + limit);
    const nextCursor = offset + limit < rows.length ? String(offset + limit) : null;

    return ok({
      results: slice,
      nextCursor,
      hasMore: nextCursor !== null,
      // `int?`, and frequently null on the real engine.
      totalCount: rows.length,
      engine: 'EfOfficialNoticeSearchEngine',
      query: query.q ?? null,
    });
  });

  mock.onGet(new RegExp(`${ROOT}/notices/[0-9a-f-]+$`)).reply((config) => {
    const noticeId = path(config).split('/').pop() ?? '';
    const card = NOTICES.find((row) => row.officialNoticeId === noticeId);
    if (!card) {
      return problem(404, 'intelligence.notice.not-found', 'That notice could not be found.');
    }
    // The detail response carries the body a card omits.
    return ok({ ...card, content: 'The full text of the notice, as the authority issued it.' });
  });

  mock.onGet(new RegExp(`${ROOT}/notices$`)).reply((config) => {
    const query = params(config);
    const rows = NOTICES.filter((row) => !query.countryCode || row.countryCode === query.countryCode)
      .filter((row) => !query.category || row.categoryKey === query.category)
      .filter((row) => !query.severity || row.severity === query.severity)
      .filter((row) => !query.status || row.status === query.status)
      // Behaviour 4: notices default `activeOnly` to **false** — an editor's
      // list has to show what is not live.
      .filter((row) => query.activeOnly !== 'true' || row.isActive)
      .filter((row) => query.expiredOnly !== 'true' || row.isExpired)
      .filter((row) => query.officialOnly !== 'true' || row.isOfficial);

    return page(rows, query);
  });

  // ── Embassies ─────────────────────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/embassies/[0-9a-f-]+$`)).reply((config) => {
    const embassyId = path(config).split('/').pop() ?? '';
    const embassy = EMBASSIES.find((row) => row.embassyId === embassyId);
    if (!embassy) {
      return problem(404, 'intelligence.embassy.not-found', 'That mission is not in the directory.');
    }
    return ok(embassy);
  });

  mock.onGet(new RegExp(`${ROOT}/embassies$`)).reply((config) => {
    const query = params(config);
    const text = (query.q ?? '').toLowerCase();

    // Behaviour 2. Two filters, applied independently. Neither is defaulted from
    // the other, so a caller naming only `locatedIn` gets "missions in that
    // country" and nothing about who they serve.
    const rows = EMBASSIES.filter((row) => row.isActive)
      .filter((row) => !query.locatedIn || row.countryCode === query.locatedIn)
      .filter((row) => !query.serving || row.servesCountryCode === query.serving)
      .filter((row) => query.verifiedOnly !== 'true' || row.isVerified)
      .filter((row) =>
        text
          ? row.name.toLowerCase().includes(text) || (row.city ?? '').toLowerCase().includes(text)
          : true
      );

    return page(rows, query);
  });

  // ── Visa advisories ───────────────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/visas/[0-9a-f-]+$`)).reply((config) => {
    const advisoryId = path(config).split('/').pop() ?? '';
    const advisory = VISAS.find((row) => row.visaAdvisoryId === advisoryId);
    if (!advisory) {
      return problem(404, 'intelligence.visa.not-found', 'That advisory is no longer available.');
    }
    return ok(advisory);
  });

  mock.onGet(new RegExp(`${ROOT}/countries/[^/?]+/visas$`)).reply((config) => {
    const query = params(config);
    const countryCode = path(config).split('/countries/')[1]?.split('/')[0] ?? '';

    // Behaviour 4: the server's default is `activeOnly: true`.
    const activeOnly = query.activeOnly === undefined ? true : query.activeOnly === 'true';

    const rows = VISAS.filter((row) => row.countryCode === countryCode)
      .filter((row) => !activeOnly || row.isActive)
      // Behaviour 3. **Widens, not narrows.** An advisory naming nobody applies
      // to everybody, so it is returned alongside the ones naming the requested
      // nationality. A handler that wrote `row.appliesToCountryCode ===
      // query.appliesTo` would tell most members no rules exist for them.
      .filter(
        (row) =>
          !query.appliesTo ||
          row.appliesToCountryCode === null ||
          row.appliesToCountryCode === query.appliesTo
      );

    return page(rows, query);
  });

  // ── Emergency ─────────────────────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/countries/[^/?]+/emergency$`)).reply((config) => {
    const countryCode = path(config).split('/countries/')[1]?.split('/')[0] ?? '';
    const directory = EMERGENCY[countryCode];

    // Behaviour 7. A country with no directory is a **404 with a code**, not an
    // empty document — a screen that rendered an empty ambulance list as "no
    // numbers for this country" would be indistinguishable from one that had
    // simply failed to ask.
    if (!directory) {
      return problem(
        404,
        'intelligence.emergency.not-found',
        'No emergency directory has been recorded for that country.'
      );
    }

    return ok(directory);
  });

  // ── Holidays ──────────────────────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/countries/[^/?]+/holidays$`)).reply((config) => {
    const query = params(config);
    const countryCode = path(config).split('/countries/')[1]?.split('/')[0] ?? '';

    let rows = HOLIDAYS.filter((row) => row.countryCode === countryCode);

    // A range wins over a year when both are given.
    if (query.from && query.until) {
      const from = Date.parse(query.from);
      const until = Date.parse(query.until);
      rows = rows.filter((row) => {
        const observed = Date.parse(row.observedOn);
        return observed >= from && observed <= until;
      });
    } else if (query.year) {
      rows = rows.filter((row) => row.year === Number(query.year));
    }

    // Behaviour 6. **A bare array, no cursor** — whatever `limit` was sent.
    return ok(rows.sort((a, b) => Date.parse(a.observedOn) - Date.parse(b.observedOn)));
  });

  // ── Authorities ───────────────────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/countries/[^/?]+/authorities$`)).reply((config) => {
    const query = params(config);
    const countryCode = path(config).split('/countries/')[1]?.split('/')[0] ?? '';
    const rows = AUTHORITIES.filter((row) => row.countryCode === countryCode)
      .filter((row) => query.verifiedOnly !== 'true' || row.isVerified)
      // Verified first, as the dashboard band orders them.
      .sort((a, b) => Number(b.isVerified) - Number(a.isVerified));
    return ok(rows);
  });

  mock.onGet(new RegExp(`${ROOT}/countries/[^/?]+/analytics$`)).reply(() =>
    problem(403, 'intelligence.not-editor', 'Country intelligence analytics are staff-only.')
  );

  // ── The country dashboard, registered last among `/countries/…` ───────────

  mock.onGet(new RegExp(`${ROOT}/countries/[^/?]+$`)).reply((config) => {
    const countryCode = path(config).split('/countries/')[1] ?? '';

    const embassies = EMBASSIES.filter(
      (row) => row.countryCode === countryCode || row.servesCountryCode === countryCode
    );
    const visas = VISAS.filter((row) => row.countryCode === countryCode && row.isActive);
    const notices = NOTICES.filter((row) => row.countryCode === countryCode);
    const holidays = HOLIDAYS.filter((row) => row.countryCode === countryCode);
    const emergency = EMERGENCY[countryCode] ?? null;

    const active = notices.filter((row) => row.isActive);
    const urgent = active.filter(
      (row) => row.severity === 'High' || row.severity === 'Critical'
    );

    const response: CountryIntelligenceResponse = {
      countryCode,
      resolvedLocale: 'en',
      statistics: {
        activeNoticeCount: active.length,
        urgentNoticeCount: urgent.length,
        embassyCount: embassies.length,
        visaAdvisoryCount: visas.length,
        emergencyContactCount: emergency?.contacts.length ?? 0,
        upcomingHolidayCount: holidays.length,
        verifiedAuthorityCount: AUTHORITIES.filter(
          (row) => row.countryCode === countryCode && row.isVerified
        ).length,
        // Null means nothing has been published for this country yet — an empty
        // state, not a zero.
        lastPublishedAt: notices.length > 0 ? '2026-07-02T09:00:00.000Z' : null,
      },
      latestNotices: notices.slice(0, 5),
      // Separate band rather than a filter over the latest: a member scanning a
      // country page during a cyclone should not have to notice that the third
      // card is red.
      safetyAlerts: urgent,
      visaUpdates: active.filter((row) => row.categoryKey === 'immigration'),
      governmentAdvisories: active.filter((row) => row.categoryKey !== 'safety'),
      embassies,
      // The one band carried in full. Tapping through to an ambulance number
      // would be indefensible.
      emergency,
      consularServices: visas,
      upcomingHolidays: holidays,
      officialContacts: AUTHORITIES.filter((row) => row.countryCode === countryCode),
      categoryBreakdown: CATEGORIES.map((category) => ({
        key: category.key,
        name: category.name,
        icon: category.icon,
        count: active.filter((row) => row.categoryKey === category.key).length,
      })),
    };

    return ok(response);
  });
}

/** The identifiers the integration test addresses. */
export const DEV_INTELLIGENCE_IDS = {
  embassyInGbServingMu: GB_EMBASSY_ID,
  embassyInMuServingGb: MU_EMBASSY_ID,
  universalVisa: UNIVERSAL_VISA_ID,
  targetedVisa: TARGETED_VISA_ID,
  expiredVisa: EXPIRED_VISA_ID,
  authority: AUTHORITY_ID,
  countryWithoutEmergencyDirectory: COUNTRY_WITHOUT_EMERGENCY_DIRECTORY,
} as const;
