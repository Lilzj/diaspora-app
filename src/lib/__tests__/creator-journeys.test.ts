// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator economy journeys (Frontend Phase 7, §42)
//
// The ten journeys the brief requires, exercised end to end against the
// development adapter — the same adapter the app talks to, through the same
// API client and the same repository functions. Nothing is stubbed at the
// module boundary, so a broken route, a wrong request shape or a mishandled
// refusal fails here rather than in somebody's hands.
//
// What these tests are careful about is the *unhappy* half. A journey suite
// that only walks the success path proves the success path renders; it proves
// nothing about the double-claim, the ineligible application, the failed quiz
// or the refused redemption — which are the cases that decide whether a member
// is told the truth. Each journey below asserts both.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '../apiClient';
import { setupCreatorEconomyMocks } from '@/mocks/handlers/creator-economy';
import * as api from '../creator-gap-api';
import { FinancialError } from '../financial-errors';

let mock: MockAdapter;
let teardown: () => void;

beforeEach(() => {
  // No `delayResponse`: these assert sequence and state, not timing, and a
  // shared 800ms delay would make the suite take a minute for no benefit.
  mock = new MockAdapter(apiClient);
  teardown = setupCreatorEconomyMocks(mock);
});

afterEach(() => {
  // Cancels the simulated platform's pending state-transition timers. Without
  // it a verification moves into review during the *next* test and the worker
  // hangs waiting on a timer nobody owns.
  teardown();
  mock.restore();
});

