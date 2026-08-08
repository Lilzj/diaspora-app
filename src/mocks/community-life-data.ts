import type { Event, CommunityOrganization, Holiday } from '@/types/community-life';

// Mock Organizations list
export const mockOrganizations: CommunityOrganization[] = [
  {
    id: 'org-1',
    name: 'Peckham Fellowship Church',
    logo: 'https://images.unsplash.com/photo-1548625361-155deee2614a?w=120',
    coverImage: 'https://images.unsplash.com/photo-1438032005730-c779502df39b?w=600',
    category: 'Churches',
    description: 'A welcoming diaspora church community based in South London, supporting members with weekly services, networking, and cultural adaptation support.',
    mission: 'To build a strong spiritual home and peer support network for the West African diaspora in London.',
    services: [
      'Weekly Sunday Service (10:00 - 12:30)',
      'Mid-week Bible Study & Fellowship',
      'Youth Mentorship Program',
      'Welfare & Newcomer Orientation Services',
      'Marriage & Naming Ceremony Officiations'
    ],
    location: {
      cityName: 'London',
      areaName: 'Peckham',
      addressLine: '128 Rye Lane, Peckham, SE15 4RZ',
      latitude: 51.468,
      longitude: -0.067,
      distanceKm: 0.8
    },
    contact: {
      phone: '+44 7700 900321',
      whatsapp: '+44 7700 900321',
      email: 'fellowship@peckhamchurch.org.uk',
      website: 'https://peckhamfellowshipchurch.org.uk',
      facebook: 'https://facebook.com/peckhamfellowship',
      instagram: 'https://instagram.com/peckhamfellowship'
    },
    openingHours: [
      { day: 'Monday - Friday', hours: '09:00 - 17:00' },
      { day: 'Saturday', hours: '10:00 - 15:00' },
      { day: 'Sunday', hours: '08:00 - 14:00' }
    ],
    isVerified: true,
    rating: 4.8,
    reputationLevel: 'TrustedCommunityHub',
    followersCount: 342,
    isFollowing: true,
    leaders: [
      { name: 'Pastor Koffi Mensah', role: 'Senior Pastor', avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100' },
      { name: 'Deaconess Aminata Diallo', role: 'Welfare Director', avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100' }
    ],
    gallery: [
      'https://images.unsplash.com/photo-1548625361-155deee2614a?w=400',
      'https://images.unsplash.com/photo-1438032005730-c779502df39b?w=400',
      'https://images.unsplash.com/photo-1478147427282-58a87a120781?w=400'
    ],
    createdAt: '2025-01-15T12:00:00Z'
  },
  {
    id: 'org-2',
    name: 'Ghanaian Students & Professionals Association (GSPA)',
    logo: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=120',
    coverImage: 'https://images.unsplash.com/photo-1529070538774-1843cb3265df?w=600',
    category: 'Student Associations',
    description: 'Empowering Ghanaian students and young professionals across London through academic assistance, career mentorship, and networking opportunities.',
    mission: 'To build a professional pathway and social network for Ghanaian students studying abroad.',
    services: [
      'CV & Resume Workshops',
      'Corporate Mentorship Matchmaking',
      'Student Visa Guideline Sessions',
      'Monthly Career Panels',
      'Social Mixers & Networking Dinners'
    ],
    location: {
      cityName: 'London',
      areaName: 'Bloomsbury',
      addressLine: 'University of London Senate House, WC1E 7HU',
      latitude: 51.521,
      longitude: -0.129,
      distanceKm: 2.5
    },
    contact: {
      phone: '+44 7700 900543',
      whatsapp: '+44 7700 900543',
      email: 'info@gspa-london.org',
      website: 'https://gspa-london.org',
      twitter: 'https://twitter.com/gspa_london',
      youtube: 'https://youtube.com/gspa_london'
    },
    openingHours: [
      { day: 'Monday - Friday', hours: '10:00 - 18:00' },
      { day: 'Saturday - Sunday', hours: 'Closed' }
    ],
    isVerified: true,
    rating: 4.7,
    reputationLevel: 'ProfessionalAssociation',
    followersCount: 510,
    isFollowing: false,
    leaders: [
      { name: 'Dr. Kwame Agyei', role: 'President / Co-founder', avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100' },
      { name: 'Abena Osei', role: 'Student Relations Lead', avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100' }
    ],
    gallery: [
      'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=400',
      'https://images.unsplash.com/photo-1529070538774-1843cb3265df?w=400'
    ],
    createdAt: '2024-09-10T12:00:00Z'
  },
  {
    id: 'org-3',
    name: 'East London Nigerian Union',
    logo: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=120',
    coverImage: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=600',
    category: 'Associations',
    description: 'Connecting Nigerian families and businesses in East London, celebrating national culture, and organizing welfare programs for new arrivals.',
    mission: 'Promoting unity, welfare, and cultural integration for Nigerians in London.',
    services: [
      'Immigration & Legal Advice Clinics',
      'Language Classes (Yoruba, Igbo, Hausa)',
      'Community Welfare Fund Administration',
      'Annual Cultural Carnival',
      'Business Directory Promotion'
    ],
    location: {
      cityName: 'London',
      areaName: 'Stratford',
      addressLine: 'Stratford Community Center, E15 4EG',
      latitude: 51.542,
      longitude: 0.003,
      distanceKm: 4.2
    },
    contact: {
      phone: '+44 7700 900657',
      whatsapp: '+44 7700 900657',
      email: 'contact@elnu.org.uk',
      website: 'https://elnu.org.uk'
    },
    openingHours: [
      { day: 'Tuesday & Thursday', hours: '12:00 - 18:00' },
      { day: 'Saturday', hours: '11:00 - 16:00' },
      { day: 'Monday, Wednesday, Friday, Sunday', hours: 'Closed' }
    ],
    isVerified: true,
    rating: 4.6,
    reputationLevel: 'UnionHub',
    followersCount: 289,
    isFollowing: false,
    leaders: [
      { name: 'Chief Olumide Awosika', role: 'Union Chairman', avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100' }
    ],
    gallery: [
      'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=400'
    ],
    createdAt: '2023-05-20T12:00:00Z'
  },
  {
    id: 'org-4',
    name: 'Diaspora Legal Consultants',
    logo: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=120',
    coverImage: 'https://images.unsplash.com/photo-1505664194779-8beaceb93744?w=600',
    category: 'Lawyers',
    description: 'Expert legal consulting specialized in immigration, visas, employment disputes, tenancy issues, and business startup legalities for the diaspora community.',
    mission: 'Providing accessible, top-quality legal guidance to diaspora residents.',
    services: [
      'Immigration & Visa Applications',
      'BRP Card Issues & Appeals',
      'Tenant Right Consultations',
      'Employment Contract Reviews',
      'Business Setup Legal Audits'
    ],
    location: {
      cityName: 'London',
      areaName: 'Brixton',
      addressLine: 'Office 4A, Brixton Arcade, SW9 8PR',
      latitude: 51.462,
      longitude: -0.114,
      distanceKm: 3.1
    },
    contact: {
      phone: '+44 20 7946 0987',
      whatsapp: '+44 7700 900876',
      email: 'consult@diasporalegal.co.uk',
      website: 'https://diasporalegal.co.uk'
    },
    openingHours: [
      { day: 'Monday - Friday', hours: '09:00 - 17:30' },
      { day: 'Saturday - Sunday', hours: 'Closed' }
    ],
    isVerified: true,
    rating: 4.9,
    reputationLevel: 'TrustedProfessional',
    followersCount: 195,
    isFollowing: false,
    leaders: [
      { name: 'Barrister Sarah Okonjo', role: 'Managing Partner', avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100' }
    ],
    gallery: [],
    createdAt: '2024-03-01T12:00:00Z'
  },
  {
    id: 'org-5',
    name: 'Diaspora Tax Advisors',
    logo: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=120',
    coverImage: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=600',
    category: 'Accountants',
    description: 'Specialized accounting, tax filing, double taxation relief audits, and corporate tax structuring consultants servicing West African and European diaspora businesses.',
    mission: 'Empowering diaspora entrepreneurs with compliant financial advice.',
    services: [
      'Self-assessment Tax Returns',
      'Double Taxation Relief Audits',
      'Corporate Accounting Setups',
      'Bookkeeping Training'
    ],
    location: {
      cityName: 'London',
      areaName: 'Hackney',
      addressLine: 'Suite 12, Tech Hub East, EC1A 2FR',
      latitude: 51.528,
      longitude: -0.086,
      distanceKm: 1.9
    },
    contact: {
      phone: '+44 7700 900222',
      email: 'taxes@diasporatax.co.uk',
      website: 'https://diasporatax.co.uk'
    },
    openingHours: [
      { day: 'Monday - Friday', hours: '09:00 - 17:00' },
      { day: 'Saturday - Sunday', hours: 'Closed' }
    ],
    isVerified: true,
    rating: 4.8,
    reputationLevel: 'TrustedProfessional',
    followersCount: 112,
    isFollowing: false,
    leaders: [],
    gallery: [],
    createdAt: '2025-05-10T12:00:00Z'
  },
  {
    id: 'org-6',
    name: 'Visa Link Consultancy',
    logo: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=120',
    coverImage: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=600',
    category: 'Immigration Consultants',
    description: 'Respected visa and immigration consultants facilitating BRP card renewals, student visa extensions, and spouse sponsorship application support.',
    mission: 'Providing transparent immigration assistance for hassle-free relocations.',
    services: [
      'Student Visa Extensions',
      'BRP Card Renewal Support',
      'Sponsorship Consultation'
    ],
    location: {
      cityName: 'London',
      areaName: 'Lewisham',
      addressLine: '14 Lewisham High St, SE13 5EH',
      latitude: 51.462,
      longitude: -0.011,
      distanceKm: 4.8
    },
    contact: {
      phone: '+44 7700 900333',
      whatsapp: '+44 7700 900333',
      email: 'apply@visalinkconsultancy.com'
    },
    openingHours: [
      { day: 'Monday - Friday', hours: '09:00 - 18:00' },
      { day: 'Saturday', hours: '10:00 - 14:00' }
    ],
    isVerified: true,
    rating: 4.6,
    reputationLevel: 'TrustedConsultant',
    followersCount: 88,
    isFollowing: false,
    leaders: [],
    gallery: [],
    createdAt: '2025-08-01T12:00:00Z'
  },
  {
    id: 'org-7',
    name: 'Mama Africa Kitchen',
    logo: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=120',
    coverImage: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600',
    category: 'Restaurants',
    description: 'Renowned local restaurant serving authentic Nigerian and West African cuisines, catering to weddings and community celebrations across London.',
    mission: 'Delivering home-cooked flavor to the diaspora.',
    services: [
      'Dine-in & Takeaway African Cuisines',
      'Wedding & Naming Ceremony Catering',
      'Bulk Jollof & Soup Orders'
    ],
    location: {
      cityName: 'London',
      areaName: 'Peckham',
      addressLine: '34 Peckham High St, SE15 5DT',
      latitude: 51.472,
      longitude: -0.068,
      distanceKm: 0.6
    },
    contact: {
      phone: '+44 20 7946 0111',
      whatsapp: '+44 7700 900444',
      email: 'order@mamaafricakitchen.co.uk'
    },
    openingHours: [
      { day: 'Monday - Sunday', hours: '11:00 - 23:00' }
    ],
    isVerified: true,
    rating: 4.9,
    reputationLevel: 'LocalGuidesFavour',
    followersCount: 654,
    isFollowing: false,
    leaders: [],
    gallery: [
      'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400'
    ],
    createdAt: '2023-01-01T12:00:00Z'
  },
  {
    id: 'org-8',
    name: 'Rose Hill Community Centre',
    logo: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=120',
    coverImage: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=600',
    category: 'Community Centres',
    description: 'A vibrant hub for community events, educational programs, and cultural celebrations in the center of Rose Hill.',
    mission: 'Serving the local residents and visitors with space, support, and resources for community life.',
    services: [
      'Community Hall Rentals',
      'Local Language and Creole Classes',
      'Seniors Support Program',
      'Youth Indoor Sports Leagues'
    ],
    location: {
      cityName: 'Rose Hill',
      areaName: 'Rose Hill Central',
      addressLine: 'Royaume Road, Rose Hill',
      latitude: -20.2417,
      longitude: 57.4806,
      distanceKm: 0.1
    },
    contact: {
      phone: '+230 460 1234',
      email: 'info@rosehillcentre.mu',
      website: 'https://rosehillcentre.mu'
    },
    openingHours: [
      { day: 'Monday - Saturday', hours: '08:00 - 20:00' },
      { day: 'Sunday', hours: '09:00 - 13:00' }
    ],
    isVerified: true,
    rating: 4.7,
    reputationLevel: 'TrustedCommunityHub',
    followersCount: 184,
    isFollowing: false,
    leaders: [],
    gallery: [],
    createdAt: '2024-05-10T12:00:00Z'
  }
];

// Mock Events List
// Current Date is assumed to be 2026-07-13 (Monday)
export const mockEvents: Event[] = [
  {
    id: 'evt-1',
    title: 'Brixton Afro-Caribbean Food Festival',
    description: 'Join us for a vibrant weekend celebration of Afro-Caribbean food, music, and crafts. Over 40 food stalls featuring Jollof Rice, Jerk Chicken, Puff Puff, Plantains, Suya, and more. Live performances by local diaspora DJs and afrobeat artists.',
    coverImage: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600',
    gallery: [
      'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600',
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600',
      'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=600'
    ],
    category: 'Food Festival',
    date: '2026-07-18', // Saturday (This Weekend)
    time: '12:00',
    endTime: '20:00',
    timezone: 'BST',
    location: {
      cityName: 'London',
      areaName: 'Brixton',
      addressLine: 'Windrush Square, Brixton, SW2 1EF',
      landmark: 'Opposite Ritzy Cinema',
      latitude: 51.461,
      longitude: -0.115,
      distanceKm: 2.9
    },
    price: 0, // Free
    currency: 'GBP',
    host: {
      id: 'org-3',
      name: 'East London Nigerian Union',
      avatarUrl: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=100',
      type: 'Organization',
      isVerified: true
    },
    agenda: [
      { id: 'ag-1', time: '12:00 - 13:00', title: 'Gates Open & Food Stall Tastings', description: 'Explore over 40 food booths and enjoy early bird samples.' },
      { id: 'ag-2', time: '14:00 - 16:30', title: 'Jollof Cooking Showcase', description: 'Chef panel with representatives from Nigeria, Ghana, and Senegal.' },
      { id: 'ag-3', time: '17:00 - 20:00', title: 'Afrobeat DJ Set & Dance-off', description: 'Live mixing from DJ Kemmy and cultural dance performances.' }
    ],
    contact: {
      phone: '+44 7700 900657',
      whatsapp: '+44 7700 900657',
      email: 'events@elnu.org.uk',
      website: 'https://elnu.org.uk/foodfest'
    },
    rsvpStatus: 'Going',
    isSaved: true,
    viewCount: 1420,
    shareCount: 230,
    saveCount: 180,
    createdAt: '2026-06-10T09:00:00Z'
  },
  {
    id: 'evt-2',
    title: 'Diaspora Tech & Business Networking Mixer',
    description: 'An evening of high-impact networking for founders, developers, creative professionals, and investors within the African and Caribbean diaspora in London. Exchange ideas, find co-founders, and build connections.',
    coverImage: 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=600',
    gallery: [
      'https://images.unsplash.com/photo-1511578314322-379afb476865?w=600',
      'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600'
    ],
    category: 'Networking',
    date: '2026-07-13', // Today (Monday)
    time: '18:30',
    endTime: '21:30',
    timezone: 'BST',
    location: {
      cityName: 'London',
      areaName: 'Bloomsbury',
      addressLine: 'Senate House Malet Street, WC1E 7HU',
      landmark: 'Room 302',
      latitude: 51.521,
      longitude: -0.129,
      distanceKm: 2.1
    },
    price: 15,
    currency: 'GBP',
    host: {
      id: 'org-2',
      name: 'Ghanaian Students & Professionals Association (GSPA)',
      avatarUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=100',
      type: 'Organization',
      isVerified: true
    },
    agenda: [
      { id: 'ag-4', time: '18:30 - 19:00', title: 'Welcome Drinks & Name-tags', description: 'Icebreaker conversations and registration.' },
      { id: 'ag-5', time: '19:00 - 19:45', title: 'Fireside Chat: Funding Your Startup in Europe', description: 'Discussion with diaspora venture capitalists.' },
      { id: 'ag-6', time: '19:45 - 21:30', title: 'Open Floor Networking', description: 'Breakout groups by industry (Fintech, Healthtech, Creative).' }
    ],
    contact: {
      phone: '+44 7700 900543',
      email: 'networking@gspa-london.org',
      website: 'https://gspa-london.org/events/mixer'
    },
    rsvpStatus: null,
    isSaved: false,
    viewCount: 680,
    shareCount: 84,
    saveCount: 32,
    createdAt: '2026-06-25T14:00:00Z'
  },
  {
    id: 'evt-3',
    title: 'Weekly Sunday Fellowship & Praise Celebration',
    description: 'Join us for a dynamic service of praise, worship, and inspiring teachings. We have a special welcoming session and lunch reception for newcomers and students who arrived in London this month.',
    coverImage: 'https://images.unsplash.com/photo-1478147427282-58a87a120781?w=600',
    gallery: [
      'https://images.unsplash.com/photo-1478147427282-58a87a120781?w=600'
    ],
    category: 'Church Program',
    date: '2026-07-19', // Sunday (This Weekend)
    time: '10:00',
    endTime: '12:30',
    timezone: 'BST',
    location: {
      cityName: 'London',
      areaName: 'Peckham',
      addressLine: '128 Rye Lane, Peckham, SE15 4RZ',
      landmark: 'Next to Peckham Rye Station',
      latitude: 51.468,
      longitude: -0.067,
      distanceKm: 0.8
    },
    price: 0, // Free
    currency: 'GBP',
    host: {
      id: 'org-1',
      name: 'Peckham Fellowship Church',
      avatarUrl: 'https://images.unsplash.com/photo-1548625361-155deee2614a?w=100',
      type: 'Organization',
      isVerified: true
    },
    agenda: [
      { id: 'ag-7', time: '10:00 - 10:30', title: 'Praise & Worship Session', description: 'Joyful music led by the Peckham Fellowship Choir.' },
      { id: 'ag-8', time: '10:30 - 11:45', title: 'Sermon & Testimonies', description: 'Inspirational word on navigating diaspora challenges with hope.' },
      { id: 'ag-9', time: '11:45 - 12:30', title: 'Newcomer Welcome & Social Lunch', description: 'Free buffet lunch and networking in the main hall.' }
    ],
    contact: {
      phone: '+44 7700 900321',
      whatsapp: '+44 7700 900321',
      email: 'fellowship@peckhamchurch.org.uk'
    },
    rsvpStatus: 'Interested',
    isSaved: true,
    viewCount: 420,
    shareCount: 45,
    saveCount: 94,
    createdAt: '2026-07-01T08:00:00Z'
  },
  {
    id: 'evt-4',
    title: 'Immigration Q&A and Legal Advice Clinic',
    description: 'Struggling with student visa extensions, BRP card issues, or family reunion sponsorship? Meet with top-tier immigration lawyers and legal consultants for free 15-minute consultations.',
    coverImage: 'https://images.unsplash.com/photo-1505664194779-8beaceb93744?w=600',
    gallery: [
      'https://images.unsplash.com/photo-1505664194779-8beaceb93744?w=600'
    ],
    category: 'Workshop',
    date: '2026-07-14', // Tomorrow (Tuesday)
    time: '14:00',
    endTime: '17:00',
    timezone: 'BST',
    location: {
      cityName: 'London',
      areaName: 'Brixton',
      addressLine: 'Office 4A, Brixton Arcade, SW9 8PR',
      landmark: 'Next to Market entrance',
      latitude: 51.462,
      longitude: -0.114,
      distanceKm: 3.1
    },
    price: 0, // Free
    currency: 'GBP',
    host: {
      id: 'org-4',
      name: 'Diaspora Legal Consultants',
      avatarUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=100',
      type: 'Organization',
      isVerified: true
    },
    agenda: [
      { id: 'ag-10', time: '14:00 - 14:30', title: 'Overview: Key Visa Policy Updates in 2026', description: 'Brief briefing on recent changes to BRP guidelines.' },
      { id: 'ag-11', time: '14:30 - 17:00', title: '1-on-1 Legal Advice Consultations', description: 'Private slots on a first-come, first-served basis.' }
    ],
    contact: {
      phone: '+44 20 7946 0987',
      email: 'consult@diasporalegal.co.uk'
    },
    rsvpStatus: null,
    isSaved: false,
    viewCount: 890,
    shareCount: 145,
    saveCount: 112,
    createdAt: '2026-07-05T11:00:00Z'
  },
  {
    id: 'evt-5',
    title: 'Annual Afro-Jazz Concert: Live in London',
    description: 'An acoustic night of live afro-jazz, fusion beats, and spoken word poetry. Headlined by internationally acclaimed artist Femi Kuti Jr. and local guest musicians.',
    coverImage: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600',
    gallery: [
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600',
      'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600'
    ],
    category: 'Concert',
    date: '2026-07-25', // Next week (Saturday)
    time: '19:00',
    endTime: '23:00',
    timezone: 'BST',
    location: {
      cityName: 'London',
      areaName: 'Camden Town',
      addressLine: 'The Jazz Cafe, 5 Parkway, NW1 7PG',
      latitude: 51.539,
      longitude: -0.142,
      distanceKm: 5.6
    },
    price: 35,
    currency: 'GBP',
    host: {
      id: 'org-3',
      name: 'East London Nigerian Union',
      avatarUrl: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=100',
      type: 'Organization',
      isVerified: true
    },
    rsvpStatus: null,
    isSaved: false,
    viewCount: 1980,
    shareCount: 420,
    saveCount: 210,
    createdAt: '2026-05-15T10:00:00Z'
  },
  {
    id: 'evt-6',
    title: 'South London Diaspora Basketball Tournament',
    description: 'The annual 3-on-3 basketball tournament bringing together youth, students, and local sports clubs from West African and Caribbean diaspora groups. Come play, cheer, and network!',
    coverImage: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=600',
    gallery: ['https://images.unsplash.com/photo-1546519638-68e109498ffc?w=600'],
    category: 'Basketball',
    date: '2026-07-18', // Saturday (This Weekend)
    time: '10:00',
    endTime: '17:00',
    timezone: 'BST',
    location: {
      cityName: 'London',
      areaName: 'Lewisham',
      addressLine: 'Lewisham Sports Centre, SE13 6LH',
      latitude: 51.461,
      longitude: -0.013,
      distanceKm: 4.5
    },
    price: 0,
    currency: 'GBP',
    host: {
      id: 'org-2',
      name: 'Ghanaian Students & Professionals Association (GSPA)',
      avatarUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=100',
      type: 'Organization',
      isVerified: true
    },
    rsvpStatus: null,
    isSaved: false,
    viewCount: 520,
    shareCount: 65,
    saveCount: 30,
    createdAt: '2026-07-05T09:00:00Z'
  },
  {
    id: 'evt-7',
    title: 'Nigeria Independence Picnic & Barbecue',
    description: 'An outdoor family picnic and networking barbecue to celebrate national independence. Enjoy authentic dishes, kid-friendly activities, and community updates.',
    coverImage: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600',
    gallery: ['https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600'],
    category: 'Independence Celebration',
    date: '2026-07-19', // Sunday (This Weekend)
    time: '13:00',
    endTime: '19:00',
    timezone: 'BST',
    location: {
      cityName: 'London',
      areaName: 'Greenwich',
      addressLine: 'Greenwich Park, SE10 8QY',
      latitude: 51.476,
      longitude: 0.000,
      distanceKm: 3.8
    },
    price: 0,
    currency: 'GBP',
    host: {
      id: 'org-3',
      name: 'East London Nigerian Union',
      avatarUrl: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=100',
      type: 'Organization',
      isVerified: true
    },
    rsvpStatus: null,
    isSaved: false,
    viewCount: 780,
    shareCount: 112,
    saveCount: 65,
    createdAt: '2026-07-02T10:00:00Z'
  },
  {
    id: 'evt-8',
    title: 'Adewale Family Naming Ceremony',
    description: 'We joyfully invite the Peckham Fellowship Church and community members to celebrate the naming ceremony of our newborn baby girl, Ifeoluwa.',
    coverImage: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600',
    gallery: [],
    category: 'Naming Ceremony',
    date: '2026-07-14', // Tomorrow (Tuesday)
    time: '11:00',
    endTime: '14:00',
    timezone: 'BST',
    location: {
      cityName: 'London',
      areaName: 'Peckham',
      addressLine: 'Community Hall, 128 Rye Lane, Peckham, SE15 4RZ',
      latitude: 51.468,
      longitude: -0.067,
      distanceKm: 0.8
    },
    price: 0,
    currency: 'GBP',
    host: {
      id: 'org-1',
      name: 'Peckham Fellowship Church',
      avatarUrl: 'https://images.unsplash.com/photo-1548625361-155deee2614a?w=100',
      type: 'Organization',
      isVerified: true
    },
    rsvpStatus: 'Going',
    isSaved: false,
    viewCount: 310,
    shareCount: 22,
    saveCount: 15,
    createdAt: '2026-07-10T12:00:00Z'
  },
  {
    id: 'evt-9',
    title: 'Hackney Community Garden Clean-up',
    description: 'A community volunteer activity to tidy up our local Hackney community allotments. Bring gardening gloves, seeds, and smiles! Coffee and puff-puff provided.',
    coverImage: 'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=600',
    gallery: [],
    category: 'Volunteer Activity',
    date: '2026-07-15', // Wednesday
    time: '09:30',
    endTime: '13:00',
    timezone: 'BST',
    location: {
      cityName: 'London',
      areaName: 'Hackney',
      addressLine: 'London Fields Allotments, Hackney, E8 3EU',
      latitude: 51.541,
      longitude: -0.060,
      distanceKm: 2.2
    },
    price: 0,
    currency: 'GBP',
    host: {
      id: 'user-123',
      name: 'Joshua (You)',
      type: 'User',
      isVerified: false
    },
    rsvpStatus: null,
    isSaved: false,
    viewCount: 190,
    shareCount: 15,
    saveCount: 8,
    createdAt: '2026-07-12T14:30:00Z'
  },
  {
    id: 'evt-10',
    title: 'Quatre Bornes Street Food Festival',
    description: 'Come taste the best local street foods of Mauritius! From hot dholl puri and roti to mine frit and samoussas. Live sega music and dance performances starting in the afternoon.',
    coverImage: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600',
    gallery: [],
    category: 'Food Festival',
    date: '2026-07-20',
    time: '11:00',
    endTime: '18:00',
    timezone: 'MUT',
    location: {
      cityName: 'Quatre Bornes',
      areaName: 'Quatre Bornes Center',
      addressLine: 'St Jean Road, Quatre Bornes',
      latitude: -20.2644,
      longitude: 57.4786,
      distanceKm: 2.5
    },
    price: 0,
    currency: 'MUR',
    host: {
      id: 'org-8',
      name: 'Rose Hill Community Centre',
      avatarUrl: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=100',
      type: 'Organization',
      isVerified: true
    },
    rsvpStatus: null,
    isSaved: false,
    viewCount: 310,
    shareCount: 45,
    saveCount: 22,
    createdAt: '2026-07-05T09:00:00Z'
  }
];

// Mock Holidays
export const mockHolidays: Holiday[] = [
  {
    id: 'hol-1',
    name: 'Summer Bank Holiday',
    date: '2026-08-31',
    type: 'National',
    countryCode: 'GB',
    description: 'National public holiday in the United Kingdom.'
  },
  {
    id: 'hol-2',
    name: 'Nigeria Independence Day Celebration',
    date: '2026-10-01',
    type: 'Community',
    countryCode: 'NG',
    description: 'Community gathering and parade in London celebrating Nigerian Independence.'
  },
  {
    id: 'hol-3',
    name: 'Ghana Republic Day Celebration',
    date: '2026-07-01', // Past holiday
    type: 'Community',
    countryCode: 'GH',
    description: 'GSPA networking barbecue celebrating Republic Day.'
  },
  {
    id: 'hol-4',
    name: 'Islamic New Year (Al-Hijra)',
    date: '2026-07-16', // Thursday (This Week)
    type: 'Community',
    countryCode: 'GB',
    description: 'Beginning of the Islamic Lunar Year observed by the diaspora Muslim community.'
  }
];
