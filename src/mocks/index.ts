import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '@/lib/apiClient';
import { isGapPreviewBuild } from '@/config/gap-preview';
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
import { setupCommunityGapMocks } from './handlers/community-gaps';
import { setupMapsGapMocks } from './handlers/maps-gaps';
import { setupCommunityDirectoryMocks } from './handlers/community-directory';
import { setupAnalyticsGapMocks } from './handlers/analytics';
import { setupIntegrationGapMocks } from './handlers/integrations-gaps';
import { setupAutomationGapMocks } from './handlers/automation-gaps';

// Create the mock adapter instance
export const mockApi = new MockAdapter(apiClient, { delayResponse: 800 });

export function initMocks() {
  console.log('[MOCK] Initializing API mocks...');

  // An internal test build is a release bundle with the simulated surfaces
  // deliberately switched on. Saying so once at startup means a crash report or
  // a session log from a tester is never ambiguous about which kind of build it
  // came from — the screens carry their own markers, but a log does not.
  if (isGapPreviewBuild()) {
    console.warn(
      '[MOCK][INTERNAL TEST BUILD] EXPO_PUBLIC_ENABLE_GAP_PREVIEW is set. ' +
        'Simulated financial, monetization, creator and community surfaces are ' +
        'REACHABLE in this release bundle. Not a production build.'
    );
  }
  setupAuthMocks(mockApi);
  setupDiscoveryMocks(mockApi);
  setupJobsMocks(mockApi);
  setupHousingMocks(mockApi);
  setupMarketplaceMocks(mockApi);
  setupCommunityLifeMocks(mockApi);
  setupLocationMocks(mockApi);
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

  // ⚠ BACKEND GAP / DEVELOPMENT ONLY. Simulated membership programmes and
  // applications, recurring event series and occurrences, event registration,
  // fundraising campaign lifecycles, campaign transparency, volunteer
  // opportunities, applications, assignments and hours, community polls and
  // results, organization roles, dashboards and analytics, neighbourhood
  // bindings, announcements and community impact, under `/community-gap/v0`.
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
  setupAutomationGapMocks(mockApi);

  // Pass through any unhandled requests
  mockApi.onAny().passThrough();
}

