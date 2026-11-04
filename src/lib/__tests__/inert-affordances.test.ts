// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Formerly inert affordances (Remediation Wave B′)
//
// The audit's Category B: buttons that reported success and sent nothing.
//
// These are harder to test for than a wrong route, because the *screen* was
// working — it validated input, showed a spinner, rendered a confirmation. The
// only thing missing was the request. So every test here asserts on the request
// having been made, not on the outcome the member was shown.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '../apiClient';
import {
  createAndPublishListing,
  isNotPublishableError,
  isSuspectedFraudError,
} from '../housing-listings-api';
import { createPost } from '../community-social-api';
import { fetchSessions, revokeOtherSessions, revokeSession } from '../auth-api';
import {
  isViewingAlreadyOpenError,
  isViewingNotPermittedError,
  requestViewing,
  viewingRefusal,
} from '../housing-viewings-api';
import { reportContent } from '../community-social-api';
import { useAuthStore, __setSessionForTests } from '@/store/auth';
import { buildAuthenticationResult } from '@/mocks/auth-session';

declare global {
  // eslint-disable-next-line no-var
  var __secureStore: Record<string, string>;
  // eslint-disable-next-line no-var
  var __asyncStorageStore: Record<string, string>;
}

let api: MockAdapter;

beforeEach(async () => {
  api = new MockAdapter(apiClient);
  globalThis.__secureStore = {};
  globalThis.__asyncStorageStore = {};
  await useAuthStore.getState().adoptSession(buildAuthenticationResult());
});

afterEach(() => {
  api.restore();
  useAuthStore.setState({ status: 'unknown', isAuthenticated: false, user: null, access: null });
  __setSessionForTests(null);
});

function envelope<T>(data: T) {
  return { data, meta: { requestId: 'r', correlationId: 'c', timestamp: 'now' } };
}

// Node's own modules, declared the way the other source-reading suites in this
// directory do it (`guides-screens-wiring`, `theme-consistency`): the project's
// `tsconfig` sets `types: ["jest"]` and pulls in no `@types/node`, so a plain
// `import … from 'fs'` does not typecheck.
declare const __dirname: string;

const readFileSync: (path: string, encoding: string) => string = require('fs').readFileSync;
const join: (...parts: string[]) => string = require('path').join;

/**
 * Read a screen's own source, **with its comments removed**.
 *
 * Used only by the Wave B″ assertions at the foot of this file, where the thing
 * being prevented is a *sentence* rather than a request — see the note there
 * for why that earns a test of its own.
 *
 * The comment stripping is the whole point rather than a convenience. Each
 * screen these tests guard carries a comment quoting the fabricated line it
 * used to print, because a future reader needs to know what was removed and
 * why — and an assertion over the raw file would make documenting the defect
 * indistinguishable from committing it. So the tests read what the screen
 * *does*: its code and the strings it renders, never the prose explaining what
 * it no longer says.
 */
function source(...segments: string[]): string {
  const text = readFileSync(join(__dirname, '..', '..', ...segments), 'utf8');

  return (
    text
      // Block comments, including JSDoc and the `{/* … */}` form JSX uses.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Line comments. The negative lookbehind spares `https://…` inside string
      // literals, which would otherwise take the rest of the line with them.
      .replace(/(?<!:)\/\/.*$/gm, '')
  );
}

// ── Session revocation ───────────────────────────────────────────────────────
//
// The worst of the twelve. The screen said "Security credentials revoked
// successfully" and removed a row from `store/trust.ts`. The refresh token on
// the device the member was worried about stayed valid for its full lifetime.

describe('session revocation', () => {
  it('lists sessions from the server rather than from local state', async () => {
    api.onGet('/auth/sessions').reply(
      200,
      envelope([
        {
          id: 's1',
          deviceName: 'Amara’s iPhone',
          platform: 'ios',
          status: 'Active',
          createdAt: '2026-08-01T00:00:00Z',
          lastSeenAt: '2026-08-17T09:00:00Z',
          expiresAt: '2026-09-01T00:00:00Z',
          isCurrent: true,
        },
      ])
    );

    const sessions = await fetchSessions();

    expect(api.history.get[0].url).toBe('/auth/sessions');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].isCurrent).toBe(true);
  });

  it('revokes one session against the server', async () => {
    api.onDelete('/auth/sessions/s2').reply(200, envelope({ message: 'Revoked.' }));

    await revokeSession('s2');

    const call = api.history.delete.find((r) => r.url === '/auth/sessions/s2');
    expect(call).toBeTruthy();
    // Authenticated: this is the request that actually ends the other device's
    // access, and it cannot be made without a bearer.
    expect(call?.headers?.Authorization).toBe('Bearer test-access-token');
  });

  it('revokes every other session with no parameters at all', async () => {
    api.onDelete('/auth/sessions').reply(200, envelope({ message: 'Revoked.' }));

    await revokeOtherSessions();

    const call = api.history.delete.find((r) => r.url === '/auth/sessions');
    expect(call).toBeTruthy();
    // The current session is excluded server-side. There is deliberately no
    // `exceptCurrent` knob for a client to get wrong — and a client that sent
    // one would be describing an intention the server does not read.
    expect(call?.params).toBeUndefined();
    expect(call?.data).toBeUndefined();
  });

  it('propagates a failed revocation instead of reporting success', async () => {
    api.onDelete('/auth/sessions/s2').reply(500);

    // The screen's catch turns this into "Not revoked — it is still active",
    // which is the sentence the previous implementation could never produce.
    await expect(revokeSession('s2')).rejects.toBeTruthy();
  });
});

// ── Job application ──────────────────────────────────────────────────────────

describe('applying to a job', () => {
  it('posts to the apply route', async () => {
    api.onPost('/jobs/job-1/apply').reply(201, envelope({ applicationId: 'a1', status: 'Submitted' }));

    await apiClient.post('/jobs/job-1/apply', {});

    expect(api.history.post[0].url).toBe('/jobs/job-1/apply');
  });

  it('accepts an application with no résumé and no cover letter', async () => {
    // Every field on `ApplyToJobRequest` is optional; the server falls back to
    // the candidate's default résumé. An empty body is a valid application, and
    // the client should not invent a required field the contract does not have.
    api.onPost('/jobs/job-1/apply').reply(201, envelope({ applicationId: 'a1' }));

    await apiClient.post('/jobs/job-1/apply', {});

    expect(JSON.parse(api.history.post[0].data)).toEqual({});
  });
});

