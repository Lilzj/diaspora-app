// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Country Intelligence wire contract (Remediation Wave D-5)
//
// A literal mirror of the `/api/v1/intelligence` half of
// `Diaspora.Modules.Guides` — the module's **third** endpoint contributor,
// `IntelligenceEndpointContributor`, which the kernel accepts because
// contributors are collected as a set. Written from
// `Api/EmbassyEndpoints.cs`, `Api/VisaAdvisoryEndpoints.cs`,
// `Api/EmergencyEndpoints.cs`, `Api/PublicHolidayEndpoints.cs`,
// `Api/IntelligenceDiscoveryEndpoints.cs` and `Contracts/V1/*`.
//
// ── The finding that reframed this wave ──────────────────────────────────────
//
// The brief said embassies and visa advisories "render from fixtures". **They
// do not.** There is no embassy screen, no visa screen and no fixture for
// either: `grep -rn "embass" src` finds one word in an unrelated marketing
// paragraph. This surface — 49 designed routes, the largest
// designed-but-unrepresented capability the audit found — had **no frontend
// representation of any kind**, and this file is the first.
//
// ── The five things that will trip a reader ─────────────────────────────────
//
// **1. `countryCode` and `servesCountryCode` are different questions.** Where a
// mission *is*, and whose nationals it *serves*. The listing takes them as two
// parameters — `locatedIn` and `serving` — and **neither defaults to the
// other**: "missions in the United Kingdom" and "missions serving British
// nationals" are lists with almost no overlap. A client that folded them into
// one `country` parameter would answer whichever the last caller had in mind.
//
// **2. `appliesToCountryCode: null` means everybody, and a screen must render
// that difference.** "Visa-free for 90 days" shown to somebody whose nationality
// it does not cover is the kind of wrong answer that ends with a person at an
// airport. The listing's `appliesTo` filter matches advisories naming that
// nationality **and** those naming nobody, because both apply.
//
// **3. Enums are PascalCase; sort keys are kebab.** Same split as Guides, and
// `Application/Intelligence/Services/IntelligenceWireNames.cs` says why: the app
// renders `Critical` and `High` from string-literal unions with icon maps keyed
// on them, and emitting `critical` would need a remapping layer.
//
// **4. `EmergencyContactResponse.kind` is a lower-case key** — `police` — and it
// is the **only** lower-case vocabulary on this surface. It is a seeded
// catalogue key rather than an enum, and it is what a client switches on for an
// icon. The `label` beside it is what *this country* calls the service,
// localized — never the platform's English name, because the body a Francophone
// country calls for police is the gendarmerie.
//
// **5. There is nothing here about applying for a visa.** No case, no status, no
// fee, no submission. Application processing is explicitly out of scope, and the
// contract is where that is visible to every client author who might otherwise
// assume it is coming.
//
// ── Pagination ───────────────────────────────────────────────────────────────
//
// Embassies and visa advisories are `CursorPagedResult<T>` — `items`. Holidays,
// notice categories and issuing authorities are bare arrays. The holiday
// calendar has **no cursor, deliberately**: a country has ten to thirty holidays
// in a year and both real queries return a set small enough to hand over whole.
// `readPage` absorbs both shapes; the integration test pins each.
// ─────────────────────────────────────────────────────────────────────────────

// ── Enums ────────────────────────────────────────────────────────────────────

/** `AuthorityType`. PascalCase. `Other` is the honest escape hatch. */
export type AuthorityType =
  | 'Embassy'
  | 'HighCommission'
  | 'Consulate'
  | 'GovernmentMinistry'
  | 'ImmigrationDepartment'
  | 'HealthMinistry'
  | 'Police'
  | 'EmergencyServices'
  | 'TaxAuthority'
  | 'EducationAuthority'
  | 'LaborDepartment'
  | 'Municipality'
  | 'Other';

/** `VisaAdvisoryStatus`. */
export type VisaAdvisoryStatus = 'Draft' | 'Published' | 'Archived';

/**
 * `HolidayKind`.
 *
 * The kind is **not** the same question as what closes: a religious holiday may
 * close nothing and a national one may close everything, and in several
 * countries the reverse is true. Closures are their own flags on the entry.
 */
export type HolidayKind =
  | 'National'
  | 'Regional'
  | 'Religious'
  | 'EmbassyClosure'
  | 'GovernmentClosure'
  | 'WorkingDayAdjustment';

