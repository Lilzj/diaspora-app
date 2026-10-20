// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — API client for UNSUPPORTED creator capabilities
//
// ⚠ EVERY ROUTE IN THIS FILE IS SIMULATED. NONE EXISTS IN THE CERTIFIED
//   BACKEND. See `src/config/creator-gaps.ts`. ⚠
//
// This is the **development arm** of §34's repository split. The backend arm is
// `financial-api.ts` (real money, real placements, real entitlements),
// `notifications-api.ts` (real notifications) and the real `/trust/*` routes.
// `hooks/creator-economy.ts` is the stable domain interface above both; the UI
// does not know — and must not be able to tell — which arm answered.
//
// Deliberately separate from every real API module, and deliberately behind
// `/creator-gap/v0` rather than `/creator`. Three consequences, all wanted:
//
//   * A reviewer reading a screen's imports can tell at a glance whether it
//     talks to a real backend.
//   * If one of these calls ever escapes a development build it 404s at the
//     gateway. It cannot collide with, shadow, or be mistaken for a certified
//     route, and it cannot move real money.
//   * The eventual migration is mechanical: when a backend phase implements
//     milestones, the repository swaps this import for a real one and the
//     request shapes already match.
//
// Every function refuses to run when creator gap features are disabled, so the
// guarantee does not depend on a screen remembering to check.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { FinancialError, toFinancialError } from './financial-errors';
import { CREATOR_GAPS, CREATOR_GAP_PREFIX, areCreatorGapsEnabled } from '@/config/creator-gaps';
import type { PlatformEnvelope } from '@/types/financial';
import type {
  AnalyticsRange,
  CommunityGrant,
  CreatorAcademySection,
  CreatorAnalyticsSummary,
  CreatorCertificate,
  CreatorChallenge,
  CreatorContentPerformancePage,
  CreatorCourse,
  CreatorCourseProgress,
  CreatorDashboardSummary,
  CreatorEarningsPage,
  CreatorLeaderboard,
  CreatorLesson,
  CreatorMilestone,
  CreatorPointRule,
  CreatorProfile,
  CreatorRecommendation,
  CreatorReferralPage,
  CreatorReferralProgramme,
  CreatorReward,
  CreatorRewardRedemption,
  CreatorRevenueSummary,
  CreatorVerification,
  GrantApplication,
  GrantApplicationForm,
  LessonQuizResult,
  PublicCreator,
  SignupBonus,
  SponsoredContentItem,
  SubmitCreatorVerificationRequest,
  SubmitGrantApplicationRequest,
} from '@/types/creator-economy';

// ─────────────────────────────────────────────────────────────────────────────
// Query keys
//
// Namespaced under `creator-gap` so a cache dump is unambiguous about which
// entries came from a simulation. Never collides with `financialKeys` or
// `monetizationGapKeys`.
// ─────────────────────────────────────────────────────────────────────────────

