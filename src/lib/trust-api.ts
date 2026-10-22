// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Trust & Verification client (Remediation Wave D-4)
//
// `Diaspora.Modules.Trust` serves **26 routes** under `/api/v1/trust` —
// profile, timeline, badges, verifications, appeals, reputation, eligibility,
// feature requirements and the two staff queues — and until this file **not one
// of them had a frontend consumer**. The Trust Centre, the reputation
// dashboard, the appeals screen, the access gateway and all three verification
// wizards read from `store/trust.ts`, a zustand store seeded with a fictional
// member who lives in Mauritius and the United Kingdom.
//
// The client base URL is `.../v1`, so every path here starts `/trust/...` and
// the platform's prefix middleware maps it onto `/api/v1/trust/...`.
//
// ── What this replaces ───────────────────────────────────────────────────────
//
// Six invented routes. `mocks/handlers/trust.ts` served eight paths; **six of
// them do not exist on the server and never did**:
//
//   * `POST /trust/verify/identity`   → `POST /trust/verifications/identity`
//   * `POST /trust/verify/diaspora`   → `POST /trust/verifications/diaspora`
//   * `POST /trust/verify/diaspora/appeal`
//                                     → `POST /trust/appeals` with `type: 'Verification'`
//   * `POST /trust/community-voting`  → `POST /trust/contributions/confirmations`
//   * `GET  /trust/audit`             → **no Trust route.** Identity owns the
//                                        security trail; Trust has a *trust*
//                                        timeline, which is a different thing.
//   * `POST /trust/privacy`           → **no Trust route.** Privacy settings are
//                                        not Trust's to serve.
//
// `verification/identity.tsx` was posting to the first of those against the
// real client. In a deployment with the mock disabled that is a 404 the screen
// reports as a submission failure.
//
// ── The seven things worth knowing before calling anything here ──────────────
//
// **1. Enum casing is per-enum and inconsistent.** Trust registers no string
// enum converter; its response DTOs hold `string` and the mappers call
// `.ToString()`. So the wire spelling is the C# member name — PascalCase for
// most, **lowercase** for `ReputationDimension`, **SCREAMING_SNAKE** for
// rejection reasons and eligibility codes, **Screaming_Snake** for risk
// factors. See the long note in `types/trust.ts`.
//
// **2. Four inputs coerce rather than refuse.** An unrecognised verification
// `type` becomes `Diaspora`; an unrecognised appeal `type` becomes
// `Verification`; an unrecognised `documentType` becomes `Other`; and an
// unrecognised appeal review `decision` **rejects the appeal**. Every function
// below takes a closed union for those fields, and `assertKnown` is the runtime
// guard for the two that can reach the wire from free-form data.
//
// **3. Ten requests per minute, per IP, for the entire module.** The route
// group carries `RequireRateLimiting("diaspora-signin")` — a sliding window of
// 10 over 60 seconds, partitioned by remote address, not by member. Opening the
// Trust Centre spends three. This is the single most important operational fact
// about this module and it is why `hooks/trust.ts` uses minute-scale
// `staleTime`s and polls nothing.
//
// **4. Paged routes are offset pages; two "list" routes are bare arrays.**
// `PagedResult<T>` inside `data` for timeline, verifications, appeals,
// reputation events and both queues. `GET /trust/badges/me` and
// `GET /trust/feature-requirements` return a bare array with no total.
//
// **5. A mistyped filter is not an error.** `?status=aproved` fails to parse
// and becomes *no filter*, so the route answers 200 with the unfiltered list.
// The filter arguments below are typed unions for that reason.
//
// **6. `riskScore`/`riskLevel` come back only for staff.** Use
// `hasStaffRiskView` rather than checking for a truthy number: a genuine score
// of 0 is falsy and a member's absent score is not zero.
//
// **7. A dry-run eligibility check cannot see the rate limit.** The limiter has
// no inspect-without-consume operation, so a dry run reports the optimistic
// answer for that step. `allowed: true` from a dry run means "no rule, health
// state or threshold refuses" — not "there is budget".
//
// ── What this file deliberately does not offer ───────────────────────────────
//
// Because the routes do not exist:
//
//   * **Attaching a document to an existing verification.** Evidence is only
//     accepted in the submission body. There is no
//     `POST /trust/verifications/{id}/documents`.
//   * **Withdrawing an appeal.** `AppealStatus.Withdrawn` exists in the enum
//     and nothing can reach it over HTTP.
//   * **Awarding or revoking a badge.** `ManageBadgeRequest` and the
//     `trust:badge:manage` permission are declared; no endpoint is mapped.
//   * **Assigning a queue item to somebody else.** `AssignQueueItemRequest`
//     carries a `moderatorUserId` that the mapped route never reads — the
//     endpoint binds `?release=` and assigns to the caller.
//   * **A privacy-settings or audit-log route of any kind.**
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { readPage, type Page } from './platform-envelope';
import type {
  AppealStatus,
  AppealType,
  EvaluateEligibilityBody,
  RecordConfirmationBody,
  RecordModerationDecisionBody,
  ReviewAppealBody,
  ReviewVerificationBody,
  SubmitAppealBody,
  SubmitCountryVerificationBody,
  SubmitDiasporaVerificationBody,
  SubmitIdentityVerificationBody,
  TrustCapabilityKey,
  VerificationStatus,
  VerificationType,
  WireAppeal,
  WireAppealDetail,
  WireBadge,
  WireConfirmation,
  WireEligibilityDecision,
  WireFeatureRequirement,
  WireModerationContentType,
  WireModerationDecision,
  WireModerationPriority,
  WireModerationQueueItem,
  WireModerationQueueStatus,
  WirePublicTrustProfile,
  WireReputationEvent,
  WireReputationProfile,
  WireReputationRule,
  WireTrustProfile,
  WireTrustTimelineEvent,
  WireVerification,
  WireVerificationDetail,
  WireVerificationQueueItem,
  WireReputationDimension,
} from '@/types/trust';

