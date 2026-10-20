// ═════════════════════════════════════════════════════════════════════════════
// Diaspora Platform — Trust development handlers for the REAL contract
// (Remediation Wave D-4)
//
// **Every shape here was written from `Diaspora.Modules.Trust`'s own contract**,
// not from what `lib/trust-api.ts` expects — which is why the wire types below
// are declared in this file rather than imported from `@/types/trust`. Typing
// this handler with the client's own types would make it impossible for
// TypeScript to ever show a divergence between the two: the mock would agree
// with the client by construction.
//
//   > A development handler written from the client's expectations proves the
//   > client is self-consistent. It proves nothing about the platform.
//
// ── What the previous version of this file got wrong ─────────────────────────
//
// It served eight routes. **Six of them do not exist on the server**, and the
// two that do were the wrong shape. In full:
//
//   1. `POST /trust/verify/identity`        — no such route. It is
//      `/trust/verifications/identity`, and `verification/identity.tsx` was
//      posting to the invented one against the real client.
//   2. `POST /trust/verify/diaspora`        — no such route.
//   3. `POST /trust/verify/diaspora/appeal` — no such route. A verification
//      appeal is `POST /trust/appeals` with `type: 'Verification'`.
//   4. `POST /trust/community-voting`       — no such route. It is
//      `POST /trust/contributions/confirmations`, and its body is nothing like
//      `{ updateId }`.
//   5. `GET /trust/audit`                   — **Trust has no audit route at
//      all.** It has a *trust timeline*, which is a different thing about a
//      different subject.
//   6. `POST /trust/privacy`                — Trust does not own privacy
//      settings and has never had a route for them.
//   7. `GET /trust/profile` existed, but returned eight of its fifteen fields.
//      No `userId`, no `trustLevel`, no `badges`, no `countryReputations`, no
//      `experienceTimeline`, no `joinedAt`, no `riskLevel` — and `verifications`
//      carried **four** keys where the server returns one per supported type,
//      thirteen today.
//   8. `POST /trust/appeals` existed and answered **200**. Submissions on this
//      module answer **201**, and the response was missing `explanation`,
//      `isCorrectionRequest`, `evidenceCount` and `resolvedAt`.
//
// Two more, worth naming separately because they are the kind that make a
// broken thing look like a working feature:
//
//   9. `riskScore: 15` was returned **unconditionally**. The server omits
//      `riskScore` and `riskLevel` entirely unless the caller holds
//      `trust:verification:review`, precisely so a member cannot read their own
//      risk number. A handler that always sends it makes the client's
//      staff-only branch untestable and always true.
//  10. Every submission response invented fields the server does not have —
//      `message`, `request`, `docType`, `country` — and returned identifiers
//      like `verify-1763...` where the server returns a GUID.
//
// ── The refusals this file ENFORCES rather than describes ────────────────────
//
//  1. **Submissions answer 201, not 200.** `PlatformResults.Created`.
//  2. **A diaspora submission whose nationality equals its residence country is
//     auto-rejected**, at 201, with `status: 'Rejected'` and
//     `rejectionReasonCode: 'NOT_DIASPORA_ELIGIBLE'`. It is not an error — the
//     submission succeeded and the claim failed, and a client that treated the
//     HTTP status as the answer would show a success screen.
//  3. **An expired document is auto-rejected** the same way, with
//     `EXPIRED_DOCUMENT`.
//  4. **A second open verification of the same type is a 409**
//     `trust.verification.duplicate`.
//  5. **A second open appeal against the same target is a 409**
//     `trust.appeal.already-open`.
//  6. **An appeal against a non-appealable verification is a 409**
//     `trust.appeal.not-allowed`. Only `Rejected`, `Revoked` and
//     `PartiallyApproved` can be appealed.
//  7. **An appeal reason shorter than 20 characters is a 400.**
//  8. **A diaspora submission without a selfie is a 400** from the type
//     handler, even though the DTO declares `SelfieReference` as optional.
//     Likewise a country submission without an arrival date.
//  9. **The staff routes answer 403** unless the caller opts in — see
//     `setTrustMockStaff`. A queue that returns rows to everyone is a queue
//     whose authorisation nobody has tested.
//
// ── The properties this file MODELS rather than refuses ──────────────────────
//
// 10. **`verifications` on the profile carries one key per supported type**,
//     thirteen of them, and types never attempted read `Pending`.
// 11. **`riskScore`/`riskLevel` appear only in staff mode.**
// 12. **Paged routes return an offset `PagedResult`** — `items`, `page`,
//     `pageSize`, `totalCount`, `totalPages`, `hasNextPage`, `hasPreviousPage`
//     — inside `data`. `pageSize` is clamped to 50.
// 13. **`GET /trust/badges/me` and `GET /trust/feature-requirements` return a
//     bare array**, with no page around it and no total.
// 14. **Enum casing is per-enum.** `dimension` is lowercase,
//     `rejectionReasonCode` and eligibility `code` are SCREAMING_SNAKE,
//     everything else is PascalCase. Reproduced exactly, because a client that
//     normalises one of them breaks the others.
// 15. **A mistyped filter is dropped, not refused** — `?status=aproved` answers
//     200 with the unfiltered list.
// 16. **An appeal review decision that is not `Approve` or `Escalate` rejects
//     the appeal**, including a typo, an empty string and `"approved"`.
// 17. **An unknown eligibility capability is allowed**, because Trust does not
//     gate what nobody asked it to gate.
// 18. **`documentUrl` is null.** A presigned link needs a storage provider; the
//     dev handler has none, and inventing a URL would hide that the real one
//     can also be null.
//
// ── What is deliberately NOT here ────────────────────────────────────────────
//
// No `/trust/audit`, no `/trust/privacy`, no `/trust/verify/*`, no
// `/trust/community-voting`. Those paths 404 now, which is what they do in
// production. A screen that still calls one will fail loudly in development
// instead of silently in the field.
// ═════════════════════════════════════════════════════════════════════════════

import type MockAdapter from 'axios-mock-adapter';

const ROOT = '/trust';

type Reply = [number, unknown];

// ── Wire shapes, from the contract ───────────────────────────────────────────
//
// `string` wherever the server emits an enum, so this file cannot inherit the
// client's opinion about what the vocabulary is.

interface WireBadge {
  type: string;
  label: string;
  since: number | null;
  countryCode: string | null;
  awardedAt: string;
}

interface WireCountryStanding {
  countryCode: string;
  countryName: string;
  flag: string;
  points: number;
  level: string;
  stars: number;
  isVerified: boolean;
}

interface WireCountryExperience {
  countryCode: string;
  countryName: string;
  flag: string;
  startYear: number;
  endYear: number | null;
  isVerified: boolean;
  role: string;
  yearsOfResidence: number;
}

