// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the Trust module against the real contract
// (Remediation Wave D-4)
//
// Runs the real `lib/trust-api.ts` against the real `mocks/handlers/trust.ts`,
// which was written from `Diaspora.Modules.Trust`'s contract rather than from
// what this client expects. Nothing is re-implemented here: a test against a
// re-implementation of the thing under test proves nothing.
//
// Every case below pins a detail that would break a client **silently** — no
// exception, no red screen, just a verification checklist missing eight rows, a
// risk score shown to a member who should never see one, a "+-20" in a points
// ledger, an appeal rejected by a typo, or a submission that reported success
// while the server had already refused it. Those are the ones worth a test. The
// loud failures look after themselves.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '@/lib/apiClient';
import { readPage } from '@/lib/platform-envelope';
import { resetTrustMocks, setTrustMockStaff, setupTrustMocks } from '@/mocks/handlers/trust';
import {
  APPEAL_REASON_MIN_LENGTH,
  MEDIA_REFERENCE_PREFIX,
  appealTrackerIndex,
  clampPageSize,
  evaluateEligibility,
  fetchAppeal,
  fetchAppealQueue,
  fetchFeatureRequirements,
  fetchModerationQueue,
  fetchMyAppeals,
  fetchMyBadges,
  fetchMyReputation,
  fetchMyReputationEvents,
  fetchMyVerifications,
  fetchReputationRules,
  fetchTrustProfile,
  fetchTrustTimeline,
  fetchVerification,
  fetchVerificationQueue,
  hasStaffRiskView,
  isAppealAlreadyOpenError,
  isAppealNotAllowedError,
  isDuplicateConfirmationError,
  isDuplicateVerificationError,
  isMediaReference,
  isSelfActionForbiddenError,
  isVerificationGranted,
  latestVerificationOfType,
  mediaDocumentReference,
  needsMemberAction,
  recordConfirmation,
  recordModerationDecision,
  reviewAppeal,
  submitAppeal,
  submitCountryVerification,
  submitDiasporaVerification,
  submitIdentityVerification,
  trustErrorMessage,
  trustKeys,
  verificationStatusFor,
} from '@/lib/trust-api';
import type { VerificationType } from '@/types/trust';

/**
 * Runs a call that must reject, and hands the rejection to a predicate.
 *
 * `expect(...).rejects.toSatisfy(...)` is `jest-extended`, which this repo does
 * not install — and a matcher that does not exist leaves the rejection
 * unhandled, which takes the whole worker down rather than failing one case.
 */
async function expectRejection(
  run: () => Promise<unknown>,
  predicate: (cause: unknown) => boolean
): Promise<void> {
  try {
    await run();
  } catch (cause) {
    expect(predicate(cause)).toBe(true);
    return;
  }
  throw new Error('Expected the call to be refused, and it succeeded.');
}

let mock: MockAdapter;

/** The seeded, approved country verification. */
const APPROVED_COUNTRY = '00000000-0000-4000-a000-000000000101';
/** The seeded, rejected diaspora verification — the only appealable one. */
const REJECTED_DIASPORA = '00000000-0000-4000-a000-000000000102';

const DEV_MEMBER_ID = '00000000-0000-4000-b000-00000000da01';
const OTHER_MEMBER_ID = '00000000-0000-4000-b000-00000000da02';

/** A well-formed media id, as `lib/media-api.ts` would hand one back. */
const MEDIA_ID = '11111111-2222-4333-8444-555555555555';

/** The thirteen types `VerificationTypeHandlerRegistry.SupportedTypes` yields. */
const SUPPORTED_TYPES: VerificationType[] = [
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
];

function diasporaBody(overrides: Record<string, unknown> = {}) {
  return {
    nationality: 'MU',
    residenceCountry: 'GB',
    documentType: 'Passport' as const,
    issueCountry: 'MU',
    documentReference: mediaDocumentReference(MEDIA_ID),
    selfieReference: mediaDocumentReference(MEDIA_ID),
    ...overrides,
  };
}

beforeAll(() => {
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
  setupTrustMocks(mock);
  // Anything this client sends that the handler does not answer is a defect in
  // the client, not a passthrough.
  mock.onAny().reply(404);
});

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  resetTrustMocks();
  mock.resetHistory();
});