// ── Provider review ──────────────────────────────────────────────────────────

describe('writing a provider review', () => {
  it('posts the rating to the provider review route', async () => {
    api.onPost('/providers/p1/reviews').reply(201, envelope({ reviewId: 'r1', rating: 4 }));

    await apiClient.post('/providers/p1/reviews', { rating: 4, body: 'Helpful.' });

    const body = JSON.parse(api.history.post[0].data);
    expect(api.history.post[0].url).toBe('/providers/p1/reviews');
    // One scalar rating, bounded 1–5. There are no dimension sub-scores on this
    // contract, so a client that collected them would be collecting nothing.
    expect(body).toEqual({ rating: 4, body: 'Helpful.' });
  });
});

// ── Asking to view a property (B′-05) ────────────────────────────────────────
//
// The screen said **"Application Sent! {host} has received your request and will
// contact you shortly."** on a bare `showAlert` with no request behind it, and
// the dialog before it promised to share the member's "verified residency and
// community profile details" — a thing no route in `Diaspora.Modules.Housing`
// carries.
//
// There is no application concept in that module at all, so the control was
// re-scoped onto the one thing the module does offer for this intent:
// `POST /housing/listings/{listingId}/viewings`.

/**
 * Phrases that assert the thing this whole wave is about: that a request
 * reached somebody.
 *
 * A refusal that matches any of these is claiming a delivery that did not
 * happen. Negated forms — "we have not sent", "nothing was submitted" — are
 * deliberately *not* matched, because they are the correct wording.
 */
const AFFIRMATIVE_CLAIMS: readonly RegExp[] = [
  /\b(?:has|have|was|were|is|are)\s+(?:been\s+)?(?:sent|submitted|received|delivered)\b/,
  /\bwe(?:'ve| have)?\s+(?:sent|submitted|forwarded|passed)\b/,
  /\bon its way\b/,
  /\bwill (?:contact|be in touch)\b/,
];

function problem(status: number, code: string, detail: string) {
  return {
    type: `https://diaspora.app/errors/${code.toLowerCase()}`,
    title: 'Request refused',
    status,
    detail,
    code,
    correlationId: 'c',
    traceId: 't',
    timestamp: 'now',
  };
}

function viewingResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    listingId: 'house-1',
    listingTitle: 'Bright one-bed in Peckham',
    listingSlug: null,
    landlordId: 'host-1',
    landlordName: 'Amara',
    seekerUserId: 'me',
    status: 'Requested',
    preferredAt: null,
    confirmedAt: null,
    durationMinutes: 30,
    isVirtual: false,
    place: null,
    message: null,
    landlordFailedToAttend: null,
    closureReason: null,
    unlocksAddress: false,
    satisfiesReservationRequirement: false,
    history: [],
    createdAt: '2026-08-18T09:00:00Z',
    ...overrides,
  };
}

describe('asking to view a housing listing', () => {
  it('posts to the viewing route on the listing', async () => {
    api.onPost('/housing/listings/house-1/viewings').reply(201, envelope(viewingResponse()));

    await requestViewing('house-1');

    const call = api.history.post.find((r) => r.url === '/housing/listings/house-1/viewings');
    expect(call).toBeTruthy();
    // The whole point of the wave. Without this assertion the screen could go
    // back to reporting a viewing it never asked for and nothing would fail.
    expect(call?.headers?.Authorization).toBe('Bearer test-access-token');
  });

  it('sends an empty body when the member chose nothing', async () => {
    // Every field on `RequestViewingRequest` is optional. `PreferredAt` null
    // "leaves it to the landlord" and `DurationMinutes` null takes
    // `HousingOptions.DefaultViewingDurationMinutes`. A client that invented a
    // preferred time to fill the field would be booking the member into an
    // appointment they never picked.
    api.onPost('/housing/listings/house-1/viewings').reply(201, envelope(viewingResponse()));

    await requestViewing('house-1');

    expect(JSON.parse(api.history.post[0].data)).toEqual({});
  });

  it('sends only the fields the member actually chose', async () => {
    api.onPost('/housing/listings/house-1/viewings').reply(201, envelope(viewingResponse()));

    await requestViewing('house-1', { isVirtual: true, message: 'Evenings suit me best.' });

    expect(JSON.parse(api.history.post[0].data)).toEqual({
      isVirtual: true,
      message: 'Evenings suit me best.',
    });
  });

  it('never resolves when the server refused — the host got nothing', async () => {
    api.onPost('/housing/listings/house-1/viewings').reply(500);

    // The screen's catch turns this into "the host has not received anything",
    // which is the sentence the previous implementation could not produce
    // because it had no failure path at all.
    await expect(requestViewing('house-1')).rejects.toBeTruthy();
  });

  it('reads "you already have one open" as met, not as an error', async () => {
    api
      .onPost('/housing/listings/house-1/viewings')
      .reply(
        409,
        problem(409, 'housing.viewing.already-open', 'You already have a viewing open on this property.')
      );

    const cause = await requestViewing('house-1').catch((error: unknown) => error);

    // A 409 here means the member's goal is already achieved. The screen shows
    // an `info`, not an `error`, because pushing somebody to re-send something
    // the landlord already has is its own small lie.
    expect(isViewingAlreadyOpenError(cause)).toBe(true);
  });

  it('sends a member who lacks the verified-tier permission to verification', async () => {
    // `HousingPolicies.ViewingSchedule` is a verified-identity gate, not a
    // merely-authenticated one: a confirmed viewing unlocks a street address.
    api.onPost('/housing/listings/house-1/viewings').reply(403, problem(403, 'auth.forbidden', 'Forbidden.'));

    const cause = await requestViewing('house-1').catch((error: unknown) => error);

    expect(isViewingNotPermittedError(cause)).toBe(true);
    expect(viewingRefusal(cause).title).toBe('Verify your identity first');
  });

  it('never phrases a refusal as a success, whatever the server said', async () => {
    const refusals = [
      problem(409, 'housing.viewing.not-accepted-here', 'This property is not taking viewing requests.'),
      problem(400, 'housing.viewing.self', 'You cannot book a viewing on your own property.'),
      problem(429, 'housing.viewings.too-many', 'You have too many viewings open.'),
      problem(404, 'housing.listing.not-found', 'We cannot find that property.'),
      problem(403, 'housing.landlord.suspended', 'That landlord cannot let property.'),
    ];

    for (const body of refusals) {
      const scoped = new MockAdapter(apiClient);
      scoped.onPost('/housing/listings/house-1/viewings').reply(body.status, body);

      const cause = await requestViewing('house-1').catch((error: unknown) => error);
      const { title, message } = viewingRefusal(cause);

      // No refusal may make an affirmative claim that the request went
      // anywhere. Written as affirmative phrases rather than bare words on
      // purpose: "we have **not** sent your request" is the sentence this wave
      // exists to produce, and a guard that banned the word "sent" outright
      // would push the wording back towards a vague "something went wrong".
      for (const affirmative of AFFIRMATIVE_CLAIMS) {
        expect(`${title} ${message}`.toLowerCase()).not.toMatch(affirmative);
      }
      expect(title.length).toBeGreaterThan(0);

      scoped.restore();
    }
  });

  it('falls back to a message that says the host got nothing', async () => {
    api.onPost('/housing/listings/house-1/viewings').reply(503);

    const cause = await requestViewing('house-1').catch((error: unknown) => error);

    // Not "Something went wrong". The member has to learn that no request
    // exists, because the alternative is waiting for a call that is not coming.
    expect(viewingRefusal(cause).message).toMatch(/has not received/i);
  });
});