/**
 * `NoticeSeverity`.
 *
 * **`Informational`, not `Info`** — the enum member is spelled out, and
 * `ToWire` is `ToString()`. A client comparing against `'Info'` matches nothing.
 *
 * **The order is load-bearing.** Ranking a country's notices, deciding what
 * leads a dashboard and choosing what survives a truncated digest all compare
 * these, so `SEVERITY_ORDER` in the client mirrors the enum's own ascent.
 */
export type NoticeSeverity = 'Informational' | 'Low' | 'Medium' | 'High' | 'Critical';

/**
 * `NoticeStatus`.
 *
 * Two steps longer than a guide's lifecycle, and both extra steps are the point:
 * `Submitted` and `Verified` exist because somebody **other than the writer**
 * confirmed the authority actually said this. That is the whole difference
 * between "a member reports that visa rules changed" and "the immigration
 * department announced a change".
 *
 * `Superseded` is **not a way of being gone** — a superseded notice stays
 * readable for ever, pointing at what replaced it. `Archived` is the one gone
 * state; there is deliberately no separate delete flag. And there is **no
 * `Expired` status**: expiry is `isExpired`, a computed boolean that is true
 * whatever the status says.
 */
export type NoticeStatus =
  | 'Draft'
  | 'Submitted'
  | 'Verified'
  | 'Published'
  | 'Superseded'
  | 'Archived';

/**
 * `NoticeVerificationState`.
 *
 * **Distinct from `NoticeStatus`, and the two must not be merged.** Status is
 * where the notice is in an editorial workflow; this is what is known about its
 * provenance. A published notice whose source turns out to be a forwarded
 * screenshot becomes `Rejected` here **without moving in the workflow** — live,
 * and known to be unconfirmed, which is exactly the state an editor must see.
 */
export type NoticeVerificationState = 'Unverified' | 'Pending' | 'Verified' | 'Rejected';

/**
 * `NoticeAlertFamily`.
 *
 * On the reader-facing category response deliberately: a client that knows a
 * category is an emergency family can render it differently without keeping its
 * own copy of which keys are serious.
 */
export type NoticeAlertFamily = 'None' | 'Emergency' | 'GovernmentAnnouncement';

/** `NoticeSortOrder`, in its **wire** spelling. Kebab; they travel in a query string. */
export type NoticeSortKey =
  | 'newest'
  | 'oldest'
  | 'effective-soonest'
  | 'expiring-soonest'
  | 'most-viewed'
  | 'priority';

// ── Embassies ────────────────────────────────────────────────────────────────

/**
 * `EmbassyOfficeHoursResponse`.
 *
 * `hours` is free text because real missions publish "09:00–12:00, closed for
 * visa collection after 11:00" and "by appointment only". `isClosed` is the one
 * structured part, because it is the one thing a client renders as a state
 * rather than as a sentence.
 */
export interface EmbassyOfficeHoursResponse {
  /** PascalCase day name — `Monday`. */
  day: string;
  hours: string | null;
  isClosed: boolean;
}

/** `EmbassyServiceResponse`. */
export interface EmbassyServiceResponse {
  key: string;
  /** Already localized where a translation exists. */
  name: string;
  description: string | null;
  /** Per service — a mission that takes walk-ins for one and not another is normal. */
  requiresAppointment: boolean;
}

/**
 * `EmbassyResponse`.
 *
 * `emergencyTelephone` is its own field and is **the single most consequential
 * field this module serves** — somebody who needs it is not going to read a
 * paragraph to find it, so a client renders it as its own control.
 */
export interface EmbassyResponse {
  embassyId: string;
  /** Already localized, with the exact→language→default fallback. */
  name: string;
  description: string | null;
  /** Where the mission **is**. Upper-case ISO 3166-1 alpha-2. */
  countryCode: string;
  /** Whose nationals it **serves**. Not derivable from `countryCode`. */
  servesCountryCode: string;
  city: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  telephone: string | null;
  /** The out-of-hours line. Rendered as its own control. */
  emergencyTelephone: string | null;
  email: string | null;
  website: string | null;
  appointmentUrl: string | null;
  requiresAppointment: boolean;
  offersPassportServices: boolean;
  offersVisaServices: boolean;
  offersConsularServices: boolean;
  offersEmergencyAssistance: boolean;
  /** A Media reference for the building photograph. Never a URL. */
  mediaId: string | null;
  /** The issuing-authority record for this mission, when one exists. */
  authorityId: string | null;
  isVerified: boolean;
  isActive: boolean;
  officeHours: EmbassyOfficeHoursResponse[];
  services: EmbassyServiceResponse[];
  /** The locales a translation exists for. */
  availableLocales: string[];
  /** The concurrency token to send back on an edit. **Editors only** — null for readers. */
  revision: number | null;
}

