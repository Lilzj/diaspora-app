import { Tour } from '@/types/explore';

export const CURRENT_PLATFORM_VERSION = '2.0.0';

/**
 * List of all tours configured in the Diaspora application.
 * Defines the steps, element focus keys, text copy, and triggering rules.
 */
export const FEATURE_TOURS: Tour[] = [
  {
    id: 'app',
    entryRoute: '/(tabs)',
    title: 'Platform Overview Tour',
    version: '1.0.0',
    description: 'Learn the primary navigation areas of Diaspora and discover how to build your new life abroad.',
    triggerRule: {
      type: 'FirstLogin',
    },
    steps: [
      {
        targetKey: 'home_tab',
        title: 'Your Home Dashboard',
        description: 'See hyperlocal announcements, community updates, and country statistics customized for your location.',
        placement: 'top',
      },
      {
        targetKey: 'discover_tab',
        title: 'Local Directories & Marketplace',
        description: 'Find local service providers, job listings, housing options, and a neighborhood buy-and-sell marketplace.',
        placement: 'top',
      },
      {
        targetKey: 'create_tab',
        title: 'Contribute content',
        description: 'Share your experience! Publish evergreen guides, post local jobs, list housing, or list marketplace items.',
        placement: 'top',
      },
      {
        targetKey: 'knowledge_tab',
        title: 'Knowledge Hub',
        description: 'Explore verified community guides, emergency updates, and contributor directories.',
        placement: 'top',
      },
      {
        targetKey: 'profile_tab',
        title: 'My Profile & Status',
        description: 'View your country verifications, contributor badges, safety history, and reputation scores.',
        placement: 'top',
      },
      {
        targetKey: 'search_button',
        title: 'Universal Proximity Search',
        description: 'Quickly find jobs, guides, housing, or services within a specific radius of your current location.',
        placement: 'bottom',
      },
      {
        targetKey: 'notification_icon',
        title: 'Stay Notified',
        description: 'Get real-time updates regarding your verifications, guide votes, and messages.',
        placement: 'bottom',
      },
    ],
  },
  {
    id: 'marketplace',
    entryRoute: '/(tabs)/discover?tab=Marketplace',
    title: 'Marketplace Safety & Deals',
    version: '2.0.0', // Part of version 2.0 release
    description: 'Learn how to buy and sell safely within the hyperlocal Diaspora community.',
    triggerRule: {
      type: 'FirstVisit',
      featureKey: 'Marketplace',
    },
    steps: [
      {
        targetKey: 'discover_results',
        title: 'Hyperlocal Buy & Sell',
        description: 'Browse second-hand items, furniture, and local services listing near you. Sort by proximity.',
        placement: 'center',
      },
      {
        targetKey: 'discover_filters',
        title: 'Verified Sellers Only',
        description: 'Open the filters to show listings only from members with approved Residency Verification.',
        placement: 'bottom',
      },
      {
        targetKey: 'discover_results',
        title: 'Item Condition & Intent',
        description: 'Every listing shows whether it is New, Like New or Used, and whether it is for Sale, Rent or Free — so you can tell at a glance before you tap.',
        placement: 'bottom',
      },
      {
        targetKey: 'discover_search',
        title: 'Find what you need',
        description: 'Search across everything listed near you. To sell something of your own, use Create on the navigation bar.',
        placement: 'top',
      },
    ],
  },
  {
    id: 'jobs',
    entryRoute: '/(tabs)/discover?tab=Jobs',
    title: 'Jobs & Local Opportunities',
    version: '1.0.0',
    description: 'Discover relevant job boards, legal listings, and verified employer openings.',
    triggerRule: {
      type: 'FirstVisit',
      featureKey: 'Jobs',
    },
    steps: [
      {
        targetKey: 'discover_search',
        title: 'Filter Openings',
        description: 'Filter listings by full-time, part-time, visa sponsorship, or benefits flags like accommodation.',
        placement: 'bottom',
      },
      {
        targetKey: 'discover_results',
        title: 'Verified Employers',
        description: 'Roles from businesses whose identity Diaspora has checked carry a verification mark in the list.',
        placement: 'bottom',
      },
      {
        targetKey: 'discover_results',
        title: 'Direct Application',
        description: 'Open any role from here to apply with your verified profile and attach a CV.',
        placement: 'top',
      },
    ],
  },
  {
    id: 'housing',
    entryRoute: '/(tabs)/discover?tab=Housing',
    title: 'Housing Finder Onboarding',
    version: '1.5.0',
    description: 'Browse local rooms, shared flats, and verified host listings.',
    triggerRule: {
      type: 'FirstVisit',
      featureKey: 'Housing',
    },
    steps: [
      {
        targetKey: 'discover_results',
        title: 'Accommodation Listings',
        description: 'Find rooms, apartments, or house-shares. Proximity filters find options near your workplace or university.',
        placement: 'center',
      },
      {
        targetKey: 'discover_filters',
        title: 'Verified Landlords',
        description: 'Use the filters to show only landlords who have submitted proof of address and identification.',
        placement: 'bottom',
      },
      {
        targetKey: 'discover_filters',
        title: 'Lifestyle Preferences Matching',
        description: 'The filters include lifestyle matching — habits, dietary preferences, working schedules and spoken languages.',
        placement: 'top',
      },
    ],
  },
  {
    id: 'creator',
    entryRoute: '/creator',
    title: 'Creator Studio Academy',
    version: '1.8.0',
    description: 'Maximize your community impact, write helpful guides, and earn reputation points.',
    triggerRule: {
      type: 'FeatureUnlock',
      featureKey: 'Guide Publishing',
    },
    steps: [
      {
        targetKey: 'creator_stats',
        title: 'Impact Analytics',
        description: 'Monitor how many newcomers have viewed, bookmarked, or voted your guides as "Helpful".',
        placement: 'bottom',
      },
      {
        targetKey: 'creator_drafts',
        title: 'What to do next',
        description: 'Diaspora suggests your next step here — a guide worth writing, a milestone within reach, a challenge open now.',
        placement: 'bottom',
      },
      {
        targetKey: 'creator_reputation_impact',
        title: 'Earn Reputation Points',
        description: 'Higher helpful votes increase your status score and unlock professional verification titles.',
        placement: 'top',
      },
    ],
  },
  {
    id: 'trust',
    entryRoute: '/profile/trust-center',
    title: 'Trust & Safety Dashboard',
    version: '1.0.0',
    description: 'Manage your country verifications, device sessions, and privacy configuration.',
    triggerRule: {
      type: 'FirstVisit',
      featureKey: 'Trust Center',
    },
    steps: [
      {
        targetKey: 'trust_status_card',
        title: 'Verification Statuses',
        description: 'Upload required documents to verify your Phone, Identity, and Residency status.',
        placement: 'bottom',
      },
      {
        targetKey: 'trust_reputation_tiers',
        title: 'Reputation breakdown',
        description: 'Check your points distribution across different countries. Level up to unlock moderator privileges.',
        placement: 'bottom',
      },
      {
        targetKey: 'trust_privacy_toggles',
        // Privacy, devices, security activity and appeals left the Trust Centre
        // for Settings. The step follows its subject rather than spotlighting
        // the space where it used to be.
        route: '/settings',
        title: 'Detailed Privacy Settings',
        description:
          'Choose who can see your verified documents, your phone number and how precisely your location is shown. Devices, security activity and appeals are here too.',
        placement: 'top',
      },
    ],
  },
  {
    id: 'neighborhood',
    entryRoute: '/(tabs)/discover',
    title: 'Neighborhood Proximity Circle',
    version: '1.2.0',
    description: 'Learn how our Hyperlocal Discovery Engine keeps you connected to your immediate community.',
    triggerRule: {
      type: 'FirstVisit',
      featureKey: 'Neighborhood',
    },
    steps: [
      {
        targetKey: 'proximity_radius_slider',
        title: 'Adjust search radius',
        description: 'Drag the slider to adjust search queries from 1 km to 50 km or expand to whole city limits.',
        placement: 'bottom',
      },
      {
        targetKey: 'neighborhood_pin',
        title: 'Switch Neighborhood context',
        description: 'Change neighborhood focus to browse directories or listings in adjacent boroughs or towns.',
        placement: 'bottom',
      },
    ],
  },
  {
    id: 'community-life',
    // The tour's targets are the events list and the organisations directory,
    // both on the events screen rather than the landing page.
    entryRoute: '/community-life/events',
    title: 'Community Life Finder',
    version: '2.0.0',
    description: 'Explore local social groups, events calendars, and cultural organizations.',
    triggerRule: {
      type: 'FirstVisit',
      featureKey: 'Community Life',
    },
    steps: [
      {
        targetKey: 'community_events_list',
        title: 'Hyperlocal Events',
        description: 'Discover cultural gatherings, visa seminars, business mixers, and language swaps.',
        placement: 'bottom',
      },
      {
        targetKey: 'community_organizations_directory',
        // A different tab of the same screen. `?tab=` exists for exactly this.
        route: '/community-life/events?tab=directory',
        title: 'Follow Community Organizations',
        description: 'Follow non-profits, verified hubs, and clubs to receive updates directly in your Home tab.',
        placement: 'top',
      },
    ],
  },
];

/**
 * Returns a specific tour configuration by its ID.
 */
export function getTourConfig(id: string): Tour | undefined {
  return FEATURE_TOURS.find((tour) => tour.id === id);
}

/**
 * Returns tours that should automatically trigger for a given route/context,
 * based on whether the tour trigger rule matches the action and the tour version matches user history.
 */
export function getToursToTrigger(
  triggerType: 'FirstLogin' | 'FirstVisit' | 'FeatureUnlock',
  featureKey?: string
): Tour[] {
  return FEATURE_TOURS.filter((tour) => {
    const rule = tour.triggerRule;
    if (rule.type !== triggerType) return false;
    if (triggerType === 'FirstVisit' || triggerType === 'FeatureUnlock') {
      return rule.featureKey === featureKey;
    }
    return true;
  });
}