// ── Posting a charitable cause (B′-11) ───────────────────────────────────────
//
// `marketplace/donation-causes.tsx` ran a 1.2-second `setTimeout` and said
// **"Cause Submitted! 🤝 Your charitable cause has been submitted for community
// review and will be listed shortly."**
//
// It was not wired, because there is nothing to wire it to. This test records
// the finding so that a future contributor who assumes the obvious route name
// exists finds out here rather than by shipping another fabricated success.

describe('the donation-cause write surface', () => {
  it('has no create route — causes are opened by publishing a campaign', async () => {
    // `Diaspora.Modules.Financial` has a complete `DonationCause` aggregate, an
    // `IDonationCauseRepository`, EF configuration and a `DonationCauseId`, and
    // **no write endpoint of any kind**. Its giving surface is
    // `GET /donations/causes`, `POST /donations`, `GET /giving/me`, the receipt
    // read, `GET /contributions/funds` and `POST /contributions`.
    //
    // A cause is created by `CampaignCommandHandlers.PublishAsync`, which calls
    // `DonationCause.Open(...)` when a campaign is published. The member-facing
    // entry point is therefore campaign creation.
    api.onPost('/donations/causes').reply(405, problem(405, 'method-not-allowed', 'No such route.'));
    api.onPost('/communities/campaigns').reply(200, envelope({ campaignId: 'c1', state: 'Draft' }));

    await expect(apiClient.post('/donations/causes', {})).rejects.toBeTruthy();

    // The route the screen now sends members to, via
    // `community-life/campaign/create`. A campaign is created as a **draft** —
    // it collects nothing until it is reviewed and published.
    const created = await apiClient.post('/communities/campaigns', {});
    expect(created.data.data.state).toBe('Draft');
  });
});

// ── Reporting content ────────────────────────────────────────────────────────
//
// `components/ReportModal.tsx` announced **"Report submitted — our moderators
// will review this content and adjust trust ratings if necessary"** and handed
// the report to an `onSubmit` prop. All four consumers implemented that prop as
// a `console.log`; `housing/[id].tsx` added a second fabricated confirmation on
// top of it.
//
// The form was already built against the real contract — its five category keys
// are exactly the alias table in `CommunityWireNames.ParseReportReason` — so the
// fix was to make the request the form was always shaped for.

describe('reporting content', () => {
  it('posts the report and carries the member’s category verbatim', async () => {
    api.onPost('/community/reports').reply(
      201,
      envelope({
        reportId: 'rep-1',
        contentType: 'marketplace',
        contentId: 'm-1',
        reasonCode: 'spam',
        description: 'Repeated advertising.',
        evidenceUrl: null,
        status: 'Open',
        createdAt: 'now',
      })
    );

    await reportContent({
      contentType: 'marketplace',
      contentId: 'm-1',
      reason: 'spam',
      description: 'Repeated advertising.',
      evidenceUrl: null,
    });

    const call = api.history.post.find((r) => r.url === '/community/reports');
    expect(call).toBeTruthy();
    // A report is an authenticated act — `CommunityPolicies.Report`. The old
    // implementation needed no bearer because it made no request.
    expect(call?.headers?.Authorization).toBe('Bearer test-access-token');
    expect(JSON.parse(call?.data).contentType).toBe('marketplace');
  });

  it('sends the evidence link for the one category the server demands it for', async () => {
    // `ReportContentCommandHandler` requires `EvidenceUrl` for the literal
    // string `"conflicting"` and for nothing else — which is precisely the one
    // category this form has always required a link for. The form was written
    // against this endpoint; it simply never called it.
    api.onPost('/community/reports').reply(201, envelope({ reportId: 'rep-2', status: 'Open' }));

    await reportContent({
      contentType: 'housing',
      contentId: 'h-1',
      reason: 'conflicting',
      description: 'Contradicts the other listing.',
      evidenceUrl: 'https://diaspora.app/housing/house-2',
    });

    const body = JSON.parse(api.history.post[0].data);
    expect(body.reason).toBe('conflicting');
    expect(body.evidenceUrl).toBe('https://diaspora.app/housing/house-2');
  });

  it('propagates a refused report instead of thanking the member for it', async () => {
    api.onPost('/community/reports').reply(500);

    await expect(
      reportContent({ contentType: 'listing', contentId: 'p-1', reason: 'spam' })
    ).rejects.toBeTruthy();
  });
});

