import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '@/lib/apiClient';
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

// Create the mock adapter instance
export const mockApi = new MockAdapter(apiClient, { delayResponse: 800 });

export function initMocks() {
  console.log('[MOCK] Initializing API mocks...');
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

  // Pass through any unhandled requests
  mockApi.onAny().passThrough();
}

