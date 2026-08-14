import { Tutorial, TutorialCategory, ReleaseAnnouncement } from '@/types/explore';

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
  // -- Post-APK pass (§10, §12) -------------------------------------------
  //
  // Each of these answers §12's five questions in order: what is it, why does
  // it exist, who is it for, what can I do there, where do I find it. The last
  // step of every article is the "where", because that is the one a member
  // comes back for.
  //
  // §10's constraint governs every word: do not promise backend functionality
  // that is not actually available. Where a capability is still simulated, the
  // article says so rather than implying money moves.
  //
  // No internal vocabulary: no "entitlement", no "gap register", no "adapter".
  {
    id: 'tut-wallet-1',
    title: 'Your Wallet, and what it is for',
    summary: 'Where your balance lives, what the transaction list is telling you, and what you can spend on.',
    categoryId: 'wallet',
    readingTimeMinutes: 4,
    difficulty: 'Beginner',
    steps: [
      {
        title: 'What the Wallet is',
        description: 'One place for the money side of Diaspora: what you hold, what you have spent, and what you have been rewarded. It exists so that paying for a promotion, donating to a fundraiser and receiving a reward are not three separate systems you have to keep track of.',
      },
      {
        title: 'Your balance',
        description: 'The figure at the top is what is available to you now. Anything still settling is shown separately, so a pending amount never quietly counts as spendable.',
      },
      {
        title: 'Your transactions',
        description: 'Every movement in and out, newest first. Open any one of them for the full record - what it was for, when it happened, and a reference you can quote if you need to ask about it.',
      },
      {
        title: 'Rewards, and turning them into balance',
        description: 'Contributing to the community earns points: publishing guides people find helpful, volunteering, answering questions. Rewards shows what you have earned and what converting them would give you.',
      },
      {
        title: 'What you can do with it',
        description: 'Pay for a promotion or a plan, donate to a community fundraiser, or contribute to a campaign. Adding money and withdrawing are built and visible, but Diaspora is not yet connected to a live payment provider - so treat those two as a preview of how they will work.',
      },
      {
        title: 'Where to find it',
        description: 'Profile, then Wallet. Statements, receipts and your purchase history are all in the same place.',
      },
    ],
  },
  {
    id: 'tut-grow-1',
    title: 'Grow: getting your listing seen',
    summary: 'Promotion, plans, featured placement and boosting - what each one does and who it is for.',
    categoryId: 'grow',
    readingTimeMinutes: 5,
    difficulty: 'Intermediate',
    steps: [
      {
        title: 'What Grow is',
        description: 'The part of Diaspora for people who need to be found. A room to let, a service you offer, a role you are hiring for, an event you are running - Grow is how you put it in front of more of the right people.',
      },
      {
        title: 'Who it is for',
        description: 'Anyone with something to offer. Landlords, sellers, service providers, employers, organisations running events, and creators who want their guides read more widely. You do not need a business to use it.',
      },
      {
        title: 'What you can promote',
        description: 'Jobs you have posted, properties you have listed, marketplace items, your service profile, events you are running, organisations you manage, and guides or updates you have published.',
      },
      {
        title: 'Promotions and boosting',
        description: 'A promotion puts one specific thing in front of more people for a set period. You choose what, for how long, and where - near you, across a city, or across a community.',
      },
      {
        title: 'Plans and featured placement',
        description: 'A plan is the ongoing version: instead of promoting one listing at a time, a plan carries benefits across everything you post, including featured placement in the directories people browse.',
      },
      {
        title: 'What it costs, honestly',
        description: 'Plans and promotions have prices attached and you can see all of them before committing to anything. Payment is not yet connected to a live provider, so you can plan and price a campaign now and complete the purchase when that is switched on.',
      },
      {
        title: 'Where to find it',
        description: 'Profile, then Grow. Promote is also on each thing you own - open a listing you posted and the option is there.',
      },
    ],
  },
  {
    id: 'tut-analytics-1',
    title: 'Analytics: what the numbers actually tell you',
    summary: 'Who is finding your work, what they do next, and how to read it without a background in data.',
    categoryId: 'analytics',
    readingTimeMinutes: 5,
    difficulty: 'Intermediate',
    steps: [
      {
        title: 'What Analytics is',
        description: 'A read on how what you have put into Diaspora is doing. Views, saves, enquiries, applications - the things that happened after somebody found you.',
      },
      {
        title: 'Why it exists',
        description: 'So that "is this working?" has an answer other than a guess. If a listing gets seen a hundred times and enquired about never, that is a different problem from one nobody sees at all - and the fix is different too.',
      },
      {
        title: 'Who it is for',
        description: 'Anyone who publishes or lists. There are views built for creators, for employers, for landlords, for sellers, for service providers and for people running an organisation - each showing the measures that make sense for what they do.',
      },
      {
        title: 'What you can look at',
        description: 'How your reach has changed over time, which places your audience is in, what people did after finding you, and which of your items are doing the work. Every figure names the period it covers.',
      },
      {
        title: 'A word on where the numbers come from',
        description: 'Analytics is fed by a development data source in this build, so treat the figures as a demonstration of the shape rather than a record of real activity. The definitions page explains exactly what each measure counts.',
      },
      {
        title: 'Where to find it',
        description: 'Profile, then Analytics. Creator-specific figures also sit inside the Creator area.',
      },
    ],
  },
  {
    id: 'tut-creator-eco-1',
    title: 'The creator ecosystem, end to end',
    summary: 'Becoming a creator, what you can publish, how standing works, and what you can earn.',
    categoryId: 'creator-ecosystem',
    readingTimeMinutes: 6,
    difficulty: 'Beginner',
    relatedTourId: 'creator',
    steps: [
      {
        title: 'How you become a creator',
        description: 'By publishing something. There is no application: write a guide, post a community update, and you are in. Some things - publishing to a wider audience, for instance - open up once your account is verified.',
      },
      {
        title: 'What you can publish',
        description: 'Evergreen guides for people arriving where you already live, updates about what is happening now, and answers to questions others have asked. Guides are the ones that keep helping people long after you write them.',
      },
      {
        title: 'How standing works',
        description: 'Your standing reflects what your work has done for other people - how many found it useful, not how much you published. It is why one genuinely helpful guide outranks ten thin ones.',
      },
      {
        title: 'Milestones and challenges',
        description: 'Milestones mark what you have already achieved and some can be claimed for a reward. Challenges are open invitations - a subject the community currently needs covered, with something attached for covering it.',
      },
      {
        title: 'What you can earn',
        description: 'Points for contribution, which convert in your Wallet. Some guides also qualify for grants or sponsorship. Your revenue view shows what has been attributed to you and where it came from.',
      },
      {
        title: 'Where to learn',
        description: 'The Creator Academy has courses and lessons on writing guides that get read - structure, what to include, and the mistakes that make a guide age badly.',
      },
      {
        title: 'Tracking your own activity',
        description: 'The Creator dashboard brings the lot together: your standing, the last thirty days of performance, what to do next, and everything you have published.',
      },
      {
        title: 'Where to find it',
        description: 'Profile, then Creator. Your published work is under Content; the Academy, milestones, challenges and rewards each have their own section.',
      },
    ],
  },
  {
    id: 'tut-community-life-1',
    title: 'Community Life: events, groups and getting involved',
    summary: 'What is on near you, which organisations to follow, and the ways to take part.',
    categoryId: 'community-life',
    readingTimeMinutes: 4,
    difficulty: 'Beginner',
    relatedTourId: 'community-life',
    steps: [
      {
        title: 'What Community Life is',
        description: 'What is actually happening around you - weddings and naming ceremonies, church and mosque programmes, career fairs, football, festivals, language exchanges. Plus the organisations behind them.',
      },
      {
        title: 'Finding something on',
        description: 'Search events near you and narrow by how far you are willing to travel, when you are free, and what kind of thing you are after. Save anything you might go to.',
      },
      {
        title: 'The directory',
        description: 'Churches, mosques, associations, embassies, student and professional bodies, community centres, clubs. Follow one and its updates reach you without you having to check.',
      },
      {
        title: 'Your calendar',
        description: 'Everything you have saved or registered for, in one place, with your own reminders alongside.',
      },
      {
        title: 'Taking part more seriously',
        description: 'Beyond attending: join a community as a member, give to a fundraiser, volunteer for something that needs hands, or vote in a poll your community is running. Those sit along the top of the Community Life page.',
      },
      {
        title: 'Where to find it',
        description: 'Discover, then Community - or the Community Life shortcut on your Home screen.',
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