interface WireVerification {
  verificationId: string;
  userId: string;
  type: string;
  status: string;
  submittedAt: string;
  reviewedAt: string | null;
  expiresAt: string | null;
  rejectionReasonCode: string | null;
  rejectionReasonDetails: string | null;
  nationality: string | null;
  residenceCountry: string | null;
  targetCountry: string | null;
  arrivalDate: string | null;
  expertiseAreas: string[];
  documentCount: number;
  canAppeal: boolean;
}

interface WireVerificationDocument {
  documentId: string;
  documentType: string;
  status: string;
  documentUrl: string | null;
  originalFileName: string | null;
  sizeInBytes: number;
  documentNumber: string | null;
  issuingCountry: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  version: number;
  reviewComment: string | null;
  uploadedAt: string;
}

interface WireAppeal {
  appealId: string;
  type: string;
  targetId: string;
  reason: string;
  status: string;
  explanation: string | null;
  isCorrectionRequest: boolean;
  evidenceCount: number;
  createdAt: string;
  resolvedAt: string | null;
}

// ── Identities ───────────────────────────────────────────────────────────────

const DEV_MEMBER_ID = '00000000-0000-4000-b000-00000000da01';
const OTHER_MEMBER_ID = '00000000-0000-4000-b000-00000000da02';

/**
 * The thirteen verification types the server's handler registry supplies.
 *
 * Hard-coded here rather than imported so that if the platform adds a
 * fourteenth and this list is not updated, the divergence shows up as a missing
 * checklist row in development instead of in production.
 */
const SUPPORTED_VERIFICATION_TYPES = [
  'Phone',
  'Email',
  'Identity',
  'Country',
  'Professional',
  'Business',
  'Organization',
  'Embassy',
  'Diaspora',
  'Residence',
  'Employment',
  'CommunityGuide',
  'Contributor',
] as const;

/** `VerificationWorkflow.IsAppealable`. */
const APPEALABLE_STATUSES = new Set(['Rejected', 'Revoked', 'PartiallyApproved']);

/** Verification statuses that count as an open request for the duplicate rule. */
const OPEN_STATUSES = new Set([
  'Submitted',
  'Pending',
  'UnderReview',
  'NeedMoreInfo',
  'UnderInvestigation',
  'Appealed',
]);

const APPEAL_OPEN_STATUSES = new Set(['Pending', 'UnderReview', 'Escalated']);

/**
 * Document types each handler accepts. Copied from
 * `Extensibility/Handlers/VerificationTypeHandlers.cs` — a submission carrying
 * anything else is a 400, and the sets genuinely differ per type. `Other` is
 * accepted for Diaspora and Country and **not** for Identity, which is the
 * asymmetry that makes a coerced `documentType` dangerous.
 */
const ACCEPTED_DOCUMENTS: Record<string, readonly string[]> = {
  Diaspora: [
    'Passport',
    'ResidencePermit',
    'WorkPermit',
    'OccupationPermit',
    'StudentPermit',
    'Visa',
    'GovernmentImmigrationDocuments',
    'Other',
  ],
  Identity: [
    'Passport',
    'NationalId',
    'DriverLicense',
    'ResidencePermit',
    'WorkPermit',
    'StudentPermit',
  ],
  Country: [
    'PassportStamp',
    'ResidencePermit',
    'WorkPermit',
    'StudentVisa',
    'Visa',
    'UtilityBill',
    'BankStatement',
    'ProofOfAddress',
    'Other',
  ],
};

// ── The envelope and the problem document ────────────────────────────────────

function meta() {
  return { requestId: 'dev', correlationId: 'dev', timestamp: 'dev' };
}

function ok(data: unknown): Reply {
  return [200, { data, meta: meta() }];
}

/** `PlatformResults.Created` — 201 with the same envelope, no Location header. */
function created(data: unknown): Reply {
  return [201, { data, meta: meta() }];
}

function problem(statusCode: number, code: string, title: string, detail: string): Reply {
  return [
    statusCode,
    {
      type: `https://diaspora.app/errors/${code.toLowerCase()}`,
      title,
      status: statusCode,
      detail,
      code,
      correlationId: 'dev',
      traceId: 'dev',
      timestamp: 'dev',
    },
  ];
}

const validation = (code: string, detail: string) => problem(400, code, 'Validation failed', detail);
const notFound = (code: string, detail: string) => problem(404, code, 'Not found', detail);
const conflict = (code: string, detail: string) => problem(409, code, 'Conflict', detail);
const forbidden = (code: string, detail: string) => problem(403, code, 'Forbidden', detail);

const staffOnly = () =>
  forbidden(
    'authorization.forbidden',
    'You do not hold the permission required for this operation.'
  );

/**
 * `PagedResult<T>` as it lands on the wire.
 *
 * Seven fields, none of them optional, and `totalPages` is a ceiling division
 * rather than a floor — `PagedResult.cs:22`.
 */
function paged<T>(rows: T[], page: number, pageSize: number): Reply {
  const totalCount = rows.length;
  const size = Math.min(50, Math.max(1, pageSize));
  const current = Math.max(1, page);
  const start = (current - 1) * size;

  return ok({
    items: rows.slice(start, start + size),
    page: current,
    pageSize: size,
    totalCount,
    totalPages: Math.ceil(totalCount / size),
    hasNextPage: current < Math.ceil(totalCount / size),
    hasPreviousPage: current > 1,
  });
}

// ── Request reading ──────────────────────────────────────────────────────────

