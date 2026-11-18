import { TutorialCategory, ReleaseAnnouncement } from '@/types/explore';

export const mockTutorialCategories: TutorialCategory[] = [
  {
    id: 'getting-started',
    group: 'discover' as const,
    name: 'Getting Started',
    icon: '🚀',
    color: '#FFF8EB', // Primary Amber Palette shade
    description: 'Essential setup and tips for your first week in the community.',
  },
  {
    id: 'finding-services',
    group: 'discover' as const,
    name: 'Finding Services',
    icon: '🔍',
    color: '#E8F7F4', // Forest Teal shade
    description: 'How to discover, contact, and verify local service providers.',
  },
  {
    id: 'jobs',
    group: 'work' as const,
    name: 'Jobs & Careers',
    icon: '💼',
    color: '#EFF6FF', // Info Blue shade
    description: 'Work permits, local CV writing, and direct job applications.',
  },
  {
    id: 'housing',
    group: 'living' as const,
    name: 'Housing Finder',
    icon: '🏠',
    color: '#FFFBEB', // Warning Yellow shade
    description: 'Renting rooms, searching roommates, and host verification.',
  },
  {
    id: 'marketplace',
    group: 'living' as const,
    name: 'Marketplace',
    icon: '🛒',
    color: '#FEF4F2', // Accent Warm Coral shade
    description: 'Hyperlocal buying, selling safely, payments, and handovers.',
  },
  {
    id: 'trust-verification',
    group: 'trust' as const,
    name: 'Trust & Verification',
    icon: '🛡️',
    color: '#F0FDF4', // Success Green shade
    description: 'Identity verification, residency checks, and reputation scores.',
  },
  {
    id: 'creator-academy',
    group: 'learning' as const,
    name: 'Creator Academy',
    icon: '🎨',
    color: '#FDF2F8', // Pink tint
    description: 'Learn to write highly rated guides and grow followers.',
  },
  {
    id: 'safety-academy',
    group: 'learning' as const,
    name: 'Safety Academy',
    icon: '🔒',
    color: '#F8F9FC', // Light neutral
    description: 'Avoid marketplace scams, protect identity, and report abuse.',
  },
  // ── Added by the post-APK pass (§9, §10) ───────────────────────────────────
  //
  // The catalogue had stopped describing the product: Wallet, Grow, Analytics
  // and most of the creator ecosystem had shipped with nothing in Explore that
  // said they existed.
  //
  // §10's constraint governs every word below — *"do not promise backend
  // functionality that is not actually available"*. So these describe what a
  // member can see and do in the app today. Where a capability is still
  // simulated, the article says so rather than implying money moves.
  {
    id: 'community-life',
    group: 'community' as const,
    name: 'Community Life',
    icon: '🎉',
    color: '#FFF1F2',
    description: 'Events, organisations, membership, fundraising, volunteering and polls.',
  },
  {
    id: 'wallet',
    group: 'wallet' as const,
    name: 'Wallet & Rewards',
    icon: '👛',
    color: '#ECFDF5',
    description: 'Your balance, your transaction history, and turning contribution into rewards.',
  },
  {
    id: 'grow',
    group: 'grow' as const,
    name: 'Grow',
    icon: '📣',
    color: '#FFF7ED',
    description: 'Promotion, plans, featured placement and boosting — getting your listing seen.',
  },
  {
    id: 'analytics',
    group: 'analytics' as const,
    name: 'Analytics',
    icon: '📊',
    color: '#EEF2FF',
    description: 'Who is finding your work, what they do next, and how that changes over time.',
  },
  {
    id: 'creator-ecosystem',
    group: 'creators' as const,
    name: 'Creator Ecosystem',
    icon: '✍️',
    color: '#FAF5FF',
    description: 'Standing, milestones, challenges, rewards and earnings for people who publish.',
  },
];


export const mockReleaseAnnouncements: ReleaseAnnouncement[] = [
  {
    version: '2.0.0',
    releaseDate: 'July 2026',
    title: 'Introducing Community Life & Marketplace Safeties',
    description: 'We are excited to launch Phase 2G including Community Life tab, verified seller indicators, and safe handovers.',
    exploreTourId: 'marketplace',
    items: [
      {
        type: 'feature',
        title: 'Community Life Hub',
        description: 'Discover local cultural events, follow verified non-profits, and access shared community calendars.',
      },
      {
        type: 'feature',
        title: 'Verified Seller Filter',
        description: 'Filter listings in the Marketplace tab to display items only from residency-verified sellers.',
      },
      {
        type: 'improvement',
        title: 'Hyperlocal Proximity Calibration',
        description: 'We improved GPS background coordinates calculation on web/mobile for more accurate distances.',
      },
      {
        type: 'fix',
        title: 'Arabic Font Rendering in RTL',
        description: 'Resolved a bug where heading texts were overlapping when switching system layout to RTL direction.',
      },
    ],
  },
  {
    version: '1.8.0',
    releaseDate: 'May 2026',
    title: 'Creator Studio Launch',
    description: 'Track how many readers read your guides, view statistics, and review guide layouts.',
    exploreTourId: 'creator',
    items: [
      {
        type: 'feature',
        title: 'Creator dashboard insights',
        description: 'Visual graphs showing weekly views, bookmarks, and total helpful upvotes received.',
      },
      {
        type: 'feature',
        title: 'Draft templates',
        description: 'Get structured templates to write Bank setups, Medical guidelines, or Transit routes.',
      },
      {
        type: 'improvement',
        title: 'Emergency notification triggers',
        description: 'Urgent municipal safety updates now trigger push alerts immediately.',
      },
    ],
  },
  {
    version: '1.5.0',
    releaseDate: 'March 2026',
    title: 'Lifestyle Roommate Matches',
    description: 'Filter shared listings by common habits, diets, and work preferences.',
    exploreTourId: 'housing',
    items: [
      {
        type: 'feature',
        title: 'Housing compatibility check',
        description: 'Find apartments matching your remote schedule, quiet hours, smoking habits, and languages.',
      },
      {
        type: 'improvement',
        title: 'Verified landlord indicator',
        description: 'Look for host verification certificates confirming ownership registers.',
      },
    ],
  },
];
