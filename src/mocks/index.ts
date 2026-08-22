// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the development API adapter, and the one gate that decides
// whether this build has one at all.
//
// ⚠ READ THIS BEFORE ADDING A HANDLER BELOW. ⚠
//
// ── What was wrong ───────────────────────────────────────────────────────────
//
// Every `*-gap` handler in this file guards itself — `if (!areXGapsEnabled())
// return;` — so a release build reached no simulated *gap* surface. The gap
// arm was never the problem.
//
// The **core** handlers had no guard at all. `setupAuthMocks`,
// `setupHousingMocks`, `setupMarketplaceMocks`, `setupJobsMocks`,
// `setupCommunityLifeMocks` and the rest registered unconditionally, against
// the real `apiClient`, from a module-scope `initMocks()` call in
// `app/_layout.tsx` with no `__DEV__` check anywhere on the path.
//
// So in a production binary every route with a registered handler was answered
// by a fixture before it reached the backend. `POST /auth/register` and sign-in
// included: a member could create an account against `mocks/auth-session.ts`,
// receive a token no server issued, and use the app for a session that existed
// only on the device. That is the failure mode Rule 5 and §6 of the remediation
// brief describe — a production capability silently falling back to fake data —
// and it was the whole application rather than one screen.
//
// ── Where the gate is, and why it is here rather than at the call site ───────
//
// **The gate is at module scope, on the adapter itself** (`mockApi` below), not
// only inside `initMocks()`. That placement is load-bearing rather than
// stylistic, for two reasons:
//
//   1. **`new MockAdapter(apiClient)` is the hijack.** Its constructor assigns
//      `axiosInstance.defaults.adapter = this.adapter()`. The real client is
//      replaced *at import time*, before `initMocks()` is called and whatever
//      `initMocks()` then decides. A guard that lived only in `initMocks()`
//      would leave a handler-less mock adapter bolted to the real client — and
//      axios-mock-adapter's default `onNoMatch` is neither "passthrough" nor
//      "throw" but **404**, so a production build would answer every request on
//      the platform with a fabricated 404. Strictly worse than the defect.
//
//   2. **A call-site guard in `_layout.tsx` cannot help.** `import '@/mocks'`
//      is a static import; its side effects run whether or not the `initMocks()`
//      line beneath it is reached. There is nothing an `if` at the call site
//      can prevent, which is why there is no second gate there — two gates that
//      can disagree is one more thing to get wrong, and the weaker of the two
//      would be the one people trust.
//
// The consequence for whoever adds handler number thirty-one: **you do not have
// to remember anything.** Registration is unreachable when the gate is closed,
// because there is no adapter to register against, and `mockApi` is typed
// `MockAdapter | null` so the compiler makes you go through the guard.
//
// ── What the gate is ─────────────────────────────────────────────────────────
//
// `areSimulatedFeaturesEnabled()` — the switch this repository already chose,
// shared with Phases 5, 6, 7 and 12. Deliberately *the same* switch rather than
// a second `EXPO_PUBLIC_ENABLE_MOCKS` of its own, because the two questions are
// not independent: the gap handlers registered below are what serve the
// simulated surfaces the gap adapters call. A build that answered "yes" to
// "may I simulate?" and "no" to "may I register handlers?" would render every
// Phase 5/6/7/12 screen with its gap notice, its controls enabled, and every
// request behind them failing — the worst of both, and a state nobody would
// think to test.
//
//   * Under Metro / in a debug binary → `__DEV__`, adapter attached, nothing
//     changes about development.
//   * Release build with `EXPO_PUBLIC_ENABLE_GAP_PREVIEW=1` → attached, and
//     loudly announced. Internal test builds keep working.
//   * Any other release build → **not constructed**. `apiClient` keeps the real
//     axios adapter and every request goes to `api.diaspora.app`.
//
// See `src/config/gap-preview.ts` for why the opt-in is build-time only.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '@/lib/apiClient';
import { areSimulatedFeaturesEnabled, isGapPreviewBuild } from '@/config/gap-preview';
import { setupAuthMocks } from './handlers/auth';
import { setupDiscoveryMocks } from './handlers/discovery';
import { setupJobsMocks } from './handlers/jobs';
import { setupHousingMocks } from './handlers/housing';
import { setupMarketplaceMocks } from './handlers/marketplace';
import { setupCommunityLifeMocks } from './handlers/community-life';
import { setupLocationMocks } from './handlers/location';
import { setupTrustMocks } from './handlers/trust';
import { setupExploreMocks } from './handlers/explore';
import { setupConversationMocks } from './handlers/conversations';
import { setupCreatorMocks } from './handlers/creator';
import { setupNotificationMocks } from './handlers/notifications';
import { setupFinancialMocks } from './handlers/financial';
import { setupFinancialGapMocks } from './handlers/financial-gaps';
import { setupMonetizationGapMocks } from './handlers/monetization-gaps';
import { setupCreatorEconomyMocks } from './handlers/creator-economy';
import { setupCreatorCertifiedMocks } from './handlers/creator-certified';
import { setupCommunityGapMocks } from './handlers/community-gaps';
import { setupCommunityProgrammeMocks } from './handlers/community-programme';
import { setupMapsGapMocks } from './handlers/maps-gaps';
import { setupCommunityDirectoryMocks } from './handlers/community-directory';
import { setupAnalyticsGapMocks } from './handlers/analytics';
import { setupIntegrationGapMocks } from './handlers/integrations-gaps';
import { setupAutomationGapMocks } from './handlers/automation-gaps';
import { setupAutomationMocks } from './handlers/automation';
import { setupMediaMocks } from './handlers/media';
import { setupIntegrationMocks } from './handlers/integrations';
import { setupRecommendationMocks } from './handlers/recommendations';
import { setupCommunitySocialMocks } from './handlers/community-social';
import { setupJobsHiringMocks } from './handlers/jobs-hiring';
import { setupGuideMocks } from './handlers/guides';
import { setupCountryIntelligenceMocks } from './handlers/country-intelligence';