// ── Visa advisories ──────────────────────────────────────────────────────────

/** `VisaAdvisoryResponse`. */
export interface VisaAdvisoryResponse {
  visaAdvisoryId: string;
  /** The **destination** the rules govern entry to. */
  countryCode: string;
  /** The nationality the rules apply to, or **null for everybody**. */
  appliesToCountryCode: string | null;
  title: string;
  summary: string;
  content: string | null;
  /** The visa class — `Student`, `Skilled Worker`. **Free text**; clients group on it. */
  visaCategory: string | null;
  status: VisaAdvisoryStatus;
  authorityId: string;
  authorityName: string;
  isOfficial: boolean;
  /** Conditions to satisfy, in the order an editor put them. Prose, not structure. */
  requirements: string[];
  /** Papers to bring, in order. */
  documents: string[];
  /** As the authority states it — "10 to 15 working days". */
  processingTime: string | null;
  /** Where somebody applies. **This platform does not.** */
  applicationUrl: string | null;
  officialReference: string | null;
  sourceUrl: string | null;
  effectiveFrom: string | null;
  expiresAt: string | null;
  publishedAt: string | null;
  lastReviewedAt: string | null;
  /** Whether these are the rules that apply **right now**. Computed so two clients agree. */
  isActive: boolean;
  /** Guides that explain how to actually do it. Identifiers; the client resolves them. */
  relatedGuideIds: string[];
  availableLocales: string[];
  revision: number | null;
}

// ── Emergency ────────────────────────────────────────────────────────────────

/** `EmergencyContactResponse`. */
export interface EmergencyContactResponse {
  /** The stable **lower-case** kind key — `police`. What a client switches on for an icon. */
  kind: string;
  /** What **this country** calls it, localized. Never the platform's English name. */
  label: string;
  number: string;
  alternateNumber: string | null;
  /** Hours, languages, coverage. Localized. */
  note: string | null;
  /** Rendered as a badge — it is what somebody checks at two in the morning. */
  isAvailableAllHours: boolean;
  position: number;
}

/**
 * `EmergencyContactsResponse`.
 *
 * Shaped so a client can render it **offline** — everything somebody needs while
 * frightened, in one document, with no identifier to resolve against another
 * module and no second call to make. Caching one response per country is the
 * right thing to do with it.
 */
export interface EmergencyContactsResponse {
  countryCode: string;
  /** A line above the numbers — "dial 999 from a landline, 112 from a mobile". Verbatim. */
  guidance: string | null;
  contacts: EmergencyContactResponse[];
  /** When somebody last checked the whole page against an official source. */
  lastReviewedAt: string | null;
  /** The locale **actually served**, after the fallback. */
  resolvedLocale: string;
  revision: number | null;
}

// ── Holidays ─────────────────────────────────────────────────────────────────

/** `PublicHolidayResponse`. The two closure flags are the payload; the name is the label. */
export interface PublicHolidayResponse {
  publicHolidayId: string;
  countryCode: string;
  /** Already localized. Holiday names differ across communities rather than translate. */
  name: string;
  description: string | null;
  kind: HolidayKind;
  /** Date-only in meaning; midnight UTC on the wire. */
  observedOn: string;
  /** The last day of a multi-day observance, or the same day as a single one. */
  observedUntil: string;
  year: number;
  /** The area it applies to, or null for nationwide. */
  region: string | null;
  closesGovernmentOffices: boolean;
  closesEmbassies: boolean;
  availableLocales: string[];
  revision: number | null;
}

// ── Authorities and notices ──────────────────────────────────────────────────

/**
 * `IssuingAuthorityResponse`.
 *
 * No owner, no rating, no review count — and their absence is the design. None
 * of those is a thing you do to an immigration department.
 */
export interface IssuingAuthorityResponse {
  issuingAuthorityId: string;
  countryCode: string;
  name: string;
  /** The acronym members and staff actually use. */
  shortName: string | null;
  authorityType: AuthorityType;
  description: string | null;
  website: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  /** Whether Trust has confirmed it. The gate every publication passes. */
  isVerified: boolean;
  verifiedAt: string | null;
  isActive: boolean;
  revision: number | null;
}