function body(config: { data?: unknown }): Record<string, unknown> {
  if (typeof config.data !== 'string') {
    const data = config.data;
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  }
  try {
    const parsed: unknown = JSON.parse(config.data);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * A query value, from either the params object or the URL.
 *
 * axios puts a `params` object on the config and only serialises it later, so a
 * handler that only read the URL would see no parameters on any request this
 * client makes.
 */
function query(config: { params?: unknown; url?: string }, name: string): string | null {
  const source = config.params;
  if (source && typeof source === 'object') {
    const value = (source as Record<string, unknown>)[name];
    if (value !== undefined && value !== null && value !== '') return String(value);
  }
  const match = new RegExp(`[?&]${name}=([^&]*)`).exec(config.url ?? '');
  if (!match) return null;
  const decoded = decodeURIComponent(match[1]);
  return decoded.length > 0 ? decoded : null;
}

function pageOf(config: { params?: unknown; url?: string }): { page: number; pageSize: number } {
  const page = Number(query(config, 'page') ?? '1');
  const pageSize = Number(query(config, 'pageSize') ?? '20');
  return {
    page: Number.isFinite(page) ? page : 1,
    pageSize: Number.isFinite(pageSize) ? pageSize : 20,
  };
}

function path(url: string | undefined): string {
  return (url ?? '').split('?')[0];
}

function segments(url: string | undefined): string[] {
  return path(url)
    .split('/')
    .filter((part) => part.length > 0)
    .map((part) => decodeURIComponent(part));
}

function text(source: Record<string, unknown>, name: string): string | null {
  const value = source[name];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function list(source: Record<string, unknown>, name: string): string[] {
  const value = source[name];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * A filter, dropped when it does not parse — exactly as `TryParse<TEnum>` does.
 *
 * Returning null for an unrecognised value is what makes `?status=aproved`
 * answer 200 with the unfiltered list rather than a 400. This is modelled, not
 * corrected.
 */
function filter(config: { params?: unknown; url?: string }, name: string, allowed: readonly string[]): string | null {
  const value = query(config, name);
  if (value === null) return null;
  const match = allowed.find((candidate) => candidate.toLowerCase() === value.toLowerCase());
  return match ?? null;
}

function guid(seed: number): string {
  return `00000000-0000-4000-a000-${seed.toString(16).padStart(12, '0')}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Staff mode ───────────────────────────────────────────────────────────────

/**
 * Whether this session holds the staff permissions.
 *
 * The real answer comes from the bearer token's permission claims, which a
 * development handler cannot see. Rather than guess — and rather than serve the
 * queues to everybody, which is what makes an authorisation bug invisible — the
 * default is **off** and a test or a developer opts in explicitly.
 */
let staffMode = false;

/**
 * Turns staff permissions on or off for the dev handler.
 *
 * Affects three things, matching the server: the two staff queues and the
 * review routes become reachable, and `GET /trust/profile` starts including
 * `riskScore` and `riskLevel`.
 */
export function setTrustMockStaff(enabled: boolean): void {
  staffMode = enabled;
}

// ── In-memory store ──────────────────────────────────────────────────────────

const verifications = new Map<string, WireVerification>();
const documents = new Map<string, WireVerificationDocument[]>();
const appeals = new Map<string, WireAppeal>();
let timeline: {
  eventId: string;
  type: string;
  label: string;
  timestamp: string;
  icon: string;
  description: string | null;
  countryCode: string | null;
}[] = [];
let reputationEvents: {
  eventId: string;
  userId: string;
  eventType: string;
  dimension: string;
  points: number;
  sourceType: string | null;
  sourceId: string | null;
  countryCode: string | null;
  description: string | null;
  createdAt: string;
}[] = [];
const confirmed = new Set<string>();
let sequence = 0;

function nextId(): string {
  sequence += 1;
  return guid(sequence);
}

function seed(): void {
  // One approved country verification and one rejected diaspora verification.
  // The rejected one is what makes the appeal path reachable at all — the
  // previous handler had no verification a member could appeal against, which
  // is why nothing ever exercised `canAppeal`.
  const approved: WireVerification = {
    verificationId: guid(0x101),
    userId: DEV_MEMBER_ID,
    type: 'Country',
    status: 'Approved',
    submittedAt: '2026-02-01T09:00:00Z',
    reviewedAt: '2026-02-10T11:30:00Z',
    expiresAt: '2028-02-10T11:30:00Z',
    rejectionReasonCode: null,
    rejectionReasonDetails: null,
    nationality: null,
    residenceCountry: null,
    targetCountry: 'GB',
    arrivalDate: '2024-03-01',
    expertiseAreas: ['Housing', 'Immigration'],
    documentCount: 1,
    canAppeal: false,
  };

  const rejected: WireVerification = {
    verificationId: guid(0x102),
    userId: DEV_MEMBER_ID,
    type: 'Diaspora',
    status: 'Rejected',
    submittedAt: '2026-03-04T08:15:00Z',
    reviewedAt: '2026-03-05T16:40:00Z',
    expiresAt: null,
    rejectionReasonCode: 'ILLEGIBLE_DOCUMENT',
    rejectionReasonDetails: 'The scan of your passport page could not be read.',
    nationality: 'MU',
    residenceCountry: 'GB',
    targetCountry: null,
    arrivalDate: null,
    expertiseAreas: [],
    documentCount: 1,
    canAppeal: true,
  };

  verifications.set(approved.verificationId, approved);
  verifications.set(rejected.verificationId, rejected);

  documents.set(approved.verificationId, [
    {
      documentId: guid(0x201),
      documentType: 'ResidencePermit',
      status: 'Accepted',
      // Null, and it stays null. A presigned link needs a storage provider.
      documentUrl: null,
      originalFileName: 'permit.jpg',
      sizeInBytes: 402_133,
      documentNumber: 'RP-88213',
      issuingCountry: 'GB',
      issuedOn: '2024-02-20',
      expiresOn: '2028-02-19',
      version: 1,
      reviewComment: 'Legible and current.',
      uploadedAt: '2026-02-01T09:00:00Z',
    },
  ]);

  documents.set(rejected.verificationId, [
    {
      documentId: guid(0x202),
      documentType: 'Passport',
      status: 'Rejected',
      documentUrl: null,
      originalFileName: 'passport.jpg',
      sizeInBytes: 1_204_882,
      documentNumber: null,
      issuingCountry: 'MU',
      issuedOn: null,
      expiresOn: null,
      version: 1,
      reviewComment: 'Photo page is blurred.',
      uploadedAt: '2026-03-04T08:15:00Z',
    },
  ]);

  timeline = [
    {
      eventId: guid(0x301),
      type: 'ProfileOpened',
      label: 'Joined Diaspora',
      timestamp: '2026-01-15T10:00:00Z',
      icon: '👋',
      description: 'Created an account.',
      countryCode: null,
    },
    {
      eventId: guid(0x302),
      type: 'VerificationSubmitted',
      label: 'Country verification submitted',
      timestamp: '2026-02-01T09:00:00Z',
      icon: '📄',
      description: 'Your documents were sent for compliance review.',
      countryCode: 'GB',
    },
    {
      eventId: guid(0x303),
      type: 'VerificationApproved',
      label: 'Residency verified in GB',
      timestamp: '2026-02-10T11:30:00Z',
      icon: '✅',
      description: 'Approved by the compliance team.',
      countryCode: 'GB',
    },
  ];

  reputationEvents = [
    {
      eventId: guid(0x401),
      userId: DEV_MEMBER_ID,
      eventType: 'GuidePublished',
      // Lowercase. The C# enum members are literally lowercase.
      dimension: 'contribution',
      points: 30,
      sourceType: 'guide',
      sourceId: guid(0x501),
      countryCode: 'GB',
      description: 'Guide published.',
      createdAt: '2026-05-02T12:00:00Z',
    },
    {
      eventId: guid(0x402),
      userId: DEV_MEMBER_ID,
      eventType: 'CountryVerified',
      dimension: 'verification',
      points: 30,
      sourceType: null,
      sourceId: null,
      countryCode: 'GB',
      description: 'Residency verified.',
      createdAt: '2026-02-10T11:30:00Z',
    },
    {
      eventId: guid(0x403),
      userId: DEV_MEMBER_ID,
      eventType: 'ViolationRecorded',
      dimension: 'trust',
      // Signed. Violations are negative — a client that rendered `+{points}`
      // unconditionally would show "+-20".
      points: -20,
      sourceType: 'comment',
      sourceId: guid(0x502),
      countryCode: null,
      description: 'Comment removed.',
      createdAt: '2026-06-18T20:05:00Z',
    },
  ];
}

/**
 * Clears everything this handler remembers and re-seeds it.
 *
 * Exported for the tests, which need a known store at the start of each case.
 * Nothing in the application calls it.
 */
export function resetTrustMocks(): void {
  verifications.clear();
  documents.clear();
  appeals.clear();
  confirmed.clear();
  timeline = [];
  reputationEvents = [];
  sequence = 0;
  staffMode = false;
  seed();
}

seed();

// ── Projections ──────────────────────────────────────────────────────────────

const BADGES: WireBadge[] = [
  {
    type: 'PhoneVerified',
    // Composed server-side, emoji included — `BadgeLabels.For`.
    label: '📱 Phone Verified',
    since: 2026,
    countryCode: null,
    awardedAt: '2026-01-15T10:05:00Z',
  },
  {
    type: 'CountryVerified',
    label: '🇬🇧 United Kingdom Verified',
    since: 2026,
    countryCode: 'GB',
    awardedAt: '2026-02-10T11:30:00Z',
  },
];

const COUNTRY_STANDINGS: WireCountryStanding[] = [
  {
    countryCode: 'GB',
    countryName: 'United Kingdom',
    flag: '🇬🇧',
    points: 300,
    // `CommunityAmbassador` is the top rung, not `Ambassador`. This one is
    // mid-ladder, but the vocabulary is the same enum.
    level: 'VerifiedResident',
    stars: 3,
    isVerified: true,
  },
  {
    countryCode: 'MU',
    countryName: 'Mauritius',
    flag: '🇲🇺',
    points: 1450,
    level: 'CommunityExpert',
    stars: 5,
    isVerified: false,
  },
];

const EXPERIENCE: WireCountryExperience[] = [
  {
    countryCode: 'GB',
    countryName: 'United Kingdom',
    flag: '🇬🇧',
    startYear: 2024,
    endYear: null,
    isVerified: true,
    role: 'Verified Resident',
    yearsOfResidence: 2,
  },
];

/**
 * The verification checklist.
 *
 * **One key per supported type**, thirteen of them, seeded to `Pending` and
 * then overwritten by whatever the member actually submitted, oldest first so
 * the newest wins — `ProfileQueries.cs:92-106`.
 */
function verificationMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const type of SUPPORTED_VERIFICATION_TYPES) {
    // `NotStarted` since 20 Oct 2026: `Pending` now means a case awaiting review.
    map[type] = 'NotStarted';
  }

  const mine = [...verifications.values()]
    .filter((item) => item.userId === DEV_MEMBER_ID)
    .sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt));

  for (const item of mine) {
    map[item.type] = item.status;
  }

  // Phone and Email mirror Identity's own outcome and auto-approve server-side.
  map.Phone = 'Approved';
  map.Email = 'Approved';

  return map;
}

function trustProfile(): Record<string, unknown> {
  const base: Record<string, unknown> = {
    userId: DEV_MEMBER_ID,
    trustLevel: 'Verified',
    healthStatus: {
      // `UnderReview`, never `'Under Review'` — no C# enum can carry a space.
      health: 'Good',
      violationsCount: 1,
      warningsCount: 0,
      activeAppealsCount: [...appeals.values()].filter((item) =>
        APPEAL_OPEN_STATUSES.has(item.status)
      ).length,
      spamReportsCount: 0,
      reasons: [],
    },
    verifications: verificationMap(),
    badges: BADGES,
    countryReputations: COUNTRY_STANDINGS,
    experienceTimeline: EXPERIENCE,
    joinedAt: '2026-01-15T10:00:00Z',
    trustLevelChangedAt: '2026-02-10T11:30:00Z',
  };

  // Staff only. Absent, not null, for an ordinary member — the properties are
  // `int?`/`string?` and the mapper sets them to null, which System.Text.Json
  // emits as `null`; either way the client must not read a number.
  if (staffMode) {
    base.riskScore = 18;
    base.riskLevel = 'Low';
  }

  return base;
}

function reputationProfile(): Record<string, unknown> {
  return {
    userId: DEV_MEMBER_ID,
    contributionScore: 180,
    verificationScore: 60,
    trustScore: 110,
    combinedScore: 350,
    level: 'TrustedContributor',
    nextLevel: {
      // `CommunityExpert` at 1000 — `ReputationThresholds`.
      name: 'CommunityExpert',
      minScore: 1000,
      pointsNeeded: 650,
    },
    guidesPublished: 4,
    guidesApproved: 3,
    updatesPublished: 12,
    updatesVerified: 9,
    commentsWritten: 46,
    guidesUpdated: 2,
    phoneVerified: true,
    emailVerified: true,
    governmentIdVerified: false,
    profilePhotoAdded: true,
    profileCompleted: true,
    providerVerified: false,
    countryVerificationsCount: 1,
    helpfulVotesReceived: 22,
    communityConfirmationsReceived: 7,
    violationCount: 1,
    reportsResolved: 0,
    noViolationStreakDays: 61,
    badges: BADGES,
    levelBenefits: {
      canPublishImmediately: true,
      canModerate: false,
      isFeaturedEligible: true,
      isRewardsEligible: true,
      hasBetaAccess: false,
      hasExclusiveBadge: false,
      searchBoostFactor: 1.2,
    },
    lastCalculatedAt: '2026-08-01T00:00:00Z',
    levelChangedAt: '2026-05-02T12:00:00Z',
  };
}

/**
 * The unlock checklist, as `EligibilityEvaluator.DescribeRequirementsAsync`
 * builds it.
 *
 * Seven capabilities, ordered by name, and the country-scoped lines read
 * `0 / N pts` when no `targetCountry` was supplied — because "150 points" is
 * always 150 points *somewhere*.
 */
function featureRequirements(targetCountry: string | null): unknown[] {
  const standing = targetCountry
    ? COUNTRY_STANDINGS.find((item) => item.countryCode === targetCountry.toUpperCase())
    : undefined;
  const points = standing?.points ?? 0;
  const verified = standing?.isVerified ?? false;
  const years = standing?.countryCode === 'GB' ? 2 : 0;

  const build = (
    featureId: string,
    name: string,
    minReputation: number,
    minYears: number,
    requiresIdentity: boolean
  ) => {
    const requirements: { description: string; isMet: boolean; currentProgress: string }[] = [
      {
        description: 'Verified Phone Number',
        isMet: true,
        currentProgress: 'Verified',
      },
    ];

    if (requiresIdentity) {
      requirements.push({
        description: 'Government ID Verification',
        isMet: false,
        currentProgress: 'Unverified',
      });
    }

    requirements.push({
      description: targetCountry ? `Verified Residency in ${targetCountry}` : 'Verified Residency',
      isMet: verified,
      currentProgress: verified ? 'Verified' : 'Unverified',
    });

    if (minReputation > 0) {
      requirements.push({
        description: `Country Reputation Points (Requires ${minReputation})`,
        isMet: points >= minReputation,
        currentProgress: `${points} / ${minReputation} pts`,
      });
    }

    if (minYears > 0) {
      const plural = minYears > 1 ? 's' : '';
      requirements.push({
        description: `Residence Duration (Requires ${minYears} year${plural})`,
        isMet: years >= minYears,
        currentProgress: `${years} / ${minYears} yr${plural}`,
      });
    }

    return {
      featureId,
      name,
      isUnlocked: requirements.every((item) => item.isMet),
      requirements,
    };
  };

  return [
    build('updates', 'Community Updates', 10, 0, false),
    build('guide-programme', 'Community Guide Programme', 1000, 3, true),
    build('comment', 'Commenting', 10, 0, false),
    // 14–15 Sep 2026: no Trust thresholds for posting a job, a guide, a home or
    // an item — a verified account is enough, and the service that takes the
    // post checks that. Mirrors `DefaultTrustRequirements`.
    { featureId: 'guides', name: 'Guide Publishing', isUnlocked: true, requirements: [] },
    { featureId: 'housing', name: 'Housing Listing', isUnlocked: true, requirements: [] },
    { featureId: 'jobs', name: 'Job Posting', isUnlocked: true, requirements: [] },
    { featureId: 'marketplace', name: 'Marketplace Directory Selling', isUnlocked: true, requirements: [] },
  ];
}

// ── Submission ───────────────────────────────────────────────────────────────

/**
 * Runs a submission through the parts of the workflow a client can observe.
 *
 * The duplicate check, the type handler's validation, then the automatic
 * decision pass. The order matters: a duplicate is a 409 before anything is
 * validated, and an automatic rejection is a **successful 201** carrying a
 * rejected verification.
 */
function submit(input: {
  type: string;
  documentType: string;
  nationality?: string | null;
  residenceCountry?: string | null;
  targetCountry?: string | null;
  arrivalDate?: string | null;
  expertiseAreas?: string[];
  selfieReference?: string | null;
  documentReference?: string | null;
  documentNumber?: string | null;
  issuingCountry?: string | null;
  issuedOn?: string | null;
  expiresOn?: string | null;
}): Reply {
  const openDuplicate = [...verifications.values()].find(
    (item) =>
      item.userId === DEV_MEMBER_ID && item.type === input.type && OPEN_STATUSES.has(item.status)
  );

  if (openDuplicate) {
    return conflict(
      'trust.verification.duplicate',
      'You already have a verification of this type in progress.'
    );
  }

  if (!input.documentReference) {
    return validation(
      'trust.verification.type-unsupported',
      'At least one supporting document is required.'
    );
  }

  const accepted = ACCEPTED_DOCUMENTS[input.type];
  if (accepted && !accepted.includes(input.documentType)) {
    return validation(
      'trust.verification.type-unsupported',
      `'${input.documentType}' is not accepted for ${input.type} verification.`
    );
  }

  // `RequiresSelfie` is true for Diaspora and Identity. The diaspora DTO
  // declares the field optional and the handler rejects without it, which is
  // the divergence this branch exists to reproduce.
  if ((input.type === 'Diaspora' || input.type === 'Identity') && !input.selfieReference) {
    return validation(
      'trust.verification.type-unsupported',
      'A biometric selfie is required for this verification.'
    );
  }

  if (input.type === 'Diaspora') {
    if (!input.nationality) {
      return validation('trust.verification.type-unsupported', 'Nationality is required.');
    }
    if (!input.residenceCountry) {
      return validation(
        'trust.verification.type-unsupported',
        'Country of residence is required.'
      );
    }
  }

  if (input.type === 'Country') {
    if (!input.targetCountry) {
      return validation('trust.verification.type-unsupported', 'A target country is required.');
    }
    // Optional on the DTO, required by the handler.
    if (!input.arrivalDate) {
      return validation('trust.verification.type-unsupported', 'An arrival date is required.');
    }
  }

  const verificationId = nextId();
  const now = new Date().toISOString();

  let status = 'Pending';
  let rejectionReasonCode: string | null = null;
  let rejectionReasonDetails: string | null = null;
  let reviewedAt: string | null = null;

  // ── Automatic decisions ──────────────────────────────────────────────────
  //
  // Expiry first, because the base handler checks it before any type-specific
  // rule. Both outcomes are a 201 carrying a rejected verification — the
  // submission is what succeeded.
  if (input.expiresOn && input.expiresOn < today()) {
    status = 'Rejected';
    rejectionReasonCode = 'EXPIRED_DOCUMENT';
    rejectionReasonDetails = 'The document you submitted has expired.';
    reviewedAt = now;
  } else if (
    input.type === 'Diaspora' &&
    input.nationality &&
    input.residenceCountry &&
    input.nationality.toUpperCase() === input.residenceCountry.toUpperCase()
  ) {
    status = 'Rejected';
    rejectionReasonCode = 'NOT_DIASPORA_ELIGIBLE';
    rejectionReasonDetails =
      'Diaspora is for people living outside their country of origin. Your declared ' +
      'nationality and country of residence are the same.';
    reviewedAt = now;
  }

  const record: WireVerification = {
    verificationId,
    userId: DEV_MEMBER_ID,
    type: input.type,
    status,
    submittedAt: now,
    reviewedAt,
    expiresAt: null,
    rejectionReasonCode,
    rejectionReasonDetails,
    nationality: input.nationality ?? null,
    residenceCountry: input.residenceCountry ?? null,
    targetCountry: input.targetCountry ?? null,
    arrivalDate: input.arrivalDate ?? null,
    expertiseAreas: input.expertiseAreas ?? [],
    documentCount: 1,
    canAppeal: APPEALABLE_STATUSES.has(status),
  };

  verifications.set(verificationId, record);
  documents.set(verificationId, [
    {
      documentId: nextId(),
      documentType: input.documentType,
      status: 'Pending',
      documentUrl: null,
      originalFileName: null,
      sizeInBytes: 0,
      documentNumber: input.documentNumber ?? null,
      issuingCountry: input.issuingCountry ?? null,
      issuedOn: input.issuedOn ?? null,
      expiresOn: input.expiresOn ?? null,
      version: 1,
      reviewComment: null,
      uploadedAt: now,
    },
  ]);

  timeline = [
    {
      eventId: nextId(),
      type: 'VerificationSubmitted',
      label: `${input.type} verification submitted`,
      timestamp: now,
      icon: '📄',
      description: 'Your documents were sent for compliance review.',
      countryCode: input.targetCountry ?? null,
    },
    ...timeline,
  ];

  return created(record);
}

// ── Handlers ─────────────────────────────────────────────────────────────────

export function setupTrustMocks(mock: MockAdapter): void {
  // Registered specific-before-generic. axios-mock-adapter matches in
  // registration order, and `/trust/verifications/{id}` would otherwise swallow
  // `/trust/verifications/queue` and all three submission routes.

  // ── Profile ──────────────────────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/profile(\\?.*)?$`)).reply(() => ok(trustProfile()));

  mock.onGet(new RegExp(`${ROOT}/profiles/[^/?]+(\\?.*)?$`)).reply((config) => {
    const userId = segments(config.url).pop() ?? '';

    // 404 for a member with no trust profile row. The *self* route synthesises
    // an empty profile; this one does not, and a client that assumed symmetry
    // would treat a brand-new member as an error.
    if (userId !== DEV_MEMBER_ID && userId !== OTHER_MEMBER_ID) {
      return notFound('trust.profile.not-found', 'That member has no trust profile.');
    }

    return ok({
      userId,
      trustLevel: 'Verified',
      reputationLevel: 'TrustedContributor',
      badges: BADGES,
      // Verified standings only, in the public projection.
      countryReputations: COUNTRY_STANDINGS.filter((item) => item.isVerified),
      isVerifiedMember: true,
      memberSince: '2026-01-15T10:00:00Z',
    });
  });

  mock.onGet(new RegExp(`${ROOT}/timeline(\\?.*)?$`)).reply((config) => {
    const { page, pageSize } = pageOf(config);
    return paged(timeline, page, pageSize);
  });

  // A bare array. No page, no total.
  mock.onGet(new RegExp(`${ROOT}/badges/me(\\?.*)?$`)).reply(() => ok(BADGES));

  // ── Verifications ────────────────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/verifications/queue(\\?.*)?$`)).reply((config) => {
    if (!staffMode) return staffOnly();

    const { page, pageSize } = pageOf(config);
    const typeFilter = filter(config, 'type', SUPPORTED_VERIFICATION_TYPES);

    const rows = [...verifications.values()]
      .filter((item) => OPEN_STATUSES.has(item.status))
      .filter((item) => typeFilter === null || item.type === typeFilter)
      .map((item) => ({
        verificationId: item.verificationId,
        userId: item.userId,
        type: item.type,
        status: item.status,
        submittedAt: item.submittedAt,
        reviewDueAt: null,
        isOverdue: false,
        assignedReviewerId: null,
        documentCount: item.documentCount,
        targetCountry: item.targetCountry,
        submitterTier: 'Verified',
        submitterViolationCount: 1,
      }));

    return paged(rows, page, pageSize);
  });

  mock.onPost(new RegExp(`${ROOT}/verifications/diaspora$`)).reply((config) => {
    const request = body(config);
    return submit({
      type: 'Diaspora',
      documentType: text(request, 'documentType') ?? 'Other',
      nationality: text(request, 'nationality'),
      residenceCountry: text(request, 'residenceCountry'),
      selfieReference: text(request, 'selfieReference'),
      documentReference: text(request, 'documentReference'),
      documentNumber: text(request, 'documentNumber'),
      issuingCountry: text(request, 'issueCountry'),
      issuedOn: text(request, 'issueDate'),
      expiresOn: text(request, 'expiryDate'),
    });
  });

  mock.onPost(new RegExp(`${ROOT}/verifications/identity$`)).reply((config) => {
    const request = body(config);
    return submit({
      type: 'Identity',
      documentType: text(request, 'documentType') ?? 'Other',
      selfieReference: text(request, 'selfieReference'),
      documentReference: text(request, 'documentReference'),
      documentNumber: text(request, 'documentNumber'),
      issuingCountry: text(request, 'issueCountry'),
      expiresOn: text(request, 'expiryDate'),
    });
  });

  mock.onPost(new RegExp(`${ROOT}/verifications/country$`)).reply((config) => {
    const request = body(config);
    return submit({
      type: 'Country',
      documentType: text(request, 'documentType') ?? 'Other',
      targetCountry: text(request, 'countryCode'),
      arrivalDate: text(request, 'arrivalDate'),
      expertiseAreas: list(request, 'expertiseAreas'),
      documentReference: text(request, 'documentReference'),
    });
  });

  mock.onPost(new RegExp(`${ROOT}/verifications/[^/]+/assign(\\?.*)?$`)).reply((config) => {
    if (!staffMode) return staffOnly();

    const parts = segments(config.url);
    const verificationId = parts[parts.length - 2] ?? '';
    const record = verifications.get(verificationId);
    if (!record) {
      return notFound('trust.verification.not-found', 'That verification does not exist.');
    }

    const release = query(config, 'release') === 'true';
    record.status = release ? 'Pending' : 'UnderReview';
    return ok(record);
  });

  mock.onPost(new RegExp(`${ROOT}/verifications/[^/]+/review(\\?.*)?$`)).reply((config) => {
    if (!staffMode) return staffOnly();

    const parts = segments(config.url);
    const verificationId = parts[parts.length - 2] ?? '';
    const record = verifications.get(verificationId);
    if (!record) {
      return notFound('trust.verification.not-found', 'That verification does not exist.');
    }

    const request = body(config);
    const decision = text(request, 'decision');

    // `ParseReviewDecision` falls back to `NeedMoreInfo` — the only reversible
    // outcome. A malformed decision string must never approve or reject
    // somebody, and this reproduces that rather than refusing.
    const known = ['Approve', 'PartiallyApprove', 'Reject', 'NeedMoreInfo', 'Escalate', 'Revoke'];
    const resolved = known.find((item) => item.toLowerCase() === (decision ?? '').toLowerCase());
    const effective = resolved ?? 'NeedMoreInfo';

    const statusFor: Record<string, string> = {
      Approve: 'Approved',
      PartiallyApprove: 'PartiallyApproved',
      Reject: 'Rejected',
      NeedMoreInfo: 'NeedMoreInfo',
      Escalate: 'UnderInvestigation',
      Revoke: 'Revoked',
    };

    record.status = statusFor[effective];
    record.reviewedAt = new Date().toISOString();
    record.rejectionReasonCode = effective === 'Reject' ? text(request, 'rejectionReason') : null;
    record.rejectionReasonDetails = effective === 'Reject' ? text(request, 'details') : null;
    record.canAppeal = APPEALABLE_STATUSES.has(record.status);

    return ok(record);
  });

  mock.onGet(new RegExp(`${ROOT}/verifications(\\?.*)?$`)).reply((config) => {
    const { page, pageSize } = pageOf(config);
    const typeFilter = filter(config, 'type', SUPPORTED_VERIFICATION_TYPES);
    const statusFilter = filter(config, 'status', [
      'Submitted',
      'Pending',
      'UnderReview',
      'NeedMoreInfo',
      'UnderInvestigation',
      'Approved',
      'PartiallyApproved',
      'Rejected',
      'Expired',
      'Revoked',
      'Appealed',
      'ReverificationRequired',
    ]);

    const rows = [...verifications.values()]
      .filter((item) => item.userId === DEV_MEMBER_ID)
      .filter((item) => typeFilter === null || item.type === typeFilter)
      .filter((item) => statusFilter === null || item.status === statusFilter)
      .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));

    return paged(rows, page, pageSize);
  });

  mock.onGet(new RegExp(`${ROOT}/verifications/[^/?]+(\\?.*)?$`)).reply((config) => {
    const verificationId = segments(config.url).pop() ?? '';
    const record = verifications.get(verificationId);

    // Not-found rather than forbidden for somebody else's verification —
    // confirming one exists is itself a disclosure.
    if (!record || record.userId !== DEV_MEMBER_ID) {
      return notFound('trust.verification.not-found', 'That verification does not exist.');
    }

    return ok({
      verification: record,
      documents: documents.get(verificationId) ?? [],
      reviews:
        record.reviewedAt === null
          ? []
          : [
              {
                reviewId: guid(0x601),
                // A member is told whether a human or a rule decided, never who.
                decidedBy:
                  record.rejectionReasonCode === 'NOT_DIASPORA_ELIGIBLE' ||
                  record.rejectionReasonCode === 'EXPIRED_DOCUMENT'
                    ? 'diaspora-eligibility'
                    : 'Compliance team',
                fromStatus: 'Pending',
                toStatus: record.status,
                decisionMode:
                  record.rejectionReasonCode === 'NOT_DIASPORA_ELIGIBLE' ||
                  record.rejectionReasonCode === 'EXPIRED_DOCUMENT'
                    ? 'AutomaticRejection'
                    : 'ManualReview',
                rejectionReason: record.rejectionReasonCode,
                // Internal notes are omitted from a member-facing projection.
                notes: staffMode ? 'Checked against the registry.' : null,
                decidedAt: record.reviewedAt,
              },
            ],
    });
  });

  // ── Appeals ──────────────────────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/appeals/queue(\\?.*)?$`)).reply((config) => {
    if (!staffMode) return staffOnly();
    const { page, pageSize } = pageOf(config);
    return paged([...appeals.values()], page, pageSize);
  });

  mock.onPost(new RegExp(`${ROOT}/appeals/[^/]+/review(\\?.*)?$`)).reply((config) => {
    if (!staffMode) return staffOnly();

    const parts = segments(config.url);
    const appealId = parts[parts.length - 2] ?? '';
    const record = appeals.get(appealId);
    if (!record) {
      return notFound('trust.appeal.not-found', 'That appeal does not exist.');
    }

    const request = body(config);
    const explanation = text(request, 'explanation');
    if (!explanation) {
      return validation('validation.failed', 'The member must be told why.');
    }

    const decision = (text(request, 'decision') ?? '').trim();

    // The endpoint does not parse this as an enum. It compares to "Approve" and
    // "Escalate" and treats **everything else** as `Upheld: false` — so a typo
    // rejects the appeal. Reproduced exactly.
    const upheld = decision.toLowerCase() === 'approve';
    const escalate = decision.toLowerCase() === 'escalate';

    record.status = escalate ? 'Escalated' : upheld ? 'Approved' : 'Rejected';
    record.explanation = explanation;
    record.resolvedAt = escalate ? null : new Date().toISOString();

    if (!escalate && record.type === 'Verification') {
      const verification = verifications.get(record.targetId);
      if (verification && verification.status === 'Appealed') {
        verification.status = upheld ? 'Approved' : 'Rejected';
        verification.canAppeal = false;
      }
    }

    return ok(record);
  });

  mock.onPost(new RegExp(`${ROOT}/appeals$`)).reply((config) => {
    const request = body(config);
    const type = text(request, 'type') ?? '';
    const targetId = text(request, 'targetId');
    const reason = text(request, 'reason');

    if (!targetId) {
      return validation('validation.failed', "'Target Id' must not be empty.");
    }

    if (!reason || reason.length < 20) {
      return validation(
        'validation.failed',
        'Please explain your appeal in at least 20 characters.'
      );
    }

    const evidence = list(request, 'additionalDocuments');
    if (evidence.length > 10) {
      return validation('validation.failed', 'At most 10 evidence items.');
    }

    const alreadyOpen = [...appeals.values()].find(
      (item) => item.targetId === targetId && APPEAL_OPEN_STATUSES.has(item.status)
    );
    if (alreadyOpen) {
      return conflict('trust.appeal.already-open', 'You already have an open appeal for this.');
    }

    // `ParseAppealType` coerces an unrecognised value to `Verification` rather
    // than refusing. `lib/trust-api.ts` refuses it before it gets here; the
    // handler still models the server's behaviour for anything that bypasses
    // the client.
    const known = ['Verification', 'Content', 'Suspension', 'Publishing'];
    const effectiveType = known.find((item) => item.toLowerCase() === type.toLowerCase()) ?? 'Verification';

    if (effectiveType === 'Verification') {
      const verification = verifications.get(targetId);
      if (!verification || verification.userId !== DEV_MEMBER_ID) {
        return notFound('trust.verification.not-found', 'That verification does not exist.');
      }
      if (!APPEALABLE_STATUSES.has(verification.status)) {
        return conflict(
          'trust.appeal.not-allowed',
          'That verification is not in a state that can be appealed.'
        );
      }
      verification.status = 'Appealed';
      verification.canAppeal = false;
    }

    const record: WireAppeal = {
      appealId: nextId(),
      type: effectiveType,
      targetId,
      reason,
      status: 'Pending',
      explanation: null,
      isCorrectionRequest: request.correctionRequest === true,
      evidenceCount: evidence.length,
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    };

    appeals.set(record.appealId, record);
    return created(record);
  });

  mock.onGet(new RegExp(`${ROOT}/appeals(\\?.*)?$`)).reply((config) => {
    const { page, pageSize } = pageOf(config);
    const statusFilter = filter(config, 'status', [
      'Pending',
      'UnderReview',
      'Escalated',
      'Approved',
      'Rejected',
      'Withdrawn',
    ]);

    const rows = [...appeals.values()]
      .filter((item) => statusFilter === null || item.status === statusFilter)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    return paged(rows, page, pageSize);
  });

  mock.onGet(new RegExp(`${ROOT}/appeals/[^/?]+(\\?.*)?$`)).reply((config) => {
    const appealId = segments(config.url).pop() ?? '';
    const record = appeals.get(appealId);
    if (!record) {
      return notFound('trust.appeal.not-found', 'That appeal does not exist.');
    }

    return ok({
      appeal: record,
      reviews:
        record.resolvedAt === null
          ? []
          : [
              {
                reviewId: guid(0x701),
                // Null in a member-facing projection — reviewers are anonymised.
                reviewerId: staffMode ? OTHER_MEMBER_ID : null,
                fromStatus: 'Pending',
                toStatus: record.status,
                notes: record.explanation,
                reviewedAt: record.resolvedAt,
              },
            ],
    });
  });

  // ── Reputation ───────────────────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/reputation/me/events(\\?.*)?$`)).reply((config) => {
    const { page, pageSize } = pageOf(config);
    // Lowercase, and a mixed-case value does not parse — so it becomes no
    // filter rather than an error.
    const dimension = query(config, 'dimension');
    const rows = reputationEvents
      .filter((item) => dimension === null || item.dimension === dimension)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    return paged(rows, page, pageSize);
  });

  mock.onGet(new RegExp(`${ROOT}/reputation/me(\\?.*)?$`)).reply(() => ok(reputationProfile()));

  mock.onPost(new RegExp(`${ROOT}/contributions/confirmations$`)).reply((config) => {
    const request = body(config);
    const targetType = text(request, 'targetType');
    const targetId = text(request, 'targetId');
    const authorUserId = text(request, 'authorUserId');

    if (!targetType || !targetId || !authorUserId) {
      return validation('validation.failed', 'Target type, target id and author are required.');
    }

    if (authorUserId === DEV_MEMBER_ID) {
      return forbidden(
        'trust.confirmation.self-forbidden',
        'You cannot confirm your own contribution.'
      );
    }

    const key = `${targetType}:${targetId}`;
    if (confirmed.has(key)) {
      return conflict('trust.confirmation.duplicate', 'You have already confirmed this.');
    }
    confirmed.add(key);

    return created({
      confirmationId: nextId(),
      targetType,
      targetId,
      // Non-zero here; zero is a legitimate success when the rule is capped.
      pointsAwarded: 5,
      confirmedAt: new Date().toISOString(),
    });
  });

  // ── Eligibility ──────────────────────────────────────────────────────────

  mock.onPost(new RegExp(`${ROOT}/eligibility$`)).reply((config) => {
    const request = body(config);
    const capability = text(request, 'capability');
    const targetCountry = text(request, 'targetCountry');

    if (!capability) {
      return validation('validation.failed', "'Capability' must not be empty.");
    }

    const known = [
      'guides',
      'jobs',
      'housing',
      'marketplace',
      'comment',
      'updates',
      'guide-programme',
    ];

    // An unknown capability is ALLOWED, not refused. Trust does not know every
    // capability on the platform, and a module that has not declared a
    // requirement has not asked Trust to gate it.
    if (!known.includes(capability)) {
      return ok({ allowed: true, code: 'ALLOW', reason: null, waitTimeSec: null, unmetRequirements: [] });
    }

    const requirement = featureRequirements(targetCountry).find(
      (item) => (item as { featureId: string }).featureId === capability
    ) as { isUnlocked: boolean; requirements: { isMet: boolean; description: string }[] } | undefined;

    if (requirement && !requirement.isUnlocked) {
      return ok({
        allowed: false,
        code: 'DENIED',
        reason: `You do not yet meet the requirements for ${capability}.`,
        waitTimeSec: null,
        unmetRequirements: requirement.requirements
          .filter((item) => !item.isMet)
          .map((item) => item.description),
      });
    }

    return ok({ allowed: true, code: 'ALLOW', reason: null, waitTimeSec: null, unmetRequirements: [] });
  });

  // A bare array. No page, no total.
  mock.onGet(new RegExp(`${ROOT}/feature-requirements(\\?.*)?$`)).reply((config) =>
    ok(featureRequirements(query(config, 'targetCountry')))
  );

  // ── Moderation ───────────────────────────────────────────────────────────

  mock.onGet(new RegExp(`${ROOT}/moderation/queue(\\?.*)?$`)).reply((config) => {
    if (!staffMode) return staffOnly();

    const { page, pageSize } = pageOf(config);
    const rows = [
      {
        itemId: guid(0x801),
        contentType: 'Guide',
        contentId: guid(0x802),
        title: 'Renting in Peckham without a UK guarantor',
        authorId: OTHER_MEMBER_ID,
        authorLevel: 'TrustedContributor',
        authorViolationCount: 0,
        aiReview: {
          status: 'Flagged',
          // snake_case labels, unlike every other vocabulary in this module.
          flags: ['low_quality'],
          confidence: 0.61,
          processedAt: '2026-08-10T07:00:00Z',
        },
        reportCount: 2,
        // `PendingReview`, and note `AIReview` is the other spelling in this
        // enum — capital I, capital R.
        status: 'PendingReview',
        priority: 'High',
        assignedModeratorId: null,
        dueAt: '2026-08-12T07:00:00Z',
        isOverdue: true,
        createdAt: '2026-08-10T06:45:00Z',
      },
    ];

    return paged(rows, page, pageSize);
  });

  mock.onPost(new RegExp(`${ROOT}/moderation/queue/[^/]+/assign(\\?.*)?$`)).reply((config) => {
    if (!staffMode) return staffOnly();
    const parts = segments(config.url);
    const itemId = parts[parts.length - 2] ?? '';
    const release = query(config, 'release') === 'true';

    return ok({
      itemId,
      contentType: 'Guide',
      contentId: guid(0x802),
      title: 'Renting in Peckham without a UK guarantor',
      authorId: OTHER_MEMBER_ID,
      authorLevel: 'TrustedContributor',
      authorViolationCount: 0,
      aiReview: null,
      reportCount: 2,
      status: 'PendingReview',
      priority: 'High',
      assignedModeratorId: release ? null : DEV_MEMBER_ID,
      dueAt: '2026-08-12T07:00:00Z',
      isOverdue: true,
      createdAt: '2026-08-10T06:45:00Z',
    });
  });

  mock.onPost(new RegExp(`${ROOT}/moderation/queue/[^/]+/decision(\\?.*)?$`)).reply((config) => {
    if (!staffMode) return staffOnly();

    const request = body(config);
    const action = text(request, 'action') ?? '';
    const reason = text(request, 'reason');

    const known = [
      'Approve',
      'Reject',
      'Hide',
      'Archive',
      'Pin',
      'Unpin',
      'Suspend',
      'Restore',
      'Escalate',
    ];
    // An unrecognised action becomes `Escalate` — it sends the item to a human
    // rather than removing content.
    const effective = known.find((item) => item.toLowerCase() === action.toLowerCase()) ?? 'Escalate';

    if ((effective === 'Reject' || effective === 'Hide' || effective === 'Suspend') && !reason) {
      return validation(
        'validation.failed',
        'A reason is required when removing or restricting content.'
      );
    }

    const newStatus: Record<string, string> = {
      Approve: 'Approved',
      Reject: 'Rejected',
      Hide: 'Rejected',
      Archive: 'Resolved',
      Pin: 'Approved',
      Unpin: 'Approved',
      Suspend: 'Rejected',
      Restore: 'Approved',
      Escalate: 'Escalated',
    };

    return ok({
      actionId: nextId(),
      moderatorId: DEV_MEMBER_ID,
      contentType: 'Guide',
      contentId: guid(0x802),
      actionType: effective,
      reason,
      previousStatus: 'PendingReview',
      newStatus: newStatus[effective],
      createdAt: new Date().toISOString(),
    });
  });
}
