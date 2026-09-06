// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — creator economy, CERTIFIED routes (Remediation Wave C-03)
//
// ⚠ THIS IS A DEVELOPMENT FIXTURE FOR ROUTES THAT REALLY EXIST. ⚠
//
// Distinct from `handlers/creator-economy.ts` in the one way that matters: that
// file simulates capabilities the backend does not have, under a prefix no
// backend serves. This one stands in for `Diaspora.Modules.Creator`, which does
// exist, on the paths it really answers — so a development build renders the
// creator surfaces without a server, and the moment one is pointed at a real
// deployment the same client code runs unchanged.
//
// `creator-gap-boundary.test.ts` asserts that every route
// `setupCreatorEconomyMocks` registers sits behind `/creator-gap/v0`. That
// assertion is why this is a separate module rather than six more handlers in
// that one, and it is the same split `handlers/automation.ts` has from
// `handlers/automation-gaps.ts`.
//
// ── The point of writing it this way ─────────────────────────────────────────
//
// **The fixtures reply in the SERVER's shape, not the client's.** The mock data
// in `mocks/creator-economy-data.ts` is in client shape — `level: 'beginner'`,
// `Money` with an `amount`, `declarations` as pairs the client reads. The server
// serves `Level: "Beginner"`, money without an `amount`, and rows named
// `rules`/`rewards`/`creators`/`referrals`. So every handler below runs the
// *inverse* of the adapter in `lib/creator/certified-client.ts`.
//
// A fixture that replied in client shape would be worse than no fixture: the
// adapters would never execute in development, and the first time anybody found
// out that `foldEnum` was wrong would be against a real deployment. Inverting
// here means the development build exercises exactly the code the production
// build runs.
// ─────────────────────────────────────────────────────────────────────────────

import type MockAdapter from 'axios-mock-adapter';
import {
  MOCK_ACADEMY_SECTIONS,
  MOCK_CHALLENGES,
  MOCK_COURSES,
  MOCK_DEFAULT_GRANT_FORM,
  MOCK_EARNINGS,
  MOCK_GRANTS,
  MOCK_GRANT_APPLICATIONS,
  MOCK_GRANT_FORMS,
  MOCK_LESSONS,
  MOCK_MILESTONES,
  MOCK_POINT_RULES,
  MOCK_PUBLIC_CREATORS,
  MOCK_REFERRALS,
  MOCK_REFERRAL_PROGRAMME,
  MOCK_REVENUE_SUMMARY,
  MOCK_REWARD_CATALOGUE,
  MOCK_SIGNUP_BONUS,
  MOCK_CREATOR_PROFILE,
  MOCK_CREATOR_VERIFICATION,
  mockLeaderboard,
} from '../creator-economy-data';
import type { Money } from '@/types/financial';
import type {
  CommunityGrant,
  CreatorCourse,
  CreatorEarning,
  CreatorLesson,
  GrantApplication,
  GrantApplicationForm,
  LessonBlock,
} from '@/types/creator-economy';

// ─────────────────────────────────────────────────────────────────────────────
// The inverse adapters
// ─────────────────────────────────────────────────────────────────────────────

/** The platform envelope every route answers in. */
function envelope(data: unknown): [number, unknown] {
  return [200, { data, meta: { simulated: true } }];
}

