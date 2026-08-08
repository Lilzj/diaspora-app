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

  // Pass through any unhandled requests
  mockApi.onAny().passThrough();
}

