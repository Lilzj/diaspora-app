// ═════════════════════════════════════════════════════════════════════════════
//
//   ⚠  BACKEND GAP / DEVELOPMENT ONLY  ⚠
//
//   NOTHING IN THIS FILE MIRRORS A CERTIFIED BACKEND CONTRACT.
//
//   Every route registered here is invented. The certified platform has no
//   creator aggregate, no creator verification programme, no milestone, no
//   challenge, no grant, no Academy, no creator analytics, no earning
//   attribution, no referral programme, no sign-up bonus, no points rules
//   catalogue, no creator leaderboard, no creator recommendation surface and no
//   creator directory. These handlers exist so the Phase 7 flows can be built,
//   reviewed and tested now — and so closing each gap is a change of import
//   rather than a redesign.
//
//   Three safeguards, none of which is a comment:
//
//     * The prefix is `/creator-gap/v0`, never `/creator` and never
//       `/financial`. A call that escaped to a real deployment 404s.
//     * `setupCreatorEconomyMocks` refuses to register in a release build.
//     * Every screen behind these routes renders `<CreatorGapNotice>`.
//
//   The simulation is **stateful within a session** and reproduces the awkward
//   parts of a real contract rather than the easy ones:
//
//     * A submitted verification sits `Submitted`, moves to `UnderReview` on a
//       timer, and only then can be decided. It never returns `Approved` from
//       the submit call, because a real review does not happen in 200ms and a
//       flow tested against one that does has never been tested.
//     * A milestone can only be claimed once, and claiming one that is not
//       `Completed` is refused with a problem document.
//     * Quiz grading happens **here**, and the answer key never leaves this
//       file — `LessonQuizOption` has no `isCorrect` field for the client to
//       read even if it wanted to.
//     * Eligibility refusals are server-side. An ineligible grant application
//       is refused with a reason rather than being prevented only by a disabled
//       button, so the screen's error path is exercised.
//
//   See `src/config/creator-gaps.ts` and
//   `frontend-phase-7-creator-economy-backend-gap-register.md`.
//
// ═════════════════════════════════════════════════════════════════════════════

import type MockAdapter from 'axios-mock-adapter';
import { CREATOR_GAP_PREFIX, areCreatorGapsEnabled } from '@/config/creator-gaps';
import { money } from '../financial-data';
import {
  MOCK_ACADEMY_SECTIONS,
  MOCK_CHALLENGES,
  MOCK_CONTENT_PERFORMANCE,
  MOCK_COURSES,
  MOCK_CREATOR_PROFILE,
  MOCK_CREATOR_REPUTATION,
  MOCK_CREATOR_VERIFICATION,
  MOCK_DEFAULT_GRANT_FORM,
  MOCK_EARNINGS,
  MOCK_GRANT_APPLICATIONS,
  MOCK_GRANT_FORMS,
  MOCK_GRANTS,
  MOCK_LESSONS,
  MOCK_MILESTONES,
  MOCK_POINT_RULES,
  MOCK_PUBLIC_CREATORS,
  MOCK_RECOMMENDATIONS,
  MOCK_REFERRAL_PROGRAMME,
  MOCK_REFERRALS,
  MOCK_REVENUE_SUMMARY,
  MOCK_REWARD_CATALOGUE,
  MOCK_SIGNUP_BONUS,
  MOCK_SPONSORED_CONTENT,
  isoDaysAgo,
  mockLeaderboard,
  mockMetricsForPeriod,
  mockSeries,
} from '../creator-economy-data';
import type {
  CommunityGrant,
  CreatorChallenge,
  CreatorCourse,
  CreatorDashboardSummary,
  CreatorLesson,
  CreatorMilestone,
  CreatorProfile,
  CreatorRecommendation,
  CreatorReward,
  CreatorRewardRedemption,
  CreatorVerification,
  GrantApplication,
  LessonQuizResult,
  SignupBonus,
} from '@/types/creator-economy';

const ROOT = CREATOR_GAP_PREFIX;

/** `axios-mock-adapter` wants a fixed-arity tuple, not a loose array. */
type MockReply = [number, unknown];

function ok(data: unknown): MockReply {
  return [200, { data }];
}

