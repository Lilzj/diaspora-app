// ─────────────────────────────────────────────────────────────────────────────
// Course, lesson, grant application and reputation — read by id since 20 Oct 2026
//
// Backend 1ca07a8 serves `GET /academy/courses/{courseId}`,
// `GET /academy/lessons/{lessonId}`, `GET /grants/applications/{applicationId}`,
// `GET /creators/me/reputation` and `GET /creators/{creatorId}/reputation`.
// Before that the app derived a course from the catalogue, needed a `courseId`
// to find a lesson (a legacy deep link fell back to the simulation), had no
// by-id application read, and showed a static badge list and a simulated
// reputation.
//
// What these pin: each function calls the real path (never `/creator-gap/v0`),
// the wire is adapted exactly as the list reads adapt it, and the reputation's
// `signals` and `unavailable` arrive untouched — nothing zero-filled, nothing
// dropped.
// ─────────────────────────────────────────────────────────────────────────────

import {
  fetchCourse,
  fetchCreatorReputation,
  fetchGrantApplication,
  fetchLesson,
  fetchMyCreatorReputation,
} from '../creator/certified-client';
import { apiClient } from '../apiClient';

jest.mock('../apiClient', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn() },
}));

const mockGet = apiClient.get as jest.Mock;

function answer(data: unknown) {
  mockGet.mockResolvedValueOnce({ data: { data } });
}

function refuse(status: number) {
  mockGet.mockRejectedValueOnce({
    isAxiosError: true,
    response: { status, data: { title: 'Not found', status } },
    message: `Request failed with status code ${status}`,
  });
}

beforeEach(() => mockGet.mockReset());

describe('a course by id', () => {
  it('reads GET /academy/courses/{courseId} and folds the level', async () => {
    answer({
      courseId: 'c1',
      slug: 'guide-craft',
      title: 'Writing a guide',
      summary: 'How',
      level: 'Beginner',
      estimatedMinutes: 20,
      tags: [],
      lessonCount: 3,
      awardsCertificate: true,
      prerequisiteCourseSlugs: ['basics'],
      progress: null,
      isSaved: false,
      sortOrder: 1,
    });

    const course = await fetchCourse('c1');

    expect(mockGet).toHaveBeenCalledWith('/academy/courses/c1', { params: undefined });
    expect(course.level).toBe('beginner');
    expect(course.prerequisiteCourseIds).toEqual(['basics']);
  });

  it('passes the server’s 404 through rather than inventing a course', async () => {
    refuse(404);
    await expect(fetchCourse('gone')).rejects.toMatchObject({ httpStatus: 404 });
  });
});

describe('a lesson by id — legacy deep links', () => {
  it('reads GET /academy/lessons/{lessonId} with no course in hand', async () => {
    answer({
      lessonId: 'l5',
      courseId: 'c1',
      title: 'Check',
      kind: 'Quiz',
      estimatedMinutes: 5,
      blocks: [{ kind: 'heading', text: 'Quiz' }],
      quiz: { quizId: 'q', passMark: 3, questions: [] },
      isComplete: false,
      completedAt: null,
      sortOrder: 5,
    });

    const lesson = await fetchLesson('l5');

    expect(mockGet).toHaveBeenCalledWith('/academy/lessons/l5', { params: undefined });
    expect(lesson.courseId).toBe('c1');
    expect(lesson.kind).toBe('quiz');
    expect(lesson.blocks[0]).toMatchObject({ kind: 'heading', text: 'Quiz' });
  });
});

describe('a grant application by id', () => {
  it('reads GET /grants/applications/{applicationId} and adapts the money', async () => {
    answer({
      applicationId: 'a1',
      grantId: 'g1',
      grantTitle: 'Community fund',
      state: 'UnderReview',
      answers: { why: 'Because' },
      acceptedDeclarations: [],
      attachmentIds: [],
      requestedAmount: { minorUnits: 50000, currency: 'GBP', exponent: 2 },
      awardedAmount: null,
      canWithdraw: true,
    });

    const application = await fetchGrantApplication('a1');

    expect(mockGet).toHaveBeenCalledWith('/grants/applications/a1', { params: undefined });
    expect(application.state).toBe('UnderReview');
    expect(application.requestedAmount?.minorUnits).toBe(50000);
    expect(application.awardedAmount).toBeNull();
  });

  it('reports somebody else’s application as the server does — a 404', async () => {
    refuse(404);
    await expect(fetchGrantApplication('not-mine')).rejects.toMatchObject({ httpStatus: 404 });
  });
});

describe('reputation', () => {
  const publicRead = {
    creatorId: 'cr1',
    userId: 'u1',
    isSelf: false,
    score: null,
    tier: 'TrustedContributor',
    tierLabel: 'Trusted contributor',
    dimensions: [{ key: 'contribution', label: 'Contribution', score: 40, maxScore: null }],
    badges: [
      {
        badgeId: 'trust:PhoneVerified',
        key: 'PhoneVerified',
        label: 'Phone verified',
        isEarned: true,
        earnedAt: '2026-10-01T00:00:00Z',
        source: 'trust',
      },
    ],
    pointsToNextTier: null,
    nextTier: 'CommunityExpert',
    nextTierLabel: 'Community expert',
    signals: [{ key: 'guide_views', label: 'Guide views', value: 0, source: 'guides' }],
    unavailable: [
      { key: 'reach', label: 'Reach beyond guides', reason: 'Views are recorded for guides only.' },
      { key: 'score', label: 'Combined score', reason: 'Withheld on a public read.' },
    ],
    updatedAt: '2026-10-20T00:00:00Z',
  };

  it('reads the caller’s own at GET /creators/me/reputation', async () => {
    answer({ ...publicRead, isSelf: true, score: 120 });

    const reputation = await fetchMyCreatorReputation();

    expect(mockGet).toHaveBeenCalledWith('/creators/me/reputation', { params: undefined });
    expect(reputation.score).toBe(120);
  });

  it('reads a public one at GET /creators/{creatorId}/reputation, unavailable and all', async () => {
    answer(publicRead);

    const reputation = await fetchCreatorReputation('cr1');

    expect(mockGet).toHaveBeenCalledWith('/creators/cr1/reputation', { params: undefined });
    // Withheld is withheld: not a zero.
    expect(reputation.score).toBeNull();
    expect(reputation.unavailable.map((item) => item.key)).toEqual(['reach', 'score']);
    expect(reputation.badges[0].source).toBe('trust');
    // A served zero stays a served zero, and is not dropped either.
    expect(reputation.signals).toEqual(publicRead.signals);
  });

  it('never calls the simulated prefix', async () => {
    answer(publicRead);
    answer(publicRead);
    await fetchMyCreatorReputation();
    await fetchCreatorReputation('cr1');

    for (const [url] of mockGet.mock.calls) {
      expect(String(url)).not.toContain('creator-gap');
    }
  });
});