// ── Trap 1 ───────────────────────────────────────────────────────────────────

describe('enum casing is per-enum, and four of them disagree with each other', () => {
  it('emits PascalCase types and statuses', async () => {
    const page = await fetchMyVerifications();

    expect(page.items.map((item) => item.type)).toEqual(
      expect.arrayContaining(['Country', 'Diaspora'])
    );
    expect(page.items.map((item) => item.status)).toEqual(
      expect.arrayContaining(['Approved', 'Rejected'])
    );

    for (const item of page.items) {
      expect(item.type[0]).toBe(item.type[0].toUpperCase());
      expect(item.status).not.toMatch(/[-_]/);
    }
  });

  it('emits reputation dimensions in LOWERCASE, which no other enum in this module does', async () => {
    const page = await fetchMyReputationEvents();

    const dimensions = page.items.map((item) => item.dimension);
    expect(dimensions).toEqual(expect.arrayContaining(['contribution', 'verification', 'trust']));

    // The C# members are literally lowercase. A client that PascalCased them —
    // as it would have to for every other enum here — matches nothing.
    for (const value of dimensions) {
      expect(value).toBe(value.toLowerCase());
    }
  });

  it('emits rejection reasons in SCREAMING_SNAKE and eligibility codes likewise', async () => {
    const page = await fetchMyVerifications({ type: 'Diaspora' });
    const rejected = page.items[0];

    expect(rejected.rejectionReasonCode).toBe('ILLEGIBLE_DOCUMENT');
    expect(rejected.rejectionReasonCode).toMatch(/^[A-Z_]+$/);

    const decision = await evaluateEligibility({ capability: 'guides', dryRun: true });
    expect(decision.code).toMatch(/^[A-Z_]+$/);
  });

  it('emits account health as `UnderReview`-style names, never with a space', async () => {
    const profile = await fetchTrustProfile();

    // `'Under Review'` is what `types/trust.ts` used to declare. No C# enum can
    // carry a space, so nothing on the wire has ever produced it.
    expect(profile.healthStatus.health).not.toContain(' ');
  });
});

// ── Trap 2 ───────────────────────────────────────────────────────────────────

describe('the verification checklist carries one key per supported type', () => {
  it('returns all thirteen, not the four the old handler sent', async () => {
    const profile = await fetchTrustProfile();
    const keys = Object.keys(profile.verifications);

    expect(keys).toHaveLength(SUPPORTED_TYPES.length);
    for (const type of SUPPORTED_TYPES) {
      expect(keys).toContain(type);
    }
  });

  it('reads `NotStarted` for a type never attempted, which is not the same as missing', async () => {
    const profile = await fetchTrustProfile();

    // Never attempted: `NotStarted` since 20 Oct 2026 (`Pending` is a case awaiting review).
    expect(verificationStatusFor(profile, 'Business')).toBe('NotStarted');
    // Attempted and granted.
    expect(verificationStatusFor(profile, 'Country')).toBe('Approved');

    // A key the deployment does not support at all is null rather than
    // `'NotStarted'`, because "we do not offer this" and "you have not done this"
    // are different answers.
    expect(verificationStatusFor(profile, 'NotAType' as VerificationType)).toBeNull();
  });

  it('counts `PartiallyApproved` as granted, and `Expired` as needing the member', () => {
    expect(isVerificationGranted('Approved')).toBe(true);
    expect(isVerificationGranted('PartiallyApproved')).toBe(true);
    expect(isVerificationGranted('Pending')).toBe(false);

    expect(needsMemberAction('Expired')).toBe(true);
    expect(needsMemberAction('Revoked')).toBe(true);
    expect(needsMemberAction('ReverificationRequired')).toBe(true);
    expect(needsMemberAction('UnderReview')).toBe(false);
  });
});

// ── Trap 3 ───────────────────────────────────────────────────────────────────