export const creatorGapKeys = {
  all: ['creator-gap'] as const,

  dashboard: () => ['creator-gap', 'dashboard'] as const,

  profile: () => ['creator-gap', 'profile', 'me'] as const,
  publicProfile: (id: string) => ['creator-gap', 'profile', 'public', id] as const,
  reputation: () => ['creator-gap', 'reputation'] as const,
  publicReputation: (creatorId: string) => ['creator-gap', 'reputation', creatorId] as const,

  verification: () => ['creator-gap', 'verification'] as const,

  milestones: () => ['creator-gap', 'milestones'] as const,

  challenges: (state?: string) => ['creator-gap', 'challenges', 'list', state ?? 'all'] as const,
  challenge: (id: string) => ['creator-gap', 'challenges', id] as const,
  challengeLeaderboard: (id: string) => ['creator-gap', 'challenges', id, 'leaderboard'] as const,

  grants: (category?: string) => ['creator-gap', 'grants', 'list', category ?? 'all'] as const,
  grant: (id: string) => ['creator-gap', 'grants', id] as const,
  grantForm: (id: string) => ['creator-gap', 'grants', id, 'form'] as const,
  grantApplications: () => ['creator-gap', 'grants', 'applications', 'me'] as const,
  grantApplication: (id: string) => ['creator-gap', 'grants', 'applications', id] as const,

  academySections: () => ['creator-gap', 'academy', 'sections'] as const,
  courses: (section?: string) => ['creator-gap', 'academy', 'courses', section ?? 'all'] as const,
  course: (id: string) => ['creator-gap', 'academy', 'courses', id] as const,
  lessons: (courseId: string) => ['creator-gap', 'academy', 'courses', courseId, 'lessons'] as const,
  lesson: (id: string) => ['creator-gap', 'academy', 'lessons', id] as const,
  certificates: () => ['creator-gap', 'academy', 'certificates'] as const,

  analytics: (fingerprint: string) => ['creator-gap', 'analytics', fingerprint] as const,
  contentPerformance: (fingerprint: string) =>
    ['creator-gap', 'analytics', 'content', fingerprint] as const,

  revenueSummary: (period?: string) =>
    ['creator-gap', 'revenue', 'summary', period ?? 'default'] as const,
  earnings: (state?: string, source?: string) =>
    ['creator-gap', 'revenue', 'earnings', state ?? 'all', source ?? 'all'] as const,

  referralProgramme: () => ['creator-gap', 'referrals', 'me'] as const,
  referralHistory: () => ['creator-gap', 'referrals', 'history'] as const,

  signupBonus: () => ['creator-gap', 'signup-bonus'] as const,

  pointRules: () => ['creator-gap', 'points', 'rules'] as const,
  rewardCatalogue: () => ['creator-gap', 'rewards', 'catalogue'] as const,
  redemptions: () => ['creator-gap', 'rewards', 'redemptions'] as const,

  leaderboard: (scope: string, period?: string) =>
    ['creator-gap', 'leaderboard', scope, period ?? 'default'] as const,

  recommendations: (surface?: string) =>
    ['creator-gap', 'recommendations', surface ?? 'all'] as const,

  directory: (fingerprint: string) => ['creator-gap', 'directory', fingerprint] as const,

  sponsored: (state?: string) => ['creator-gap', 'sponsored', state ?? 'all'] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Transport
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The refusal a gap route produces in a build where gap features are off.
 *
 * A `FinancialError` rather than a thrown string, so the same components render
 * it as they render every other platform failure — a member on a production
 * build sees a coherent "not available yet" rather than a crash. Reusing the
 * financial error type across domains is deliberate: there is one error surface
 * in this app, and a second one would drift.
 */
function unavailable(gapKey: string): FinancialError {
  const gap = CREATOR_GAPS[gapKey];
  return new FinancialError({
    kind: 'unavailable',
    code: `frontend.creator-gap.${gapKey}`,
    message: `${gap?.title ?? 'This'} is not available on Diaspora yet.`,
    hint: 'The platform does not support it yet. We will let you know when it arrives.',
    isRetryable: false,
    isTerminal: true,
    isIndeterminate: false,
  });
}

function assertEnabled(gapKey: string): void {
  if (!areCreatorGapsEnabled()) throw unavailable(gapKey);
}

async function read<T>(
  gapKey: string,
  path: string,
  params?: Record<string, unknown> | object
): Promise<T> {
  assertEnabled(gapKey);
  try {
    const response = await apiClient.get<PlatformEnvelope<T>>(
      `${CREATOR_GAP_PREFIX}${path}`,
      { params }
    );
    return response.data.data;
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}

/**
 * Every write is classified `mutating`, exactly as the real financial client
 * does, so a transport failure on a simulated grant submission becomes an
 * *indeterminate* outcome rather than a failed one.
 *
 * The simulation reproduces the real failure semantics on purpose: a flow
 * tested against forgiving mocks is a flow that breaks the first time a real
 * gateway is slow, and "did my grant application send?" is precisely the
 * question a member must never be left guessing at.
 */
async function write<T>(
  gapKey: string,
  method: 'post' | 'put' | 'delete',
  path: string,
  body?: unknown,
  params?: Record<string, unknown> | object
): Promise<T> {
  assertEnabled(gapKey);
  try {
    const url = `${CREATOR_GAP_PREFIX}${path}`;
    const response =
      method === 'delete'
        ? await apiClient.delete<PlatformEnvelope<T>>(url, { params })
        : method === 'put'
          ? await apiClient.put<PlatformEnvelope<T>>(url, body, { params })
          : await apiClient.post<PlatformEnvelope<T>>(url, body, { params });
    return response.data.data;
  } catch (cause) {
    throw toFinancialError(cause, 'mutating');
  }
}

// ── Dashboard — spans several gaps, so keyed to the profile gap ──────────────

/**
 * The one call the dashboard makes on first paint.
 *
 * §39: the dashboard must not become an API waterfall. Everything deeper is
 * fetched by the screen that needs it, and this summary carries only what the
 * first screenful renders plus the counts that decide which sections collapse.
 */
export function fetchDashboardSummary(): Promise<CreatorDashboardSummary> {
  return read<CreatorDashboardSummary>('dashboardSummary', '/creators/me/dashboard');
}

// ── Creator profile and status — CREATOR-GAP-001 ─────────────────────────────

export function fetchCreatorProfile(): Promise<CreatorProfile> {
  return read<CreatorProfile>('profile', '/creators/me');
}

export interface UpdateCreatorProfileRequest {
  /**
   * The creator's display name.
   *
   * Added when the creator profile absorbed `/edit-profile`, a stub screen
   * whose Save only called `router.back()`. The field was editable there and
   * went nowhere; it is editable on the profile now and goes here.
   */
  displayName?: string;
  bio?: string;
  categories?: string[];
  expertise?: string[];
  languages?: string[];
  coverImageUrl?: string | null;
  isDiscoverable?: boolean;
}

export function updateCreatorProfile(request: UpdateCreatorProfileRequest): Promise<CreatorProfile> {
  return write<CreatorProfile>('profile', 'put', '/creators/me', request);
}

export function fetchPublicCreator(creatorId: string): Promise<PublicCreator> {
  return read<PublicCreator>('discovery', `/creators/${creatorId}`);
}

// ── Verification — CREATOR-GAP-002 ───────────────────────────────────────────

export function fetchCreatorVerification(): Promise<CreatorVerification> {
  return read<CreatorVerification>('verification', '/creators/me/verification');
}

export function startCreatorVerification(): Promise<CreatorVerification> {
  return write<CreatorVerification>('verification', 'post', '/creators/me/verification');
}

export function submitCreatorVerification(
  request: SubmitCreatorVerificationRequest
): Promise<CreatorVerification> {
  return write<CreatorVerification>('verification', 'post', '/creators/me/verification/submit', request);
}

export function appealCreatorVerification(reason: string): Promise<CreatorVerification> {
  return write<CreatorVerification>('verification', 'post', '/creators/me/verification/appeal', { reason });
}

// ── Milestones — CREATOR-GAP-003 ─────────────────────────────────────────────

export function fetchMilestones(): Promise<CreatorMilestone[]> {
  return read<CreatorMilestone[]>('milestones', '/creators/me/milestones');
}

export function claimMilestone(milestoneId: string, idempotencyKey?: string): Promise<CreatorMilestone> {
  return write<CreatorMilestone>('milestones', 'post', `/creators/me/milestones/${milestoneId}/claim`, {
    idempotencyKey,
  });
}

// ── Challenges — CREATOR-GAP-004 ─────────────────────────────────────────────

export function fetchChallenges(params: { state?: string; take?: number } = {}): Promise<CreatorChallenge[]> {
  return read<CreatorChallenge[]>('challenges', '/challenges', params);
}

export function fetchChallenge(challengeId: string): Promise<CreatorChallenge> {
  return read<CreatorChallenge>('challenges', `/challenges/${challengeId}`);
}

export function joinChallenge(challengeId: string, idempotencyKey?: string): Promise<CreatorChallenge> {
  return write<CreatorChallenge>('challenges', 'post', `/challenges/${challengeId}/join`, { idempotencyKey });
}

export function claimChallenge(challengeId: string, idempotencyKey?: string): Promise<CreatorChallenge> {
  return write<CreatorChallenge>('challenges', 'post', `/challenges/${challengeId}/claim`, { idempotencyKey });
}

export function fetchChallengeLeaderboard(challengeId: string): Promise<CreatorLeaderboard> {
  return read<CreatorLeaderboard>('leaderboards', `/challenges/${challengeId}/leaderboard`);
}

// ── Grants — CREATOR-GAP-005 ─────────────────────────────────────────────────

export function fetchGrants(
  params: { category?: string; country?: string; state?: string } = {}
): Promise<CommunityGrant[]> {
  return read<CommunityGrant[]>('grants', '/grants', params);
}

export function fetchGrant(grantId: string): Promise<CommunityGrant> {
  return read<CommunityGrant>('grants', `/grants/${grantId}`);
}

/** The form as data. §24: the frontend does not hard-code a grant's questions. */
export function fetchGrantForm(grantId: string): Promise<GrantApplicationForm> {
  return read<GrantApplicationForm>('grants', `/grants/${grantId}/form`);
}

export function fetchGrantApplications(): Promise<GrantApplication[]> {
  return read<GrantApplication[]>('grants', '/grants/applications/me');
}

export function saveGrantDraft(
  grantId: string,
  answers: Record<string, string>
): Promise<GrantApplication> {
  return write<GrantApplication>('grants', 'post', `/grants/${grantId}/applications`, { answers });
}

export function submitGrantApplication(
  request: SubmitGrantApplicationRequest
): Promise<GrantApplication> {
  return write<GrantApplication>(
    'grants',
    'post',
    `/grants/${request.grantId}/applications/submit`,
    request
  );
}

export function withdrawGrantApplication(applicationId: string): Promise<GrantApplication> {
  return write<GrantApplication>('grants', 'post', `/grants/applications/${applicationId}/withdraw`);
}

// ── Academy — CREATOR-GAP-006 ────────────────────────────────────────────────

export function fetchAcademySections(): Promise<CreatorAcademySection[]> {
  return read<CreatorAcademySection[]>('academy', '/academy/sections');
}

export function fetchCourses(
  params: { section?: string; level?: string } = {}
): Promise<CreatorCourse[]> {
  return read<CreatorCourse[]>('academy', '/academy/courses', params);
}

export function fetchCourseLessons(courseId: string): Promise<CreatorLesson[]> {
  return read<CreatorLesson[]>('academy', `/academy/courses/${courseId}/lessons`);
}

export function completeLesson(
  lessonId: string,
  idempotencyKey?: string
): Promise<CreatorCourseProgress> {
  return write<CreatorCourseProgress>('academy', 'post', `/academy/lessons/${lessonId}/complete`, {
    idempotencyKey,
  });
}

/**
 * Grades a quiz.
 *
 * Server-side on purpose, even in the simulation. `LessonQuizOption` carries no
 * `isCorrect`, so the device genuinely cannot mark the paper — which is what
 * makes the assessment mean anything and what makes the eventual real
 * implementation a route change rather than a redesign.
 */
export function submitQuiz(
  quizId: string,
  answers: { questionId: string; optionId: string }[]
): Promise<LessonQuizResult> {
  return write<LessonQuizResult>('academy', 'post', `/academy/quizzes/${quizId}/submit`, { answers });
}

export function setCourseSaved(courseId: string, isSaved: boolean): Promise<CreatorCourse> {
  return write<CreatorCourse>('academy', 'put', `/academy/courses/${courseId}/saved`, { isSaved });
}

export function fetchCertificates(): Promise<CreatorCertificate[]> {
  return read<CreatorCertificate[]>('academy', '/academy/certificates/me');
}

// ── Analytics — CREATOR-GAP-007 ──────────────────────────────────────────────

export function fetchCreatorAnalytics(range: AnalyticsRange): Promise<CreatorAnalyticsSummary> {
  return read<CreatorAnalyticsSummary>('analytics', '/creators/me/analytics', {
    period: range.period,
    from: range.from ?? undefined,
    to: range.to ?? undefined,
  });
}

export function fetchContentPerformance(params: {
  period: string;
  from?: string | null;
  to?: string | null;
  contentType?: string;
  cursor?: string;
  take?: number;
}): Promise<CreatorContentPerformancePage> {
  return read<CreatorContentPerformancePage>('analytics', '/creators/me/analytics/content', {
    ...params,
    from: params.from ?? undefined,
    to: params.to ?? undefined,
  });
}

// ── Revenue — CREATOR-GAP-008 ────────────────────────────────────────────────

export function fetchRevenueSummary(period?: string): Promise<CreatorRevenueSummary> {
  return read<CreatorRevenueSummary>('revenue', '/creators/me/revenue/summary', { period });
}

export function fetchEarnings(
  params: { state?: string; source?: string; cursor?: string; take?: number } = {}
): Promise<CreatorEarningsPage> {
  return read<CreatorEarningsPage>('revenue', '/creators/me/earnings', params);
}

// ── Referrals — CREATOR-GAP-009 ──────────────────────────────────────────────

export function fetchReferralProgramme(): Promise<CreatorReferralProgramme> {
  return read<CreatorReferralProgramme>('referrals', '/referrals/me');
}

export function fetchReferralHistory(
  params: { cursor?: string; take?: number } = {}
): Promise<CreatorReferralPage> {
  return read<CreatorReferralPage>('referrals', '/referrals/me/history', params);
}

// ── Sign-up bonus — CREATOR-GAP-010 ──────────────────────────────────────────

export function fetchSignupBonus(): Promise<SignupBonus> {
  return read<SignupBonus>('signupBonus', '/rewards/signup-bonus/me');
}

/**
 * Records that the member accepted the bonus.
 *
 * §19: the frontend never awards a point. This returns the *state* the server
 * decided, and the points balance is re-read from Phase 5's rewards adapter
 * rather than incremented here.
 */
export function acknowledgeSignupBonus(idempotencyKey?: string): Promise<SignupBonus> {
  return write<SignupBonus>('signupBonus', 'post', '/rewards/signup-bonus/acknowledge', {
    idempotencyKey,
  });
}

// ── Point rules and reward catalogue — CREATOR-GAP-011 ───────────────────────

export function fetchPointRules(): Promise<CreatorPointRule[]> {
  return read<CreatorPointRule[]>('pointRules', '/rewards/rules');
}

export function fetchRewardCatalogue(): Promise<CreatorReward[]> {
  return read<CreatorReward[]>('pointRules', '/rewards/catalogue');
}

export function fetchRedemptions(): Promise<CreatorRewardRedemption[]> {
  return read<CreatorRewardRedemption[]>('pointRules', '/rewards/redemptions/me');
}

export function redeemReward(
  rewardId: string,
  idempotencyKey?: string
): Promise<CreatorRewardRedemption> {
  return write<CreatorRewardRedemption>('pointRules', 'post', '/rewards/redemptions', {
    rewardId,
    idempotencyKey,
  });
}

// ── Leaderboards — CREATOR-GAP-012 ───────────────────────────────────────────

export function fetchLeaderboard(
  params: { scope: string; period?: string; country?: string; take?: number }
): Promise<CreatorLeaderboard> {
  return read<CreatorLeaderboard>('leaderboards', '/creators/leaderboard', params);
}

// ── Recommendations — CREATOR-GAP-013 ────────────────────────────────────────

export function fetchCreatorRecommendations(
  surface?: string,
  take?: number
): Promise<CreatorRecommendation[]> {
  return read<CreatorRecommendation[]>('recommendations', '/recommendations/creator', {
    surface,
    take,
  });
}

/** Dismissal is a round trip, so it holds across devices. §28. */
export function dismissRecommendation(recommendationId: string): Promise<void> {
  return write<void>('recommendations', 'post', `/recommendations/${recommendationId}/dismiss`);
}

// ── Directory — CREATOR-GAP-014 ──────────────────────────────────────────────

export interface CreatorDirectoryParams {
  query?: string;
  country?: string;
  category?: string;
  expertise?: string;
  verified?: boolean;
  cursor?: string;
  take?: number;
}

export interface CreatorDirectoryPage {
  creators: PublicCreator[];
  nextCursor?: string | null;
  hasMore: boolean;
}

export function fetchCreatorDirectory(params: CreatorDirectoryParams): Promise<CreatorDirectoryPage> {
  return read<CreatorDirectoryPage>('discovery', '/creators', params);
}

// ── Sponsored content — the creator's view over real placements ──────────────

/**
 * The creator-facing sponsored content list.
 *
 * The placements underneath are **real** — bought through B15, cancellable
 * through B15. What this route adds is the approval state and the delivery
 * figures, which are MON-GAP-006 and MON-GAP-002 respectively. The list is
 * assembled here so the creator surface has one call rather than three, and the
 * screen marks the simulated columns rather than the whole table.
 */
export function fetchSponsoredContent(state?: string): Promise<SponsoredContentItem[]> {
  return read<SponsoredContentItem[]>('sponsorship', '/creators/me/sponsored', { state });
}
