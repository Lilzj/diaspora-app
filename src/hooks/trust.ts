// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Trust hooks (Remediation Wave D-4)
//
// The read layer for `lib/trust-api.ts`. What these replace is not another
// hooks file — there was none — but `store/trust.ts`, a zustand store that held
// the member's verification statuses, account health, badges, country standings
// and trust journey as **seeded local state**, and `lib/trustEngine.ts`, which
// computed feature unlocks and a risk score from it.
//
// ── Why every staleTime here is measured in minutes ──────────────────────────
//
// The Trust module's route group carries `RequireRateLimiting(
// "diaspora-signin")` — **10 requests per 60 seconds, partitioned by IP
// address** rather than by member. The Trust Centre alone needs profile +
// timeline + feature requirements; the reputation dashboard needs two more.
// Five of the ten, for one member, on one screen visit, on a connection several
// members might share.
//
// So: nothing polls, nothing refetches on focus, and the `staleTime`s are long
// enough that a member moving between the Trust Centre and the reputation
// screen and back does not spend a second budget. Verification state does not
// change second to second — a review has a 24-to-48-hour SLA — and pretending
// otherwise would cost the member a 429 on the screen that explains why they
// are restricted.
//
// ── The one thing that is deliberately not a query ───────────────────────────
//
// `useEligibilityCheck` is a **mutation**, not a query, and it is not cached. A
// non-dry-run evaluation consumes a rate-limit permit server-side, which makes
// it a write however much it reads like a question; and caching "may I publish?"
// is how a member who has just been verified is still told they cannot.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import {
  assignModerationItem,
  assignVerification,
  evaluateEligibility,
  fetchAppeal,
  fetchAppealQueue,
  fetchFeatureRequirements,
  fetchModerationQueue,
  fetchMyAppeals,
  fetchMyModerationCase,
  fetchMyBadges,
  fetchMyReputation,
  fetchMyReputationEvents,
  fetchMyVerifications,
  fetchReputationRules,
  fetchPublicTrustProfile,
  fetchTrustProfile,
  fetchTrustTimeline,
  fetchVerification,
  fetchVerificationQueue,
  hasStaffRiskView,
  recordConfirmation,
  recordModerationDecision,
  reviewAppeal,
  reviewVerification,
  requestModerationReview,
  submitAppeal,
  submitCountryVerification,
  submitDiasporaVerification,
  submitIdentityVerification,
  trustErrorMessage,
  trustKeys,
  type AppealQueueFilters,
  type ModerationQueueFilters,
  type VerificationListFilters,
  type VerificationQueueFilters,
} from '@/lib/trust-api';
import type {
  AppealStatus,
  EvaluateEligibilityBody,
  RecordConfirmationBody,
  RecordModerationDecisionBody,
  ReviewAppealBody,
  ReviewVerificationBody,
  RiskLevel,
  SubmitAppealBody,
  SubmitCountryVerificationBody,
  SubmitDiasporaVerificationBody,
  SubmitIdentityVerificationBody,
  TrustCapabilityKey,
  VerificationType,
  WireAppeal,
  WireAppealDetail,
  WireBadge,
  WireConfirmation,
  WireEligibilityDecision,
  WireFeatureRequirement,
  WireModerationDecision,
  WireModerationQueueItem,
  WirePublicTrustProfile,
  WireReputationDimension,
  WireReputationEvent,
  WireReputationProfile,
  WireReputationRule,
  WireTrustProfile,
  WireTrustTimelineEvent,
  WireVerification,
  WireVerificationDetail,
  WireVerificationQueueItem,
} from '@/types/trust';
import { useReputationStore } from '@/store/reputation';
import { useTrustStore } from '@/store/trust';

// ── Shared plumbing ──────────────────────────────────────────────────────────