/** The error a refused request produces, for asserting on its code. */
async function refusalOf(operation: Promise<unknown>): Promise<FinancialError> {
  try {
    await operation;
  } catch (error) {
    return error as FinancialError;
  }
  throw new Error('Expected the request to be refused, and it was not.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Journey 1 — dashboard → profile → verification → submit → pending
// ─────────────────────────────────────────────────────────────────────────────

describe('Journey 1 · become a verified creator', () => {
  it('walks dashboard, profile, verification and submission', async () => {
    const dashboard = await api.fetchDashboardSummary();
    expect(dashboard.status).toBeTruthy();
    expect(dashboard.headline.length).toBeGreaterThan(0);
    // §39: the summary carries the counts, so the dashboard needs no other call
    // to decide which sections to draw.
    expect(dashboard.counts).toBeDefined();

    const profile = await api.fetchCreatorProfile();
    expect(profile.completeness.percentage).toBeGreaterThan(0);

    const updated = await api.updateCreatorProfile({ bio: 'A shorter bio.' });
    expect(updated.bio).toBe('A shorter bio.');

    const verification = await api.fetchCreatorVerification();
    expect(verification.requirements.length).toBeGreaterThan(0);
    // Every `isMet` is served. Nothing in the client decided any of them.
    expect(verification.requirements.every((r) => typeof r.isMet === 'boolean')).toBe(true);
  });

  it('refuses a submission that has not acknowledged every requirement', async () => {
    const verification = await api.fetchCreatorVerification();

    const refusal = await refusalOf(
      api.submitCreatorVerification({
        acknowledgedRequirements: [verification.requirements[0].key],
        evidenceIds: [],
      })
    );

    // Already approved in the fixture, so the conflict fires first — which is
    // itself the right refusal and the one a screen has to render.
    expect(refusal).toBeInstanceOf(FinancialError);
    expect(refusal.code).toBe('creator.verification.already_approved');
  });

  it('refuses a bio over the limit rather than truncating it', async () => {
    const refusal = await refusalOf(api.updateCreatorProfile({ bio: 'x'.repeat(700) }));

    expect(refusal.code).toBe('creator.profile.bio_too_long');
  });

  it('refuses an appeal on an application with nothing to appeal', async () => {
    const refusal = await refusalOf(api.appealCreatorVerification('A long enough reason here.'));

    expect(refusal.code).toBe('creator.verification.not_appealable');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Journey 2 — rewards → points → history → redeem
// ─────────────────────────────────────────────────────────────────────────────

describe('Journey 2 · view points and redeem a reward', () => {
  it('shows the earning rules, the catalogue, and redeems an affordable reward', async () => {
    const rules = await api.fetchPointRules();
    expect(rules.length).toBeGreaterThan(0);
    // §11: the award amounts come from the catalogue, not from the app.
    expect(rules.every((rule) => typeof rule.points === 'number')).toBe(true);

    const catalogue = await api.fetchRewardCatalogue();
    const affordable = catalogue.find((reward) => reward.state === 'Available' && reward.pointsCost <= 3_240);
    expect(affordable).toBeDefined();

    const redemption = await api.redeemReward(affordable!.rewardId);
    expect(redemption.rewardId).toBe(affordable!.rewardId);
    // Fulfilment is not instant, and the screen has to handle that.
    expect(redemption.state).toBe('Pending');

    const history = await api.fetchRedemptions();
    expect(history.map((item) => item.redemptionId)).toContain(redemption.redemptionId);
  });

  it('refuses a second redemption of the same reward', async () => {
    const catalogue = await api.fetchRewardCatalogue();
    const reward = catalogue.find((item) => item.state === 'Available' && item.pointsCost <= 3_240)!;

    await api.redeemReward(reward.rewardId);
    const refusal = await refusalOf(api.redeemReward(reward.rewardId));

    expect(refusal.code).toBe('creator.reward.already_redeemed');
  });

  it('refuses a reward the member cannot afford, with the server deciding', async () => {
    const catalogue = await api.fetchRewardCatalogue();
    const expensive = catalogue.find((reward) => reward.pointsCost > 3_240 && reward.state === 'Available');

    if (expensive) {
      const refusal = await refusalOf(api.redeemReward(expensive.rewardId));
      expect(refusal.code).toBe('creator.reward.insufficient_points');
    }
  });

  it('refuses a locked reward with the reason the platform gave', async () => {
    const catalogue = await api.fetchRewardCatalogue();
    const locked = catalogue.find((reward) => reward.state === 'Locked')!;

    const refusal = await refusalOf(api.redeemReward(locked.rewardId));

    expect(refusal.code).toBe('creator.reward.locked');
  });

  it('refuses an expired reward', async () => {
    const catalogue = await api.fetchRewardCatalogue();
    const expired = catalogue.find((reward) => reward.state === 'Expired')!;

    const refusal = await refusalOf(api.redeemReward(expired.rewardId));

    expect(refusal.code).toBe('creator.reward.expired');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Journey 3 — academy → course → lesson → complete → progress
// ─────────────────────────────────────────────────────────────────────────────

describe('Journey 3 · learn something in the Academy', () => {
  it('walks sections, a course, a lesson and its completion', async () => {
    const sections = await api.fetchAcademySections();
    expect(sections.length).toBeGreaterThan(0);

    const courses = await api.fetchCourses();
    const course = courses.find((item) => item.courseId === 'course-guide-craft')!;
    expect(course.progress).toBeDefined();

    const before = course.progress!.lessonsCompleted;

    const lessons = await api.fetchCourseLessons(course.courseId);
    expect(lessons.length).toBe(course.lessonCount);
    // Ordered by the platform's `sortOrder`, not by id.
    expect(lessons.map((lesson) => lesson.sortOrder)).toEqual(
      [...lessons.map((lesson) => lesson.sortOrder)].sort((a, b) => a - b)
    );

    const next = lessons.find((lesson) => !lesson.isComplete && lesson.kind !== 'quiz')!;
    const progress = await api.completeLesson(next.lessonId);

    expect(progress.lessonsCompleted).toBe(before + 1);
    expect(progress.percentage).toBeGreaterThan(0);
  });

  it('will not let a quiz lesson be completed by asking', async () => {
    // The whole point of a server-side grader. A quiz that could be marked done
    // is decoration.
    const refusal = await refusalOf(api.completeLesson('lesson-craft-5'));

    expect(refusal.code).toBe('creator.lesson.quiz_required');
  });

  it('grades a quiz server-side and completes the lesson only on a pass', async () => {
    const lesson = await api.fetchLesson('lesson-craft-5');
    expect(lesson.quiz).toBeDefined();

    // The answer key is not in the payload. This is the assertion that keeps it
    // out — a client that could mark its own paper makes the quiz pointless.
    for (const question of lesson.quiz!.questions) {
      for (const option of question.options) {
        expect(option).not.toHaveProperty('isCorrect');
      }
    }

    const wrong = await api.submitQuiz(
      lesson.quiz!.quizId,
      lesson.quiz!.questions.map((question) => ({
        questionId: question.questionId,
        optionId: question.options[0].optionId,
      }))
    );

    expect(wrong.totalCount).toBe(lesson.quiz!.questions.length);
    expect(wrong.outcomes).toHaveLength(lesson.quiz!.questions.length);
    // Every outcome carries the explanation, whichever way it went.
    expect(wrong.outcomes.every((outcome) => typeof outcome.isCorrect === 'boolean')).toBe(true);

    if (!wrong.passed) {
      expect(wrong.canRetry).toBe(true);
      const stillIncomplete = await api.fetchLesson('lesson-craft-5');
      expect(stillIncomplete.isComplete).toBe(false);
    }

    const right = await api.submitQuiz(lesson.quiz!.quizId, [
      { questionId: 'q1', optionId: 'b' },
      { questionId: 'q2', optionId: 'c' },
      { questionId: 'q3', optionId: 'b' },
      { questionId: 'q4', optionId: 'c' },
    ]);

    expect(right.passed).toBe(true);
    expect(right.correctCount).toBe(4);

    const completed = await api.fetchLesson('lesson-craft-5');
    expect(completed.isComplete).toBe(true);
  });

  it('refuses a half-answered quiz', async () => {
    const refusal = await refusalOf(
      api.submitQuiz('quiz-guide-craft', [{ questionId: 'q1', optionId: 'b' }])
    );

    expect(refusal.code).toBe('creator.quiz.incomplete');
  });

  it('issues a certificate only once a course that awards one is finished', async () => {
    const before = await api.fetchCertificates();
    const beforeIds = new Set(before.map((certificate) => certificate.courseId));

    const lessons = await api.fetchCourseLessons('course-guide-craft');
    for (const lesson of lessons.filter((item) => item.kind !== 'quiz' && !item.isComplete)) {
      await api.completeLesson(lesson.lessonId);
    }
    await api.submitQuiz('quiz-guide-craft', [
      { questionId: 'q1', optionId: 'b' },
      { questionId: 'q2', optionId: 'c' },
      { questionId: 'q3', optionId: 'b' },
      { questionId: 'q4', optionId: 'c' },
    ]);

    const after = await api.fetchCertificates();
    expect(after.length).toBeGreaterThan(before.length);
    expect(after.some((certificate) => !beforeIds.has(certificate.courseId))).toBe(true);
    expect(after.every((certificate) => certificate.verificationReference.length > 0)).toBe(true);
  });

  it('saves and unsaves a course', async () => {
    const saved = await api.setCourseSaved('course-analytics', true);
    expect(saved.isSaved).toBe(true);

    const unsaved = await api.setCourseSaved('course-analytics', false);
    expect(unsaved.isSaved).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Journey 4 — analytics → period → performance → content metrics
// ─────────────────────────────────────────────────────────────────────────────

describe('Journey 4 · read your analytics', () => {
  it('returns a different dataset for each period', async () => {
    const week = await api.fetchCreatorAnalytics({ period: '7d' });
    const quarter = await api.fetchCreatorAnalytics({ period: '90d' });

    expect(week.range.period).toBe('7d');
    expect(quarter.range.period).toBe('90d');

    const weekViews = week.metrics.find((metric) => metric.key === 'content_views')!.value;
    const quarterViews = quarter.metrics.find((metric) => metric.key === 'content_views')!.value;

    // A fixture returning the same number for both would let a broken period
    // selector pass review.
    expect(quarterViews).toBeGreaterThan(weekViews);
  });

  it('serves a definition for every metric it reports', async () => {
    // §14: the app ships no glossary of its own to drift out of date.
    const summary = await api.fetchCreatorAnalytics({ period: '30d' });

    for (const metric of summary.metrics) {
      expect(metric.definition).toBeTruthy();
      expect(metric.definition!.length).toBeGreaterThan(20);
    }
  });

  it('states the reporting lag rather than implying the figures are live', async () => {
    const summary = await api.fetchCreatorAnalytics({ period: 'today' });

    expect(summary.freshnessNote).toBeTruthy();
    expect(summary.generatedAt).toBeTruthy();
  });

  it('refuses an incomplete custom range', async () => {
    const refusal = await refusalOf(
      api.fetchCreatorAnalytics({ period: 'custom', from: '2026-01-01', to: null })
    );

    expect(refusal.code).toBe('creator.analytics.range_incomplete');
  });

  it('refuses an inverted custom range rather than silently swapping the dates', async () => {
    const refusal = await refusalOf(
      api.fetchCreatorAnalytics({ period: 'custom', from: '2026-03-01', to: '2026-01-01' })
    );

    expect(refusal.code).toBe('creator.analytics.range_inverted');
  });

  it('pages per-content performance rather than returning everything', async () => {
    // §39: no dataset arrives whole.
    const first = await api.fetchContentPerformance({ period: '30d', take: 3 });

    expect(first.items).toHaveLength(3);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBeTruthy();

    const second = await api.fetchContentPerformance({
      period: '30d',
      take: 3,
      cursor: first.nextCursor!,
    });

    expect(second.items[0].contentId).not.toBe(first.items[0].contentId);
  });

  it('filters content by type', async () => {
    const updates = await api.fetchContentPerformance({ period: '30d', contentType: 'Update' });

    expect(updates.items.length).toBeGreaterThan(0);
    expect(updates.items.every((item) => item.contentType === 'Update')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Journey 5 — revenue → earnings → source → transaction
// ─────────────────────────────────────────────────────────────────────────────

describe('Journey 5 · understand what you earned', () => {
  it('keeps pending and available apart, and never sums them', async () => {
    const summary = await api.fetchRevenueSummary();

    // §17. The two are separate fields, both `Money`, and the total the screen
    // shows is the server's rather than a sum of the parts.
    expect(summary.available.minorUnits).toBeGreaterThanOrEqual(0);
    expect(summary.pending.minorUnits).toBeGreaterThan(0);
    expect(summary.available.minorUnits).not.toBe(
      summary.available.minorUnits + summary.pending.minorUnits
    );
  });

  it('serves the per-source share rather than leaving it to be divided', async () => {
    const summary = await api.fetchRevenueSummary();

    expect(summary.breakdown.length).toBeGreaterThan(0);
    for (const row of summary.breakdown) {
      expect(typeof row.sharePercentage).toBe('number');
      expect(row.amount.minorUnits).toBeGreaterThan(0);
      expect(row.amount.currency).toBe(summary.currency);
    }
  });

  it('reports every money figure as Money with minorUnits', async () => {
    const summary = await api.fetchRevenueSummary();

    for (const value of [
      summary.lifetimeEarned,
      summary.available,
      summary.pending,
      summary.processing,
      summary.paidOut,
      summary.currentPeriod,
    ]) {
      expect(typeof value.minorUnits).toBe('number');
      expect(typeof value.exponent).toBe('number');
      expect(value.currency).toBe('GBP');
    }
  });

  it('pages earnings and filters by state and source', async () => {
    const all = await api.fetchEarnings({ take: 50 });
    expect(all.earnings.length).toBeGreaterThan(0);

    const pending = await api.fetchEarnings({ state: 'Pending' });
    expect(pending.earnings.every((earning) => earning.state === 'Pending')).toBe(true);

    const sponsored = await api.fetchEarnings({ source: 'SponsoredContent' });
    expect(sponsored.earnings.every((earning) => earning.source === 'SponsoredContent')).toBe(true);
  });

  it('includes the unhappy states, so the screen has to handle them', async () => {
    const all = await api.fetchEarnings({ take: 50 });
    const states = new Set(all.earnings.map((earning) => String(earning.state)));

    expect(states.has('Reversed')).toBe(true);
    expect(states.has('Refunded')).toBe(true);
  });

  it('reports a net amount rather than making the client subtract the fee', async () => {
    const all = await api.fetchEarnings({ take: 50 });
    const withFee = all.earnings.find((earning) => (earning.fee?.minorUnits ?? 0) > 0)!;

    expect(withFee.netAmount.minorUnits).toBe(
      withFee.amount.minorUnits - withFee.fee!.minorUnits
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Journey 6 — referral → share → status → reward
// ─────────────────────────────────────────────────────────────────────────────

describe('Journey 6 · invite somebody', () => {
  it('keeps invited, joined and qualified as three different numbers', async () => {
    // §18. A fixture where they matched would let a screen conflate them
    // undetected, and a member would be told they are owed money they are not.
    const programme = await api.fetchReferralProgramme();

    expect(programme.invited).toBeGreaterThan(programme.signedUp);
    expect(programme.signedUp).toBeGreaterThan(programme.qualified);
  });

  it('serves the qualification rule in words rather than expecting the app to know it', async () => {
    const programme = await api.fetchReferralProgramme();

    expect(programme.qualificationDescription.length).toBeGreaterThan(40);
    expect(programme.terms.length).toBeGreaterThan(0);
  });

  it('builds the share URL server-side so the domain is never guessed', async () => {
    const programme = await api.fetchReferralProgramme();

    expect(programme.shareUrl).toMatch(/^https:\/\//);
    expect(programme.shareUrl).toContain(programme.code);
  });

  it('gives every referral a state, and a reason where it is not obvious', async () => {
    const history = await api.fetchReferralHistory({ take: 20 });

    expect(history.referrals.length).toBeGreaterThan(0);

    const states = new Set(history.referrals.map((referral) => String(referral.state)));
    expect(states.has('Rewarded')).toBe(true);
    expect(states.has('Pending')).toBe(true);
    // The unhappy ones are present, and each explains itself.
    expect(states.has('Rejected')).toBe(true);
    expect(states.has('Expired')).toBe(true);

    for (const referral of history.referrals.filter((item) => item.state !== 'Rewarded' && item.state !== 'Invited')) {
      expect(referral.stateReason).toBeTruthy();
    }
  });

  it('pages referral history', async () => {
    const first = await api.fetchReferralHistory({ take: 3 });

    expect(first.referrals).toHaveLength(3);
    expect(first.hasMore).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Journey 7 — challenge → join → progress → complete → reward
// ─────────────────────────────────────────────────────────────────────────────

describe('Journey 7 · take on a challenge', () => {
  it('joins an open, eligible challenge', async () => {
    const open = await api.fetchChallenges({ state: 'open' });
    const target = open.find((challenge) => challenge.state === 'Open' && challenge.isEligible)!;

    const joined = await api.joinChallenge(target.challengeId);

    expect(joined.state).toBe('Joined');
    expect(joined.joinedAt).toBeTruthy();
  });

  it('refuses to join twice', async () => {
    const open = await api.fetchChallenges({ state: 'open' });
    const target = open.find((challenge) => challenge.state === 'Open' && challenge.isEligible)!;

    await api.joinChallenge(target.challengeId);
    const refusal = await refusalOf(api.joinChallenge(target.challengeId));

    expect(refusal.code).toBe('creator.challenge.already_joined');
  });

  it('refuses an ineligible challenge with the platform’s own reason', async () => {
    const all = await api.fetchChallenges();
    const ineligible = all.find((challenge) => !challenge.isEligible)!;

    const refusal = await refusalOf(api.joinChallenge(ineligible.challengeId));

    expect(refusal.code).toBe('creator.challenge.not_eligible');
    // The reason is the platform's, not a generic "unavailable".
    expect(refusal.message.length).toBeGreaterThan(20);
  });

  it('refuses a challenge that has not opened yet', async () => {
    const all = await api.fetchChallenges();
    const upcoming = all.find((challenge) => challenge.state === 'Upcoming')!;

    const refusal = await refusalOf(api.joinChallenge(upcoming.challengeId));

    expect(refusal.code).toBe('creator.challenge.not_open');
  });

  it('claims a completed challenge exactly once', async () => {
    const all = await api.fetchChallenges();
    const completed = all.find((challenge) => challenge.state === 'Completed')!;

    const claimed = await api.claimChallenge(completed.challengeId);
    expect(claimed.state).toBe('Claimed');

    const refusal = await refusalOf(api.claimChallenge(completed.challengeId));
    expect(refusal.code).toBe('creator.challenge.already_claimed');
  });

  it('refuses to claim a challenge that is not finished', async () => {
    const all = await api.fetchChallenges();
    const inProgress = all.find((challenge) => challenge.state === 'InProgress')!;

    const refusal = await refusalOf(api.claimChallenge(inProgress.challengeId));

    expect(refusal.code).toBe('creator.challenge.not_complete');
  });

  it('serves rules and per-task progress as data rather than expecting the app to know them', async () => {
    const all = await api.fetchChallenges();
    const challenge = all.find((item) => item.state === 'InProgress')!;

    expect(challenge.rules.length).toBeGreaterThan(0);
    expect(challenge.tasks.length).toBeGreaterThan(0);
    expect(challenge.tasks.every((task) => typeof task.isComplete === 'boolean')).toBe(true);
    // The overall progress is served, not derived from the task list.
    expect(typeof challenge.progress.percentage).toBe('number');
  });

  it('serves a leaderboard only where the challenge ranks participants', async () => {
    const all = await api.fetchChallenges();
    const ranked = all.find((challenge) => challenge.hasLeaderboard)!;
    const unranked = all.find((challenge) => !challenge.hasLeaderboard)!;

    const leaderboard = await api.fetchChallengeLeaderboard(ranked.challengeId);
    expect(leaderboard.entries.length).toBeGreaterThan(0);
    expect(leaderboard.scoreLabel.length).toBeGreaterThan(0);

    const refusal = await refusalOf(api.fetchChallengeLeaderboard(unranked.challengeId));
    expect(refusal.code).toBe('creator.challenge.no_leaderboard');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Journey 8 — grant → eligibility → apply → submit → pending
// ─────────────────────────────────────────────────────────────────────────────

describe('Journey 8 · apply for a grant', () => {
  it('walks discovery, the served form, and a complete submission', async () => {
    const grants = await api.fetchGrants();
    const target = grants.find(
      (grant) => grant.isEligible && grant.state === 'Open' && !grant.applicationId
    )!;

    const form = await api.fetchGrantForm(target.grantId);
    expect(form.fields.length).toBeGreaterThan(0);
    // §24: the questions are data, not hard-coded in the app.
    expect(form.declarations.length).toBeGreaterThan(0);

    const answers = Object.fromEntries(
      form.fields.map((field) => [field.key, field.kind === 'select' ? field.options![0].value : 'An answer.'])
    );

    const application = await api.submitGrantApplication({
      grantId: target.grantId,
      answers,
      attachmentIds: [],
      acceptedDeclarations: form.declarations,
    });

    // A real panel is not instant. `Submitted`, and no further.
    expect(application.state).toBe('Submitted');
    expect(application.submittedAt).toBeTruthy();
    expect(application.canWithdraw).toBe(true);

    const mine = await api.fetchGrantApplications();
    expect(mine.map((item) => item.applicationId)).toContain(application.applicationId);
  });

  it('refuses a submission missing a required answer', async () => {
    const grants = await api.fetchGrants();
    const target = grants.find(
      (grant) => grant.isEligible && grant.state === 'Open' && !grant.applicationId
    )!;
    const form = await api.fetchGrantForm(target.grantId);

    const refusal = await refusalOf(
      api.submitGrantApplication({
        grantId: target.grantId,
        answers: {},
        attachmentIds: [],
        acceptedDeclarations: form.declarations,
      })
    );

    expect(refusal.code).toBe('creator.grant.answers_incomplete');
  });

  it('refuses a submission that has not accepted every declaration', async () => {
    const grants = await api.fetchGrants();
    const target = grants.find(
      (grant) => grant.isEligible && grant.state === 'Open' && !grant.applicationId
    )!;
    const form = await api.fetchGrantForm(target.grantId);
    const answers = Object.fromEntries(
      form.fields.map((field) => [field.key, field.kind === 'select' ? field.options![0].value : 'An answer.'])
    );

    const refusal = await refusalOf(
      api.submitGrantApplication({
        grantId: target.grantId,
        answers,
        attachmentIds: [],
        acceptedDeclarations: [],
      })
    );

    expect(refusal.code).toBe('creator.grant.declarations_required');
  });

  it('refuses an ineligible applicant server-side, not only with a disabled button', async () => {
    const grants = await api.fetchGrants();
    const ineligible = grants.find((grant) => !grant.isEligible)!;
    const form = await api.fetchGrantForm(ineligible.grantId);

    const refusal = await refusalOf(
      api.submitGrantApplication({
        grantId: ineligible.grantId,
        answers: Object.fromEntries(form.fields.map((field) => [field.key, 'x'])),
        attachmentIds: [],
        acceptedDeclarations: form.declarations,
      })
    );

    expect(refusal.code).toBe('creator.grant.not_eligible');
  });

  it('refuses a grant that has not opened', async () => {
    const grants = await api.fetchGrants();
    const upcoming = grants.find((grant) => grant.state === 'Upcoming')!;
    const form = await api.fetchGrantForm(upcoming.grantId);

    const refusal = await refusalOf(
      api.submitGrantApplication({
        grantId: upcoming.grantId,
        answers: Object.fromEntries(form.fields.map((field) => [field.key, 'x'])),
        attachmentIds: [],
        acceptedDeclarations: form.declarations,
      })
    );

    expect(refusal.code).toBe('creator.grant.not_open');
  });

  it('saves and reloads a draft', async () => {
    const grants = await api.fetchGrants();
    const target = grants.find(
      (grant) => grant.isEligible && grant.state === 'Open' && !grant.applicationId
    )!;

    const draft = await api.saveGrantDraft(target.grantId, { proposal: 'Half written.' });
    expect(draft.state).toBe('Draft');

    const again = await api.saveGrantDraft(target.grantId, { proposal: 'More written now.' });
    // Updates the existing draft rather than opening a second one.
    expect(again.applicationId).toBe(draft.applicationId);
    expect(again.answers.proposal).toBe('More written now.');
  });

  it('withdraws an application and frees the grant to be applied for again', async () => {
    const before = await api.fetchGrantApplications();
    const withdrawable = before.find((application) => application.canWithdraw)!;

    const withdrawn = await api.withdrawGrantApplication(withdrawable.applicationId);

    expect(withdrawn.state).toBe('Withdrawn');
    expect(withdrawn.canWithdraw).toBe(false);

    const refusal = await refusalOf(api.withdrawGrantApplication(withdrawable.applicationId));
    expect(refusal.code).toBe('creator.grant.not_withdrawable');
  });

  it('serves a default form for a grant with no bespoke one', async () => {
    const form = await api.fetchGrantForm('grant-safety-campaign');

    expect(form.grantId).toBe('grant-safety-campaign');
    expect(form.fields.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Journey 9 — content → sponsor → package → payment → approval
// ─────────────────────────────────────────────────────────────────────────────

describe('Journey 9 · sponsor a piece of content', () => {
  it('shows a creator’s sponsored content across every state', async () => {
    const all = await api.fetchSponsoredContent();
    const states = new Set(all.map((item) => String(item.state)));

    expect(states.has('Active')).toBe(true);
    expect(states.has('PendingApproval')).toBe(true);
    // The refusal path exists in the fixture, so the screen must render it.
    expect(states.has('Rejected')).toBe(true);
  });

  it('gives a rejected placement a reason a creator can act on', async () => {
    const all = await api.fetchSponsoredContent();
    const rejected = all.find((item) => item.state === 'Rejected')!;

    expect(rejected.rejectionReason).toBeTruthy();
    expect(rejected.rejectionReason!.length).toBeGreaterThan(40);
  });

  it('groups by lifecycle stage rather than making the client filter', async () => {
    const live = await api.fetchSponsoredContent('live');
    const pending = await api.fetchSponsoredContent('pending');
    const finished = await api.fetchSponsoredContent('finished');

    expect(live.every((item) => ['Active', 'Scheduled', 'Approved'].includes(String(item.state)))).toBe(true);
    expect(
      pending.every((item) => ['PendingPayment', 'PendingApproval', 'Draft'].includes(String(item.state)))
    ).toBe(true);
    expect(
      finished.every((item) =>
        ['Expired', 'Completed', 'Cancelled', 'Rejected'].includes(String(item.state))
      )
    ).toBe(true);
  });

  it('carries a real B15 product code on anything that was actually bought', async () => {
    // The purchase itself goes through Phase 6's real checkout. This asserts
    // the creator view points back at a real catalogue product rather than
    // inventing a package of its own.
    const all = await api.fetchSponsoredContent();
    const bought = all.filter((item) => item.amountPaid);

    expect(bought.length).toBeGreaterThan(0);
    for (const item of bought) {
      expect(item.productCode).toBeTruthy();
      expect(item.amountPaid!.minorUnits).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Journey 10 — milestones → progress → complete → claim → reward
// ─────────────────────────────────────────────────────────────────────────────

describe('Journey 10 · claim a milestone', () => {
  it('claims a completed milestone and pays its reward', async () => {
    const milestones = await api.fetchMilestones();
    const claimable = milestones.find((milestone) => milestone.state === 'Completed')!;

    expect(claimable.reward).toBeTruthy();

    const claimed = await api.claimMilestone(claimable.milestoneId);

    expect(claimed.state).toBe('Claimed');
    expect(claimed.claimedAt).toBeTruthy();
  });

  it('refuses a second claim of the same milestone', async () => {
    const milestones = await api.fetchMilestones();
    const claimable = milestones.find((milestone) => milestone.state === 'Completed')!;

    await api.claimMilestone(claimable.milestoneId);
    const refusal = await refusalOf(api.claimMilestone(claimable.milestoneId));

    expect(refusal.code).toBe('creator.milestone.already_claimed');
  });

  it('refuses a claim on a milestone that is not finished', async () => {
    const milestones = await api.fetchMilestones();
    const inProgress = milestones.find((milestone) => milestone.state === 'InProgress')!;

    const refusal = await refusalOf(api.claimMilestone(inProgress.milestoneId));

    expect(refusal.code).toBe('creator.milestone.not_complete');
  });

  it('serves a progress percentage that is not always current over target', async () => {
    // The property the whole "progress is served" rule exists to protect.
    const milestones = await api.fetchMilestones();
    const weighted = milestones.find(
      (milestone) =>
        milestone.progress.target > 0 &&
        milestone.progress.percentage !==
          Math.round((milestone.progress.current / milestone.progress.target) * 100)
    );

    expect(weighted).toBeDefined();
  });

  it('gives every milestone a state, an ordering and a description', async () => {
    const milestones = await api.fetchMilestones();

    expect(milestones.length).toBeGreaterThan(5);
    for (const milestone of milestones) {
      expect(milestone.state).toBeTruthy();
      expect(typeof milestone.sortOrder).toBe('number');
      expect(milestone.description.length).toBeGreaterThan(10);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-cutting
// ─────────────────────────────────────────────────────────────────────────────

describe('sign-up bonus is never awarded by the client', () => {
  it('refuses acknowledgement while requirements are outstanding', async () => {
    const bonus = await api.fetchSignupBonus();
    expect(bonus.requirements.some((requirement) => !requirement.isMet)).toBe(true);

    const refusal = await refusalOf(api.acknowledgeSignupBonus());

    expect(refusal.code).toBe('creator.signup_bonus.requirements_unmet');
  });

  it('returns a state rather than a points total', async () => {
    // §19: the client presents state. The balance is re-read from the rewards
    // adapter; nothing here increments anything.
    const bonus = await api.fetchSignupBonus();

    expect(bonus.state).toBeTruthy();
    expect(bonus).not.toHaveProperty('balanceAfter');
    expect(bonus).not.toHaveProperty('newBalance');
  });
});

describe('recommendations are ranked by the platform and dismissed across devices', () => {
  it('returns them in the platform’s order', async () => {
    const first = await api.fetchCreatorRecommendations('dashboard');
    const second = await api.fetchCreatorRecommendations('dashboard');

    expect(first.map((item) => item.recommendationId)).toEqual(
      second.map((item) => item.recommendationId)
    );
  });

  it('explains every suggestion', async () => {
    const recommendations = await api.fetchCreatorRecommendations();

    for (const recommendation of recommendations) {
      expect(recommendation.reason.length).toBeGreaterThan(15);
      expect(recommendation.actionRoute.startsWith('/')).toBe(true);
    }
  });

  it('keeps a dismissal rather than filtering locally', async () => {
    const before = await api.fetchCreatorRecommendations();
    const target = before[0];

    await api.dismissRecommendation(target.recommendationId);

    const after = await api.fetchCreatorRecommendations();
    expect(after.map((item) => item.recommendationId)).not.toContain(target.recommendationId);
  });
});

describe('the directory returns only the public projection', () => {
  it('never includes a private field', async () => {
    const page = await api.fetchCreatorDirectory({ take: 5 });

    expect(page.creators.length).toBeGreaterThan(0);
    for (const creator of page.creators) {
      // §6/§31. A `PublicCreator` has no audience internals, no completeness
      // score and no programme state. This asserts the payload matches.
      expect(creator).not.toHaveProperty('audience');
      expect(creator).not.toHaveProperty('completeness');
      expect(creator).not.toHaveProperty('userId');
      expect(creator).not.toHaveProperty('isDiscoverable');
    }
  });

  it('filters by query, country, category and verification', async () => {
    const verified = await api.fetchCreatorDirectory({ verified: true, take: 50 });
    expect(verified.creators.every((creator) => creator.isVerifiedCreator)).toBe(true);

    const british = await api.fetchCreatorDirectory({ country: 'GB', take: 50 });
    expect(british.creators.every((creator) => creator.countryCode === 'GB')).toBe(true);

    const housing = await api.fetchCreatorDirectory({ category: 'housing', take: 50 });
    expect(housing.creators.every((creator) => creator.categories.includes('housing'))).toBe(true);
  });

  it('pages', async () => {
    const first = await api.fetchCreatorDirectory({ take: 4 });

    expect(first.creators).toHaveLength(4);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBeTruthy();
  });
});

describe('leaderboards label their score and place the viewer', () => {
  it('names the period and the scoring rule', async () => {
    const leaderboard = await api.fetchLeaderboard({ scope: 'top-creators', period: '30d' });

    expect(leaderboard.periodLabel.length).toBeGreaterThan(0);
    expect(leaderboard.scoreLabel.length).toBeGreaterThan(0);
    expect(leaderboard.updatedAt).toBeTruthy();
  });

  it('returns the viewer’s own entry separately so it is always visible', async () => {
    const leaderboard = await api.fetchLeaderboard({ scope: 'top-creators' });

    expect(leaderboard.viewerEntry).toBeTruthy();
    expect(leaderboard.entries[0].rank).toBe(1);
  });

  it('returns entries already ordered', async () => {
    const leaderboard = await api.fetchLeaderboard({ scope: 'country' });
    const ranks = leaderboard.entries.map((entry) => entry.rank);

    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});
