import { Tutorial, TutorialCategory, ReleaseAnnouncement } from '@/types/explore';

export const mockTutorialCategories: TutorialCategory[] = [
  {
    id: 'getting-started',
    name: 'Getting Started',
    icon: '🚀',
    color: '#FFF8EB', // Primary Amber Palette shade
    description: 'Essential setup and tips for your first week in the community.',
  },
  {
    id: 'finding-services',
    name: 'Finding Services',
    icon: '🔍',
    color: '#E8F7F4', // Forest Teal shade
    description: 'How to discover, contact, and verify local service providers.',
  },
  {
    id: 'jobs',
    name: 'Jobs & Careers',
    icon: '💼',
    color: '#EFF6FF', // Info Blue shade
    description: 'Work permits, local CV writing, and direct job applications.',
  },
  {
    id: 'housing',
    name: 'Housing Finder',
    icon: '🏠',
    color: '#FFFBEB', // Warning Yellow shade
    description: 'Renting rooms, searching roommates, and host verification.',
  },
  {
    id: 'marketplace',
    name: 'Marketplace',
    icon: '🛒',
    color: '#FEF4F2', // Accent Warm Coral shade
    description: 'Hyperlocal buying, selling safely, payments, and handovers.',
  },
  {
    id: 'trust-verification',
    name: 'Trust & Verification',
    icon: '🛡️',
    color: '#F0FDF4', // Success Green shade
    description: 'Identity verification, residency checks, and reputation scores.',
  },
  {
    id: 'creator-academy',
    name: 'Creator Academy',
    icon: '🎨',
    color: '#FDF2F8', // Pink tint
    description: 'Learn to write highly rated guides and grow followers.',
  },
  {
    id: 'safety-academy',
    name: 'Safety Academy',
    icon: '🔒',
    color: '#F8F9FC', // Light neutral
    description: 'Avoid marketplace scams, protect identity, and report abuse.',
  },
];