const ROOT = '/trust';

interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

// ── Limits, as the server applies them ───────────────────────────────────────

/** `PaginationRequest.DefaultPageSize`. */
export const DEFAULT_PAGE_SIZE = 20;
/** `PaginationRequest.MaxPageSize`. A larger value is clamped, not refused. */
export const MAX_PAGE_SIZE = 50;
export const MIN_PAGE_SIZE = 1;

/** `Appeal.MaxReasonLength`, and the minimum FluentValidation enforces. */
export const APPEAL_REASON_MIN_LENGTH = 20;
export const APPEAL_REASON_MAX_LENGTH = 2000;
/** `Appeal.MaxEvidenceItems`. */
export const APPEAL_MAX_EVIDENCE = 10;
/** `Appeal.MaxTargetIdLength`. */
export const APPEAL_TARGET_ID_MAX_LENGTH = 128;

/** `VerificationRequest.MaxSupportingNotesLength`. */
export const SUPPORTING_NOTES_MAX_LENGTH = 2000;
/** `VerificationRequest.MaxExpertiseAreas`. */
export const MAX_EXPERTISE_AREAS = 10;
/** `VerificationDocument.MaxSizeInBytes` — the wizard advertises 5 MB and the server enforces it. */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

/**
 * The rate-limit budget the whole module shares.
 *
 * Exported so a screen can say "you have made too many requests, wait a
 * minute" with a number that is true, rather than guessing.
 */
export const TRUST_RATE_LIMIT_PER_MINUTE = 10;

export function clampPageSize(pageSize: number | null | undefined): number {
  if (typeof pageSize !== 'number' || !Number.isFinite(pageSize)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, Math.floor(pageSize)));
}

// ── Cache keys ───────────────────────────────────────────────────────────────
//
// Member-scoped through the bearer token, like every other module here: the
// cache is cleared on sign-in and sign-out rather than carrying a member id in
// the key. `profiles(userId)` is the exception and is *not* member-scoped — it
// is somebody else's public standing, keyed by whose.

export const trustKeys = {
  all: ['trust'] as const,

  profile: () => ['trust', 'profile'] as const,
  publicProfile: (userId: string) => ['trust', 'profiles', userId] as const,
  timeline: (pageSize?: number | null) =>
    ['trust', 'timeline', clampPageSize(pageSize)] as const,
  badges: () => ['trust', 'badges'] as const,

  verifications: () => ['trust', 'verifications'] as const,
  verificationList: (filters: VerificationListFilters = {}) =>
    [
      'trust',
      'verifications',
      'list',
      filters.type ?? 'all',
      filters.status ?? 'all',
      clampPageSize(filters.pageSize),
    ] as const,
  verification: (verificationId: string) =>
    ['trust', 'verifications', 'detail', verificationId] as const,
  verificationQueue: (filters: VerificationQueueFilters = {}) =>
    [
      'trust',
      'verifications',
      'queue',
      filters.type ?? 'all',
      filters.status ?? 'all',
      filters.assignedTo ?? 'anyone',
      filters.overdueOnly ?? false,
      clampPageSize(filters.pageSize),
    ] as const,

  appeals: () => ['trust', 'appeals'] as const,
  appealList: (status?: AppealStatus | null, pageSize?: number | null) =>
    ['trust', 'appeals', 'list', status ?? 'all', clampPageSize(pageSize)] as const,
  appeal: (appealId: string) => ['trust', 'appeals', 'detail', appealId] as const,
  appealQueue: (filters: AppealQueueFilters = {}) =>
    [
      'trust',
      'appeals',
      'queue',
      filters.status ?? 'all',
      filters.type ?? 'all',
      filters.assignedTo ?? 'anyone',
      clampPageSize(filters.pageSize),
    ] as const,

  reputation: () => ['trust', 'reputation'] as const,
  reputationEvents: (dimension?: WireReputationDimension | null, pageSize?: number | null) =>
    ['trust', 'reputation', 'events', dimension ?? 'all', clampPageSize(pageSize)] as const,
  // Outside `['trust', 'reputation']` on purpose: scoring invalidates the
  // member's reputation, and the rules do not change when a member scores.
  reputationRules: () => ['trust', 'reputation-rules'] as const,

  featureRequirements: (targetCountry?: string | null) =>
    ['trust', 'feature-requirements', normaliseCountry(targetCountry) ?? 'global'] as const,

  moderation: () => ['trust', 'moderation'] as const,
  moderationQueue: (filters: ModerationQueueFilters = {}) =>
    [
      'trust',
      'moderation',
      'queue',
      filters.status ?? 'all',
      filters.contentType ?? 'all',
      filters.minimumPriority ?? 'any',
      filters.assignedTo ?? 'anyone',
      filters.overdueOnly ?? false,
      clampPageSize(filters.pageSize),
    ] as const,
};