/** `OfficialNoticeCardResponse`. The full body is deliberately absent. */
export interface OfficialNoticeCardResponse {
  officialNoticeId: string;
  title: string;
  summary: string;
  countryCode: string;
  region: string | null;
  categoryKey: string;
  /** The category's localized label, so a card needs no second call to render. */
  categoryName: string;
  categoryIcon: string | null;
  severity: NoticeSeverity;
  status: NoticeStatus;
  verificationStatus: NoticeVerificationState;
  authorityId: string;
  authorityName: string;
  authorityShortName: string | null;
  authorityType: AuthorityType;
  /**
   * **The single most important boolean on this card.** The difference between
   * "the immigration department announced this" and "somebody typed this in".
   * Always true on a published notice — publication requires it.
   */
  isOfficial: boolean;
  /** When the **authority** issued it, which is not when this platform published it. */
  publicationDate: string | null;
  publishedAt: string | null;
  effectiveFrom: string | null;
  expiresAt: string | null;
  /** Whether this is guidance right now. Computed server-side so two clients agree. */
  isActive: boolean;
  /** Whether the expiry has passed, **whatever the status says**. */
  isExpired: boolean;
  supersededById: string | null;
  lastReviewedAt: string | null;
  viewCount: number;
  referenceCount: number;
  attachmentCount: number;
}

/** `NoticeCategoryCountResponse`. The filter chips with their badges. */
export interface NoticeCategoryCountResponse {
  key: string;
  name: string;
  icon: string | null;
  count: number;
}

// ── The country dashboard ────────────────────────────────────────────────────

/** `CountryIntelligenceStatisticsResponse`. */
export interface CountryIntelligenceStatisticsResponse {
  activeNoticeCount: number;
  /** Live notices at critical or high severity. The number that decides a banner. */
  urgentNoticeCount: number;
  embassyCount: number;
  visaAdvisoryCount: number;
  emergencyContactCount: number;
  upcomingHolidayCount: number;
  verifiedAuthorityCount: number;
  /**
   * When anything official about this country last changed.
   *
   * **Null means nothing has been published for this country yet**, which a
   * client renders as an empty state rather than as zero.
   */
  lastPublishedAt: string | null;
}

/**
 * `CountryIntelligenceResponse` — ten bands in one response.
 *
 * One call rather than ten on purpose: a country page opens on a phone,
 * frequently on the connection that is the reason somebody is reading about
 * their country, and ten round trips is ten chances to show a spinner where an
 * emergency number should be.
 *
 * Every band is short and has a corresponding paged endpoint behind it — except
 * `emergency`, which carries its **whole** content, because making somebody tap
 * through to an ambulance number would be indefensible.
 */
export interface CountryIntelligenceResponse {
  countryCode: string;
  resolvedLocale: string;
  statistics: CountryIntelligenceStatisticsResponse;
  latestNotices: OfficialNoticeCardResponse[];
  /** Critical or high and live right now. Separate from `latestNotices`, not filtered out of it. */
  safetyAlerts: OfficialNoticeCardResponse[];
  visaUpdates: OfficialNoticeCardResponse[];
  governmentAdvisories: OfficialNoticeCardResponse[];
  /** Missions **in** this country and missions **serving** its nationals. */
  embassies: EmbassyResponse[];
  emergency: EmergencyContactsResponse | null;
  /** Published advisories that apply right now. */
  consularServices: VisaAdvisoryResponse[];
  upcomingHolidays: PublicHolidayResponse[];
  officialContacts: IssuingAuthorityResponse[];
  categoryBreakdown: NoticeCategoryCountResponse[];
}

/** `EmergencyContactKindResponse`. */
export interface EmergencyContactKindResponse {
  key: string;
  /** The platform's name for it. **Editorial screens only** — readers see the country's. */
  name: string;
  icon: string | null;
  order: number;
  isEssential: boolean;
}

/** `NoticeCategoryResponse`. */
export interface NoticeCategoryResponse {
  noticeCategoryId: string;
  /** The stable key. What a URL carries and a notification preference stores. */
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  order: number;
  /** What a notice in this category is worth **before an editor decides**. PascalCase. */
  defaultSeverity: NoticeSeverity;
  alertFamily: NoticeAlertFamily;
  isActive: boolean;
  /** Editors only. */
  revision: number | null;
  /** Editors only. */
  availableLocales: string[];
}