/** `beginner` → `Beginner`, `longText` → `LongText`. The inverse of `foldEnum`. */
function unfold(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * An earning, in the server's shape.
 *
 * The two divergences `creator-earning-api.ts` documents, run backwards: the
 * response carries a gross and a share rather than an amount and a fee, and it
 * carries minor units rather than a `Money`. A fixture that replied in the
 * client's shape would mean the mapping never executed in development.
 */
function unearning(earning: CreatorEarning) {
  return {
    earningId: earning.earningId,
    source: String(earning.source),
    state: String(earning.state),
    amountMinorUnits: earning.netAmount.minorUnits,
    grossMinorUnits: earning.amount.minorUnits,
    currency: earning.amount.currency,
    exponent: earning.amount.exponent,
    subjectType: earning.subjectType ?? null,
    subjectId: earning.subjectId ?? null,
    transactionId: earning.transactionId ?? null,
    occurredAt: earning.occurredAt,
    settledAt: earning.settledAt ?? null,
    stateReason: null,
    availableAt: earning.availableAt ?? null,
    description: earning.description,
  };
}

/** `CreatorEarningCursor.ToString()` — an instant and a row, joined. */
function positionOf(earning: CreatorEarning): string {
  return `${earning.occurredAt}|${earning.earningId.replace(/-/g, '')}`;
}

/** The revenue summary, in the server's shape. */
function unsummary() {
  const summary = MOCK_REVENUE_SUMMARY;

  return {
    currency: summary.currency,
    exponent: summary.lifetimeEarned.exponent,
    lifetimeMinorUnits: summary.lifetimeEarned.minorUnits,
    pendingMinorUnits: summary.pending.minorUnits,
    availableMinorUnits: summary.available.minorUnits,
    processingMinorUnits: summary.processing.minorUnits,
    paidMinorUnits: summary.paidOut.minorUnits,
    reversedMinorUnits: summary.reversed?.minorUnits ?? 0,
    clearingDays: summary.clearingDays ?? 30,
    hasOtherCurrencies: summary.hasOtherCurrencies ?? false,
    currentPeriodMinorUnits: summary.currentPeriod.minorUnits,
    currentPeriodLabel: summary.currentPeriodLabel,
    generatedAt: summary.generatedAt,
    bySource: summary.breakdown.map((row) => ({
      source: String(row.source),
      label: row.label,
      minorUnits: row.amount.minorUnits,
      count: row.transactionCount,
      sharePercentage: row.sharePercentage,
    })),
  };
}

/** `MoneyResponse` carries no `amount`; the client derives one. */
function unmoney(value: Money | null | undefined) {
  if (!value) return null;
  return { minorUnits: value.minorUnits, currency: value.currency, exponent: value.exponent };
}

function serverCourse(course: CreatorCourse) {
  const { prerequisiteCourseIds, level, ...rest } = course;
  return { ...rest, level: unfold(level), prerequisiteCourseSlugs: prerequisiteCourseIds };
}

/**
 * A block, flattened back to the record the wire carries.
 *
 * The server serves one flat shape with every field optional rather than a
 * discriminated union, and `kind` is the one enum this module lower-cases on the
 * way out — so it is passed through rather than unfolded.
 */
function serverBlock(block: LessonBlock) {
  const flat: Record<string, unknown> = { kind: block.kind };

  if ('text' in block) flat.text = block.text;
  if ('title' in block && block.title !== undefined) flat.title = block.title;
  if (block.kind === 'callout') flat.tone = block.tone;
  if (block.kind === 'list') flat.ordered = block.ordered;
  if (block.kind === 'list' || block.kind === 'checklist') flat.items = block.items;
  if (block.kind === 'action') {
    flat.route = block.route;
    flat.title = block.label;
    flat.text = block.description ?? block.label;
  }

  return flat;
}

function serverLesson(lesson: CreatorLesson) {
  return {
    ...lesson,
    kind: unfold(lesson.kind),
    blocks: lesson.blocks.map(serverBlock),
    // Served by the real route and not held by the fixture data. A first read is
    // never a revision, which is the only honest answer here.
    contentVersion: 1,
    completedAtVersion: lesson.isComplete ? 1 : null,
    hasBeenRevised: false,
  };
}

function serverGrant(grant: CommunityGrant) {
  return {
    ...grant,
    fundingAmount: unmoney(grant.fundingAmount),
    fundingMinimum: unmoney(grant.fundingMinimum),
    fundingMaximum: unmoney(grant.fundingMaximum),
  };
}

function serverForm(form: GrantApplicationForm) {
  return { ...form, fields: form.fields.map((field) => ({ ...field, kind: unfold(field.kind) })) };
}

function serverApplication(application: GrantApplication) {
  return {
    ...application,
    requestedAmount: unmoney(application.requestedAmount),
    awardedAmount: unmoney(application.awardedAmount),
    fundingReference: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registers the certified creator routes.
 *
 * Returns a teardown so the caller's lifetime matches the gap handler's, even
 * though there is nothing here to cancel: this fixture holds no timers and
 * simulates no state transitions, because the routes it stands in for are real
 * and their state machines live on the server.
 *
 * **Writes reply with the read shape rather than mutating a store.** A fixture
 * that maintained its own copy of nine aggregates would be a second
 * implementation of the module, and the one thing worse than no fixture is one
 * that disagrees with the server about a state machine. The gap arm still holds
 * the stateful simulation, and `creator-journeys.test.ts` still drives it.
 */
export function setupCreatorCertifiedMocks(mock: MockAdapter): () => void {
  // ── CREATOR-GAP-001 · the projection ──────────────────────────────────────
  mock.onGet('/creators/me').reply(() =>
    envelope({
      ...MOCK_CREATOR_PROFILE,
      statusPolicyVersion: 'dev-1',
      audience: {
        ...MOCK_CREATOR_PROFILE.audience,
        reach: 0,
        // NG-39, reproduced deliberately: the real route serves a zero with this
        // flag beside it, and a fixture that served a plausible reach would hide
        // the one screen state nobody has seen.
        reachAvailable: false,
      },
    })
  );
  mock.onPut('/creators/me').reply((config) => {
    const patch = JSON.parse(config.data || '{}');
    return envelope({ ...MOCK_CREATOR_PROFILE, ...patch });
  });
  // ── CREATOR-GAP-012 · the leaderboard ─────────────────────────────────────
  //
  // **Registered before `/creators/{id}`, and the order is load-bearing here for
  // exactly the reason it is on the server.** `CreatorEndpointContributor` spells
  // it out — "literal segments are mapped before their parameterised siblings" —
  // and axios-mock-adapter is first-match-wins, so the parameterised regex below
  // would otherwise swallow `/creators/leaderboard` and answer it with a 404 for
  // a creator whose id is the word "leaderboard".
  mock.onGet('/creators/leaderboard').reply((config) =>
    envelope(mockLeaderboard(String(config.params?.scope ?? 'top-creators'), config.params?.period))
  );

  mock.onGet(/^\/creators\/[^/]+$/).reply((config) => {
    const id = config.url!.split('/').pop();
    const found = MOCK_PUBLIC_CREATORS.find((creator) => creator.creatorId === id);
    return found ? envelope(found) : [404, { title: 'Not found' }];
  });

  // Rows named `creators`. See the row-property ledger.
  mock.onGet('/creators').reply(() =>
    envelope({
      creators: MOCK_PUBLIC_CREATORS,
      nextCursor: null,
      hasMore: false,
      facets: {
        countries: [],
        categories: [],
        expertise: [],
        languages: [],
        verifiedCount: MOCK_PUBLIC_CREATORS.filter((c) => c.isVerifiedCreator).length,
        totalCount: MOCK_PUBLIC_CREATORS.length,
      },
    })
  );

  // ── CREATOR-GAP-002 · verification ────────────────────────────────────────
  mock.onGet('/creators/me/verification').reply(() => envelope(MOCK_CREATOR_VERIFICATION));
  mock.onPost('/creators/me/verification').reply(() => envelope(MOCK_CREATOR_VERIFICATION));
  mock.onPost('/creators/me/verification/evidence').reply((config) => {
    const body = JSON.parse(config.data || '{}');
    return envelope({
      evidenceId: `evidence-${Date.now()}`,
      kind: body.kind,
      // The label is the *server's*, never the client's — an earlier backend
      // version accepted a client hint and stored a local file path.
      label: `Supporting material (${body.kind})`,
      status: 'Pending',
      uploadedAt: new Date().toISOString(),
    });
  });
  mock.onPost('/creators/me/verification/submit').reply(() =>
    envelope({ ...MOCK_CREATOR_VERIFICATION, state: 'Submitted', submittedAt: new Date().toISOString() })
  );
  mock.onPost('/creators/me/verification/appeal').reply(() =>
    envelope({ ...MOCK_CREATOR_VERIFICATION, state: 'AppealPending' })
  );

  // ── CREATOR-GAP-003 · milestones ──────────────────────────────────────────
  mock.onGet('/creators/me/milestones').reply(() => envelope(MOCK_MILESTONES));
  mock.onPost(/^\/creators\/me\/milestones\/[^/]+\/claim$/).reply((config) => {
    const id = config.url!.split('/')[4];
    const found = MOCK_MILESTONES.find((milestone) => milestone.milestoneId === id);
    return found
      ? envelope({ ...found, state: 'Claimed', claimedAt: new Date().toISOString() })
      : [404, { title: 'Not found' }];
  });

  // ── CREATOR-GAP-004 · challenges ──────────────────────────────────────────
  mock.onGet('/challenges').reply(() => envelope(MOCK_CHALLENGES));
  mock.onGet(/^\/challenges\/[^/]+$/).reply((config) => {
    const id = config.url!.split('/').pop();
    const found = MOCK_CHALLENGES.find((challenge) => challenge.challengeId === id);
    return found ? envelope(found) : [404, { title: 'Not found' }];
  });
  mock.onGet(/^\/challenges\/[^/]+\/leaderboard$/).reply(() =>
    envelope(mockLeaderboard('challenge'))
  );
  mock.onPost(/^\/challenges\/[^/]+\/join$/).reply((config) => {
    const id = config.url!.split('/')[2];
    const found = MOCK_CHALLENGES.find((challenge) => challenge.challengeId === id);
    return found
      ? envelope({ ...found, state: 'Joined', joinedAt: new Date().toISOString() })
      : [404, { title: 'Not found' }];
  });
  mock.onPost(/^\/challenges\/[^/]+\/claim$/).reply((config) => {
    const id = config.url!.split('/')[2];
    const found = MOCK_CHALLENGES.find((challenge) => challenge.challengeId === id);
    return found ? envelope({ ...found, state: 'Claimed' }) : [404, { title: 'Not found' }];
  });

  // ── CREATOR-GAP-005 · grants ──────────────────────────────────────────────
  mock.onGet('/grants').reply(() => envelope(MOCK_GRANTS.map(serverGrant)));
  mock.onGet('/grants/applications/me').reply(() =>
    envelope(MOCK_GRANT_APPLICATIONS.map(serverApplication))
  );
  mock.onGet(/^\/grants\/[^/]+\/form$/).reply((config) => {
    const id = config.url!.split('/')[2];
    const form = MOCK_GRANT_FORMS[id] ?? { ...MOCK_DEFAULT_GRANT_FORM, grantId: id };
    return envelope(serverForm(form));
  });
  mock.onGet(/^\/grants\/[^/]+$/).reply((config) => {
    const id = config.url!.split('/').pop();
    const found = MOCK_GRANTS.find((grant) => grant.grantId === id);
    return found ? envelope(serverGrant(found)) : [404, { title: 'Not found' }];
  });
  mock.onPost(/^\/grants\/[^/]+\/applications$/).reply((config) => {
    const body = JSON.parse(config.data || '{}');
    return envelope(
      serverApplication({
        ...MOCK_GRANT_APPLICATIONS[0],
        state: 'Draft',
        answers: body.answers ?? {},
      })
    );
  });
  mock.onPost(/^\/grants\/[^/]+\/applications\/submit$/).reply((config) => {
    const body = JSON.parse(config.data || '{}');
    return envelope(
      serverApplication({
        ...MOCK_GRANT_APPLICATIONS[0],
        state: 'Submitted',
        answers: body.answers ?? {},
        submittedAt: new Date().toISOString(),
      })
    );
  });
  mock.onPost(/^\/grants\/applications\/[^/]+\/withdraw$/).reply(() =>
    envelope(serverApplication({ ...MOCK_GRANT_APPLICATIONS[0], state: 'Withdrawn' }))
  );
  mock.onPost(/^\/grants\/applications\/[^/]+\/reports$/).reply(() =>
    envelope(serverApplication(MOCK_GRANT_APPLICATIONS[0]))
  );

  // ── CREATOR-GAP-006 · the Academy ─────────────────────────────────────────
  mock.onGet('/academy/sections').reply(() => envelope(MOCK_ACADEMY_SECTIONS));
  mock.onGet('/academy/courses').reply(() => envelope(MOCK_COURSES.map(serverCourse)));
  // Empty, and honestly so: the real route issues a certificate against a
  // persisted completion and nothing else, and this fixture persists none.
  mock.onGet('/academy/certificates/me').reply(() => envelope([]));
  mock.onGet(/^\/academy\/courses\/[^/]+\/lessons$/).reply((config) => {
    const courseId = config.url!.split('/')[3];
    return envelope(
      MOCK_LESSONS.filter((lesson) => lesson.courseId === courseId).map(serverLesson)
    );
  });
  mock.onPut(/^\/academy\/courses\/[^/]+\/saved$/).reply((config) => {
    const courseId = config.url!.split('/')[3];
    const body = JSON.parse(config.data || '{}');
    const found = MOCK_COURSES.find((course) => course.courseId === courseId);
    return found
      ? envelope(serverCourse({ ...found, isSaved: Boolean(body.isSaved) }))
      : [404, { title: 'Not found' }];
  });
  mock.onPost(/^\/academy\/lessons\/[^/]+\/complete$/).reply((config) => {
    const lessonId = config.url!.split('/')[3];
    const lesson = MOCK_LESSONS.find((item) => item.lessonId === lessonId);
    if (!lesson) return [404, { title: 'Not found' }];

    // The server refuses this for a quiz lesson, and so does the fixture: a
    // development build that let a quiz be finished by asserting would let the
    // screen ship without its refusal path ever rendering.
    if (lesson.kind === 'quiz') {
      return [
        422,
        { type: 'about:blank', title: 'Quiz required', code: 'creator.lesson.quiz_required' },
      ];
    }

    const siblings = MOCK_LESSONS.filter((item) => item.courseId === lesson.courseId);
    return envelope({
      courseId: lesson.courseId,
      state: 'InProgress',
      lessonsCompleted: 1,
      lessonCount: siblings.length,
      percentage: Math.round((1 / Math.max(siblings.length, 1)) * 100),
      nextLessonId: siblings[1]?.lessonId ?? null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      certificateId: null,
    });
  });
  mock.onPost(/^\/academy\/quizzes\/[^/]+\/submit$/).reply((config) => {
    const body = JSON.parse(config.data || '{}');
    // `answers` is a MAP on this route, not an array of pairs. Reading it as a
    // map here is what makes the fixture prove the client built one.
    const answers: Record<string, string> = body.answers ?? {};
    const questionIds = Object.keys(answers);

    return envelope({
      passed: questionIds.length > 0,
      correctCount: questionIds.length,
      totalCount: questionIds.length,
      outcomes: questionIds.map((questionId) => ({
        questionId,
        isCorrect: true,
        explanation: 'Correct. The development grader accepts a complete paper.',
      })),
      canRetry: false,
      retryAvailableAt: null,
      progress: null,
    });
  });

  // ── CREATOR-GAP-009 · referrals ───────────────────────────────────────────
  mock.onGet('/referrals/me/history').reply(() =>
    // Rows named `referrals`. See the row-property ledger.
    envelope({ referrals: MOCK_REFERRALS, nextCursor: null, hasMore: false })
  );
  mock.onGet('/referrals/me').reply(() =>
    envelope({ ...MOCK_REFERRAL_PROGRAMME, qualificationVersion: 'dev-1' })
  );
  mock.onPost('/referrals/code').reply(() => envelope(MOCK_REFERRAL_PROGRAMME));

  // ── CREATOR-GAP-008 · earnings and revenue ───────────────────────────

  mock.onGet('/creators/me/revenue/summary').reply(() => envelope(unsummary()));

  mock.onGet('/creators/me/earnings').reply((config) => {
    const state = config.params?.state as string | undefined;
    const source = config.params?.source as string | undefined;
    const cursor = config.params?.cursor as string | undefined;
    const take = Math.min(Math.max(Number(config.params?.take ?? 25), 1), 100);

    let rows = MOCK_EARNINGS;
    if (state) rows = rows.filter((row) => row.state === state);
    if (source) rows = rows.filter((row) => row.source === source);

    // The cursor is opaque to the client and it is opaque here too: the fixture
    // finds the row it names rather than treating it as an offset. A fixture
    // that accepted a plain index would let a client that built its own cursor
    // pass in development and fail against the deployment.
    const from = cursor ? rows.findIndex((row) => positionOf(row) === cursor) + 1 : 0;

    const page = rows.slice(from, from + take);
    const hasMore = from + page.length < rows.length;

    return envelope({
      items: page.map(unearning),
      nextCursor: hasMore && page.length > 0 ? positionOf(page[page.length - 1]) : null,
      hasMore,
    });
  });

  // ── CREATOR-GAP-010 and -011 · the bonus, the rules, the catalogue ────────
  mock.onGet('/rewards/signup-bonus/me').reply(() => envelope(MOCK_SIGNUP_BONUS));
  mock.onPost('/rewards/signup-bonus/acknowledge').reply(() =>
    envelope({ ...MOCK_SIGNUP_BONUS, state: 'Awarded', awardedAt: new Date().toISOString() })
  );

  // An envelope, not an array — the divergence this wave found.
  mock.onGet('/rewards/rules').reply(() =>
    envelope({
      rules: MOCK_POINT_RULES,
      catalogueVersion: 'dev-1',
      expiryPolicy: 'Never',
      expiryDescription: 'Points do not expire on Diaspora.',
      updatedAt: new Date().toISOString(),
    })
  );
  mock.onGet('/rewards/catalogue').reply(() =>
    envelope({
      rewards: MOCK_REWARD_CATALOGUE,
      catalogueVersion: 'dev-1',
      availablePoints: 2_400,
      updatedAt: new Date().toISOString(),
    })
  );
  mock.onGet('/rewards/redemptions/me').reply(() => envelope([]));
  mock.onPost('/rewards/redemptions').reply((config) => {
    const body = JSON.parse(config.data || '{}');
    const reward = MOCK_REWARD_CATALOGUE.find((item) => item.rewardId === body.rewardId);
    if (!reward) return [404, { title: 'Not found' }];

    return envelope({
      redemptionId: `redemption-${Date.now()}`,
      rewardId: reward.rewardId,
      rewardTitle: reward.title,
      // The *catalogue's* price. The request carried none, which is §31.
      pointsSpent: reward.pointsCost,
      state: 'Pending',
      grantReference: null,
      rejectionReason: null,
      catalogueVersion: 'dev-1',
      createdAt: new Date().toISOString(),
      completedAt: null,
    });
  });

  // ── CREATOR-GAP-016 · telemetry ingestion ─────────────────────────────────
  mock.onPost('/telemetry/events').reply((config) => {
    const body = JSON.parse(config.data || '{}');
    const events: { event: string }[] = body.events ?? [];

    // 202, not 200. The batch is accepted for processing and nothing about the
    // response implies a figure has moved.
    return [
      202,
      {
        data: {
          accepted: events.length,
          duplicate: 0,
          rejected: 0,
          results: events.map((event, index) => ({
            index,
            event: event.event,
            status: 'accepted',
            reason: null,
          })),
        },
        meta: { simulated: true },
      },
    ];
  });

  return () => {
    /* Nothing to cancel — see the function's own comment. */
  };
}