function problem(status: number, errorCode: string, detail: string): MockReply {
  return [
    status,
    {
      type: `https://docs.diaspora.app/errors/${errorCode}`,
      title: 'Request refused',
      status,
      detail,
      // `code`, as PlatformProblem writes it. These mocks sent `errorCode`,
      // which matched the client's old lookup and nothing the platform ever sent —
      // so mocked runs agreed with the defect instead of exposing it.
      code: errorCode,
    },
  ];
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function body<T>(config: { data?: unknown }): T {
  try {
    return config.data ? (JSON.parse(String(config.data)) as T) : ({} as T);
  } catch {
    return {} as T;
  }
}

/** The last path segment, for `/milestones/{id}/claim` style routes. */
function segment(url: string | undefined, fromEnd: number): string {
  const parts = (url ?? '').split('?')[0].split('/').filter(Boolean);
  return parts[parts.length - 1 - fromEnd] ?? '';
}

/**
 * The quiz answer key.
 *
 * Lives here and only here. `LessonQuizOption` deliberately carries no
 * `isCorrect`, so the client genuinely cannot mark its own paper — which is
 * what makes the assessment worth having and what makes the real
 * implementation a route change rather than a redesign.
 */
const QUIZ_ANSWERS: Record<string, Record<string, string>> = {
  'quiz-guide-craft': { q1: 'b', q2: 'c', q3: 'b', q4: 'c' },
};

/**
 * Lessons for a course that has none written out.
 *
 * Keeps the fixture file readable without leaving a course that opens onto an
 * empty screen. Generated deterministically from the course, so the same course
 * always produces the same lessons.
 */
function synthesiseLessons(course: CreatorCourse): CreatorLesson[] {
  const perLesson = Math.max(3, Math.round(course.estimatedMinutes / course.lessonCount));

  return Array.from({ length: course.lessonCount }, (_, index) => ({
    lessonId: `${course.courseId}-lesson-${index + 1}`,
    courseId: course.courseId,
    title: `${course.title}: part ${index + 1}`,
    kind: 'reading' as const,
    estimatedMinutes: perLesson,
    sortOrder: (index + 1) * 10,
    isComplete: false,
    blocks: [
      { kind: 'heading' as const, text: `Part ${index + 1}` },
      {
        kind: 'paragraph' as const,
        text: `${course.summary} This part covers section ${index + 1} of ${course.lessonCount}.`,
      },
      {
        kind: 'callout' as const,
        tone: 'info' as const,
        title: 'Development content',
        text: 'This lesson is generated by the development content provider. Real Academy content will come from a content service — see CREATOR-GAP-006.',
      },
    ],
  }));
}

/**
 * Registers the simulated routes — and only in a development build.
 *
 * The guard is here as well as in `creator-gap-api.ts` because defence at one
 * layer is a decision somebody can accidentally undo. A release bundle
 * registers nothing, so even a screen that ignored `areCreatorGapsEnabled()`
 * would get a 404 rather than a convincing fake.
 */
export function setupCreatorEconomyMocks(mock: MockAdapter): () => void {
  if (!areCreatorGapsEnabled()) {
    return () => undefined;
  }

  // eslint-disable-next-line no-console
  console.warn(
    '[MOCK][BACKEND GAP] Registering SIMULATED creator economy routes under ' +
      `${ROOT}. Creator status, verification, milestones, challenges, grants, ` +
      'the Academy, creator analytics, earnings attribution, referrals, the ' +
      'sign-up bonus, point rules, leaderboards, recommendations and the ' +
      'creator directory do not exist in the certified backend.'
  );

  // ── Session state ──────────────────────────────────────────────────────────

  let profile: CreatorProfile = { ...MOCK_CREATOR_PROFILE };
  let verification: CreatorVerification = { ...MOCK_CREATOR_VERIFICATION };
  let milestones: CreatorMilestone[] = MOCK_MILESTONES.map((item) => ({ ...item }));
  let challenges: CreatorChallenge[] = MOCK_CHALLENGES.map((item) => ({ ...item }));
  let grants: CommunityGrant[] = MOCK_GRANTS.map((item) => ({ ...item }));
  let applications: GrantApplication[] = MOCK_GRANT_APPLICATIONS.map((item) => ({ ...item }));
  let courses: CreatorCourse[] = MOCK_COURSES.map((item) => ({ ...item }));
  let signupBonus: SignupBonus = { ...MOCK_SIGNUP_BONUS };
  let recommendations: CreatorRecommendation[] = MOCK_RECOMMENDATIONS.map((item) => ({ ...item }));
  const redemptions: CreatorRewardRedemption[] = [];
  const dismissedRecommendations = new Set<string>();

  /**
   * Lesson completion, keyed by lesson id.
   *
   * Separate from the lesson fixtures so a synthesised lesson can be completed
   * too, and so resetting progress is one `clear()` rather than a walk.
   */
  const completedLessons = new Set<string>(
    MOCK_LESSONS.filter((lesson) => lesson.isComplete).map((lesson) => lesson.lessonId)
  );

  /**
   * Timers the simulated platform has scheduled.
   *
   * Tracked so a teardown can cancel them. Without it, one test's verification
   * moves into review in the middle of another and the Jest worker hangs
   * waiting on a timer nobody owns.
   */
  const timers = new Set<ReturnType<typeof setTimeout>>();

  function schedule(fn: () => void, delayMs: number): void {
    const timer = setTimeout(() => {
      timers.delete(timer);
      fn();
    }, delayMs);
    timers.add(timer);
  }

  function lessonsForCourse(courseId: string): CreatorLesson[] {
    const authored = MOCK_LESSONS.filter((lesson) => lesson.courseId === courseId);
    const course = courses.find((item) => item.courseId === courseId);
    const source = authored.length > 0 ? authored : course ? synthesiseLessons(course) : [];

    return source
      .map((lesson) => ({ ...lesson, isComplete: completedLessons.has(lesson.lessonId) }))
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }

  /** Recomputes a course's progress from the completion set. */
  function progressForCourse(courseId: string) {
    const lessons = lessonsForCourse(courseId);
    const done = lessons.filter((lesson) => lesson.isComplete).length;
    const next = lessons.find((lesson) => !lesson.isComplete);
    const state = done === 0 ? 'NotStarted' : done === lessons.length ? 'Completed' : 'InProgress';
    const course = courses.find((item) => item.courseId === courseId);

    return {
      courseId,
      state: state as 'NotStarted' | 'InProgress' | 'Completed',
      lessonsCompleted: done,
      lessonCount: lessons.length,
      percentage: lessons.length === 0 ? 0 : Math.round((done / lessons.length) * 100),
      nextLessonId: next?.lessonId ?? null,
      startedAt: done > 0 ? isoDaysAgo(14) : null,
      completedAt: state === 'Completed' ? nowIso() : null,
      certificateId:
        state === 'Completed' && course?.awardsCertificate ? `cert-${courseId}` : null,
    };
  }

  function decoratedCourses(): CreatorCourse[] {
    return courses.map((course) => ({ ...course, progress: progressForCourse(course.courseId) }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Dashboard
  // ═══════════════════════════════════════════════════════════════════════════

  mock.onGet(`${ROOT}/creators/me/dashboard`).reply(() => {
    const claimable = milestones.filter((item) => item.state === 'Completed').length;
    const activeChallenges = challenges.filter(
      (item) => item.state === 'Joined' || item.state === 'InProgress' || item.state === 'Completed'
    ).length;
    const openGrants = grants.filter(
      (item) => item.state === 'Open' || item.state === 'ClosingSoon'
    ).length;
    const inProgressCourses = decoratedCourses().filter(
      (course) => course.progress?.state === 'InProgress'
    ).length;
    const activeSponsored = MOCK_SPONSORED_CONTENT.filter(
      (item) => item.state === 'Active' || item.state === 'Scheduled' || item.state === 'PendingApproval'
    ).length;

    const summary: CreatorDashboardSummary = {
      status: profile.status,
      statusLabel: 'Verified creator',
      headline: mockMetricsForPeriod('30d').slice(0, 4),
      points: { available: 3_240, pending: 180 },
      revenue: { available: MOCK_REVENUE_SUMMARY.available, pending: MOCK_REVENUE_SUMMARY.pending },
      counts: {
        activeChallenges,
        claimableMilestones: claimable,
        openGrants,
        coursesInProgress: inProgressCourses,
        activeSponsoredContent: activeSponsored,
        pendingReferrals: MOCK_REFERRAL_PROGRAMME.pendingRewards,
        unreadNotifications: 3,
      },
      nextActions: recommendations
        .filter((item) => !dismissedRecommendations.has(item.recommendationId))
        .slice(0, 3),
      verificationState: verification.state,
      generatedAt: nowIso(),
    };

    return ok(summary);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Profile · reputation — CREATOR-GAP-001
  // ═══════════════════════════════════════════════════════════════════════════

  mock.onGet(`${ROOT}/creators/me`).reply(() => ok(profile));

  mock.onPut(`${ROOT}/creators/me`).reply((config) => {
    const request = body<{
      bio?: string;
      categories?: string[];
      expertise?: string[];
      languages?: string[];
      coverImageUrl?: string | null;
      isDiscoverable?: boolean;
    }>(config);

    if (typeof request.bio === 'string' && request.bio.length > 600) {
      return problem(400, 'creator.profile.bio_too_long', 'A creator bio can be at most 600 characters.');
    }

    profile = {
      ...profile,
      bio: request.bio ?? profile.bio,
      categories: request.categories ?? profile.categories,
      expertise: request.expertise ?? profile.expertise,
      languages: request.languages ?? profile.languages,
      coverImageUrl:
        request.coverImageUrl !== undefined ? request.coverImageUrl : profile.coverImageUrl,
      isDiscoverable: request.isDiscoverable ?? profile.isDiscoverable,
      updatedAt: nowIso(),
    };

    // Completeness is recomputed server-side, which is the point: the client
    // sends fields and is told what that did to the score.
    const missing = profile.completeness.missing.filter((item) => {
      if (item.key === 'cover_image') return !profile.coverImageUrl;
      if (item.key === 'languages_confirmed') return profile.languages.length === 0;
      return true;
    });

    profile = {
      ...profile,
      completeness: {
        percentage: Math.min(100, 82 + (profile.completeness.missing.length - missing.length) * 9),
        missing,
      },
    };

    return ok(profile);
  });

  mock.onGet(`${ROOT}/creators/me/reputation`).reply(() => ok(MOCK_CREATOR_REPUTATION));

  // ═══════════════════════════════════════════════════════════════════════════
  // Verification — CREATOR-GAP-002
  // ═══════════════════════════════════════════════════════════════════════════

  mock.onGet(`${ROOT}/creators/me/verification`).reply(() => ok(verification));

  mock.onPost(`${ROOT}/creators/me/verification/submit`).reply((config) => {
    const request = body<{ acknowledgedRequirements?: string[]; evidenceIds?: string[] }>(config);

    if (verification.state === 'Approved') {
      return problem(
        409,
        'creator.verification.already_approved',
        'You are already a verified creator.'
      );
    }

    const unmet = verification.requirements.filter((requirement) => !requirement.isMet);
    if (unmet.length > 0) {
      // A server-side eligibility refusal, not just a disabled button. The
      // screen's error path has to work, and the only way to know it does is
      // for the simulation to exercise it.
      return problem(
        422,
        'creator.verification.requirements_unmet',
        `${unmet.length} requirement${unmet.length === 1 ? '' : 's'} still to complete.`
      );
    }

    const acknowledged = request.acknowledgedRequirements ?? [];
    if (acknowledged.length < verification.requirements.length) {
      return problem(
        422,
        'creator.verification.acknowledgement_required',
        'Every requirement has to be acknowledged before submitting.'
      );
    }

    verification = {
      ...verification,
      applicationId: verification.applicationId ?? newId('creator-verification'),
      state: 'Submitted',
      submittedAt: nowIso(),
      decidedAt: null,
      decisionReason: null,
      informationRequested: null,
      canResubmit: false,
      canAppeal: false,
    };

    // A real review is not instant. `Submitted` → `UnderReview` on a timer, and
    // no further — a decision needs a human, and simulating one would teach the
    // screen that approval arrives by itself.
    schedule(() => {
      if (verification.state !== 'Submitted') return;
      verification = { ...verification, state: 'UnderReview', reviewStartedAt: nowIso() };
    }, 3_000);

    return ok(verification);
  });

  mock.onPost(`${ROOT}/creators/me/verification/appeal`).reply((config) => {
    const request = body<{ reason?: string }>(config);

    if (!verification.canAppeal) {
      return problem(
        409,
        'creator.verification.not_appealable',
        'There is nothing to appeal on this application.'
      );
    }
    if (!request.reason || request.reason.trim().length < 20) {
      return problem(
        422,
        'creator.verification.appeal_too_short',
        'Tell us a little more about why you are appealing — at least 20 characters.'
      );
    }

    verification = { ...verification, state: 'AppealPending', canAppeal: false, canResubmit: false };
    return ok(verification);
  });

  mock.onPost(`${ROOT}/creators/me/verification`).reply(() => {
    if (verification.state === 'NotEligible') {
      return problem(
        403,
        'creator.verification.not_eligible',
        'There are still requirements to complete before you can apply.'
      );
    }
    verification = { ...verification, state: 'Draft', applicationId: verification.applicationId ?? newId('creator-verification') };
    return ok(verification);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Milestones — CREATOR-GAP-003
  // ═══════════════════════════════════════════════════════════════════════════

  mock.onGet(`${ROOT}/creators/me/milestones`).reply(() => ok(milestones));

  mock.onPost(new RegExp(`${ROOT}/creators/me/milestones/[^/]+/claim$`)).reply((config) => {
    const milestoneId = segment(config.url, 1);
    const milestone = milestones.find((item) => item.milestoneId === milestoneId);

    if (!milestone) {
      return problem(404, 'creator.milestone.not_found', 'That milestone does not exist.');
    }
    if (milestone.state === 'Claimed') {
      return problem(409, 'creator.milestone.already_claimed', 'You have already claimed this.');
    }
    if (milestone.state !== 'Completed') {
      return problem(
        422,
        'creator.milestone.not_complete',
        'This milestone is not complete yet.'
      );
    }

    const claimed: CreatorMilestone = { ...milestone, state: 'Claimed', claimedAt: nowIso() };
    milestones = milestones.map((item) => (item.milestoneId === milestoneId ? claimed : item));
    return ok(claimed);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Challenges — CREATOR-GAP-004
  // ═══════════════════════════════════════════════════════════════════════════

  mock.onGet(`${ROOT}/challenges`).reply((config) => {
    const state = config.params?.state as string | undefined;
    if (!state || state === 'all') return ok(challenges);

    // Grouped filters, because a screen's tabs are "active / open / finished"
    // rather than one state each.
    const groups: Record<string, string[]> = {
      active: ['Joined', 'InProgress', 'Completed'],
      open: ['Open', 'Upcoming'],
      finished: ['Claimed', 'Failed', 'Expired', 'Cancelled'],
    };
    const members = groups[state] ?? [state];
    return ok(challenges.filter((item) => members.includes(String(item.state))));
  });

  mock.onGet(new RegExp(`${ROOT}/challenges/[^/]+/leaderboard$`)).reply((config) => {
    const challengeId = segment(config.url, 1);
    const challenge = challenges.find((item) => item.challengeId === challengeId);

    if (!challenge) {
      return problem(404, 'creator.challenge.not_found', 'That challenge does not exist.');
    }
    if (!challenge.hasLeaderboard) {
      return problem(
        404,
        'creator.challenge.no_leaderboard',
        'This challenge does not rank participants.'
      );
    }
    return ok(mockLeaderboard('challenge'));
  });

  mock.onPost(new RegExp(`${ROOT}/challenges/[^/]+/join$`)).reply((config) => {
    const challengeId = segment(config.url, 1);
    const challenge = challenges.find((item) => item.challengeId === challengeId);

    if (!challenge) {
      return problem(404, 'creator.challenge.not_found', 'That challenge does not exist.');
    }
    if (!challenge.isEligible) {
      return problem(
        403,
        'creator.challenge.not_eligible',
        challenge.ineligibleReason ?? 'You cannot join this challenge.'
      );
    }
    if (challenge.state === 'Joined' || challenge.state === 'InProgress') {
      return problem(409, 'creator.challenge.already_joined', 'You have already joined this.');
    }
    if (challenge.state === 'Upcoming') {
      return problem(
        422,
        'creator.challenge.not_open',
        'This challenge has not opened yet. You can join it when it does.'
      );
    }

    const joined: CreatorChallenge = { ...challenge, state: 'Joined', joinedAt: nowIso() };
    challenges = challenges.map((item) => (item.challengeId === challengeId ? joined : item));
    return ok(joined);
  });

  mock.onPost(new RegExp(`${ROOT}/challenges/[^/]+/claim$`)).reply((config) => {
    const challengeId = segment(config.url, 1);
    const challenge = challenges.find((item) => item.challengeId === challengeId);

    if (!challenge) {
      return problem(404, 'creator.challenge.not_found', 'That challenge does not exist.');
    }
    if (challenge.state === 'Claimed') {
      return problem(409, 'creator.challenge.already_claimed', 'You have already claimed this reward.');
    }
    if (challenge.state !== 'Completed') {
      return problem(422, 'creator.challenge.not_complete', 'This challenge is not complete yet.');
    }

    const claimed: CreatorChallenge = { ...challenge, state: 'Claimed' };
    challenges = challenges.map((item) => (item.challengeId === challengeId ? claimed : item));
    return ok(claimed);
  });

  mock.onGet(new RegExp(`${ROOT}/challenges/[^/]+$`)).reply((config) => {
    const challengeId = segment(config.url, 0);
    const challenge = challenges.find((item) => item.challengeId === challengeId);
    return challenge
      ? ok(challenge)
      : problem(404, 'creator.challenge.not_found', 'That challenge does not exist.');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Grants — CREATOR-GAP-005
  // ═══════════════════════════════════════════════════════════════════════════

  mock.onGet(`${ROOT}/grants/applications/me`).reply(() => ok(applications));

  mock.onGet(new RegExp(`${ROOT}/grants/applications/[^/]+$`)).reply((config) => {
    const applicationId = segment(config.url, 0);
    const application = applications.find((item) => item.applicationId === applicationId);
    return application
      ? ok(application)
      : problem(404, 'creator.grant.application_not_found', 'That application does not exist.');
  });

  mock.onPost(new RegExp(`${ROOT}/grants/applications/[^/]+/withdraw$`)).reply((config) => {
    const applicationId = segment(config.url, 1);
    const application = applications.find((item) => item.applicationId === applicationId);

    if (!application) {
      return problem(404, 'creator.grant.application_not_found', 'That application does not exist.');
    }
    if (!application.canWithdraw) {
      return problem(
        409,
        'creator.grant.not_withdrawable',
        'This application can no longer be withdrawn.'
      );
    }

    const withdrawn: GrantApplication = {
      ...application,
      state: 'Withdrawn',
      canWithdraw: false,
      canResubmit: false,
    };
    applications = applications.map((item) =>
      item.applicationId === applicationId ? withdrawn : item
    );
    grants = grants.map((grant) =>
      grant.grantId === withdrawn.grantId
        ? { ...grant, applicationId: null, applicationState: null }
        : grant
    );
    return ok(withdrawn);
  });

  mock.onGet(new RegExp(`${ROOT}/grants/[^/]+/form$`)).reply((config) => {
    const grantId = segment(config.url, 1);
    const grant = grants.find((item) => item.grantId === grantId);
    if (!grant) return problem(404, 'creator.grant.not_found', 'That grant does not exist.');

    return ok(MOCK_GRANT_FORMS[grantId] ?? { grantId, ...MOCK_DEFAULT_GRANT_FORM });
  });

  mock.onPost(new RegExp(`${ROOT}/grants/[^/]+/applications/submit$`)).reply((config) => {
    const grantId = segment(config.url, 2);
    const grant = grants.find((item) => item.grantId === grantId);
    const request = body<{
      answers?: Record<string, string>;
      acceptedDeclarations?: string[];
      attachmentIds?: string[];
      requestedAmountMinorUnits?: number | null;
      currency?: string | null;
    }>(config);

    if (!grant) return problem(404, 'creator.grant.not_found', 'That grant does not exist.');

    if (!grant.isEligible) {
      return problem(
        403,
        'creator.grant.not_eligible',
        grant.ineligibleReason ?? 'You are not eligible for this grant.'
      );
    }
    if (grant.state === 'Upcoming') {
      return problem(422, 'creator.grant.not_open', 'This grant is not open for applications yet.');
    }
    if (grant.state === 'Closed') {
      return problem(422, 'creator.grant.closed', 'This grant has closed.');
    }
    if (grant.applicationId) {
      return problem(409, 'creator.grant.already_applied', 'You have already applied for this grant.');
    }

    const form = MOCK_GRANT_FORMS[grantId] ?? { grantId, ...MOCK_DEFAULT_GRANT_FORM };
    const answers = request.answers ?? {};
    const missing = form.fields
      .filter((field) => field.isRequired && !String(answers[field.key] ?? '').trim())
      .map((field) => field.label);

    if (missing.length > 0) {
      return problem(
        422,
        'creator.grant.answers_incomplete',
        `Still to answer: ${missing.join(', ')}.`
      );
    }

    if ((request.acceptedDeclarations ?? []).length < form.declarations.length) {
      return problem(
        422,
        'creator.grant.declarations_required',
        'Every declaration has to be accepted before submitting.'
      );
    }

    const requested = request.requestedAmountMinorUnits;
    if (typeof requested === 'number' && grant.fundingMaximum && requested > grant.fundingMaximum.minorUnits) {
      return problem(
        422,
        'creator.grant.amount_too_high',
        'The amount you asked for is more than this grant awards.'
      );
    }

    const application: GrantApplication = {
      applicationId: newId('grant-application'),
      grantId,
      grantTitle: grant.title,
      state: 'Submitted',
      answers,
      requestedAmount:
        typeof requested === 'number'
          ? money(requested, request.currency ?? grant.fundingAmount.currency)
          : null,
      attachmentIds: [],
      submittedAt: nowIso(),
      decidedAt: null,
      decisionReason: null,
      informationRequested: null,
      reports: [],
      canWithdraw: true,
      canResubmit: false,
    };

    applications = [application, ...applications];
    grants = grants.map((item) =>
      item.grantId === grantId
        ? { ...item, applicationId: application.applicationId, applicationState: 'Submitted' }
        : item
    );

    // A panel takes time. `Submitted` → `UnderReview`, and no further.
    schedule(() => {
      applications = applications.map((item) =>
        item.applicationId === application.applicationId && item.state === 'Submitted'
          ? { ...item, state: 'UnderReview' }
          : item
      );
      grants = grants.map((item) =>
        item.grantId === grantId ? { ...item, applicationState: 'UnderReview' } : item
      );
    }, 4_000);

    return ok(application);
  });

  mock.onPost(new RegExp(`${ROOT}/grants/[^/]+/applications$`)).reply((config) => {
    const grantId = segment(config.url, 1);
    const grant = grants.find((item) => item.grantId === grantId);
    const request = body<{ answers?: Record<string, string> }>(config);

    if (!grant) return problem(404, 'creator.grant.not_found', 'That grant does not exist.');

    const existing = applications.find(
      (item) => item.grantId === grantId && item.state === 'Draft'
    );

    if (existing) {
      const updated: GrantApplication = { ...existing, answers: request.answers ?? {} };
      applications = applications.map((item) =>
        item.applicationId === existing.applicationId ? updated : item
      );
      return ok(updated);
    }

    const draft: GrantApplication = {
      applicationId: newId('grant-application'),
      grantId,
      grantTitle: grant.title,
      state: 'Draft',
      answers: request.answers ?? {},
      attachmentIds: [],
      reports: [],
      canWithdraw: true,
      canResubmit: false,
    };
    applications = [draft, ...applications];
    return ok(draft);
  });

  mock.onGet(new RegExp(`${ROOT}/grants/[^/]+$`)).reply((config) => {
    const grantId = segment(config.url, 0);
    const grant = grants.find((item) => item.grantId === grantId);
    return grant ? ok(grant) : problem(404, 'creator.grant.not_found', 'That grant does not exist.');
  });

  mock.onGet(`${ROOT}/grants`).reply((config) => {
    const category = config.params?.category as string | undefined;
    const state = config.params?.state as string | undefined;

    let filtered = grants;
    if (category && category !== 'all') {
      filtered = filtered.filter((grant) => grant.category.toLowerCase() === category.toLowerCase());
    }
    if (state && state !== 'all') {
      filtered = filtered.filter((grant) => grant.state === state);
    }
    return ok(filtered);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Academy — CREATOR-GAP-006
  // ═══════════════════════════════════════════════════════════════════════════

  mock.onGet(`${ROOT}/academy/sections`).reply(() => ok(MOCK_ACADEMY_SECTIONS));

  mock.onGet(`${ROOT}/academy/certificates/me`).reply(() => {
    const issued = decoratedCourses()
      .filter((course) => course.awardsCertificate && course.progress?.state === 'Completed')
      .map((course) => ({
        certificateId: `cert-${course.courseId}`,
        courseId: course.courseId,
        courseTitle: course.title,
        recipientName: profile.displayName,
        issuedAt: course.progress?.completedAt ?? nowIso(),
        verificationReference: `DSP-CERT-${course.courseId.slice(-6).toUpperCase()}`,
      }));
    return ok(issued);
  });

  mock.onGet(`${ROOT}/academy/courses`).reply((config) => {
    const section = config.params?.section as string | undefined;
    const level = config.params?.level as string | undefined;

    let filtered = decoratedCourses();
    if (section && section !== 'all') {
      filtered = filtered.filter((course) => course.sectionKey === section);
    }
    if (level && level !== 'all') {
      filtered = filtered.filter((course) => course.level === level);
    }
    return ok(filtered.sort((left, right) => left.sortOrder - right.sortOrder));
  });

  mock.onGet(new RegExp(`${ROOT}/academy/courses/[^/]+/lessons$`)).reply((config) => {
    const courseId = segment(config.url, 1);
    const course = courses.find((item) => item.courseId === courseId);
    if (!course) return problem(404, 'creator.course.not_found', 'That course does not exist.');
    return ok(lessonsForCourse(courseId));
  });

  mock.onPut(new RegExp(`${ROOT}/academy/courses/[^/]+/saved$`)).reply((config) => {
    const courseId = segment(config.url, 1);
    const request = body<{ isSaved?: boolean }>(config);
    const course = courses.find((item) => item.courseId === courseId);

    if (!course) return problem(404, 'creator.course.not_found', 'That course does not exist.');

    const updated = { ...course, isSaved: Boolean(request.isSaved) };
    courses = courses.map((item) => (item.courseId === courseId ? updated : item));
    return ok({ ...updated, progress: progressForCourse(courseId) });
  });

  mock.onGet(new RegExp(`${ROOT}/academy/courses/[^/]+$`)).reply((config) => {
    const courseId = segment(config.url, 0);
    const course = decoratedCourses().find((item) => item.courseId === courseId);
    return course ? ok(course) : problem(404, 'creator.course.not_found', 'That course does not exist.');
  });

  mock.onPost(new RegExp(`${ROOT}/academy/lessons/[^/]+/complete$`)).reply((config) => {
    const lessonId = segment(config.url, 1);

    // Find which course it belongs to, whether authored or synthesised.
    const authored = MOCK_LESSONS.find((lesson) => lesson.lessonId === lessonId);
    const courseId =
      authored?.courseId ??
      courses.find((course) => lessonId.startsWith(`${course.courseId}-lesson-`))?.courseId;

    if (!courseId) {
      return problem(404, 'creator.lesson.not_found', 'That lesson does not exist.');
    }

    // A quiz lesson cannot be completed by asking. It is completed by passing.
    if (authored?.kind === 'quiz' && authored.quiz) {
      return problem(
        422,
        'creator.lesson.quiz_required',
        'Finish the quiz to complete this lesson.'
      );
    }

    completedLessons.add(lessonId);
    return ok(progressForCourse(courseId));
  });

  mock.onPost(new RegExp(`${ROOT}/academy/quizzes/[^/]+/submit$`)).reply((config) => {
    const quizId = segment(config.url, 1);
    const request = body<{ answers?: { questionId: string; optionId: string }[] }>(config);
    const key = QUIZ_ANSWERS[quizId];

    if (!key) return problem(404, 'creator.quiz.not_found', 'That quiz does not exist.');

    const lesson = MOCK_LESSONS.find((item) => item.quiz?.quizId === quizId);
    const questions = lesson?.quiz?.questions ?? [];
    const answers = request.answers ?? [];

    if (answers.length < questions.length) {
      return problem(422, 'creator.quiz.incomplete', 'Answer every question before submitting.');
    }

    const outcomes = questions.map((question) => {
      const given = answers.find((answer) => answer.questionId === question.questionId);
      return {
        questionId: question.questionId,
        isCorrect: given?.optionId === key[question.questionId],
        explanation: question.explanation ?? null,
      };
    });

    const correctCount = outcomes.filter((outcome) => outcome.isCorrect).length;
    const passed = correctCount >= (lesson?.quiz?.passMark ?? questions.length);

    if (passed && lesson) completedLessons.add(lesson.lessonId);

    const result: LessonQuizResult = {
      passed,
      correctCount,
      totalCount: questions.length,
      outcomes,
      canRetry: !passed,
      retryAvailableAt: null,
    };
    return ok(result);
  });

  mock.onGet(new RegExp(`${ROOT}/academy/lessons/[^/]+$`)).reply((config) => {
    const lessonId = segment(config.url, 0);
    const authored = MOCK_LESSONS.find((lesson) => lesson.lessonId === lessonId);

    if (authored) {
      return ok({ ...authored, isComplete: completedLessons.has(lessonId) });
    }

    const course = courses.find((item) => lessonId.startsWith(`${item.courseId}-lesson-`));
    const synthesised = course
      ? lessonsForCourse(course.courseId).find((lesson) => lesson.lessonId === lessonId)
      : undefined;

    return synthesised
      ? ok(synthesised)
      : problem(404, 'creator.lesson.not_found', 'That lesson does not exist.');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Analytics — CREATOR-GAP-007
  // ═══════════════════════════════════════════════════════════════════════════

  mock.onGet(`${ROOT}/creators/me/analytics/content`).reply((config) => {
    const cursor = config.params?.cursor as string | undefined;
    const take = Number(config.params?.take ?? 15);
    const contentType = config.params?.contentType as string | undefined;

    let items = MOCK_CONTENT_PERFORMANCE;
    if (contentType && contentType !== 'all') {
      items = items.filter((item) => String(item.contentType) === contentType);
    }

    const offset = cursor ? Number(cursor) : 0;
    const page = items.slice(offset, offset + take);
    const nextOffset = offset + page.length;

    return ok({
      items: page,
      nextCursor: nextOffset < items.length ? String(nextOffset) : null,
      hasMore: nextOffset < items.length,
    });
  });

  mock.onGet(`${ROOT}/creators/me/analytics`).reply((config) => {
    const period = String(config.params?.period ?? '30d');
    const from = config.params?.from as string | undefined;
    const to = config.params?.to as string | undefined;

    if (period === 'custom' && (!from || !to)) {
      return problem(
        422,
        'creator.analytics.range_incomplete',
        'A custom period needs both a start and an end date.'
      );
    }
    if (period === 'custom' && from && to && from > to) {
      return problem(
        422,
        'creator.analytics.range_inverted',
        'The start date has to be before the end date.'
      );
    }

    const buckets = period === 'today' ? 24 : period === '7d' ? 7 : period === '90d' ? 12 : period === 'year' ? 12 : 30;

    return ok({
      range: { period, from: from ?? null, to: to ?? null },
      metrics: mockMetricsForPeriod(period),
      series: [
        mockSeries('content_views', buckets, 110),
        mockSeries('reach', buckets, 300),
        mockSeries('followers', buckets, 11),
      ],
      generatedAt: nowIso(),
      freshnessNote: 'Figures are recalculated every few hours, so today may be incomplete.',
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Revenue — CREATOR-GAP-008
  // ═══════════════════════════════════════════════════════════════════════════

  mock.onGet(`${ROOT}/creators/me/revenue/summary`).reply(() => ok(MOCK_REVENUE_SUMMARY));

  mock.onGet(`${ROOT}/creators/me/earnings`).reply((config) => {
    const state = config.params?.state as string | undefined;
    const source = config.params?.source as string | undefined;
    const cursor = config.params?.cursor as string | undefined;
    const take = Number(config.params?.take ?? 20);

    let items = MOCK_EARNINGS;
    if (state && state !== 'all') items = items.filter((item) => item.state === state);
    if (source && source !== 'all') items = items.filter((item) => item.source === source);

    const offset = cursor ? Number(cursor) : 0;
    const page = items.slice(offset, offset + take);
    const nextOffset = offset + page.length;

    return ok({
      earnings: page,
      nextCursor: nextOffset < items.length ? String(nextOffset) : null,
      hasMore: nextOffset < items.length,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Referrals · sign-up bonus — CREATOR-GAP-009 · 010
  // ═══════════════════════════════════════════════════════════════════════════

  mock.onGet(`${ROOT}/referrals/me/history`).reply((config) => {
    const cursor = config.params?.cursor as string | undefined;
    const take = Number(config.params?.take ?? 20);

    const offset = cursor ? Number(cursor) : 0;
    const page = MOCK_REFERRALS.slice(offset, offset + take);
    const nextOffset = offset + page.length;

    return ok({
      referrals: page,
      nextCursor: nextOffset < MOCK_REFERRALS.length ? String(nextOffset) : null,
      hasMore: nextOffset < MOCK_REFERRALS.length,
    });
  });

  mock.onGet(`${ROOT}/referrals/me`).reply(() => ok(MOCK_REFERRAL_PROGRAMME));

  mock.onGet(`${ROOT}/rewards/signup-bonus/me`).reply(() => ok(signupBonus));

  mock.onPost(`${ROOT}/rewards/signup-bonus/acknowledge`).reply(() => {
    if (signupBonus.state === 'Awarded' || signupBonus.state === 'AlreadyClaimed') {
      return problem(
        409,
        'creator.signup_bonus.already_claimed',
        'You have already had this bonus.'
      );
    }
    if (signupBonus.state === 'Blocked') {
      // Deliberately unhelpful about *why*. A fraud refusal that explains itself
      // is a map for getting round it.
      return problem(
        403,
        'creator.signup_bonus.blocked',
        'We need to check something before awarding this. Support can help.'
      );
    }

    const outstanding = signupBonus.requirements.filter((requirement) => !requirement.isMet);
    if (outstanding.length > 0) {
      return problem(
        422,
        'creator.signup_bonus.requirements_unmet',
        `${outstanding.length} thing${outstanding.length === 1 ? '' : 's'} left to do first.`
      );
    }

    // The *server* awards. This handler stands in for it, and the client's job
    // is to re-read the balance rather than to add anything to it. §19.
    signupBonus = { ...signupBonus, state: 'Awarded', awardedAt: nowIso() };
    return ok(signupBonus);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Point rules · reward catalogue — CREATOR-GAP-011
  // ═══════════════════════════════════════════════════════════════════════════

  mock.onGet(`${ROOT}/rewards/rules`).reply(() => ok(MOCK_POINT_RULES));

  mock.onGet(`${ROOT}/rewards/catalogue`).reply(() => {
    const redeemedIds = new Set(redemptions.map((item) => item.rewardId));
    const catalogue: CreatorReward[] = MOCK_REWARD_CATALOGUE.map((reward) =>
      redeemedIds.has(reward.rewardId) ? { ...reward, state: 'Redeemed' } : reward
    );
    return ok(catalogue);
  });

  mock.onGet(`${ROOT}/rewards/redemptions/me`).reply(() => ok(redemptions));

  mock.onPost(`${ROOT}/rewards/redemptions`).reply((config) => {
    const request = body<{ rewardId?: string }>(config);
    const reward = MOCK_REWARD_CATALOGUE.find((item) => item.rewardId === request.rewardId);

    if (!reward) return problem(404, 'creator.reward.not_found', 'That reward does not exist.');

    if (reward.state === 'Locked') {
      return problem(
        403,
        'creator.reward.locked',
        reward.lockedReason ?? 'This reward is not available to you yet.'
      );
    }
    if (reward.state === 'Expired') {
      return problem(422, 'creator.reward.expired', 'This reward is no longer available.');
    }
    if (redemptions.some((item) => item.rewardId === reward.rewardId)) {
      return problem(409, 'creator.reward.already_redeemed', 'You have already redeemed this.');
    }

    // The balance check is the server's. A client that decided it had enough
    // points would be deciding somebody's balance, which §12 forbids.
    const availablePoints = 3_240;
    if (reward.pointsCost > availablePoints) {
      return problem(
        422,
        'creator.reward.insufficient_points',
        `This costs ${reward.pointsCost.toLocaleString()} points and you have ${availablePoints.toLocaleString()}.`
      );
    }

    const redemption: CreatorRewardRedemption = {
      redemptionId: newId('redemption'),
      rewardId: reward.rewardId,
      rewardTitle: reward.title,
      pointsSpent: reward.pointsCost,
      state: 'Pending',
      createdAt: nowIso(),
    };
    redemptions.unshift(redemption);

    // Fulfilment is not instant, and the screen has to handle that.
    schedule(() => {
      const index = redemptions.findIndex((item) => item.redemptionId === redemption.redemptionId);
      if (index === -1) return;
      redemptions[index] = {
        ...redemptions[index],
        state: 'Redeemed',
        grantReference: newId('grant-ref').toUpperCase(),
        completedAt: nowIso(),
      };
    }, 2_500);

    return ok(redemption);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Leaderboards · recommendations · directory — CREATOR-GAP-012 · 013 · 014
  // ═══════════════════════════════════════════════════════════════════════════

  mock.onGet(`${ROOT}/creators/leaderboard`).reply((config) => {
    const scope = String(config.params?.scope ?? 'top-creators');
    const period = String(config.params?.period ?? '30d');
    return ok(mockLeaderboard(scope, period));
  });

  mock.onPost(new RegExp(`${ROOT}/recommendations/[^/]+/dismiss$`)).reply((config) => {
    const recommendationId = segment(config.url, 1);
    dismissedRecommendations.add(recommendationId);
    recommendations = recommendations.filter(
      (item) => item.recommendationId !== recommendationId
    );
    return ok(null);
  });

  mock.onGet(`${ROOT}/recommendations/creator`).reply((config) => {
    const take = config.params?.take ? Number(config.params.take) : undefined;
    const live = recommendations.filter(
      (item) => !dismissedRecommendations.has(item.recommendationId)
    );
    return ok(take ? live.slice(0, take) : live);
  });

  mock.onGet(`${ROOT}/creators`).reply((config) => {
    const query = String(config.params?.query ?? '').toLowerCase();
    const country = config.params?.country as string | undefined;
    const category = config.params?.category as string | undefined;
    const expertise = String(config.params?.expertise ?? '').toLowerCase();
    const verified = config.params?.verified;
    const cursor = config.params?.cursor as string | undefined;
    const take = Number(config.params?.take ?? 20);

    let items = MOCK_PUBLIC_CREATORS;

    if (query) {
      items = items.filter(
        (creator) =>
          creator.displayName.toLowerCase().includes(query) ||
          creator.expertise.some((item) => item.toLowerCase().includes(query)) ||
          (creator.bio ?? '').toLowerCase().includes(query)
      );
    }
    if (country && country !== 'all') {
      items = items.filter((creator) => creator.countryCode === country);
    }
    if (category && category !== 'all') {
      items = items.filter((creator) => creator.categories.includes(category));
    }
    if (expertise) {
      items = items.filter((creator) =>
        creator.expertise.some((item) => item.toLowerCase().includes(expertise))
      );
    }
    if (verified === true || verified === 'true') {
      items = items.filter((creator) => creator.isVerifiedCreator);
    }

    const offset = cursor ? Number(cursor) : 0;
    const page = items.slice(offset, offset + take);
    const nextOffset = offset + page.length;

    return ok({
      creators: page,
      nextCursor: nextOffset < items.length ? String(nextOffset) : null,
      hasMore: nextOffset < items.length,
    });
  });

  mock.onGet(`${ROOT}/creators/me/sponsored`).reply((config) => {
    const state = config.params?.state as string | undefined;
    if (!state || state === 'all') return ok(MOCK_SPONSORED_CONTENT);

    const groups: Record<string, string[]> = {
      live: ['Active', 'Scheduled', 'Approved'],
      pending: ['PendingPayment', 'PendingApproval', 'Draft'],
      finished: ['Expired', 'Completed', 'Cancelled', 'Rejected'],
    };
    const members = groups[state] ?? [state];
    return ok(MOCK_SPONSORED_CONTENT.filter((item) => members.includes(String(item.state))));
  });

  /**
   * Public creator profile.
   *
   * Registered last among the `/creators/...` routes so the more specific ones
   * — `/creators/me`, `/creators/leaderboard` — match first. `axios-mock-adapter`
   * matches in registration order, and a greedy `[^/]+` here would otherwise
   * swallow both.
   */
  mock.onGet(new RegExp(`${ROOT}/creators/[^/]+$`)).reply((config) => {
    const creatorId = segment(config.url, 0);
    const creator = MOCK_PUBLIC_CREATORS.find((item) => item.creatorId === creatorId);
    return creator
      ? ok(creator)
      : problem(404, 'creator.not_found', 'That creator does not exist.');
  });

  /** Cancels every pending simulated timer. Called from a test teardown. */
  return () => {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  };
}