/**
 * The development API adapter, or `null` in a build that may not simulate.
 *
 * Evaluated once, at import. `areSimulatedFeaturesEnabled()` reads `__DEV__` and
 * an `EXPO_PUBLIC_*` variable, both of which Babel inlines at build time, so in
 * a production bundle this collapses to `null` and the `new MockAdapter(...)`
 * branch is unreachable code rather than code that is reached and declines.
 *
 * **The `| null` in the type is the enforcement.** Nothing can register a
 * handler without first narrowing this, and the only narrowing is the guard in
 * `initMocks()` below. A non-null adapter with an "is it allowed?" boolean
 * beside it would let the next handler be added correctly-looking and ungated;
 * this does not compile.
 */
export const mockApi: MockAdapter | null = areSimulatedFeaturesEnabled()
  ? new MockAdapter(apiClient, { delayResponse: 800 })
  : null;

export function initMocks(): void {
  // ── The gate ───────────────────────────────────────────────────────────────
  //
  // Nothing below this point runs in a production build. Not "runs and returns
  // early" — the adapter does not exist, so `apiClient` still holds the real
  // axios transport and every request leaves the device.
  //
  // It says so rather than returning in silence. A build that answers a login
  // from a fixture and a build that answers it from the backend look identical
  // from the outside until the moment one of them is wrong, and the first thing
  // anyone reads when a tester reports "sign-in did nothing" is the startup
  // log. One line there removes an hour of guessing.
  if (mockApi === null) {
    console.log(
      '[MOCK] Production build — no mock adapter installed. Every request goes ' +
        'to the real backend. (Set EXPO_PUBLIC_ENABLE_GAP_PREVIEW=1 at build ' +
        'time for an internal test build that simulates.)'
    );
    return;
  }

  console.log('[MOCK] Initializing API mocks...');

  // An internal test build is a release bundle with the simulated surfaces
  // deliberately switched on. Saying so once at startup means a crash report or
  // a session log from a tester is never ambiguous about which kind of build it
  // came from — the screens carry their own markers, but a log does not.
  //
  // Louder than it was, because the gate above changed what this warning means.
  // It used to say "the gap surfaces are reachable in a bundle that was going
  // to mock everything anyway". It now says "this bundle mocks **everything**,
  // including registration and sign-in" — the authentication note is the part a
  // tester and a release manager both need, and it is new.
  if (isGapPreviewBuild()) {
    console.warn(
      '[MOCK][INTERNAL TEST BUILD] EXPO_PUBLIC_ENABLE_GAP_PREVIEW is set. This ' +
        'RELEASE bundle serves the full development API from fixtures — ' +
        'including POST /auth/register and sign-in, so accounts created here ' +
        'exist only on this device — plus the simulated financial, ' +
        'monetization, creator and community surfaces. NOT a production build ' +
        'and must never be shipped as one.'
    );
  }
  setupAuthMocks(mockApi);
  setupDiscoveryMocks(mockApi);

  // Remediation Wave K. `Diaspora.Modules.Jobs` serves 28 routes under
  // `/api/v1/jobs`, of which **fifteen are the hiring workflow** — apply,
  // applications, withdraw, decide, interviews, offers, candidate profile,
  // candidate dashboard, employer registration and management, employer
  // dashboard — and until this wave none of them had a frontend consumer. Every
  // shape was written from that module's source rather than from what
  // `lib/jobs-hiring-api.ts` expects.
  //
  // **Registered BEFORE `setupJobsMocks`, and the order is load-bearing.**
  // `handlers/jobs.ts` opens with `mock.onGet(/\/jobs/)` — unanchored, so it
  // matches every GET whose path merely *contains* `/jobs`, including
  // `/jobs/applications` and `/jobs/candidate/dashboard`. axios-mock-adapter is
  // first-match-wins, so registering this second would hand the applications
  // list to a fixture that answers with a `JobOpportunity[]` and a `pagination`
  // envelope the platform has never returned — an empty page with no error,
  // which is the exact failure this remediation keeps finding.
  //
  // It enforces the server's refusals rather than describing them: applying
  // without a candidate profile is **403 `jobs.not-candidate`** (the gate the
  // old blind apply button would have hit for every member, because no screen
  // could create a profile); self-application is a **400**, not a 403; an
  // unparseable `?status=` filter is **dropped rather than refused**, so a
  // kebab-cased chip returns the complete list; `Withdrawn` is unreachable through
  // `/decide`; and withdrawal is the applicant's alone, not staff's.
  //
  // It adds no route the backend does not have. In particular there is **no
  // `GET /jobs/employers/{id}`** — NG-04 is confirmed, and the fixture that
  // answers `GET /employers/{id}` below is `handlers/jobs.ts`'s, serving a route
  // nobody wrote.
  setupJobsHiringMocks(mockApi);

  setupJobsMocks(mockApi);
  setupHousingMocks(mockApi);
  setupMarketplaceMocks(mockApi);
  setupCommunityLifeMocks(mockApi);
  setupLocationMocks(mockApi);
  // D-4. The Trust module's real 26-route contract under `/api/v1/trust` —
  // profile, timeline, badges, verifications, appeals, reputation, eligibility,
  // feature requirements and the two staff queues.
  //
  // The eight routes this used to register are gone. Six of them never existed
  // on the server (`/trust/verify/*`, `/trust/community-voting`,
  // `/trust/audit`, `/trust/privacy`), and one screen was posting to one of
  // them against the real client. They 404 now, which is what they do in
  // production.
  setupTrustMocks(mockApi);
  setupExploreMocks(mockApi);
  setupConversationMocks(mockApi);
  setupCreatorMocks(mockApi);

  // B13. The notification routes must be registered before the passthrough below,
  // like every other handler — an unmatched request falls through to the network.
  setupNotificationMocks(mockApi);

  // B15. The certified financial platform: wallets, ledger, payments, catalogue,
  // subscriptions and giving. Every route mirrors `/api/v1/financial`.
  setupFinancialMocks(mockApi);

  // ⚠ BACKEND GAP / DEVELOPMENT ONLY. Simulated deposits, withdrawals and
  // creator rewards, under `/financial-gap/v0`. This call registers nothing in
  // a release build — see `src/config/financial-gaps.ts`.
  setupFinancialGapMocks(mockApi);

  // ⚠ BACKEND GAP / DEVELOPMENT ONLY. Simulated campaigns, performance figures,
  // plan changes, usage counters, invoices, premium analytics and monetization
  // recommendations, under `/monetization-gap/v0`. This call registers nothing
  // in a release build — see `src/config/monetization-gaps.ts`.
  setupMonetizationGapMocks(mockApi);

  // ⚠ BACKEND GAP / DEVELOPMENT ONLY. Simulated creator status, verification,
  // milestones, challenges, grants, the Academy, creator analytics, earnings
  // attribution, referrals, the sign-up bonus, point rules, leaderboards,
  // recommendations and the creator directory, under `/creator-gap/v0`. This
  // call registers nothing in a release build — see `src/config/creator-gaps.ts`.
  setupCreatorEconomyMocks(mockApi);

  // The creator economy's **certified** half — Remediation Wave C-03. Thirty-one
  // routes `config/creator-gaps.ts` declared missing are served by
  // `Diaspora.Modules.Creator` under `/api/v1/creators`, `/challenges`,
  // `/grants`, `/academy`, `/referrals` and `/rewards`, and this fixture stands
  // in for them on those real paths. Separate from the call above because the
  // boundary test asserts that everything *that* one registers sits behind
  // `/creator-gap/v0`, and because a reviewer should be able to tell at a glance
  // which half of the creator surface is real.
  setupCreatorCertifiedMocks(mockApi);

  // The Community Programme's **certified** half — Remediation Wave C-04.
  // `Diaspora.Modules.CommunityProgramme` serves membership programmes and
  // their fourteen states, volunteering, polls, organization capabilities and
  // dashboards, announcements, impact and federated search under
  // `/api/v1/communities`, and this fixture stands in for it on those real
  // paths.
  //
  // Registered *before* the gap handler and separate from it, because the
  // boundary test asserts everything the gap handler registers sits behind
  // `/community-gap/v0` — and because a reviewer should be able to tell at a
  // glance which half of the Community Life surface is real.
  //
  // Not to be confused with `setupCommunitySocialMocks`, which serves
  // `Diaspora.Modules.Community` at `/api/v1/community` (singular) — the social
  // graph. Two modules, two prefixes, one letter apart.
  setupCommunityProgrammeMocks(mockApi);

  // ⚠ BACKEND GAP / DEVELOPMENT ONLY. What B18 does *not* serve: the hub
  // summary, community recommendations, occurrence registration and attendance,
  // the fundraising campaign wrapper and its donation stitching, and
  // neighbourhood bindings — under `/community-gap/v0`.
  //
  // Money is NOT simulated here: every donation on a Phase 12 screen goes to
  // B15's real `/financial/donations`, and every membership payment goes to
  // B15's real payment intents. This call registers nothing in a release build
  // — see `src/config/community-gaps.ts`.
  setupCommunityGapMocks(mockApi);

  // ⚠ BACKEND GAP / DEVELOPMENT ONLY. Simulated heat-map aggregates,
  // neighbourhood score breakdowns, cost-of-living categories, safety-score
  // provenance and community-alert affected-area geometry, under
  // `/maps-gap/v0`. This call registers nothing in a release build — see
  // `src/config/maps-gaps.ts`.
  //
  // Phase 8's map search is NOT simulated: every listing, job, event,
  // organization, guide and community alert on the map comes from the routes
  // registered above. §2 makes maps a presentation layer over what already
  // exists, and this call adds nothing that duplicates them.
  setupMapsGapMocks(mockApi);

  // ⚠ BACKEND GAP / DEVELOPMENT ONLY. Simulated community directory, community
  // profiles, community membership and its ten states, primary community,
  // interested communities, server-evaluated community capabilities, community
  // statistics, comparison, rules, notices, moderator and ambassador
  // directories, initiatives, the community moderation queue and community
  // preferences, under `/community-directory/v0`.
  //
  // Deliberately NOT under `/communities` — that path already belongs to Phase
  // 12's organization membership programmes at `/community-gap/v0/communities/*`,
  // which is a different domain with a colliding name.
  //
  // Phase 13's community-scoped *content* is NOT simulated: every guide, job,
  // listing, event, organization and update on a community-scoped surface comes
  // from the certified routes registered above, narrowed by the single projection
  // in `lib/community/scope.ts`. §3 and §14 forbid a second discovery system and
  // this call adds none. Nothing here moves money — §51 forbids a community
  // wallet and there is no function in the adapter that could create one.
  //
  // This call registers nothing in a release build — see
  // `src/config/multi-community-gaps.ts`.
  setupCommunityDirectoryMocks(mockApi);

  // ⚠ BACKEND GAP / DEVELOPMENT ONLY. Simulated analytics datasets for every
  // subject — platform, country, community, neighbourhood, creator, provider,
  // employer, seller, landlord, organization, campaign and individual content
  // items — plus funnels, cohort retention, leaderboards, insights, the
  // server-evaluated analytics capability set, export jobs and saved reports,
  // under `/analytics-gap/v0`.
  //
  // Unlike every handler above it, this one ships **no fixture data**: an
  // analytics answer depends on a date range no fixture author can know, so each
  // response is computed deterministically from the request by
  // `mocks/analytics-data.ts`. Same query in, same dataset out, on every render
  // and in every test — which is §60 and is what makes an inconsistency between
  // two analytics screens a finding rather than a coin toss.
  //
  // Analytics does NOT simulate what the platform genuinely knows: inventory
  // counts come from the real `/jobs`, `/housing`, `/marketplace`, `/listings`,
  // `/community-life/*` and `/neighborhood/{id}` routes registered above, and
  // wallet figures are summed on the device from B15's real ledger. Those render
  // as backend figures with no gap notice, because they are not gaps.
  //
  // Nothing here moves money, writes to a certified route or grants a
  // permission. This call registers nothing in a release build — see
  // `src/config/analytics-gaps.ts`.
  setupAnalyticsGapMocks(mockApi);

  // ⚠ BACKEND GAP / DEVELOPMENT ONLY. Simulated integration connections, the
  // OAuth authorization-code exchange, the Google Calendar proxy, calendar sync
  // and settings, identity linking, email verification state, government
  // notices and saved payment-method display fields, under
  // `/integrations-gap/v0`.
  //
  // Three things are deliberately NOT simulated here, and each absence is a
  // decision rather than an omission:
  //
  //   * **No payment route.** Every payment goes to B15's real `/financial/*`
  //     endpoints registered above. Nothing in the integration arm charges,
  //     refunds or moves money.
  //   * **No session.** The simulated OAuth exchange returns a connection and
  //     refuses `intent: "signIn"` with a 501, because a development adapter
  //     that could mint a session would be an authentication bypass a screen
  //     could reach.
  //   * **No push route.** B13's `/notifications/devices` and
  //     `/notifications/preferences` are real and are used unchanged; only the
  //     device-side token acquisition is missing, and that is a provider gap
  //     rather than a backend one.
  //
  // Phase 8's map providers are also untouched: §12 forbids a second map
  // implementation and `lib/integrations/maps.ts` is a read-only bridge onto the
  // existing registry.
  //
  // This call registers nothing in a release build — see
  // `src/config/integration-gaps.ts`.
  setupIntegrationGapMocks(mockApi);

  // Remediation Wave C-05. The **certified** integrations surface —
  // `/api/v1/integrations` — as distinct from the gap prefix registered above.
  // Connection registry, OAuth exchange and revoke, calendar list/write/sync and
  // calendar settings all exist and are served; every shape here came from
  // `Diaspora.Modules.Integrations/Api/IntegrationsEndpointContributor.cs`.
  //
  // Registered **after** the gap handler so the gap prefix keeps answering for
  // the capabilities that genuinely remain absent, and before the passthrough
  // like every other handler.
  setupIntegrationMocks(mockApi);

  // ⚠ BACKEND GAP / DEVELOPMENT ONLY. Simulated automations, their execution
  // history and run detail, the server-evaluated automation capability set,
  // audience estimates, audit trails, saved searches and reminder records,
  // under `/automation-gap/v0`.
  //
  // Four things are deliberately NOT simulated here, and each absence is a
  // decision rather than an omission:
  //
  //   * **No dispatch route.** GAP-024's notification dispatch is
  //     service-to-service and must never be client-callable. A simulated one
  //     would be a client-callable send path sitting in the codebase waiting to
  //     be pointed at a real backend.
  //   * **No money route.** Nothing charges, refunds, credits, claims or
  //     renews. The financial triggers produce notification-shaped runs and
  //     nothing else, and `AutomationAction` has no field that could carry an
  //     amount.
  //   * **No platform-wide capability.** `/capabilities` answers
  //     `canCreatePlatformWide: false` for every caller, so §66's security test
  //     runs against the same answer in development as in production.
  //   * **No completed run.** A manually-run automation returns SKIPPED with a
  //     backend-gap reason. Nothing here can report that an action was carried
  //     out, because nothing here carries one out.
  //
  // B13's notification preferences, categories and inbox are NOT simulated:
  // §28 forbids a second notification system, every automation action names a
  // real B13 channel and category, and `automation-api.ts` reads the live
  // preference contract registered above. Phase 16's calendar is untouched for
  // the same reason — §11 forbids a second calendar implementation and the
  // calendar action calls Phase 16's single `exportEventToCalendar`.
  //
  // This call registers nothing in a release build — see
  // `src/config/automation-gaps.ts`.
  //
  // Remediation Wave C-02: it is now only reached for the thirteen
  // trigger-context routes that remain genuinely absent. Everything else moved
  // to the real contract below.
  setupAutomationGapMocks(mockApi);

  // Remediation Wave C-02. `Diaspora.Modules.Automation` serves 24 routes under
  // `/api/v1/automations`, and every shape in this handler was read from that
  // module's source rather than from what the client expects — which is the
  // distinction that made the previous handler unable to find the page-shape,
  // idempotency-key and subject-moment defects it was sitting on top of.
  //
  // Registered AFTER the gap handler so the two prefixes cannot shadow each
  // other, and before the passthrough like every other handler.
  setupAutomationMocks(mockApi);

  // Remediation Wave E. `Diaspora.Modules.Media` serves the upload, asset,
  // capability, content and processing routes under `/api/v1/media`, and until
  // this call there was **no `/media` handler at all** — so every
  // `POST /media/uploads/direct` fell through to the passthrough below and hit a
  // network that is not there. Wave E built the whole upload pipeline and left
  // it unusable in development; this is the other half.
  //
  // Every shape was read from that module's source rather than from what
  // `lib/media-api.ts` expects, which is what let it find that this deployment
  // has no malware scanner, no image codec, and creates every asset private.
  //
  // Nothing here serves bytes. `GET /media/{id}/content` is one of the only two
  // routes on the platform that return a file rather than the envelope, and an
  // axios adapter cannot answer an `<Image src>`. A listing photograph therefore
  // does not render in development — which is true, and is the point: the
  // Unsplash fallbacks this wave removed from `handlers/housing.ts` and
  // `handlers/marketplace.ts` were what made it look otherwise.
  setupMediaMocks(mockApi);

  // Remediation Wave D-1. `Diaspora.Modules.Recommendations` serves the home
  // feed and the five feedback routes under `/api/v1/recommendations`, and until
  // this call there was **no `/recommendations` handler at all** — because until
  // this wave there was no client either. The Home tab rendered
  // `mocks/community-data.ts` directly and never made a request, so every member
  // in every country saw the same three guides under the word "Trending".
  //
  // Every shape was read from that module's contracts rather than from what
  // `lib/recommendations-api.ts` expects. It enforces the refusals rather than
  // describing them: the five-minute `/view` and `/click` de-duplication that
  // answers **200 with `wasRecorded: false`**, the separator-sensitive
  // `targetType` parse that refuses `housing_listing` while accepting
  // `housinglisting`, the GUID binding on `targetId`, and the rule that a
  // section under its minimum is **absent** from `sections` rather than present
  // and empty.
  //
  // It invents recommendations and nothing else. Every `targetId` is a GUID no
  // other handler knows, so tapping a card in development reaches the owning
  // module's own "not found" — which is true, and is better than a card that
  // opens a fixture the recommender never chose.
  setupRecommendationMocks(mockApi);

  // Remediation Wave D-2. `Diaspora.Modules.Community` serves **36 routes**
  // under `/api/v1/community` — posts, comments, reactions, feeds, bookmarks,
  // shares, follows, moderation and hashtag discovery — and until this wave
  // **not one of them had a frontend consumer**, so there was no handler either.
  // Every one of them would have fallen through to the passthrough below.
  //
  // Every shape was written from that module's contract rather than from what
  // `lib/community-social-api.ts` expects, and it enforces the refusals rather
  // than describing them: `prefix` is **required** on `/hashtags/suggest`,
  // unfollowing something you do not follow is a **404** while un-reacting to
  // something you never reacted to is a 200, the 500- and 2000-character
  // ceilings are applied, and **a malformed cursor comes back as page one at
  // HTTP 200** rather than a 400 — which is what makes an infinite query that
  // stops on an empty page rather than on `hasMore` testable at all.
  //
  // It also models what the module returns and cannot be talked out of: poll
  // counts that are **null rather than 0** while results are hidden, a
  // `reportCount` that is 0 for anyone who is not the author, a `reviewStatus`
  // of `unavailable` (which is **not** `clean`) on a deployment with no review
  // provider, deleted comments delivered tombstoned so their replies keep a
  // parent, and the four moderation display names the server hardcodes to null.
  //
  // Nothing here is `/api/v1/bookmarks` — that prefix belongs to a separate
  // Bookmarks module — and there is deliberately no `GET /community/posts`
  // handler, because no such route exists: the collection answers 405, which is
  // what ASP.NET does for a path that matches with a method that does not.
  //
  // Registered before the passthrough, like every other handler.
  setupCommunitySocialMocks(mockApi);

  // Remediation Wave D-3. `Diaspora.Modules.Guides` serves **44 routes** under
  // `/api/v1/guides` — discovery, the reader, authoring, publishing, versions,
  // engagement, suggestions, verification and a fourth moderation queue — and
  // until this wave **not one of them had a frontend consumer**. Guide
  // discovery, `guide/[id].tsx`, `guide/[id]/versions.tsx` and the create
  // wizard all rendered `mocks/community-data.ts` directly, so there was no
  // handler either and every one of these routes would have fallen through to
  // the passthrough below.
  //
  // Every shape was written from that module's contract rather than from what
  // `lib/guides-api.ts` expects, and it enforces the refusals rather than
  // describing them: **`POST /guides` answers a draft** whatever the caller
  // sent, publishing an empty guide is **400 `guides.structure.empty`**, a
  // stale `baseRevision` is **409 `guides.revision-conflict`**, a title under
  // three characters is refused, voting on your own guide is **403
  // `guides.vote.self`**, somebody else's draft is **404 rather than 403**, and
  // media attachment is idempotent on the **(mediaId, role) pair** rather than
  // on the id.
  //
  // It also models the one silent behaviour a test is the only way to find:
  // **an unrecognised `?sort=` is not an error.** `GuideWireNames.ParseSort`
  // falls back to `newest`, so a client that sent `most_helpful` gets a
  // plausible page in the wrong order and no complaint.
  //
  // There is deliberately **no comment route** here — a guide's discussion is
  // Community's generic content thread, served by `handlers/community-social.ts`
  // and consumed by `guide/[id].tsx` through `useContentComments('guide', …)`.
  //
  // Registered after the community social handler so that the `guide` content
  // type keeps reaching Community's thread, and before the passthrough like
  // every other handler.
  setupGuideMocks(mockApi);

  // Remediation Wave D-5. The Country Intelligence Platform — the **third**
  // endpoint contributor on the Guides module, mapping `/api/v1/intelligence`.
  // Embassies, visa advisories, emergency numbers, public holidays, official
  // notices and the one-call country dashboard.
  //
  // The wave's brief described these as rendering from fixtures. They did not:
  // **no screen rendered them at all and no fixture existed**, so this handler
  // and the client above it are the first consumer the surface has ever had.
  //
  // Every shape came from `Api/EmbassyEndpoints.cs`,
  // `Api/VisaAdvisoryEndpoints.cs`, `Api/EmergencyEndpoints.cs`,
  // `Api/PublicHolidayEndpoints.cs` and `Api/IntelligenceDiscoveryEndpoints.cs`.
  // It enforces that `locatedIn` and `serving` are **different questions that do
  // not default to each other**, and that `appliesTo` matches advisories naming
  // that nationality *and* those naming nobody — a filter that matched only the
  // exact code would tell most members no rules exist for them, which is the
  // most dangerous kind of wrong this surface can be.
  setupCountryIntelligenceMocks(mockApi);

  // Pass through any unhandled requests
  mockApi.onAny().passThrough();
}