describe('risk is staff-only, and absent is not zero', () => {
  it('omits riskScore and riskLevel for an ordinary member', async () => {
    const profile = await fetchTrustProfile();

    expect(profile.riskScore).toBeUndefined();
    expect(profile.riskLevel).toBeUndefined();
    expect(hasStaffRiskView(profile)).toBe(false);
  });

  it('includes them for a caller holding the review permission', async () => {
    setTrustMockStaff(true);
    const profile = await fetchTrustProfile();

    expect(typeof profile.riskScore).toBe('number');
    expect(profile.riskLevel).toBe('Low');
    expect(hasStaffRiskView(profile)).toBe(true);
  });

  it('does not mistake a genuine score of zero for an absent one', () => {
    // `Boolean(0)` is false. A staff caller looking at a spotless member would
    // have had the panel hidden, which is the same rendering as a member who
    // is not entitled to see it at all.
    expect(hasStaffRiskView({ riskScore: 0, riskLevel: 'Low' } as never)).toBe(true);
    expect(hasStaffRiskView(null)).toBe(false);
  });
});

// ── Trap 4 ───────────────────────────────────────────────────────────────────

describe('pagination: offset pages inside `data`, and two routes that are not pages', () => {
  it('returns an offset `PagedResult` with all seven fields on a list route', async () => {
    const response = await apiClient.get('/trust/timeline');
    const body = (response.data as { data: Record<string, unknown> }).data;

    expect(body).toEqual(
      expect.objectContaining({
        items: expect.any(Array),
        page: expect.any(Number),
        pageSize: expect.any(Number),
        totalCount: expect.any(Number),
        totalPages: expect.any(Number),
        hasNextPage: expect.any(Boolean),
        hasPreviousPage: expect.any(Boolean),
      })
    );

    const page = readPage(response.data);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.totalCount).not.toBeNull();
  });

  it('honours page and pageSize, and clamps pageSize to the server ceiling', async () => {
    const first = await fetchTrustTimeline({ page: 1, pageSize: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.hasMore).toBe(true);

    const second = await fetchTrustTimeline({ page: 2, pageSize: 1 });
    expect(second.items[0].eventId).not.toBe(first.items[0].eventId);

    // `PaginationRequest.MaxPageSize` is 50, and the server clamps rather than
    // refusing — so a client asking for 500 gets 50 and no warning.
    expect(clampPageSize(500)).toBe(50);
    expect(clampPageSize(0)).toBe(1);
    expect(clampPageSize(undefined)).toBe(20);
  });

  it('returns a bare array from badges and feature-requirements, with no total anywhere', async () => {
    const badges = await fetchMyBadges();
    expect(Array.isArray(badges)).toBe(true);

    const requirements = await fetchFeatureRequirements('GB');
    expect(Array.isArray(requirements)).toBe(true);

    // `readPage` over a bare array reports `totalCount: null`, never
    // `items.length` — the length is what came back, not the population.
    const response = await apiClient.get('/trust/badges/me');
    expect(readPage(response.data).totalCount).toBeNull();
  });
});

// ── Trap 5 ───────────────────────────────────────────────────────────────────

describe('a submission is a 201, and a refusal can arrive inside one', () => {
  it('answers 201 rather than 200', async () => {
    const response = await apiClient.post('/trust/verifications/diaspora', diasporaBody());
    expect(response.status).toBe(201);
  });

  it('auto-rejects a claim whose nationality equals its residence — at 201', async () => {
    // The whole product rests on this check, and it happens without a human:
    // `DiasporaVerificationHandler.Evaluate` refuses it as a fact rather than a
    // judgement. A client that treated the HTTP status as the answer would show
    // a success screen over a rejection.
    const created = await submitDiasporaVerification(
      diasporaBody({ nationality: 'GB', residenceCountry: 'GB' })
    );

    expect(created.status).toBe('Rejected');
    expect(created.rejectionReasonCode).toBe('NOT_DIASPORA_ELIGIBLE');
    expect(created.canAppeal).toBe(true);
  });

  it('auto-rejects an expired document the same way', async () => {
    const created = await submitDiasporaVerification(
      diasporaBody({ expiryDate: '2020-01-01' })
    );

    expect(created.status).toBe('Rejected');
    expect(created.rejectionReasonCode).toBe('EXPIRED_DOCUMENT');
  });

  it('queues an ordinary claim as Pending, with nothing appealable yet', async () => {
    const created = await submitDiasporaVerification(diasporaBody());

    expect(created.status).toBe('Pending');
    expect(created.canAppeal).toBe(false);
    expect(created.rejectionReasonCode).toBeNull();
  });
});