/**
 * `OfficialNoticeSearchResponse` — **and the trap this wave was told to look for.**
 *
 * It is a hand-rolled cursor page and it names its rows **`results`**, not
 * `items`. `readPage` in `lib/platform-envelope.ts` finds a page by looking for
 * `Array.isArray(payload.items)`, so handing it this response returns an
 * **empty page with no error** — the same failure that made every comment thread
 * in this application render "no comments yet".
 *
 * `toNoticeSearchPage` in `lib/country-intelligence-api.ts` is the explicit
 * adapter, and `country-intelligence-api.integration.test.ts` pins both halves:
 * that `readPage` loses the rows, and that the adapter does not.
 *
 * Every *other* list on this surface is either `CursorPagedResult<T>` or a bare
 * array, and `readPage` absorbs those correctly.
 */
export interface OfficialNoticeSearchResponse {
  results: OfficialNoticeCardResponse[];
  nextCursor: string | null;
  hasMore: boolean;
  /** When the engine can say cheaply. **Frequently null**, which is not zero. */
  totalCount: number | null;
  /** The engine that answered. Diagnostic — the answer to "why is production different". */
  engine: string;
  /** The phrase as the engine received it, normalized. Echoed for the empty state. */
  query: string | null;
}

/** `IntelligenceCapabilitiesResponse`. */
export interface IntelligenceCapabilitiesResponse {
  categories: NoticeCategoryResponse[];
  emergencyKinds: EmergencyContactKindResponse[];
  authorityTypes: AuthorityType[];
  /** In ascending order of urgency. */
  severities: NoticeSeverity[];
  sortOptions: NoticeSortKey[];
  /** The search engine answering here. Diagnostic. */
  searchEngine: string;
  /** Whether it can answer **right now**. */
  searchAvailable: boolean;
  authorityVerificationAvailable: boolean;
  sourceValidators: string[];
  analyticsSinks: string[];
  /** How far ahead a country dashboard looks for holidays, in days. */
  holidayHorizonDays: number;
}

// ── Query shapes ─────────────────────────────────────────────────────────────

/**
 * `GET /intelligence/embassies`.
 *
 * `locatedIn` and `serving` are separate and **neither defaults to the other**.
 * A client that wants both sends both.
 */
export interface EmbassyDirectoryQuery {
  /** Missions physically in this country. */
  locatedIn?: string;
  /** Missions serving this country's nationals. */
  serving?: string;
  verifiedOnly?: boolean;
  /** Free text over the mission's name and city. The parameter is `q`. */
  q?: string;
  cursor?: string;
  limit?: number;
  locale?: string;
}

/** `GET /intelligence/countries/{countryCode}/visas`. */
export interface VisaAdvisoryQuery {
  /**
   * A nationality. Matches advisories naming it **and** those naming nobody.
   * Omitted, every advisory for the destination comes back regardless.
   */
  appliesTo?: string;
  /** Only advisories inside their effective window. **Defaults to true** on the server. */
  activeOnly?: boolean;
  cursor?: string;
  limit?: number;
  locale?: string;
}

/** `GET /intelligence/countries/{countryCode}/holidays`. A range wins over a year. */
export interface PublicHolidayQuery {
  year?: number;
  from?: string;
  until?: string;
  locale?: string;
}

/**
 * `GET /intelligence/notices`.
 *
 * `severity` and `status` are **single values** on the wire that the endpoint
 * wraps into the handler's lists — sending a comma-joined string would be
 * matched as one literal severity and would quietly return nothing.
 */
export interface OfficialNoticeListQuery {
  countryCode?: string;
  category?: string;
  severity?: NoticeSeverity;
  /** Everything at or above this level. Distinct from `severity`, which is exact. */
  minimumSeverity?: NoticeSeverity;
  authorityId?: string;
  language?: string;
  q?: string;
  officialOnly?: boolean;
  activeOnly?: boolean;
  expiredOnly?: boolean;
  status?: NoticeStatus;
  includeArchived?: boolean;
  sort?: NoticeSortKey;
  cursor?: string;
  limit?: number;
  locale?: string;
}

/** `GET /intelligence/search`. */
export interface OfficialNoticeSearchQuery {
  q?: string;
  countryCode?: string;
  /** One category key. The endpoint wraps it into the handler's list. */
  category?: string;
  severity?: NoticeSeverity;
  language?: string;
  officialOnly?: boolean;
  activeOnly?: boolean;
  sort?: NoticeSortKey;
  cursor?: string;
  limit?: number;
  locale?: string;
}