/**
 * A 401, 403 or 404 from this module is final. A **429 is too**, and that is
 * the one worth stating.
 *
 * The module's budget is ten requests a minute across every route. Retrying a
 * 429 spends the next permit on the retry, which is how a screen that was one
 * request over its budget becomes a screen that cannot load at all. The member
 * is told to wait instead.
 */
function shouldRetry(failureCount: number, cause: unknown): boolean {
  const httpStatus = (cause as { response?: { status?: number } })?.response?.status;
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 404 || httpStatus === 429) {
    return false;
  }
  return failureCount < 1;
}

/** A sentence for the member, or null. */
function messageFor(query: { isError: boolean; error: unknown }): string | null {
  return query.isError ? trustErrorMessage(query.error) : null;
}

/**
 * How long a trust read stays fresh.
 *
 * Five minutes for the member's own standing. A verification review has a
 * 24-hour SLA at its fastest, so a five-minute-old answer is not stale in any
 * sense a member would notice — and re-asking costs a tenth of the module's
 * per-minute budget.
 */
const SELF_STALE_MS = 5 * 60 * 1000;

/** Two minutes for staff queues, which do move while somebody is working them. */
const QUEUE_STALE_MS = 2 * 60 * 1000;

/** Ten minutes for somebody else's public standing. */
const PUBLIC_STALE_MS = 10 * 60 * 1000;

// ── Invalidation ─────────────────────────────────────────────────────────────
//
// One helper per fact that changes, rather than a list at each mutation.
// Getting this wrong here is not cosmetic: a member who has just submitted a
// verification and still sees "Unverified" on the Trust Centre has no way to
// tell whether the submission failed.

/** Everything about the caller's own standing. A grant changes all of it. */
function invalidateSelf(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: trustKeys.profile() });
  void client.invalidateQueries({ queryKey: trustKeys.timeline() });
  void client.invalidateQueries({ queryKey: trustKeys.badges() });
  void client.invalidateQueries({ queryKey: trustKeys.reputation() });
  // Every feature-requirements key, whatever country it was scoped to.
  void client.invalidateQueries({ queryKey: ['trust', 'feature-requirements'] });
}

/** Every verification list and the queue. */
function invalidateVerifications(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: trustKeys.verifications() });
}

/** Every appeal list, the queue, and the account-health counter appeals move. */
function invalidateAppeals(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: trustKeys.appeals() });
  void client.invalidateQueries({ queryKey: trustKeys.profile() });
}

// ── Profile ──────────────────────────────────────────────────────────────────