export const mockTutorials: Tutorial[] = [
  {
    id: 'tut-1',
    title: 'Verify Your Country Residency Status',
    summary: 'A complete walkthrough on uploading utility bills or work permits to earn the Verified Resident badge.',
    categoryId: 'trust-verification',
    readingTimeMinutes: 4,
    difficulty: 'Intermediate',
    imageUrl: 'https://images.unsplash.com/photo-1544027993-37dbfe43562a?auto=format&fit=crop&w=400&q=80',
    relatedTourId: 'trust',
    steps: [
      {
        title: 'Gather Your Proof of Address',
        description: 'You will need a digital copy of a local utility bill, bank statement, or rental lease agreement showing your name and address.',
      },
      {
        title: 'Open the Trust & Safety Center',
        description: 'Navigate to your Profile tab and select the "Trust & Safety Center" panel.',
      },
      {
        title: 'Submit Resident Verification Documents',
        description: 'Click on Country Verification, select your target country, upload files, and click Submit. Verification takes 12-24 hours.',
      },
      {
        title: 'Discover What This Unlocks',
        description: 'Verified Residents receive a green badge, rank higher in directories, and satisfy guide publishing criteria.',
      },
    ],
  },
  {
    id: 'tut-2',
    title: 'How to Publish Your First Evergreen Guide',
    summary: 'Step-by-step guidance on writing local transit summaries, bank setup guides, or health insurance walkthroughs.',
    categoryId: 'creator-academy',
    readingTimeMinutes: 5,
    difficulty: 'Beginner',
    imageUrl: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=400&q=80',
    relatedTourId: 'creator',
    steps: [
      {
        title: 'Understand Evergreen Knowledge',
        description: 'We prioritize guides that remain useful over months (e.g. "Registering with a GP"). Avoid posting temporary updates here.',
      },
      {
        title: 'Navigate to Creator Studio',
        description: 'Ensure you satisfy residency requirements, then tap Creator Studio -> Create Guide.',
      },
      {
        title: 'Format for Readability',
        description: 'Use headers, lists, and bold text. Keep paragraphs short. Cite official government websites where applicable.',
      },
      {
        title: 'Publish and Engage',
        description: 'Review guidelines and submit. Once live, answer user questions in the comments to earn helpful votes.',
      },
    ],
  },
  {
    id: 'tut-3',
    title: 'Avoiding Marketplace Scams & Fake Sellers',
    summary: 'Essential safety rules to prevent loss of funds, check seller authenticity, and choose safe handover locations.',
    categoryId: 'safety-academy',
    readingTimeMinutes: 3,
    difficulty: 'Beginner',
    imageUrl: 'https://images.unsplash.com/photo-1557200134-90327ee9fafa?auto=format&fit=crop&w=400&q=80',
    relatedTourId: 'marketplace',
    steps: [
      {
        title: 'Check the Verification Shield',
        description: 'Always check if the seller is a Verified Resident. Non-verified accounts carry higher risk.',
      },
      {
        title: 'Insist on Safe Handovers',
        description: 'Never pay in advance via bank transfers. Meet in a public, well-lit place (e.g. outside a train station or coffee shop).',
      },
      {
        title: 'Inspect the Item First',
        description: 'Fully examine the goods (test electronics, check clothing seams) before transferring any cash.',
      },
      {
        title: 'Report Suspicious Activity',
        description: 'If a deal feels too good to be true, or the seller pressures you, tap "Report Listing" to alert our compliance team.',
      },
    ],
  },
  {
    id: 'tut-4',
    title: 'Finding Housing with Verified Hosts',
    summary: 'Learn how to filter sublets, verify landlord registrations, and find roommates matching your lifestyle.',
    categoryId: 'housing',
    readingTimeMinutes: 4,
    difficulty: 'Intermediate',
    imageUrl: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=400&q=80',
    relatedTourId: 'housing',
    steps: [
      {
        title: 'Apply the Verified Host Filter',
        description: 'In the housing finder, toggle "Verified Host Only". These landlords have submitted verified utility and ownership deeds.',
      },
      {
        title: 'Use Lifestyle Matching Filters',
        description: 'Toggle tags for Quiet Hours, Remote Work, Dietary Preferences, or Languages spoken to find compatible roommates.',
      },
      {
        title: 'Arrange a Video Viewing first',
        description: 'If you are abroad, request a live video tour of the property before making any payments.',
      },
      {
        title: 'Standard Deposit Protection',
        description: 'Ensure deposits are paid into government-approved protection schemes. Diaspora hosts are contractually required to use these.',
      },
    ],
  },
  {
    id: 'tut-5',
    title: 'Job Search Strategies for Newcomers',
    summary: 'A quick guide on how to filter listings by work visa sponsorship and read employer trust ratings.',
    categoryId: 'jobs',
    readingTimeMinutes: 3,
    difficulty: 'Beginner',
    imageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=400&q=80',
    relatedTourId: 'jobs',
    steps: [
      {
        title: 'Identify Sponsor Flag',
        description: 'Diaspora job cards display tags like "Visa Sponsor Available" or "Right to Work Required". Filter accordingly.',
      },
      {
        title: 'Read Employer Ratings',
        description: 'Check community reviews on employer profile pages to see feedback on pay schedules, workspace culture, and onboarding.',
      },
      {
        title: 'Optimize CV for the Destination',
        description: 'Different countries expect different CV formats. Refer to our Country Guides for CV templates.',
      },
    ],
  },
  {
    id: 'tut-6',
    title: 'Understanding the Diaspora Reputation System',
    summary: 'How helpful votes, content creation, and directory reviews dynamically build your community trust status.',
    categoryId: 'trust-verification',
    readingTimeMinutes: 3,
    difficulty: 'Intermediate',
    imageUrl: 'https://images.unsplash.com/photo-1507537297725-24a1c029d3ca?auto=format&fit=crop&w=400&q=80',
    steps: [
      {
        title: 'What are Reputation Points?',
        description: 'Points are country-specific. You earn them when users upvote your guides or reviews, and when your alerts are confirmed.',
      },
      {
        title: 'Unlock Privileges',
        description: 'Points unlock tiers: Resident, Active Contributor, Trusted Contributor, and finally Community Expert.',
      },
      {
        title: 'Governance Privileges',
        description: 'Trusted Contributor and above can verify community updates, moderate comments, and request Creator academy access.',
      },
    ],
  },
  {
    id: 'tut-7',
    title: 'Safe Meeting Locations for Marketplace Handovers',
    summary: 'A list of vetted, safe physical transaction points in major cities with active surveillance and lighting.',
    categoryId: 'safety-academy',
    readingTimeMinutes: 2,
    difficulty: 'Beginner',
    imageUrl: 'https://images.unsplash.com/photo-1473177104440-ffee2f376098?auto=format&fit=crop&w=400&q=80',
    steps: [
      {
        title: 'Public Transit Stations',
        description: 'Major transit hubs are highly monitored. Meet outside ticket gates near cameras.',
      },
      {
        title: 'Police Station Safe Zones',
        description: 'In many cities, police station parking lots are recommended zones for online classified transactions.',
      },
      {
        title: 'Daylight Only',
        description: 'Never meet sellers late at night. Schedule handovers during public business hours.',
      },
    ],
  },
  {
    id: 'tut-8',
    title: 'How to Check Provider Distance and Reviews',
    summary: 'Learn how our Proximity Engine checks service locations, opening statuses, and verified reviews.',
    categoryId: 'finding-services',
    readingTimeMinutes: 3,
    difficulty: 'Beginner',
    imageUrl: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=400&q=80',
    steps: [
      {
        title: 'Check Distance Indicators',
        description: 'Cards show "1.2 km away" calculated from your active neighborhood focus.',
      },
      {
        title: 'Verify Review Statuses',
        description: 'Look for "Verified Customer" labels on reviews to confirm the reviewer completed a transaction.',
      },
      {
        title: 'Store Operating Hours',
        description: 'Check operating schedules to ensure businesses are open. Red/green markers show real-time opening status.',
      },
    ],
  },
  {
    id: 'tut-9',
    title: 'Unlocking the Community Expert Badge',
    summary: 'An advanced guide for writers and contributors outlining the exact metrics and moderation standards.',
    categoryId: 'trust-verification',
    readingTimeMinutes: 5,
    difficulty: 'Advanced',
    imageUrl: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=400&q=80',
    steps: [
      {
        title: 'Score Milestone',
        description: 'Reach 1,000+ points in a single country community category to become eligible.',
      },
      {
        title: 'Publish 5 highly rated guides',
        description: 'Submit 5 guides with average rating above 4.5 stars and at least 30 helpful votes.',
      },
      {
        title: 'Verification Status',
        description: 'Must maintain a verified identity status and have zero active account violations or spam warnings.',
      },
    ],
  },
  {
    id: 'tut-10',
    title: 'Introduction to Hyperlocal Radius Filters',
    summary: 'A simple explanation of how to adjust your proximity diameter to see more listings.',
    categoryId: 'getting-started',
    readingTimeMinutes: 2,
    difficulty: 'Beginner',
    imageUrl: 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=400&q=80',
    relatedTourId: 'neighborhood',
    steps: [
      {
        title: 'Locate proximity settings',
        description: 'Tap the top location banner in the Discover tab to open radius configurations.',
      },
      {
        title: 'Drag to adjust',
        description: 'Set diameter: 2km for walking distance, 10km for city-wide transit, or 50km for suburban limits.',
      },
    ],
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