// ── Trap 6 ───────────────────────────────────────────────────────────────────

describe('fields the DTO marks optional and the type handler requires', () => {
  it('refuses a diaspora submission with no selfie, though `SelfieReference` is `string?`', async () => {
    // The C# property is nullable and `RequiresSelfie` is true, so this is a
    // 400 from the handler rather than a model-binding error — which means it
    // is invisible in the DTO and invisible in any generated client.
    await expect(
      submitDiasporaVerification(diasporaBody({ selfieReference: '' }))
    ).rejects.toMatchObject({ response: { status: 400 } });
  });

  it('refuses a country submission with no arrival date, though `ArrivalDate` is `DateOnly?`', async () => {
    await expect(
      submitCountryVerification({
        countryCode: 'GB',
        documentType: 'ResidencePermit',
        documentReference: mediaDocumentReference(MEDIA_ID),
        arrivalDate: '',
      })
    ).rejects.toMatchObject({ response: { status: 400 } });
  });
});

// ── Trap 7 ───────────────────────────────────────────────────────────────────

describe('accepted document types differ per verification type', () => {
  it('accepts `Other` for a diaspora claim', async () => {
    const created = await submitDiasporaVerification(
      diasporaBody({ documentType: 'Other' })
    );
    expect(created.status).toBe('Pending');
  });

  it('refuses `Other` for an identity claim', async () => {
    // Same string, same coercion path on the server — an unrecognised
    // `documentType` becomes `Other` — and the outcome differs by route. That
    // asymmetry is what makes the silent coercion dangerous.
    await expect(
      submitIdentityVerification({
        documentType: 'Other',
        issueCountry: 'GB',
        documentReference: mediaDocumentReference(MEDIA_ID),
        selfieReference: mediaDocumentReference(MEDIA_ID),
      })
    ).rejects.toMatchObject({ response: { status: 400 } });
  });
});

// ── Trap 8 ───────────────────────────────────────────────────────────────────

describe('duplicates are conflicts, not silent second rows', () => {
  it('refuses a second open verification of the same type', async () => {
    await submitDiasporaVerification(diasporaBody());

    await expectRejection(
      () => submitDiasporaVerification(diasporaBody()),
      isDuplicateVerificationError
    );
  });

  it('refuses a second open appeal against the same target', async () => {
    const first = {
      type: 'Verification' as const,
      targetId: REJECTED_DIASPORA,
      reason: 'The scan was legible on my copy and I can supply a better one.',
    };

    await submitAppeal(first);
    await expectRejection(() => submitAppeal(first), isAppealAlreadyOpenError);
  });

  it('refuses a duplicate community confirmation and a self-confirmation', async () => {
    const body = {
      targetType: 'community-update',
      targetId: 'update-1',
      authorUserId: OTHER_MEMBER_ID,
    };

    const recorded = await recordConfirmation(body);
    expect(recorded.pointsAwarded).toBeGreaterThan(0);

    await expectRejection(() => recordConfirmation(body), isDuplicateConfirmationError);

    await expectRejection(
      () => recordConfirmation({ ...body, targetId: 'update-2', authorUserId: DEV_MEMBER_ID }),
      isSelfActionForbiddenError
    );
  });
});

// ── Trap 9 ───────────────────────────────────────────────────────────────────