export interface UseTrustProfileResult {
  profile: WireTrustProfile | null;
  /**
   * Whether the server returned the staff-only risk fields.
   *
   * The Trust Centre rendered an "Internal Risk Index (Admin view)" panel for
   * every member, from a number the device computed. The server sends risk only
   * to a caller holding `trust:verification:review`, so for almost everyone
   * this is false and the panel should not be drawn at all.
   */
  canSeeRisk: boolean;
  riskScore: number | null;
  riskLevel: RiskLevel | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * `GET /trust/profile`. The whole Trust Centre in one read.
 *
 * **It also hydrates `store/trust.ts`**, and that side effect is deliberate
 * rather than incidental. `lib/trustEngine.ts` reads verification statuses,
 * account health and country standings synchronously through `getState()` from
 * five create screens; it cannot become a hook without rewriting all five, and
 * the backend explicitly expects the client to keep a local copy for instant
 * feedback. Putting the hydration here means the mirror is filled by *any*
 * consumer of the profile, so there is no screen where the engine can be asked
 * a question the server has already answered differently.
 *
 * The alternative — each screen remembering to hydrate — is the arrangement
 * that produced the fictional Mauritius member in the first place.
 *
 * React Query deduplicates by key, so five screens mounting this inside the
 * five-minute `staleTime` cost one request out of the module's ten a minute.
 */
export function useTrustProfile(options: { enabled?: boolean } = {}): UseTrustProfileResult {
  const hydrate = useTrustStore((state) => state.hydrateFromTrustProfile);

  const query = useQuery({
    queryKey: trustKeys.profile(),
    queryFn: fetchTrustProfile,
    enabled: options.enabled ?? true,
    staleTime: SELF_STALE_MS,
    retry: shouldRetry,
  });

  const profile = query.data ?? null;
  const canSeeRisk = hasStaffRiskView(profile);

  useEffect(() => {
    if (!profile) return;
    hydrate({
      verifications: profile.verifications,
      healthStatus: profile.healthStatus,
      countryReputations: profile.countryReputations,
      experienceTimeline: profile.experienceTimeline,
    });
  }, [profile, hydrate]);

  return {
    profile,
    canSeeRisk,
    riskScore: canSeeRisk ? (profile?.riskScore ?? null) : null,
    riskLevel: canSeeRisk ? (profile?.riskLevel ?? null) : null,
    isLoading: query.isLoading,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

export interface UsePublicTrustProfileResult {
  profile: WirePublicTrustProfile | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * `GET /trust/profiles/{userId}`.
 *
 * 404s for a member who has never touched a trust feature, which is not an
 * error worth surfacing as one — it means "no standing established yet".
 */
export function usePublicTrustProfile(userId: string | null): UsePublicTrustProfileResult {
  const query = useQuery({
    queryKey: trustKeys.publicProfile(userId ?? ''),
    queryFn: () => fetchPublicTrustProfile(userId as string),
    enabled: Boolean(userId),
    staleTime: PUBLIC_STALE_MS,
    retry: shouldRetry,
  });

  return {
    profile: query.data ?? null,
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

export interface UseTrustTimelineResult {
  events: WireTrustTimelineEvent[];
  totalCount: number | null;
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * `GET /trust/timeline`.
 *
 * One page, not an infinite query. The journey tab renders a vertical timeline
 * a member scrolls once; paging it would cost another request from a budget of
 * ten a minute to show entries nobody scrolled to.
 */
export function useTrustTimeline(
  options: { pageSize?: number; enabled?: boolean } = {}
): UseTrustTimelineResult {
  const query = useQuery({
    queryKey: trustKeys.timeline(options.pageSize),
    queryFn: () => fetchTrustTimeline({ pageSize: options.pageSize }),
    enabled: options.enabled ?? true,
    staleTime: SELF_STALE_MS,
    retry: shouldRetry,
  });

  const events = useMemo(() => query.data?.items ?? [], [query.data]);

  return {
    events,
    totalCount: query.data?.totalCount ?? null,
    isLoading: query.isLoading,
    isEmpty: query.isSuccess && events.length === 0,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

export interface UseMyBadgesResult {
  badges: WireBadge[];
  isLoading: boolean;
  error: string | null;
}

/** `GET /trust/badges/me` — a bare array of active badges. */
export function useMyBadges(options: { enabled?: boolean } = {}): UseMyBadgesResult {
  const query = useQuery({
    queryKey: trustKeys.badges(),
    queryFn: fetchMyBadges,
    enabled: options.enabled ?? true,
    staleTime: SELF_STALE_MS,
    retry: shouldRetry,
  });

  return {
    badges: query.data ?? [],
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

// ── Verifications ────────────────────────────────────────────────────────────

export interface UseMyVerificationsResult {
  verifications: WireVerification[];
  totalCount: number | null;
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
  refresh: () => void;
  /** The newest verification of one type, or null. */
  latestOfType: (type: VerificationType) => WireVerification | null;
}

/** `GET /trust/verifications`. */
export function useMyVerifications(
  filters: VerificationListFilters = {},
  options: { enabled?: boolean } = {}
): UseMyVerificationsResult {
  const query = useQuery({
    queryKey: trustKeys.verificationList(filters),
    queryFn: () => fetchMyVerifications(filters),
    enabled: options.enabled ?? true,
    staleTime: SELF_STALE_MS,
    retry: shouldRetry,
  });

  const verifications = useMemo(() => query.data?.items ?? [], [query.data]);

  return {
    verifications,
    totalCount: query.data?.totalCount ?? null,
    isLoading: query.isLoading,
    isEmpty: query.isSuccess && verifications.length === 0,
    error: messageFor(query),
    refresh: () => void query.refetch(),
    latestOfType: (type) => {
      const matching = verifications.filter((item) => item.type === type);
      if (matching.length === 0) return null;
      return matching.reduce((newest, item) =>
        Date.parse(item.submittedAt) > Date.parse(newest.submittedAt) ? item : newest
      );
    },
  };
}

export interface UseVerificationResult {
  detail: WireVerificationDetail | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * `GET /trust/verifications/{id}`.
 *
 * `documents[].documentUrl` is minted per request and lives ten minutes.
 * Refetching is how a screen gets a working link again; caching the URL beyond
 * that is how a member sees a broken image.
 */
export function useVerification(verificationId: string | null): UseVerificationResult {
  const query = useQuery({
    queryKey: trustKeys.verification(verificationId ?? ''),
    queryFn: () => fetchVerification(verificationId as string),
    enabled: Boolean(verificationId),
    // Shorter than the rest of this module on purpose: the presigned document
    // links in this payload expire after ten minutes.
    staleTime: 5 * 60 * 1000,
    retry: shouldRetry,
  });

  return {
    detail: query.data ?? null,
    isLoading: query.isLoading,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

export interface UseSubmitVerificationResult {
  submitDiaspora: (body: SubmitDiasporaVerificationBody) => Promise<WireVerification>;
  submitIdentity: (body: SubmitIdentityVerificationBody) => Promise<WireVerification>;
  submitCountry: (body: SubmitCountryVerificationBody) => Promise<WireVerification>;
  isPending: boolean;
  error: string | null;
}

/**
 * The three submission routes.
 *
 * One hook rather than three because a wizard uses exactly one of them and the
 * caller should not have to know which shape of hook it needs.
 */
export function useSubmitVerification(): UseSubmitVerificationResult {
  const client = useQueryClient();

  const onSubmitted = (created: WireVerification) => {
    client.setQueryData(trustKeys.verification(created.verificationId), undefined);
    invalidateVerifications(client);
    invalidateSelf(client);
  };

  // Not retried, and not because of idempotency alone. There is no idempotency
  // key on these routes, and the server refuses a second open request of the
  // same type with a 409 — so a retry after a successful-but-unacknowledged
  // call reports a duplicate error for a submission that actually worked.
  const diaspora = useMutation({
    mutationFn: submitDiasporaVerification,
    retry: false,
    onSuccess: onSubmitted,
  });

  const identity = useMutation({
    mutationFn: submitIdentityVerification,
    retry: false,
    onSuccess: onSubmitted,
  });

  const country = useMutation({
    mutationFn: submitCountryVerification,
    retry: false,
    onSuccess: onSubmitted,
  });

  return {
    submitDiaspora: (body) => diaspora.mutateAsync(body),
    submitIdentity: (body) => identity.mutateAsync(body),
    submitCountry: (body) => country.mutateAsync(body),
    isPending: diaspora.isPending || identity.isPending || country.isPending,
    error: messageFor(diaspora) ?? messageFor(identity) ?? messageFor(country),
  };
}

export interface UseVerificationQueueResult {
  items: WireVerificationQueueItem[];
  totalCount: number | null;
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
  refresh: () => void;
}

/** `GET /trust/verifications/queue`. Staff only — a 403 for everyone else. */
export function useVerificationQueue(
  filters: VerificationQueueFilters = {},
  options: { enabled?: boolean } = {}
): UseVerificationQueueResult {
  const query = useQuery({
    queryKey: trustKeys.verificationQueue(filters),
    queryFn: () => fetchVerificationQueue(filters),
    enabled: options.enabled ?? true,
    staleTime: QUEUE_STALE_MS,
    retry: shouldRetry,
  });

  const items = useMemo(() => query.data?.items ?? [], [query.data]);

  return {
    items,
    totalCount: query.data?.totalCount ?? null,
    isLoading: query.isLoading,
    isEmpty: query.isSuccess && items.length === 0,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

export interface UseVerificationReviewResult {
  assign: (verificationId: string, release?: boolean) => Promise<WireVerification>;
  review: (verificationId: string, body: ReviewVerificationBody) => Promise<WireVerification>;
  isPending: boolean;
  error: string | null;
}

/** The two staff actions on a verification. */
export function useVerificationReview(): UseVerificationReviewResult {
  const client = useQueryClient();

  const assignment = useMutation({
    mutationFn: (input: { verificationId: string; release: boolean }) =>
      assignVerification(input.verificationId, { release: input.release }),
    retry: false,
    onSuccess: (_result, input) => {
      void client.invalidateQueries({ queryKey: trustKeys.verification(input.verificationId) });
      invalidateVerifications(client);
    },
  });

  const decision = useMutation({
    mutationFn: (input: { verificationId: string; body: ReviewVerificationBody }) =>
      reviewVerification(input.verificationId, input.body),
    retry: false,
    onSuccess: (_result, input) => {
      void client.invalidateQueries({ queryKey: trustKeys.verification(input.verificationId) });
      invalidateVerifications(client);
    },
  });

  return {
    assign: (verificationId, release = false) =>
      assignment.mutateAsync({ verificationId, release }),
    review: (verificationId, body) => decision.mutateAsync({ verificationId, body }),
    isPending: assignment.isPending || decision.isPending,
    error: messageFor(assignment) ?? messageFor(decision),
  };
}

// ── Appeals ──────────────────────────────────────────────────────────────────

export interface UseMyAppealsResult {
  appeals: WireAppeal[];
  totalCount: number | null;
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
  refresh: () => void;
}

/** `GET /trust/appeals`. */
export function useMyAppeals(
  filters: { status?: AppealStatus | null; pageSize?: number | null } = {},
  options: { enabled?: boolean } = {}
): UseMyAppealsResult {
  const query = useQuery({
    queryKey: trustKeys.appealList(filters.status, filters.pageSize),
    queryFn: () => fetchMyAppeals(filters),
    enabled: options.enabled ?? true,
    staleTime: SELF_STALE_MS,
    retry: shouldRetry,
  });

  const appeals = useMemo(() => query.data?.items ?? [], [query.data]);

  return {
    appeals,
    totalCount: query.data?.totalCount ?? null,
    isLoading: query.isLoading,
    isEmpty: query.isSuccess && appeals.length === 0,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

/** A moderation decision about the member's own content, and asking for it to be reviewed. */
export function useMyModerationCase(caseId: string | null | undefined) {
  const client = useQueryClient();

  const query = useQuery({
    queryKey: ['trust', 'moderation-case', caseId ?? ''] as const,
    queryFn: () => fetchMyModerationCase(caseId as string),
    enabled: Boolean(caseId),
    retry: shouldRetry,
  });

  const review = useMutation({
    mutationFn: () => requestModerationReview(caseId as string),
    retry: false,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['trust', 'moderation-case', caseId ?? ''] });
    },
  });

  return {
    decision: query.data ?? null,
    isLoading: query.isLoading,
    error: messageFor(query),
    refresh: () => void query.refetch(),
    requestReview: () => review.mutateAsync(),
    isRequestingReview: review.isPending,
    reviewError: messageFor(review),
  };
}

export interface UseAppealResult {
  detail: WireAppealDetail | null;
  isLoading: boolean;
  error: string | null;
}

/** `GET /trust/appeals/{id}`. */
export function useAppeal(appealId: string | null): UseAppealResult {
  const query = useQuery({
    queryKey: trustKeys.appeal(appealId ?? ''),
    queryFn: () => fetchAppeal(appealId as string),
    enabled: Boolean(appealId),
    staleTime: SELF_STALE_MS,
    retry: shouldRetry,
  });

  return {
    detail: query.data ?? null,
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

export interface UseSubmitAppealResult {
  submit: (body: SubmitAppealBody) => Promise<WireAppeal>;
  isPending: boolean;
  error: string | null;
}

/**
 * `POST /trust/appeals`.
 *
 * A verification appeal moves the verification to `Appealed`, so the
 * verification lists are invalidated too — otherwise the member's own
 * verification still reads `Rejected` beside their new open appeal.
 */
export function useSubmitAppeal(): UseSubmitAppealResult {
  const client = useQueryClient();

  const mutation = useMutation({
    mutationFn: submitAppeal,
    retry: false,
    onSuccess: (created) => {
      client.setQueryData(trustKeys.appeal(created.appealId), undefined);
      invalidateAppeals(client);
      invalidateVerifications(client);
    },
  });

  return {
    submit: (body) => mutation.mutateAsync(body),
    isPending: mutation.isPending,
    error: messageFor(mutation),
  };
}

export interface UseAppealQueueResult {
  appeals: WireAppeal[];
  totalCount: number | null;
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
  refresh: () => void;
}

/** `GET /trust/appeals/queue`. Staff only. */
export function useAppealQueue(
  filters: AppealQueueFilters = {},
  options: { enabled?: boolean } = {}
): UseAppealQueueResult {
  const query = useQuery({
    queryKey: trustKeys.appealQueue(filters),
    queryFn: () => fetchAppealQueue(filters),
    enabled: options.enabled ?? true,
    staleTime: QUEUE_STALE_MS,
    retry: shouldRetry,
  });

  const appeals = useMemo(() => query.data?.items ?? [], [query.data]);

  return {
    appeals,
    totalCount: query.data?.totalCount ?? null,
    isLoading: query.isLoading,
    isEmpty: query.isSuccess && appeals.length === 0,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

export interface UseAppealReviewResult {
  review: (appealId: string, body: ReviewAppealBody) => Promise<WireAppeal>;
  isPending: boolean;
  error: string | null;
}

/**
 * `POST /trust/appeals/{id}/review`. Staff only.
 *
 * `lib/trust-api.ts` asserts the decision string before it leaves the device,
 * because the server treats anything it does not recognise as a rejection.
 */
export function useAppealReview(): UseAppealReviewResult {
  const client = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: { appealId: string; body: ReviewAppealBody }) =>
      reviewAppeal(input.appealId, input.body),
    retry: false,
    onSuccess: (_result, input) => {
      void client.invalidateQueries({ queryKey: trustKeys.appeal(input.appealId) });
      invalidateAppeals(client);
      invalidateVerifications(client);
    },
  });

  return {
    review: (appealId, body) => mutation.mutateAsync({ appealId, body }),
    isPending: mutation.isPending,
    error: messageFor(mutation),
  };
}

// ── Reputation ───────────────────────────────────────────────────────────────

export interface UseReputationResult {
  reputation: WireReputationProfile | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * `GET /trust/reputation/me`. Never 404s — a new member is a `Member` on zero.
 *
 * The one fetch of this route in the app. Every result is mirrored into
 * `store/reputation.ts`, which `lib/trustEngine.ts` reads synchronously; the
 * store used to fetch for itself, and the Profile tab and the reputation screen
 * paid for the same profile twice.
 */
export function useMyReputation(options: { enabled?: boolean } = {}): UseReputationResult {
  const hydrate = useReputationStore((state) => state.hydrateFromReputationProfile);

  const query = useQuery({
    queryKey: trustKeys.reputation(),
    queryFn: fetchMyReputation,
    enabled: options.enabled ?? true,
    staleTime: SELF_STALE_MS,
    retry: shouldRetry,
  });

  useEffect(() => {
    if (query.data) hydrate(query.data);
  }, [query.data, hydrate]);

  return {
    reputation: query.data ?? null,
    isLoading: query.isLoading,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

export interface UseReputationRulesResult {
  /** Empty until loaded, and on a server that does not serve the rules. */
  rules: WireReputationRule[];
  isLoading: boolean;
  error: string | null;
}

/**
 * `GET /trust/reputation/rules`. What the platform pays reputation for.
 *
 * Fetched once a session: the rules change only with a deployment, and the
 * Trust client is held to ten requests a minute, so the reputation screen's
 * third request is paid the first time it opens and never again.
 */
export function useReputationRules(options: { enabled?: boolean } = {}): UseReputationRulesResult {
  const query = useQuery({
    queryKey: trustKeys.reputationRules(),
    queryFn: fetchReputationRules,
    enabled: options.enabled ?? true,
    staleTime: Infinity,
    retry: shouldRetry,
  });

  return {
    rules: query.data ?? [],
    isLoading: query.isLoading,
    error: messageFor(query),
  };
}

export interface UseReputationEventsResult {
  events: WireReputationEvent[];
  totalCount: number | null;
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
}

/** `GET /trust/reputation/me/events`. The real points ledger. */
export function useMyReputationEvents(
  filters: { dimension?: WireReputationDimension | null; pageSize?: number | null } = {},
  options: { enabled?: boolean } = {}
): UseReputationEventsResult {
  const query = useQuery({
    queryKey: trustKeys.reputationEvents(filters.dimension, filters.pageSize),
    queryFn: () => fetchMyReputationEvents(filters),
    enabled: options.enabled ?? true,
    staleTime: SELF_STALE_MS,
    retry: shouldRetry,
  });

  const events = useMemo(() => query.data?.items ?? [], [query.data]);

  return {
    events,
    totalCount: query.data?.totalCount ?? null,
    isLoading: query.isLoading,
    isEmpty: query.isSuccess && events.length === 0,
    error: messageFor(query),
  };
}

export interface UseRecordConfirmationResult {
  confirm: (body: RecordConfirmationBody) => Promise<WireConfirmation>;
  isPending: boolean;
  error: string | null;
}

/**
 * `POST /trust/contributions/confirmations`.
 *
 * Replaces the invented `POST /trust/community-voting`. **It pays nobody**:
 * since 21 Oct 2026 (CS-3) the route records the confirmation and answers
 * `pointsAwarded: 0`, because it paid an author the client named for a target
 * nothing checked. A confirmation is scored from the corroborating reaction
 * instead, which pays the author Community itself names. Nothing of the
 * caller's changes, so nothing is invalidated. No screen calls this.
 */
export function useRecordConfirmation(): UseRecordConfirmationResult {
  const mutation = useMutation({
    mutationFn: recordConfirmation,
    retry: false,
  });

  return {
    confirm: (body) => mutation.mutateAsync(body),
    isPending: mutation.isPending,
    error: messageFor(mutation),
  };
}

// ── Eligibility ──────────────────────────────────────────────────────────────

export interface UseFeatureRequirementsResult {
  requirements: WireFeatureRequirement[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  requirementFor: (featureId: TrustCapabilityKey) => WireFeatureRequirement | null;
}

/**
 * `GET /trust/feature-requirements`.
 *
 * The server-side replacement for `TrustEngine.getFeatureUnlockRequirements`,
 * which computed the same checklist on the device from `GOVERNANCE_CONFIG` —
 * thresholds shipped to every phone and editable by anyone with a debugger.
 * That code is still there for instant feedback; this is the answer that
 * decides.
 */
export function useFeatureRequirements(
  targetCountry?: string | null,
  options: { enabled?: boolean } = {}
): UseFeatureRequirementsResult {
  const query = useQuery({
    queryKey: trustKeys.featureRequirements(targetCountry),
    queryFn: () => fetchFeatureRequirements(targetCountry),
    enabled: options.enabled ?? true,
    staleTime: SELF_STALE_MS,
    retry: shouldRetry,
  });

  const requirements = useMemo(() => query.data ?? [], [query.data]);

  return {
    requirements,
    isLoading: query.isLoading,
    error: messageFor(query),
    refresh: () => void query.refetch(),
    requirementFor: (featureId) =>
      requirements.find((item) => item.featureId === featureId) ?? null,
  };
}

export interface UseEligibilityCheckResult {
  /**
   * Ask the server whether the caller may act.
   *
   * Pass `dryRun: false` **only at the moment the member commits** — that call
   * consumes one of their daily permits for the capability, and a screen that
   * greys out a button with a live check has spent a permit for a button
   * nobody pressed.
   */
  check: (body: EvaluateEligibilityBody) => Promise<WireEligibilityDecision>;
  isPending: boolean;
  error: string | null;
}

/**
 * `POST /trust/eligibility`.
 *
 * A mutation, and uncached, for the two reasons in this file's header. The
 * client's own `TrustEngine.evaluateAction` still runs for instant feedback;
 * this is what the submit button should wait for.
 */
export function useEligibilityCheck(): UseEligibilityCheckResult {
  const mutation = useMutation({
    mutationFn: evaluateEligibility,
    // A retried non-dry-run check spends a second permit to ask the same
    // question. The member would be rate-limited by their own client.
    retry: false,
  });

  return {
    check: (body) => mutation.mutateAsync(body),
    isPending: mutation.isPending,
    error: messageFor(mutation),
  };
}

// ── Moderation ───────────────────────────────────────────────────────────────

export interface UseTrustModerationQueueResult {
  items: WireModerationQueueItem[];
  totalCount: number | null;
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * `GET /trust/moderation/queue`.
 *
 * Trust's queue, not Community's. `app/moderation/queue.tsx` renders
 * `GET /community/moderation/queue`, which is a different module with different
 * items and different identifiers. Both are real; neither is the other.
 */
export function useTrustModerationQueue(
  filters: ModerationQueueFilters = {},
  options: { enabled?: boolean } = {}
): UseTrustModerationQueueResult {
  const query = useQuery({
    queryKey: trustKeys.moderationQueue(filters),
    queryFn: () => fetchModerationQueue(filters),
    enabled: options.enabled ?? true,
    staleTime: QUEUE_STALE_MS,
    retry: shouldRetry,
  });

  const items = useMemo(() => query.data?.items ?? [], [query.data]);

  return {
    items,
    totalCount: query.data?.totalCount ?? null,
    isLoading: query.isLoading,
    isEmpty: query.isSuccess && items.length === 0,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

export interface UseTrustModerationActionsResult {
  assign: (itemId: string, release?: boolean) => Promise<WireModerationQueueItem>;
  decide: (itemId: string, body: RecordModerationDecisionBody) => Promise<WireModerationDecision>;
  isPending: boolean;
  error: string | null;
}

/** The two staff actions on a Trust moderation queue item. */
export function useTrustModerationActions(): UseTrustModerationActionsResult {
  const client = useQueryClient();

  const assignment = useMutation({
    mutationFn: (input: { itemId: string; release: boolean }) =>
      assignModerationItem(input.itemId, { release: input.release }),
    retry: false,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: trustKeys.moderation() });
    },
  });

  const decision = useMutation({
    mutationFn: (input: { itemId: string; body: RecordModerationDecisionBody }) =>
      recordModerationDecision(input.itemId, input.body),
    retry: false,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: trustKeys.moderation() });
    },
  });

  return {
    assign: (itemId, release = false) => assignment.mutateAsync({ itemId, release }),
    decide: (itemId, body) => decision.mutateAsync({ itemId, body }),
    isPending: assignment.isPending || decision.isPending,
    error: messageFor(assignment) ?? messageFor(decision),
  };
}