/**
 * Eligibility is **not** cached under a query key.
 *
 * A non-dry-run evaluation consumes a rate-limit permit, which makes it a
 * mutation however much it reads like a question. Caching the answer would also
 * mean a member who has just been verified is still told they cannot publish,
 * which is the exact failure this whole wave exists to end.
 */

// ── Request plumbing ─────────────────────────────────────────────────────────

/** Drops nulls, undefineds and empty strings so axios does not serialise `?status=null`. */
function params(source: Record<string, unknown>): Record<string, unknown> | undefined {
  const entries = Object.entries(source).filter(
    ([, value]) => value !== null && value !== undefined && value !== ''
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

function normaliseCountry(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

async function get<T>(url: string, query?: Record<string, unknown>): Promise<T> {
  const response = await apiClient.get<Envelope<T>>(url, {
    params: query ? params(query) : undefined,
  });
  return response.data.data;
}

async function post<T>(url: string, data?: unknown, query?: Record<string, unknown>): Promise<T> {
  const response = await apiClient.post<Envelope<T>>(url, data, {
    params: query ? params(query) : undefined,
  });
  return response.data.data;
}

/**
 * Refuses a value the server would silently coerce.
 *
 * Four inputs on this module accept a string and fall back to a default when it
 * does not parse, and two of those defaults are consequential: an unrecognised
 * verification type becomes `Diaspora` — the check the whole product rests on —
 * and an unrecognised appeal type becomes `Verification`. The unions in
 * `types/trust.ts` stop that at compile time for a literal; this stops it at
 * run time for a value that arrived from a picker, a deep link or a draft
 * restored from storage.
 *
 * Throwing rather than substituting is the point. A client that quietly picked
 * a different value would be making the same mistake the server makes, one
 * layer earlier.
 */
function assertKnown<T extends string>(
  value: string,
  allowed: readonly T[],
  field: string
): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(
    `Refusing to send an unrecognised ${field}: "${value}". ` +
      `The server would coerce it to "${allowed[0]}" rather than refuse it.`
  );
}

/** The values `assertKnown` guards, exported so a picker can be built from them. */
export const VERIFICATION_TYPE_VALUES: readonly VerificationType[] = [
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

export const APPEAL_TYPE_VALUES: readonly AppealType[] = [
  'Verification',
  'Content',
  'Suspension',
  'Publishing',
] as const;

// ── Media references ─────────────────────────────────────────────────────────

/**
 * The `media:` prefix that turns a Media asset id into something Trust accepts
 * as a document reference.
 *
 * **This is not a guess, and it is not this client's invention.** It is
 * declared twice on the server, independently, and both declarations agree:
 *
 *   * `VerificationDocument.MediaStorageKey(mediaId)` renders
 *     `media:{guid:D}` — *"namespaced deliberately: a bare GUID sitting in a
 *     column that elsewhere holds object-store paths is the kind of ambiguity
 *     that eventually gets passed to a storage client"*.
 *   * `MediaStorageService.MediaReferencePrefix` is `"media:"`, and its
 *     `GetPresignedUrlAsync` resolves a key in that form to the asset and mints
 *     a signed link through Media's own content route — *"the first form is
 *     what every new caller should use"*.
 *
 * `MediaStorageService` is registered as the platform's `IStorageService`
 * (`MediaModule.cs:235`), which is the dependency Trust's `DocumentLinkFactory`
 * resolves. So a document submitted with this reference is a document a
 * reviewer can actually open.
 *
 * **What it does not do**, and this is the residue of NG-32: the HTTP
 * submission routes carry a flat `documentReference: string` and never populate
 * `VerificationSubmissionInput.Evidence`, so
 * `VerificationDocument.MediaId` stays null. The storage key is right and the
 * link works; Trust's own record of "this document is a Media asset" does not
 * get written. Only an in-process module submission can set it today.
 */
export const MEDIA_REFERENCE_PREFIX = 'media:';

/**
 * A Media asset id as the document reference Trust's submission routes want.
 *
 * Upload through `lib/media-api.ts`, take the `mediaId`, pass it here.
 */
export function mediaDocumentReference(mediaId: string): string {
  const trimmed = mediaId.trim();
  if (trimmed.length === 0) {
    throw new Error('A media reference needs a media id.');
  }
  return trimmed.toLowerCase().startsWith(MEDIA_REFERENCE_PREFIX)
    ? trimmed
    : `${MEDIA_REFERENCE_PREFIX}${trimmed}`;
}

/** Whether a stored document reference points at a Media asset rather than an object key. */
export function isMediaReference(documentReference: string | null | undefined): boolean {
  return (
    typeof documentReference === 'string' &&
    documentReference.toLowerCase().startsWith(MEDIA_REFERENCE_PREFIX)
  );
}

// ── Profile, timeline, badges ────────────────────────────────────────────────

/**
 * `GET /trust/profile` — 200. Policy `trust.read-self`.
 *
 * The whole Trust Centre in one call. A member who has never touched a trust
 * feature gets a synthesised empty profile rather than a 404
 * (`ProfileQueries.cs:66`), so this never fails for a new account.
 */
export function fetchTrustProfile(): Promise<WireTrustProfile> {
  return get<WireTrustProfile>(`${ROOT}/profile`);
}

/**
 * `GET /trust/profiles/{userId}` — 200. Policy `trust.read-public`.
 *
 * **404 when the member has no trust profile row yet**, unlike the self route,
 * which synthesises one. A brand-new member is a `trust.profile.not-found`.
 */
export function fetchPublicTrustProfile(userId: string): Promise<WirePublicTrustProfile> {
  return get<WirePublicTrustProfile>(`${ROOT}/profiles/${segment(userId)}`);
}

/**
 * `GET /trust/timeline` — 200, an offset `PagedResult`.
 *
 * Staff investigating a case see internal entries too; a member never does
 * (`ProfileQueries.cs:191`). So two callers can legitimately get different rows
 * for the same member.
 */
export async function fetchTrustTimeline(
  query: { page?: number | null; pageSize?: number | null } = {}
): Promise<Page<WireTrustTimelineEvent>> {
  const response = await apiClient.get<Envelope<unknown>>(`${ROOT}/timeline`, {
    params: params({ page: query.page ?? 1, pageSize: clampPageSize(query.pageSize) }),
  });
  return readPage<WireTrustTimelineEvent>(response.data);
}

/**
 * `GET /trust/badges/me` — 200, a **bare array**, not a page.
 *
 * Active badges only, oldest first.
 */
export function fetchMyBadges(): Promise<WireBadge[]> {
  return get<WireBadge[]>(`${ROOT}/badges/me`);
}

// ── Verifications ────────────────────────────────────────────────────────────

/**
 * `POST /trust/verifications/diaspora` — **201**. Policy `trust.verification.submit`.
 *
 * Available from `AccessTier.Limited` and granted while restricted, on purpose:
 * *"a member who cannot yet do anything is exactly the member who needs to
 * verify."*
 *
 * Two refusals happen without a human and are worth expecting:
 * `NOT_DIASPORA_ELIGIBLE` when nationality equals residence, and
 * `EXPIRED_DOCUMENT` when the expiry date has passed. Both come back as an
 * **`Approved`-shaped 201 with `status: 'Rejected'`**, not an error — the
 * submission succeeded, the claim did not.
 */
export function submitDiasporaVerification(
  body: SubmitDiasporaVerificationBody
): Promise<WireVerification> {
  return post<WireVerification>(`${ROOT}/verifications/diaspora`, body);
}

/**
 * `POST /trust/verifications/identity` — **201**.
 *
 * Never auto-approved: this is the verification that unlocks publishing.
 * `Other` is **not** an accepted document type here, unlike the diaspora route.
 */
export function submitIdentityVerification(
  body: SubmitIdentityVerificationBody
): Promise<WireVerification> {
  return post<WireVerification>(`${ROOT}/verifications/identity`, body);
}

/**
 * `POST /trust/verifications/country` — **201**.
 *
 * The only type with a real expiry: the grant lasts two years, because permits
 * lapse. The route sends no issuing country, so `issuingCountry` on the stored
 * document is always null for this flow.
 */
export function submitCountryVerification(
  body: SubmitCountryVerificationBody
): Promise<WireVerification> {
  return post<WireVerification>(`${ROOT}/verifications/country`, body);
}

export interface VerificationListFilters {
  type?: VerificationType | null;
  status?: VerificationStatus | null;
  page?: number | null;
  pageSize?: number | null;
}

/**
 * `GET /trust/verifications` — 200, an offset `PagedResult`.
 *
 * A mistyped `type` or `status` is dropped rather than refused, so this can
 * answer 200 with rows the caller did not ask for. The union types are the
 * guard.
 */
export async function fetchMyVerifications(
  filters: VerificationListFilters = {}
): Promise<Page<WireVerification>> {
  const response = await apiClient.get<Envelope<unknown>>(`${ROOT}/verifications`, {
    params: params({
      type: filters.type,
      status: filters.status,
      page: filters.page ?? 1,
      pageSize: clampPageSize(filters.pageSize),
    }),
  });
  return readPage<WireVerification>(response.data);
}

/**
 * `GET /trust/verifications/{verificationId}` — 200.
 *
 * **404, not 403, when the verification belongs to somebody else** — confirming
 * that one exists is itself a disclosure (`VerificationQueries.cs:113`).
 */
export function fetchVerification(verificationId: string): Promise<WireVerificationDetail> {
  return get<WireVerificationDetail>(`${ROOT}/verifications/${segment(verificationId)}`);
}

export interface VerificationQueueFilters {
  type?: VerificationType | null;
  status?: VerificationStatus | null;
  assignedTo?: string | null;
  overdueOnly?: boolean;
  page?: number | null;
  pageSize?: number | null;
}

/**
 * `GET /trust/verifications/queue` — 200, an offset `PagedResult`.
 * Policy `trust.verification.review` — Moderator, Admin or SuperAdmin, **and**
 * `AccessTier.Verified`. A moderator whose own residency lapsed stops being
 * able to judge anyone else's.
 */
export async function fetchVerificationQueue(
  filters: VerificationQueueFilters = {}
): Promise<Page<WireVerificationQueueItem>> {
  const response = await apiClient.get<Envelope<unknown>>(`${ROOT}/verifications/queue`, {
    params: params({
      type: filters.type,
      status: filters.status,
      assignedTo: filters.assignedTo,
      overdueOnly: filters.overdueOnly ?? false,
      page: filters.page ?? 1,
      pageSize: clampPageSize(filters.pageSize),
    }),
  });
  return readPage<WireVerificationQueueItem>(response.data);
}

/**
 * `POST /trust/verifications/{verificationId}/assign` — 200.
 *
 * The take/release switch is a **query parameter**, not a body: `?release=true`
 * puts it back. There is no body at all, and no way to assign it to anybody
 * other than the caller.
 */
export function assignVerification(
  verificationId: string,
  options: { release?: boolean } = {}
): Promise<WireVerification> {
  return post<WireVerification>(
    `${ROOT}/verifications/${segment(verificationId)}/assign`,
    undefined,
    { release: options.release ?? false }
  );
}

/** `POST /trust/verifications/{verificationId}/review` — 200. Staff only. */
export function reviewVerification(
  verificationId: string,
  body: ReviewVerificationBody
): Promise<WireVerification> {
  return post<WireVerification>(`${ROOT}/verifications/${segment(verificationId)}/review`, body);
}

// ── Appeals ──────────────────────────────────────────────────────────────────

/**
 * `POST /trust/appeals` — **201**. Policy `trust.appeal.submit`, granted while
 * restricted because *"the whole point of an appeal is that the member
 * disagrees with the restriction."*
 *
 * One endpoint for all four appeal types, replacing the two the mocks declared.
 * Refusals worth handling: `trust.appeal.already-open` (409 — one open appeal
 * per target), `trust.appeal.window-closed` (the decision is more than 90 days
 * old) and `trust.appeal.not-allowed` (the verification is not in an appealable
 * state).
 *
 * `type` is asserted rather than trusted: an unrecognised value becomes
 * `Verification` server-side, which would file an appeal against the wrong
 * thing.
 */
// `async` so a refusal from `assertKnown` arrives as a rejected promise rather
// than a synchronous throw. A caller writing `submitAppeal(x).catch(…)` should
// not have to know which of the two failure modes it is dealing with.
export async function submitAppeal(body: SubmitAppealBody): Promise<WireAppeal> {
  return post<WireAppeal>(`${ROOT}/appeals`, {
    ...body,
    type: assertKnown(body.type, APPEAL_TYPE_VALUES, 'appeal type'),
  });
}

/** `GET /trust/appeals` — 200, an offset `PagedResult`. */
export async function fetchMyAppeals(
  filters: { status?: AppealStatus | null; page?: number | null; pageSize?: number | null } = {}
): Promise<Page<WireAppeal>> {
  const response = await apiClient.get<Envelope<unknown>>(`${ROOT}/appeals`, {
    params: params({
      status: filters.status,
      page: filters.page ?? 1,
      pageSize: clampPageSize(filters.pageSize),
    }),
  });
  return readPage<WireAppeal>(response.data);
}

/** `GET /trust/appeals/{appealId}` — 200. 404 for somebody else's appeal. */
export function fetchAppeal(appealId: string): Promise<WireAppealDetail> {
  return get<WireAppealDetail>(`${ROOT}/appeals/${segment(appealId)}`);
}

export interface AppealQueueFilters {
  status?: AppealStatus | null;
  type?: AppealType | null;
  assignedTo?: string | null;
  page?: number | null;
  pageSize?: number | null;
}

/**
 * `GET /trust/appeals/queue` — 200, an offset `PagedResult` of the **same**
 * `AppealResponse` the member's own list returns. There is no richer queue row
 * here, unlike the verification queue.
 */
export async function fetchAppealQueue(
  filters: AppealQueueFilters = {}
): Promise<Page<WireAppeal>> {
  const response = await apiClient.get<Envelope<unknown>>(`${ROOT}/appeals/queue`, {
    params: params({
      status: filters.status,
      type: filters.type,
      assignedTo: filters.assignedTo,
      page: filters.page ?? 1,
      pageSize: clampPageSize(filters.pageSize),
    }),
  });
  return readPage<WireAppeal>(response.data);
}

/**
 * `POST /trust/appeals/{appealId}/review` — 200. Policy `trust.appeal.review`.
 *
 * **`decision` is not parsed as an enum.** The endpoint compares it to
 * `"Approve"` and `"Escalate"`, case-insensitively, and treats every other
 * value — including `""`, `"approved"` with a d, and any typo — as
 * `Upheld: false`, which **rejects the appeal**
 * (`TrustEndpointContributor.cs:463-471`). There is no safe fallback to lean
 * on, so this is asserted before it leaves the device.
 */
export async function reviewAppeal(appealId: string, body: ReviewAppealBody): Promise<WireAppeal> {
  return post<WireAppeal>(`${ROOT}/appeals/${segment(appealId)}/review`, {
    ...body,
    decision: assertKnown(body.decision, ['Approve', 'Reject', 'Escalate'] as const, 'appeal decision'),
  });
}

// ── Reputation ───────────────────────────────────────────────────────────────

/**
 * `GET /trust/reputation/me` — 200.
 *
 * A member with no scoring history is a `Member` on zero points, not a 404
 * (`ReputationHandlers.cs:53`).
 */
export function fetchMyReputation(): Promise<WireReputationProfile> {
  return get<WireReputationProfile>(`${ROOT}/reputation/me`);
}

/**
 * `GET /trust/reputation/rules` — 200. What the platform pays reputation for,
 * contribution then verification then trust, largest award first.
 *
 * The same for every member and fixed for a deployment's life (the server
 * sends `Cache-Control: private, max-age=3600`). A server from before
 * 22 Oct 2026 answers 404.
 */
export function fetchReputationRules(): Promise<WireReputationRule[]> {
  return get<WireReputationRule[]>(`${ROOT}/reputation/rules`);
}

/**
 * `GET /trust/reputation/me/events` — 200, an offset `PagedResult`.
 *
 * `dimension` is **lowercase** on the wire. `?dimension=Contribution` does not
 * parse, so it is dropped and the route answers with every dimension.
 */
export async function fetchMyReputationEvents(
  filters: {
    dimension?: WireReputationDimension | null;
    page?: number | null;
    pageSize?: number | null;
  } = {}
): Promise<Page<WireReputationEvent>> {
  const response = await apiClient.get<Envelope<unknown>>(`${ROOT}/reputation/me/events`, {
    params: params({
      dimension: filters.dimension,
      page: filters.page ?? 1,
      pageSize: clampPageSize(filters.pageSize),
    }),
  });
  return readPage<WireReputationEvent>(response.data);
}

/**
 * `POST /trust/contributions/confirmations` — **201**. Policy
 * `trust.contribution.confirm`, which requires `AccessTier.Verified` —
 * *"an unverified account vouching for content is the cheapest possible way to
 * manufacture trust."*
 *
 * Two refusals: `trust.confirmation.self-forbidden` (403) and
 * `trust.confirmation.duplicate` (409). `pointsAwarded: 0` is a success — it
 * means the author's scoring rule is capped out for the period.
 */
export function recordConfirmation(body: RecordConfirmationBody): Promise<WireConfirmation> {
  return post<WireConfirmation>(`${ROOT}/contributions/confirmations`, body);
}

// ── Eligibility ──────────────────────────────────────────────────────────────

/**
 * `POST /trust/eligibility` — 200.
 *
 * A POST because a non-dry-run evaluation consumes a rate-limit permit.
 * `dryRun` has no default here on purpose: the server defaults it to true, and
 * a client that relied on that default would eventually send the one call that
 * spends a member's daily quota without meaning to.
 *
 * **An unknown capability is allowed**, not refused
 * (`EligibilityEvaluator.cs:68-73`), so `allowed: true` is not evidence that a
 * gate was consulted.
 */
export function evaluateEligibility(
  body: EvaluateEligibilityBody
): Promise<WireEligibilityDecision> {
  return post<WireEligibilityDecision>(`${ROOT}/eligibility`, {
    ...body,
    targetCountry: normaliseCountry(body.targetCountry),
  });
}

/**
 * `GET /trust/feature-requirements` — 200, a **bare array**, not a page.
 *
 * Country-scoped thresholds are meaningless without a country — *"150 points is
 * always 150 points somewhere"* — so a call with no `targetCountry` reports
 * every country-scoped requirement as unmet with `0 / N pts`.
 */
export function fetchFeatureRequirements(
  targetCountry?: string | null
): Promise<WireFeatureRequirement[]> {
  return get<WireFeatureRequirement[]>(`${ROOT}/feature-requirements`, {
    targetCountry: normaliseCountry(targetCountry),
  });
}

// ── Moderation ───────────────────────────────────────────────────────────────

export interface ModerationQueueFilters {
  status?: WireModerationQueueStatus | null;
  contentType?: WireModerationContentType | null;
  minimumPriority?: WireModerationPriority | null;
  assignedTo?: string | null;
  overdueOnly?: boolean;
  page?: number | null;
  pageSize?: number | null;
}

/**
 * `GET /trust/moderation/queue` — 200, an offset `PagedResult`. Policy
 * `trust.moderate`.
 *
 * **This is not the same queue as `GET /community/moderation/queue`.** That one
 * is the Community module's report queue over posts and comments;
 * `app/moderation/queue.tsx` already renders it. This one is Trust's own,
 * spanning guides, listings, profiles and organisations, with SLA and priority.
 * Two different queues that both call themselves the moderation queue.
 */
export async function fetchModerationQueue(
  filters: ModerationQueueFilters = {}
): Promise<Page<WireModerationQueueItem>> {
  const response = await apiClient.get<Envelope<unknown>>(`${ROOT}/moderation/queue`, {
    params: params({
      status: filters.status,
      contentType: filters.contentType,
      minimumPriority: filters.minimumPriority,
      assignedTo: filters.assignedTo,
      overdueOnly: filters.overdueOnly ?? false,
      page: filters.page ?? 1,
      pageSize: clampPageSize(filters.pageSize),
    }),
  });
  return readPage<WireModerationQueueItem>(response.data);
}

/** `POST /trust/moderation/queue/{itemId}/assign?release=` — 200. */
export function assignModerationItem(
  itemId: string,
  options: { release?: boolean } = {}
): Promise<WireModerationQueueItem> {
  return post<WireModerationQueueItem>(
    `${ROOT}/moderation/queue/${segment(itemId)}/assign`,
    undefined,
    { release: options.release ?? false }
  );
}

/**
 * `POST /trust/moderation/queue/{itemId}/decision` — 200.
 *
 * An unrecognised `action` becomes `Escalate` — the safe fallback, but still
 * not the decision that was made. `reason` is required for `Reject`, `Hide` and
 * `Suspend`; omitting it is a 400, not a silent accept.
 */
export function recordModerationDecision(
  itemId: string,
  body: RecordModerationDecisionBody
): Promise<WireModerationDecision> {
  return post<WireModerationDecision>(
    `${ROOT}/moderation/queue/${segment(itemId)}/decision`,
    body
  );
}

// ── Reading what came back ───────────────────────────────────────────────────

/**
 * Whether this profile carries the staff-only risk fields.
 *
 * Not `Boolean(profile.riskScore)`: a genuine score of zero is falsy, and an
 * ordinary member's *absent* score is not a score of zero. The distinction is
 * the whole reason the server omits the fields rather than nulling them.
 */
export function hasStaffRiskView(profile: WireTrustProfile | null | undefined): boolean {
  return (
    typeof profile?.riskScore === 'number' &&
    typeof profile?.riskLevel === 'string' &&
    profile.riskLevel.length > 0
  );
}

/**
 * The status of one verification type from the profile's checklist map.
 *
 * Every supported type is present, so a missing key means the deployment does
 * not support that type at all — which is different from "not attempted", and
 * is why this returns null rather than `'Pending'`.
 */
export function verificationStatusFor(
  profile: WireTrustProfile | null | undefined,
  type: VerificationType
): VerificationStatus | null {
  const value = profile?.verifications?.[type];
  return typeof value === 'string' ? (value as VerificationStatus) : null;
}

/**
 * Whether a verification type has been granted.
 *
 * `PartiallyApproved` counts as granted for display, because the server treats
 * it as a grant that can still be appealed. `Approved` alone would under-report.
 */
export function isVerificationGranted(status: VerificationStatus | null | undefined): boolean {
  return status === 'Approved' || status === 'PartiallyApproved';
}

/** Whether a verification is still moving — the member should wait, not act. */
export function isVerificationInFlight(status: VerificationStatus | null | undefined): boolean {
  return (
    status === 'Submitted' ||
    status === 'Pending' ||
    status === 'UnderReview' ||
    status === 'UnderInvestigation' ||
    status === 'Appealed'
  );
}

/** Whether a verification outcome asks the member for something. */
export function needsMemberAction(status: VerificationStatus | null | undefined): boolean {
  return (
    status === 'NeedMoreInfo' ||
    status === 'Rejected' ||
    status === 'Expired' ||
    status === 'Revoked' ||
    status === 'ReverificationRequired'
  );
}

/** The most recent verification of one type, or null. Newest by `submittedAt`. */
export function latestVerificationOfType(
  verifications: readonly WireVerification[] | null | undefined,
  type: VerificationType
): WireVerification | null {
  if (!verifications || verifications.length === 0) return null;
  const matching = verifications.filter((item) => item.type === type);
  if (matching.length === 0) return null;
  return matching.reduce((newest, item) =>
    Date.parse(item.submittedAt) > Date.parse(newest.submittedAt) ? item : newest
  );
}

/** One feature requirement by its capability key. */
export function featureRequirementFor(
  requirements: readonly WireFeatureRequirement[] | null | undefined,
  featureId: TrustCapabilityKey
): WireFeatureRequirement | null {
  return requirements?.find((item) => item.featureId === featureId) ?? null;
}

/**
 * An appeal's position on the six-stage tracker `profile/appeals.tsx` draws.
 *
 * The tracker's stages are `Pending → Approved → Rejected → Escalated →
 * Appealed → Resolved`, which is not a sequence and never was — three of them
 * are terminal outcomes, not steps. Mapping the six real `AppealStatus` values
 * onto it here rather than in the screen keeps the fiction in one place, and
 * `Withdrawn` — which the tracker has no stage for — reads as resolved.
 */
export function appealTrackerIndex(status: AppealStatus): number {
  switch (status) {
    case 'Pending':
      return 0;
    case 'UnderReview':
      return 0;
    case 'Approved':
      return 1;
    case 'Rejected':
      return 2;
    case 'Escalated':
      return 3;
    case 'Withdrawn':
      return 5;
    default:
      return 0;
  }
}

/** Whether an appeal has finished, whichever way it went. */
export function isAppealResolved(status: AppealStatus): boolean {
  return status === 'Approved' || status === 'Rejected' || status === 'Withdrawn';
}

// ── Errors ───────────────────────────────────────────────────────────────────

function problemCode(cause: unknown): string | null {
  const code = (cause as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === 'string' ? code : null;
}

function status(cause: unknown): number | null {
  const value = (cause as { response?: { status?: number } })?.response?.status;
  return typeof value === 'number' ? value : null;
}

/** `trust.verification.duplicate` — one open request per type. */
export function isDuplicateVerificationError(cause: unknown): boolean {
  return status(cause) === 409 && problemCode(cause) === 'trust.verification.duplicate';
}

/** `trust.appeal.already-open` — one open appeal per target. */
export function isAppealAlreadyOpenError(cause: unknown): boolean {
  return status(cause) === 409 && problemCode(cause) === 'trust.appeal.already-open';
}

/** `trust.appeal.window-closed` — the 90-day window from the decision has passed. */
export function isAppealWindowClosedError(cause: unknown): boolean {
  return problemCode(cause) === 'trust.appeal.window-closed';
}

/** `trust.appeal.not-allowed` — this outcome cannot be appealed. */
export function isAppealNotAllowedError(cause: unknown): boolean {
  return problemCode(cause) === 'trust.appeal.not-allowed';
}

/** `trust.confirmation.duplicate` — you have already confirmed this. */
export function isDuplicateConfirmationError(cause: unknown): boolean {
  return status(cause) === 409 && problemCode(cause) === 'trust.confirmation.duplicate';
}

/** `trust.confirmation.self-forbidden` / `trust.review.self-forbidden`. */
export function isSelfActionForbiddenError(cause: unknown): boolean {
  const code = problemCode(cause);
  return code === 'trust.confirmation.self-forbidden' || code === 'trust.review.self-forbidden';
}

/** `trust.profile.not-found` — the member has no trust profile row yet. */
export function isProfileNotFoundError(cause: unknown): boolean {
  return status(cause) === 404 && problemCode(cause) === 'trust.profile.not-found';
}

/**
 * A 429 from anywhere in this module.
 *
 * Worth its own predicate because the budget is ten requests a minute for the
 * *whole* module and it is partitioned by IP address rather than by member. A
 * member on a shared connection can be refused because of somebody else's
 * traffic, and telling them to "try again" without saying how long is telling
 * them nothing.
 */
export function isRateLimitedError(cause: unknown): boolean {
  return status(cause) === 429;
}

/** Seconds to wait after a 429, from the problem document's `retryAfter`. */
export function retryAfterSeconds(cause: unknown): number | null {
  const value = (cause as { response?: { data?: { retryAfter?: unknown } } })?.response?.data
    ?.retryAfter;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** A sentence a member can act on, from the platform's problem envelope. */
export function trustErrorMessage(cause: unknown): string {
  if (status(cause) === 401) {
    return 'Sign in to see your verification status.';
  }
  if (status(cause) === 403) {
    return 'You do not have permission to do that.';
  }
  if (isRateLimitedError(cause)) {
    const wait = retryAfterSeconds(cause);
    return wait === null
      ? 'Too many requests just now. Please wait a moment and try again.'
      : `Too many requests just now. Please try again in ${wait} seconds.`;
  }
  if (isDuplicateVerificationError(cause)) {
    return 'You already have a verification of this kind in progress.';
  }
  if (isAppealAlreadyOpenError(cause)) {
    return 'You already have an open appeal for this.';
  }
  if (isAppealWindowClosedError(cause)) {
    return 'The 90-day window to appeal this decision has closed.';
  }
  const detail = (cause as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim().length > 0) return detail;
  return 'We could not reach the trust service just now.';
}