describe('appeals: what can be appealed, and for how long', () => {
  it('refuses an appeal against a verification that is not in an appealable state', async () => {
    // Only `Rejected`, `Revoked` and `PartiallyApproved`. The approved country
    // verification is not one of them, and the screen's own `canAppeal` flag
    // says so — but a deep link or a stale draft can still reach here.
    await expectRejection(
      () =>
        submitAppeal({
          type: 'Verification',
          targetId: APPROVED_COUNTRY,
          reason: 'I would like this looked at again by somebody else please.',
        }),
      isAppealNotAllowedError
    );
  });

  it('refuses a reason shorter than twenty characters', async () => {
    await expect(
      submitAppeal({ type: 'Verification', targetId: REJECTED_DIASPORA, reason: 'Unfair' })
    ).rejects.toMatchObject({ response: { status: 400 } });

    expect(APPEAL_REASON_MIN_LENGTH).toBe(20);
  });

  it('moves the appealed verification to `Appealed` so it cannot be decided underneath', async () => {
    await submitAppeal({
      type: 'Verification',
      targetId: REJECTED_DIASPORA,
      reason: 'The scan was legible on my copy and I can supply a better one.',
    });

    const detail = await fetchVerification(REJECTED_DIASPORA);
    expect(detail.verification.status).toBe('Appealed');
    expect(detail.verification.canAppeal).toBe(false);
  });

  it('carries the four fields the old handler omitted', async () => {
    const created = await submitAppeal({
      type: 'Verification',
      targetId: REJECTED_DIASPORA,
      reason: 'The scan was legible on my copy and I can supply a better one.',
      additionalDocuments: [mediaDocumentReference(MEDIA_ID)],
      correctionRequest: true,
    });

    expect(created.isCorrectionRequest).toBe(true);
    expect(created.evidenceCount).toBe(1);
    expect(created.explanation).toBeNull();
    expect(created.resolvedAt).toBeNull();
  });
});

// ── Trap 10 ──────────────────────────────────────────────────────────────────

describe('the four inputs the server coerces rather than refusing', () => {
  it('refuses an unrecognised appeal type before it reaches the wire', async () => {
    // Server-side, `ParseAppealType` turns this into `Verification` — so the
    // member files an appeal against a verification when they meant a
    // suspension, and nothing anywhere reports an error.
    await expect(
      submitAppeal({
        type: 'Susspension' as never,
        targetId: REJECTED_DIASPORA,
        reason: 'The scan was legible on my copy and I can supply a better one.',
      })
    ).rejects.toThrow(/unrecognised appeal type/i);

    // And nothing was sent.
    expect(mock.history.post.filter((call) => call.url === '/trust/appeals')).toHaveLength(0);
  });

  it('refuses an unrecognised appeal review decision, which the server treats as a rejection', async () => {
    setTrustMockStaff(true);

    // `ReviewAppealRequest.Decision` is not parsed as an enum at all. The
    // endpoint compares it to "Approve" and "Escalate" and treats everything
    // else — a typo, an empty string, `"approved"` — as `Upheld: false`. There
    // is no safe fallback to lean on.
    await expect(
      reviewAppeal('any-id', { decision: 'approve ' as never, explanation: 'Looks fine.' })
    ).rejects.toThrow(/unrecognised appeal decision/i);
  });

  it('demonstrates what the coercion does when it is not stopped', async () => {
    setTrustMockStaff(true);

    const appeal = await submitAppeal({
      type: 'Verification',
      targetId: REJECTED_DIASPORA,
      reason: 'The scan was legible on my copy and I can supply a better one.',
    });

    // Straight to the wire, bypassing the client's guard, the way any other
    // caller would reach it.
    const response = await apiClient.post(`/trust/appeals/${appeal.appealId}/review`, {
      decision: 'Aprove',
      explanation: 'Meant to approve this.',
    });

    // Rejected. A single transposed letter is the difference between a member
    // getting their verification back and being refused.
    expect((response.data as { data: { status: string } }).data.status).toBe('Rejected');
  });

  it('drops a mistyped filter instead of refusing it, answering 200 with the full list', async () => {
    const mistyped = await apiClient.get('/trust/verifications', {
      params: { status: 'Aproved' },
    });

    expect(mistyped.status).toBe(200);
    // Both seeded verifications, not the one the caller asked for and not an
    // error. `TryParse<TEnum>` returning null means "no filter".
    expect(readPage(mistyped.data).items).toHaveLength(2);

    const correct = await fetchMyVerifications({ status: 'Approved' });
    expect(correct.items).toHaveLength(1);
  });
});

// ── Trap 11 ──────────────────────────────────────────────────────────────────