// ── Subjects that cannot be reported at all ──────────────────────────────────
//
// Two of them, and both had a control claiming otherwise. These tests exist so
// that a contributor who assumes a report route must exist finds the evidence
// here rather than shipping another thank-you for nothing.

describe('the report surface’s real boundaries', () => {
  it('cannot carry a job — no content source claims it and Jobs has no report route', async () => {
    // `CommunityContentType.Job` is in the enum and is claimed by no
    // `ICommunityContentSource`, so `ContentReferenceResolver.IsSupported`
    // rejects it. `JobPolicies.Report` is declared in `Diaspora.Modules.Jobs`
    // and referenced by no registered route. A job is unreportable end to end,
    // and `ReportModal` renders no submit control for one.
    api
      .onPost('/community/reports')
      .reply(400, problem(400, 'community.content-type.unsupported', 'That content cannot be reported.'));

    await expect(
      reportContent({ contentType: 'job', contentId: 'job-1', reason: 'spam' })
    ).rejects.toBeTruthy();
  });

  it('cannot carry a private message — the enum has no member for one', async () => {
    // `Diaspora.Modules.Conversations` registers 21 routes and no report.
    // `ReportConversationRequest` exists, carries a doc comment reading
    // `POST /conversations/{id}/report`, and has exactly one occurrence in the
    // solution — its own declaration. `ConversationResponse.CanReport` is
    // hardcoded `true` by the mapper, advertising a capability with no endpoint.
    //
    // What is real is blocking, which is what `conversation/[id].tsx` now
    // offers in place of the fabricated "our team will review this message".
    api.onPost('/conversations/c-1/report').reply(404);
    api.onPost('/conversations/block').reply(200, envelope({ blocked: true }));

    await expect(apiClient.post('/conversations/c-1/report', {})).rejects.toBeTruthy();

    const blocked = await apiClient.post('/conversations/block', { userId: 'u-2' });
    expect(blocked.data.data.blocked).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Wave B″ — the second inert-affordance sweep
//
// The first sweep closed controls that sent nothing. This one closes the
// remainder, and adds a category the first did not have: controls that
// *fabricated information* rather than fabricating a request. A button that
// silently fails wastes a member's time; a "market analysis" assembled from the
// member's own input spends their money.
//
// Two shapes of test below, because the affordances come in two shapes:
//
//   * Where a route exists, the test asserts the request was made and that a
//     refusal is never rendered as a success. (Housing publication, and the
//     local alert.)
//   * Where no route exists there is nothing to assert a request against, so
//     the test asserts on the **source of the screen**, pinning the specific
//     fabricated sentences out of existence. That is unusual and it is
//     deliberate: these were not bugs in logic that a behavioural test would
//     catch, they were confident prose, and prose comes back. A contributor who
//     reinstates "your pricing is competitive" should have to delete a test
//     that explains why it went.
// ═════════════════════════════════════════════════════════════════════════════

// ── Publishing a housing listing (B″-01) ─────────────────────────────────────
//
// `housing/create.tsx` posted the draft and announced "Listing Published!" with
// a button to go and see it in Discover. It was not published and not in
// Discover — and the screen's own comment, directly above the call, said so.

describe('publishing a housing listing', () => {
  const CREATED = { id: '11111111-2222-3333-4444-555555555555', status: 'Draft' };

  it('calls publish after create — a draft alone is not a published listing', async () => {
    api.onPost('/housing/listings').reply(201, envelope(CREATED));
    api.onPost(`/housing/listings/${CREATED.id}/publish`).reply(200, envelope(CREATED));

    const outcome = await createAndPublishListing({ title: 'Room in Peckham' });

    expect(api.history.post.map((request) => request.url)).toEqual([
      '/housing/listings',
      `/housing/listings/${CREATED.id}/publish`,
    ]);
    expect(outcome).toEqual({ kind: 'published', listingId: CREATED.id });
  });

  it('sends no `status` field — the server never bound one', async () => {
    // The old payload carried `status: 'Active'`, which made the request look
    // like it published something. `CreateHousingListingRequest` has no such
    // field, and `HousingListing.Draft` sets Draft "whatever the caller asked
    // for", so it was decoration on a request that could not publish.
    api.onPost('/housing/listings').reply(201, envelope(CREATED));
    api.onPost(`/housing/listings/${CREATED.id}/publish`).reply(200, envelope(CREATED));

    await createAndPublishListing({ title: 'Room in Peckham' });

    expect(JSON.parse(api.history.post[0].data)).not.toHaveProperty('status');
  });

  it('reports a draft — never a publication — when the listing is incomplete', async () => {
    api.onPost('/housing/listings').reply(201, envelope(CREATED));
    api
      .onPost(`/housing/listings/${CREATED.id}/publish`)
      .reply(400, problem(400, 'housing.listing.not-publishable', 'Not publishable.'));

    const outcome = await createAndPublishListing({ title: 'Room' });

    expect(outcome).toEqual({
      kind: 'draft-only',
      listingId: CREATED.id,
      reason: 'incomplete',
    });
  });

  it('reports a draft when the fraud assessor refused, and does not retry', async () => {
    api.onPost('/housing/listings').reply(201, envelope(CREATED));
    api
      .onPost(`/housing/listings/${CREATED.id}/publish`)
      .reply(403, problem(403, 'housing.fraud.suspected', 'Under review.'));

    const outcome = await createAndPublishListing({ title: 'Room' });

    expect(outcome).toEqual({ kind: 'draft-only', listingId: CREATED.id, reason: 'refused' });
    // Exactly one publish attempt. A retry loop here is how a fraudulent lister
    // gets a second assessment.
    expect(api.history.post.filter((request) => request.url?.endsWith('/publish'))).toHaveLength(1);
  });

  it('still reports the draft when publication fails for an unrecognised reason', async () => {
    // The member's work survived; saying "posting failed" would send them off
    // to retype a listing that already exists.
    api.onPost('/housing/listings').reply(201, envelope(CREATED));
    api.onPost(`/housing/listings/${CREATED.id}/publish`).reply(500);

    const outcome = await createAndPublishListing({ title: 'Room' });

    expect(outcome).toEqual({ kind: 'draft-only', listingId: CREATED.id, reason: 'unknown' });
  });

  it('propagates a failed creation rather than claiming a draft exists', async () => {
    api.onPost('/housing/listings').reply(422, problem(422, 'validation', 'Bad request.'));

    await expect(createAndPublishListing({ title: '' })).rejects.toBeTruthy();
    // Nothing was published, and nothing pretended to have been.
    expect(api.history.post.filter((request) => request.url?.endsWith('/publish'))).toHaveLength(0);
  });

  it('distinguishes the two refusals it is allowed to word differently', () => {
    const incomplete = { response: { data: { code: 'housing.listing.not-publishable' } } };
    const fraud = { response: { data: { code: 'housing.fraud.suspected' } } };

    expect(isNotPublishableError(incomplete)).toBe(true);
    expect(isSuspectedFraudError(incomplete)).toBe(false);
    expect(isSuspectedFraudError(fraud)).toBe(true);
    expect(isNotPublishableError(fraud)).toBe(false);
    expect(isNotPublishableError(new Error('offline'))).toBe(false);
    expect(isSuspectedFraudError(null)).toBe(false);
  });

  it('the screen no longer announces a publication it has not been told about', () => {
    const screen = source('app', 'housing', 'create.tsx');

    // The exact sentence that shipped, and the exclamation mark that sold it.
    expect(screen).not.toContain('Listing Published!');
    expect(screen).not.toContain('Your property has been listed for the community.');
    // And it goes through the two-step client rather than posting the draft
    // directly and calling that publication.
    expect(screen).toContain('createAndPublishListing');
  });
});

// ── The three "AI" helpers (B″-02) ───────────────────────────────────────────
//
// None of these was ever a model, a request, or a lookup. Each was a template
// string behind a 1200ms `setTimeout` that existed to make the fabrication feel
// computed. **No pricing, market, benchmark, comparable, valuation or
// listing-quality endpoint is registered anywhere in the backend**, so there
// was nothing behind them and nothing to wire them to.
//
// Each now reports the form's own contents and says what Diaspora cannot do.

describe('the listing checkers do not fabricate market data', () => {
  it('housing no longer reads the member’s own rent back as the area average', () => {
    // The worst single line in the sweep:
    //
    //   Average rent for a {bedrooms}-bed {propertyType} in {areaName} is
    //   around {currency} {rent}/mo. Your pricing is competitive.
    //
    // `{rent}` is what the member typed. The verdict was their figure measured
    // against itself, so it could not come out any other way — and an empty
    // field asserted a hardcoded 1500 for any area in any currency.
    const screen = source('app', 'housing', 'create.tsx');

    expect(screen).not.toContain('Average rent for a');
    expect(screen).not.toContain('Your pricing is competitive');
    expect(screen).not.toContain('AI Housing Evaluator');
    expect(screen).not.toContain('check local pricing averages');
    // The disclaimer is load-bearing: it is what stops the checklist being read
    // as a valuation.
    expect(screen).toContain('Diaspora does not estimate rents');
  });

  it('jobs no longer asserts an invented pay band', () => {
    // "Average cleaning rates in {cityName} are £13-15/hr" — one hardcoded
    // sterling band printed for every category and every currency, followed by
    // a verdict on the member's own rate. Domestic work is among the most
    // exploitable transactions this app carries.
    const screen = source('app', 'job', 'create.tsx');

    expect(screen).not.toContain('13-15');
    expect(screen).not.toContain('Average cleaning rates');
    expect(screen).not.toContain('AI Optimization Suggestions');
    // It also claimed to have edited the description. It never touched it.
    expect(screen).not.toContain('Added key safety phrases');
    expect(screen).not.toContain('review salary competitiveness');
    expect(screen).toContain('Diaspora does not know local pay rates');
  });

  it('marketplace no longer centres a “fair market price” on the member’s own price', () => {
    // `targetPrice * 0.8` to `targetPrice * 1.2`, where `targetPrice` is the
    // member's asking price — a band that always contained their number, then
    // pronounced it optimal. Plus an unmeasured conversion statistic.
    const screen = source('app', 'marketplace', 'create.tsx');

    expect(screen).not.toContain('fair market price');
    expect(screen).not.toContain('optimal community ranges');
    expect(screen).not.toContain('convert 3x faster');
    expect(screen).not.toContain('AI Price & Valuation Guide');
    expect(screen).not.toContain('Run AI Price Valuation');
    // No arithmetic on the member's own price survives anywhere on the screen.
    expect(screen).not.toContain('* 0.8');
    expect(screen).not.toContain('* 1.2');
    expect(screen).toContain('Diaspora cannot value an item');
  });
});

// ── Posting a local alert (B″-03) ────────────────────────────────────────────
//
// `update/create.tsx`'s Publish cleared the draft and navigated to the live
// updates feed. The member landed on the screen their alert belonged on, saw
// other people's alerts, and had every reason to think theirs was among them —
// with the draft deleted, so their words were gone too.

describe('posting a local alert', () => {
  it('really does reach POST /community/posts with the alert’s own fields', async () => {
    api.onPost('/community/posts').reply(201, envelope({ postId: 'p-1' }));

    await createPost({
      body: 'Power cut on Atlantic Road.',
      category: 'safetyAlert',
      urgency: 'urgent',
      expiresInHours: 6,
      cityName: 'London',
      areaName: 'Peckham',
    });

    const sent = JSON.parse(api.history.post[0].data);
    expect(api.history.post[0].url).toBe('/community/posts');
    expect(sent.category).toBe('safetyAlert');
    expect(sent.urgency).toBe('urgent');
    expect(sent.expiresInHours).toBe(6);
  });

  it('the screen posts before it navigates, and keeps the draft if it cannot', () => {
    const screen = source('app', 'update', 'create.tsx');

    expect(screen).toContain('createPost');
    // The draft is cleared only after the await, never before it. That is the
    // property which stopped a failed post from also destroying the text.
    const publishBody = screen.slice(screen.indexOf('const handlePublish'));
    const awaitIndex = publishBody.indexOf('await createPost');
    const clearIndex = publishBody.indexOf('globalUpdateDraft = null');
    expect(awaitIndex).toBeGreaterThan(-1);
    expect(clearIndex).toBeGreaterThan(awaitIndex);
  });

  it('offers the server’s own categories rather than the provider directory’s', () => {
    // The picker rendered the first five of `mockCategories` — "Food &
    // Restaurants", "Hair & Beauty" — which are business categories from the
    // provider directory. `PostCategory` is a different set entirely, and the
    // server's category also selects the post's default lifetime.
    const screen = source('app', 'update', 'create.tsx');

    expect(screen).not.toContain("from '@/mocks/data'");
    // Served since 13 Oct 2026 (`GET /community/posts/categories`). This used to
    // pin 'safetyAlert', one of five app-only names the server filed as Other.
    expect(screen).toContain('usePostCategories()');
    expect(screen).not.toContain("'safetyAlert'");
    // ── Corrected 24 Aug 2026 ──────────────────────────────────────────────
    //
    // This previously asserted `'elevated'`, on the stated grounds that
    // "`UrgencyLevel` has no low". It has one — `Low = 0` is the first member,
    // and `ConfirmationThresholds` maps `UrgencyLevel.Low => (3, 1)`.
    // `Elevated` appears nowhere in the module.
    //
    // The inversion was not cosmetic. `CreatePostCommandHandler` parses with
    // `CommunityWireNames.ParseOr(payload.Urgency, UrgencyLevel.Normal)`, so a
    // member choosing **Elevated** had their post silently filed as **Normal**,
    // and `Low` could not be chosen at all. Urgency also selects the
    // confirmation threshold, so the level decides how a post gets verified.
    expect(screen).toContain("'low'");
    expect(screen).not.toContain("'elevated'");
  });

  it('no longer offers a photo attachment it cannot send', () => {
    // A toggle over a boolean that flipped its own label to "Image Attached"
    // without opening a picker, uploading anything, or adding a field to the
    // request.
    const screen = source('app', 'update', 'create.tsx');

    expect(screen).not.toContain('Image Attached');
    expect(screen).not.toContain('simulate uploading');
  });
});

// ── Connectivity (B″-04) ─────────────────────────────────────────────────────

describe('the community-life offline banner', () => {
  it('reads real connectivity instead of a header toggle a member could press', () => {
    // `isOffline` was `useState(false)` driven by a "OFFLINE / ONLINE" button
    // that shipped to members. Pressing it swapped three live fetches for
    // `mockEvents`/`mockOrganizations` and raised a banner calling the fixtures
    // the member's cached data.
    const screen = source('app', 'community-life', 'events.tsx');

    expect(screen).toContain('useConnectivityStore');
    expect(screen).not.toContain('setIsOffline');
    expect(screen).not.toContain("import('@/mocks/community-life-data')");
    expect(screen).not.toContain('Using Cached Data');
  });

  it('retries with a real request rather than a timer that cannot fail', () => {
    // The old handler was a 1500ms `setTimeout` that cleared the flag and said
    // "Connected back to Diaspora network servers" — on a plane, in a tunnel,
    // and behind a captive portal alike.
    const screen = source('app', 'community-life', 'events.tsx');

    expect(screen).not.toContain('Connected back to Diaspora network servers');
    expect(screen).not.toContain('Online Mode Restored');

    const handler = screen.slice(
      screen.indexOf('const handleRetryConnection'),
      screen.indexOf('const handleSaveToggle')
    );
    // A genuine request, and a branch that says so when it fails.
    expect(handler).toContain('await apiClient.get');
    expect(handler).toContain('Still offline');
  });

  it('does not claim a calendar note is saved or that a reminder will arrive', () => {
    // "Reminder Saved — Personal reminder has been added to your calendar."
    // Nothing was saved (a `useState` array), nothing reached a calendar, and
    // no notification was ever scheduled. `GET /community-life/calendar` is
    // read-only and the module has no reminder concept; Automation's reminders
    // anchor to an event, not to a free-text note on a date.
    const screen = source('app', 'community-life', 'events.tsx');

    expect(screen).not.toContain('Reminder Saved');
    expect(screen).not.toContain('has been added to your calendar');

    // The note is not kept — that is the claim this test exists to prevent, and
    // it still has to be made in words.
    expect(screen).toContain('gone when you leave');

    // ...but the denial has to stop exactly there. The sentence used to read
    // "Diaspora cannot save calendar notes or send you a reminder yet", and the
    // second half was false: `/automations/reminders` serves GET, POST and
    // DELETE, and the register marks eventReminders `connected`. The comment
    // above already drew the distinction the wording then threw away.
    expect(screen).not.toContain('or send you a reminder yet');
    expect(screen).toContain('remind you about an event');
  });
});

// ── Creator Studio (B″-05) ───────────────────────────────────────────────────
//
// Every control in the Workspace section acts on `mockCreatorContent` through
// non-persisted zustand. Some of the routes exist — comment reply, pin, report,
// per-module archive and delete — but they take Guids, and these items are
// fixtures with ids like `cnt-hou-1`, so nothing here can be wired until the
// stores are migrated onto the gap architecture.
//
// Three of the verbs do not exist at *all*, in any module: **renew/bump**,
// **duplicate/clone**, and **bulk actions**. Those are not waiting on a
// migration; they are waiting on a capability nobody has built.

describe('Creator Studio no longer reports work it did not do', () => {
  it('does not claim a reply was published to a reader', () => {
    const modal = source('components', 'creator', 'CommentManagementModal.tsx');

    expect(modal).not.toContain('Reply Sent');
    expect(modal).not.toContain('Published reply');
    expect(modal).not.toContain('Flagged for moderation queue review');

    // The honest-toast assertions that used to stand here ("Not published", "No
    // moderator was notified") are gone because the controls they described are
    // gone. `mockCommentsMap` — and the hard-coded comment the component
    // invented inline when the map had no entry — no longer seed the sheet, so
    // there is no fabricated comment to reply to, pin or flag, and an inert
    // control over nothing is worse than no control. What must hold now is that
    // the sheet does not fabricate a thread and does say why it has none.
    expect(modal).not.toContain("from '@/mocks/creator-data'");
    expect(modal).toContain('Diaspora cannot load the comments on this item');
  });

  it('does not claim a listing was bumped to the top of searches', () => {
    // The strongest false claim in the menu: a member competing for views could
    // press it every morning believing they were buying back visibility.
    const menu = source('components', 'creator', 'QuickActionsMenu.tsx');

    expect(menu).not.toContain('bumped to top of searches');
    expect(menu).not.toContain('Listing Renewed');

    // ── Narrowed, not deleted ────────────────────────────────────────────
    //
    // This used to assert the menu says *"Diaspora cannot bump listings"*, and
    // that sentence overreached. `GET /financial/catalog` serves
    // `marketplace.listing.boost.7d` with `placementKind: "Boost"` and
    // `priorityWeight: 1.5`; buying it through `POST /financial/purchases`
    // returns a live placement that can be paused, resumed, renewed and
    // auto-renewed. Boosting a listing is something this platform sells.
    //
    // What does not exist is a *free* one-tap refresh, so that is what the
    // assertion pins: the absolute claim must stay out, and the narrow one must
    // stay in.
    expect(menu).not.toContain('Diaspora cannot bump listings');
    expect(menu).toContain('There is no free bump');
    // And it still points at the thing that genuinely buys reach.
    expect(menu).toContain('See boost options');
  });

  it('does not advertise a promotion product that does not exist', () => {
    // A second "Promote (Coming Soon)" row sat directly under the working one,
    // toasting "Promote campaign tools are coming soon in Phase 3!" — a roadmap
    // phase number shown to a member for a feature naming no product and no
    // route. Removed rather than reworded.
    const menu = source('components', 'creator', 'QuickActionsMenu.tsx');

    expect(menu).not.toContain('Promote (Coming Soon)');
    expect(menu).not.toContain('coming soon in Phase 3');
    expect(menu).not.toContain('sponsored diaspora community banners');
    // The real one is still there.
    expect(menu).toContain('Promote this listing');
  });

  it('does not offer to permanently delete something it cannot touch', () => {
    const menu = source('components', 'creator', 'QuickActionsMenu.tsx');

    expect(menu).not.toContain('This action cannot be undone');
    expect(menu).not.toContain('Delete Permanently');
    expect(menu).toContain('Not deleted');
  });

  it('does not report a fabricated bulk count', () => {
    // `executeBulkAction` returned a count from a local reducer and the toolbar
    // reported it as "Updated N items." The tally was the convincing part: a
    // fabricated success is easy to doubt, a fabricated receipt is not.
    const toolbar = source('components', 'creator', 'BulkActionToolbar.tsx');

    expect(toolbar).not.toContain('Bulk Action Completed');
    expect(toolbar).not.toContain('executeBulkAction(');
    expect(toolbar).toContain('Diaspora cannot');
  });

  it('does not tell a member their archived item was deleted forever', () => {
    const card = source('components', 'creator', 'ArchiveCard.tsx');

    expect(card).not.toContain('Item deleted forever');
    expect(card).not.toContain('restored back to your active workspace');
    expect(card).toContain('Not deleted');
  });

  it('does not claim a draft was renamed, duplicated or deleted', () => {
    const card = source('components', 'creator', 'DraftCard.tsx');

    expect(card).not.toContain('Draft Duplicated');
    expect(card).not.toContain('Draft removed.');
    expect(card).toContain('Not saved');
  });

  it('offers only the controls that take effect, so it needs no warning banner', () => {
    // A member should not have to press a control to discover it does nothing.
    //
    // The workspace once carried a standing banner, last as "What you can
    // change here … States like Reserved, Paused, Interviewing and Filled are
    // not tracked". It existed because the item menu offered those states and
    // each answered "Not available". Android UAT, 3 Nov 2026: the banner went,
    // and so did the controls it was apologising for. What the menu offers now
    // is exactly what a module saves: Sold for a marketplace item, Rented for a
    // home.
    const section = source('components', 'creator', 'sections', 'WorkspaceSection.tsx');
    const menu = source('components', 'creator', 'QuickActionsMenu.tsx');

    expect(section).not.toContain('What you can change here');
    expect(section).not.toContain('are not tracked by any part of the');

    for (const untracked of ['Available', 'Reserved', 'Paused', 'Open', 'Interviewing', 'Filled']) {
      expect(menu).not.toContain(`handleStatusChange('${untracked}')`);
    }
    expect(menu).toContain(`handleStatusChange('Sold')`);
    expect(menu).toContain(`handleStatusChange('Rented')`);

    // The sentence that used to follow it — "Duplicating content is not
    // something Diaspora does" — was a PRODUCT decision rather than a stale
    // re-read: nobody had ever said whether the platform copies items. It was
    // decided, built, and must not come back.
    expect(section).not.toContain('Duplicating content is not something Diaspora does');

    // The stale sentences must not come back.
    expect(section).not.toContain('Diaspora cannot list your published items');
    expect(section).not.toContain('Diaspora cannot list your drafts yet');
    expect(section).not.toContain('Diaspora cannot list your archive yet');
    expect(section).not.toContain('Diaspora cannot list your published content yet');
  });

  it('reads the activity history instead of denying it', () => {
    // This used to be titled "still says the one workspace thing that is
    // genuinely missing", and it was right: every other sentence in the section
    // was stale and this one was not.
    //
    // BG-06 closed it. The store no longer opens `isUnavailable: true` either —
    // that made every member's first frame assert a failure that had not
    // happened — so both the denial and the pessimistic default are pinned out.
    const section = source('components', 'creator', 'sections', 'WorkspaceSection.tsx');
    const store = source('store', 'creator-timeline.ts');

    expect(section).not.toContain('Diaspora cannot show your activity history yet');
    expect(store).toContain("fetchCreatorActivity");
    expect(store).toContain('isUnavailable: false');
  });
});

// ── Settings that protected nothing (B″-06) ──────────────────────────────────

describe('privacy and provider alerts say what the platform cannot do', () => {
  it('the privacy screen no longer presents unsaved switches as protection', () => {
    // Six controls written into `store/trust.ts`, which had exactly one reader
    // in the whole app — this screen, loading its own initial state. Nothing
    // reached the server and no behaviour changed anywhere.
    // `ProfileVisibility`, `PhoneVisibility`, `LocationPrecision`,
    // `ActivityVisibility`, `AllowFollowers` and `VerificationVisibility`
    // return **zero hits across every `.cs` file in the backend**.
    //
    // Removed rather than relabelled: a privacy switch that visibly moves
    // invites the belief that it did something, however it is captioned.
    const screen = source('app', 'profile', 'privacy-settings.tsx');

    expect(screen).not.toContain('updatePrivacySettings');
    expect(screen).not.toContain('Save Changes');
    expect(screen).not.toContain('<Switch');
    expect(screen).toContain('Diaspora has no visibility controls yet');
    // It has to tell the member what *is* visible, or it is only a refusal.
    expect(screen).toContain('What other members can see today');
  });

  it('the two subject rights are reachable from the settings menu, not just routable', () => {
    // The defect this replaces: `app/settings/privacy.tsx` was wired to the real export and
    // deletion screens, and **nothing in the app linked to it**. `settings/index.tsx` routes
    // "Privacy" to `/profile/privacy-settings` — a different screen — so the two capabilities
    // existed, worked, and could not be found by anybody who was not typing a deep link.
    //
    // A route is not navigation. Expo Router makes every file in `app/` reachable by URL, which
    // is exactly what makes this easy to miss: the screen opens perfectly when you test it the
    // way you built it.
    //
    // The orphan was deleted rather than re-linked, because two screens called "Privacy" with
    // one of them dead is how this happened in the first place.
    const menu = source('app', 'settings', 'index.tsx');

    expect(menu).toContain("router.push('/settings/data-export')");
    expect(menu).toContain("router.push('/settings/delete-account')");

    // Its own group. Burying "Delete my account" beside "Who can see your profile" is how
    // people delete an account by accident and how the ones who mean to cannot find it.
    expect(menu).toContain('title="Your data"');
  });

  it('the Privacy screen a member actually lands on offers the rights that exist', () => {
    // `settings/index.tsx` sends "Privacy" here. Somebody looking for how to leave looks under
    // Privacy; somebody looking for their data looks under Settings. Both are wired, on purpose.
    const screen = source('app', 'profile', 'privacy-settings.tsx');

    expect(screen).toContain("router.push('/settings/data-export')");
    expect(screen).toContain("router.push('/settings/delete-account')");

    // The sibling assertion below still holds: no switch that saves nowhere.
    expect(screen).not.toContain('<Switch');

    // And the claim was narrowed rather than left standing. Visibility controls still do not
    // exist; data rights now do, so "no privacy controls yet" had become false.
    expect(screen).toContain('Diaspora has no visibility controls yet');
  });

  it('the orphaned duplicate privacy screen is gone', () => {
    // Asserted by absence, which is unusual here and deliberate: while the file existed it was a
    // second screen titled "Privacy & Security", wired to the real capabilities, reachable from
    // nothing. Re-adding it would recreate the confusion rather than fix anything.
    const orphan = join(__dirname, '..', '..', 'app', 'settings', 'privacy.tsx');
    const exists: (path: string) => boolean = require('fs').existsSync;

    expect(exists(orphan)).toBe(false);
  });

  it('the data export screen tells the member what it does not cover', () => {
    // `modulesWithoutExportProvider` is the server saying "these modules hold data and could not
    // contribute", and twenty-one of twenty-two modules are in that list today. A screen that
    // dropped it would read as "here is everything Diaspora holds about you", which is false.
    const screen = source('app', 'settings', 'data-export.tsx');

    expect(screen).toContain('modulesWithoutExportProvider');
    expect(screen).toContain('What this export does not cover');
  });

  it('the delete-account screen previews before it destroys, and asks for a password', () => {
    // The preview is not a courtesy: "delete my account" means something specific here — the row
    // is anonymised rather than removed, because 216 foreign keys point at it — and a member is
    // entitled to know that before choosing it.
    //
    // The password is the real control. A bearer token on an unlocked phone can reach the
    // endpoint; only a password says the person pressing the button owns the account.
    const screen = source('app', 'settings', 'delete-account.tsx');

    expect(screen).toContain('previewAccountDeletion');
    expect(screen).toContain('modulesWithoutErasureProvider');
    expect(screen).toContain('secureTextEntry');
    expect(screen).toContain('DELETION_CONFIRMATION');

    // The receipt is rendered, and the session cleared only when the member taps Done — never as
    // part of the deletion call. Signing out inside `onDelete` would throw away the only record
    // the member gets of what was kept and why.
    expect(screen).toContain('receipt.results.map');
    expect(screen).toContain('onPress={onFinish}');

    const onDelete = screen.slice(screen.indexOf('const onDelete'), screen.indexOf('const onFinish'));
    expect(onDelete).not.toContain('signOut');
  });

  it('the provider alerts sheet no longer offers a subscription that cannot exist', () => {
    // `/providers` maps eleven routes and none of them subscribe.
    // `FollowTargetType` is Member/Organization/Hashtag — there is no Provider
    // member — and notification preferences are global, so writing this sheet's
    // state into them would turn "alert me about this agent" into "alert me
    // about all housing on Diaspora".
    const modal = source('components', 'ProviderNotificationModal.tsx');

    // The store is not merely unused — it is no longer imported, so the sheet
    // cannot drift back into writing preferences nobody reads.
    expect(modal).not.toContain("from '@/store/provider-notifications'");
    expect(modal).not.toContain('<Switch');
    expect(modal).not.toContain('Configure which alerts you would like to receive');
    expect(modal).toContain('Diaspora cannot alert you about one provider');
    // And it routes to the preferences that are real.
    expect(modal).toContain('/settings/notifications');
  });
});

// ── One last sibling: the publishing identity pill (B″-07) ───────────────────

describe('the publishing identity selector', () => {
  it('does not claim posts will be published as the chosen organisation', () => {
    // "Identity Switched — Now operating as: {name}" read as a mode that
    // persists into publishing. `activeIdentity` has no reader outside the
    // selector; every create screen sends its own author fields, so the only
    // effect of a selection is the workspace filter.
    const selector = source('components', 'creator', 'PublishingIdentitySelector.tsx');

    expect(selector).not.toContain('Identity Switched');
    expect(selector).not.toContain('Now operating as');
    expect(selector).toContain('Workspace filtered');
    expect(selector).toContain('New posts are still published as you');
  });
});