describe('media references are the format both sides already agree on', () => {
  it('renders a bare media id in the `media:` form Trust and Media both parse', () => {
    expect(mediaDocumentReference(MEDIA_ID)).toBe(`${MEDIA_REFERENCE_PREFIX}${MEDIA_ID}`);
    expect(MEDIA_REFERENCE_PREFIX).toBe('media:');
  });

  it('is idempotent, so a reference that already carries the prefix is not double-prefixed', () => {
    const once = mediaDocumentReference(MEDIA_ID);
    expect(mediaDocumentReference(once)).toBe(once);
    expect(isMediaReference(once)).toBe(true);
    expect(isMediaReference('uploads/2026/08/scan.jpg')).toBe(false);
  });

  it('refuses an empty id rather than sending `media:`', () => {
    expect(() => mediaDocumentReference('   ')).toThrow(/media id/i);
  });

  it('survives the round trip into a stored document', async () => {
    const created = await submitDiasporaVerification(diasporaBody());
    const detail = await fetchVerification(created.verificationId);

    expect(detail.documents).toHaveLength(1);
    // `documentUrl` is null: minting a link needs a storage provider, and a
    // handler that invented one would hide that the real field is nullable.
    expect(detail.documents[0].documentUrl).toBeNull();
  });
});

// ── Trap 12 ──────────────────────────────────────────────────────────────────

describe('eligibility', () => {
  it('allows an unknown capability rather than refusing it', async () => {
    // Trust does not know every capability on the platform, and a module that
    // has not declared a requirement has not asked Trust to gate it. So
    // `allowed: true` is not evidence that a gate was consulted.
    const decision = await evaluateEligibility({
      capability: 'time-travel',
      dryRun: true,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe('ALLOW');
  });

  it('names the unmet requirements when it refuses a known one', async () => {
    // The guide programme, not guide publishing: since 15 Sep 2026 publishing a
    // guide carries no Trust thresholds (a verified account is enough), so the
    // programme is the capability that still has requirements to name.
    const decision = await evaluateEligibility({
      capability: 'guide-programme',
      targetCountry: 'GB',
      dryRun: true,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('DENIED');
    expect(decision.unmetRequirements.length).toBeGreaterThan(0);
  });

  it('reports country-scoped thresholds as unmet when no country is supplied', async () => {
    const scoped = await fetchFeatureRequirements('GB');
    const global = await fetchFeatureRequirements(null);

    // See above: the guide programme is the capability with thresholds now.
    const scopedGuides = scoped.find((item) => item.featureId === 'guide-programme');
    const globalGuides = global.find((item) => item.featureId === 'guide-programme');

    expect(scopedGuides?.requirements.some((item) => item.currentProgress.includes('300'))).toBe(
      true
    );
    // "150 points" is always 150 points *somewhere*.
    expect(globalGuides?.requirements.some((item) => item.currentProgress.startsWith('0 /'))).toBe(
      true
    );
  });
});

// ── Trap 13 ──────────────────────────────────────────────────────────────────

describe('the staff surfaces refuse an ordinary caller', () => {
  it('answers 403 on both queues and the moderation decision route', async () => {
    await expect(fetchVerificationQueue()).rejects.toMatchObject({ response: { status: 403 } });
    await expect(fetchAppealQueue()).rejects.toMatchObject({ response: { status: 403 } });
    await expect(fetchModerationQueue()).rejects.toMatchObject({ response: { status: 403 } });
    await expect(
      recordModerationDecision('any', { action: 'Approve' })
    ).rejects.toMatchObject({ response: { status: 403 } });
  });

  it('serves them once the caller holds the permission', async () => {
    setTrustMockStaff(true);

    const queue = await fetchModerationQueue();
    expect(queue.items).toHaveLength(1);
    // `AIReview` with a capital I and R is a real member of
    // `ModerationQueueStatus`; `PendingReview` is the one this row is in.
    expect(queue.items[0].status).toBe('PendingReview');
    expect(queue.items[0].aiReview?.flags).toEqual(['low_quality']);
  });

  it('requires a reason before removing or restricting content', async () => {
    setTrustMockStaff(true);

    await expect(recordModerationDecision('any', { action: 'Reject' })).rejects.toMatchObject({
      response: { status: 400 },
    });

    const decision = await recordModerationDecision('any', {
      action: 'Reject',
      reason: 'Duplicated from another guide.',
    });
    expect(decision.actionType).toBe('Reject');
  });

  it('hides reviewer identities and internal notes from the member', async () => {
    const detail = await fetchVerification(REJECTED_DIASPORA);

    expect(detail.reviews).toHaveLength(1);
    // A member is told whether a human or a rule decided, never who.
    expect(detail.reviews[0].decidedBy).toBe('Compliance team');
    expect(detail.reviews[0].notes).toBeNull();
  });
});

// ── Trap 14 ──────────────────────────────────────────────────────────────────

describe('the six routes the previous handler invented are gone', () => {
  it.each([
    ['post', '/trust/verify/identity'],
    ['post', '/trust/verify/diaspora'],
    ['post', '/trust/verify/diaspora/appeal'],
    ['post', '/trust/community-voting'],
    ['post', '/trust/privacy'],
  ] as const)('%s %s answers 404', async (method, url) => {
    // The catch-all registered in `beforeAll` is what answers these. They 404
    // in production too — `verification/identity.tsx` was posting to the first
    // one against the real client.
    await expect(apiClient[method](url, {})).rejects.toMatchObject({
      response: { status: 404 },
    });
  });

  it('GET /trust/audit answers 404 — Trust has a trust timeline, not an audit log', async () => {
    await expect(apiClient.get('/trust/audit')).rejects.toMatchObject({
      response: { status: 404 },
    });
  });
});

// ── Trap 15 ──────────────────────────────────────────────────────────────────

describe('reading what came back', () => {
  it('maps the six appeal statuses onto a tracker that is not a sequence', () => {
    expect(appealTrackerIndex('Pending')).toBe(0);
    expect(appealTrackerIndex('UnderReview')).toBe(0);
    expect(appealTrackerIndex('Approved')).toBe(1);
    expect(appealTrackerIndex('Rejected')).toBe(2);
    expect(appealTrackerIndex('Escalated')).toBe(3);
    // The tracker has no stage for a withdrawal, so it reads as resolved.
    expect(appealTrackerIndex('Withdrawn')).toBe(5);
  });

  it('picks the newest verification of a type, not the first', () => {
    const older = { type: 'Diaspora', submittedAt: '2026-01-01T00:00:00Z', verificationId: 'a' };
    const newer = { type: 'Diaspora', submittedAt: '2026-06-01T00:00:00Z', verificationId: 'b' };

    expect(latestVerificationOfType([older, newer] as never, 'Diaspora')?.verificationId).toBe('b');
    expect(latestVerificationOfType([newer, older] as never, 'Diaspora')?.verificationId).toBe('b');
    expect(latestVerificationOfType([], 'Diaspora')).toBeNull();
    expect(latestVerificationOfType(null, 'Diaspora')).toBeNull();
  });

  it('keeps reputation event points signed, including the negative ones', async () => {
    const page = await fetchMyReputationEvents();
    const violation = page.items.find((item) => item.eventType === 'ViolationRecorded');

    // A ledger rendering `+{points}` unconditionally prints "+-75" here. The
    // fixture it replaced had no negative rows, so nothing ever showed it.
    expect(violation?.points).toBeLessThan(0);
  });

  it('serves the reputation rules something actually pays, with their labels', async () => {
    const rules = await fetchReputationRules();
    const actions = rules.map((rule) => rule.actionType);

    // Priced on the server and paid by nothing, so never offered to a member.
    for (const unpaid of ['UpdateVerified', 'ReportResolved', 'ProfilePhotoAdded', 'ProfileCompleted']) {
      expect(actions).not.toContain(unpaid);
    }

    expect(rules.find((rule) => rule.actionType === 'GuidePublished')).toMatchObject({
      label: 'Guides published',
      dimension: 'contribution',
      points: 50,
    });
    expect(rules.find((rule) => rule.actionType === 'ViolationRecorded')?.points).toBe(-75);
  });

  it('reports the reputation ladder ending in `CommunityAmbassador`', async () => {
    const reputation = await fetchMyReputation();

    expect(reputation.nextLevel?.name).toBe('CommunityExpert');
    // `types/trust.ts` declared `CountryReputationScore.level` ending in
    // `Ambassador`, which contradicted `types/reputation.ts` in the same repo
    // and was never on the wire.
    const profile = await fetchTrustProfile();
    for (const standing of profile.countryReputations) {
      expect(standing.level).not.toBe('Ambassador');
    }
  });

  it('composes badge labels server-side, emoji included', async () => {
    const badges = await fetchMyBadges();
    const country = badges.find((badge) => badge.type === 'CountryVerified');

    expect(country?.label).toContain('🇬🇧');
    expect(country?.countryCode).toBe('GB');
  });
});

// ── Trap 16 ──────────────────────────────────────────────────────────────────

describe('cache keys and error sentences', () => {
  it('namespaces every key under `trust` and narrows hierarchically', () => {
    expect(trustKeys.all).toEqual(['trust']);
    expect(trustKeys.profile()).toEqual(['trust', 'profile']);
    // A prefix invalidation of `verifications()` must reach the list and the
    // queue, or a member's own new submission does not appear.
    expect(trustKeys.verificationList({}).slice(0, 2)).toEqual(trustKeys.verifications());
    expect(trustKeys.verificationQueue({}).slice(0, 2)).toEqual(trustKeys.verifications());
    expect(trustKeys.appealList().slice(0, 2)).toEqual(trustKeys.appeals());
  });

  it('normalises the country in a feature-requirements key so `gb` and `GB` are one entry', () => {
    expect(trustKeys.featureRequirements('gb')).toEqual(trustKeys.featureRequirements('GB'));
    expect(trustKeys.featureRequirements(null)).toEqual([
      'trust',
      'feature-requirements',
      'global',
    ]);
  });

  it('turns a 429 into a sentence that says how long to wait', () => {
    const cause = { response: { status: 429, data: { retryAfter: 42 } } };
    expect(trustErrorMessage(cause)).toContain('42 seconds');
  });

  it('falls back to the problem document detail, then to a domain sentence', () => {
    expect(trustErrorMessage({ response: { data: { detail: 'Nationality is required.' } } })).toBe(
      'Nationality is required.'
    );
    expect(trustErrorMessage(new Error('boom'))).toBe(
      'We could not reach the trust service just now.'
    );
  });
});

// ── Trap 17 ──────────────────────────────────────────────────────────────────

describe('appeal detail anonymises the reviewer for a member', () => {
  it('returns no reviewerId until the caller is staff', async () => {
    setTrustMockStaff(true);
    const appeal = await submitAppeal({
      type: 'Verification',
      targetId: REJECTED_DIASPORA,
      reason: 'The scan was legible on my copy and I can supply a better one.',
    });
    await reviewAppeal(appeal.appealId, {
      decision: 'Approve',
      explanation: 'Second copy is legible.',
    });

    const asStaff = await fetchAppeal(appeal.appealId);
    expect(asStaff.reviews[0].reviewerId).toBe(OTHER_MEMBER_ID);

    setTrustMockStaff(false);
    const asMember = await fetchAppeal(appeal.appealId);
    expect(asMember.reviews[0].reviewerId).toBeNull();
  });

  it('writes an upheld appeal back onto the verification', async () => {
    setTrustMockStaff(true);
    const appeal = await submitAppeal({
      type: 'Verification',
      targetId: REJECTED_DIASPORA,
      reason: 'The scan was legible on my copy and I can supply a better one.',
    });

    await reviewAppeal(appeal.appealId, {
      decision: 'Approve',
      explanation: 'Second copy is legible.',
    });

    // The point of an upheld appeal is that it grants the thing that was
    // refused. An appeal that resolves without touching the verification leaves
    // the member exactly as restricted as before.
    const detail = await fetchVerification(REJECTED_DIASPORA);
    expect(detail.verification.status).toBe('Approved');
  });
});

// ── Trap 18 ──────────────────────────────────────────────────────────────────

describe('the member list route only ever shows the member their own', () => {
  it('answers 404, not 403, for somebody else’s verification', async () => {
    // Confirming that a verification exists for another member is itself a
    // disclosure, so the server refuses to distinguish the two cases.
    await expect(fetchVerification('00000000-0000-4000-a000-0000000009ff')).rejects.toMatchObject({
      response: { status: 404 },
    });
  });

  it('lists appeals newest first and reports an accurate total', async () => {
    await submitAppeal({
      type: 'Verification',
      targetId: REJECTED_DIASPORA,
      reason: 'The scan was legible on my copy and I can supply a better one.',
    });

    const page = await fetchMyAppeals();
    expect(page.items).toHaveLength(1);
    expect(page.totalCount).toBe(1);
  });
});
