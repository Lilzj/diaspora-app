// Diaspora Platform — Mock Jobs Data

import type { JobOpportunity, JobCategory, EmploymentType } from '@/types/job';

export const mockJobCategories: { id: string; name: JobCategory; icon: string }[] = [
  { id: 'jcat-1', name: 'Construction', icon: '🏗️' },
  { id: 'jcat-2', name: 'House Cleaning', icon: '🧹' },
  { id: 'jcat-3', name: 'Hotel', icon: '🏨' },
  { id: 'jcat-4', name: 'Restaurant', icon: '🍳' },
  { id: 'jcat-5', name: 'Driver', icon: '🚗' },
  { id: 'jcat-6', name: 'Delivery', icon: '📦' },
  { id: 'jcat-7', name: 'Warehouse', icon: '🏢' },
  { id: 'jcat-8', name: 'Factory', icon: '🏭' },
  { id: 'jcat-9', name: 'Farm Work', icon: '🚜' },
  { id: 'jcat-10', name: 'Security', icon: '🛡️' },
  { id: 'jcat-11', name: 'Caregiver', icon: '👵' },
  { id: 'jcat-12', name: 'Babysitting', icon: '👶' },
  { id: 'jcat-13', name: 'Electrician', icon: '⚡' },
  { id: 'jcat-14', name: 'Plumber', icon: '🔧' },
  { id: 'jcat-15', name: 'Painter', icon: '🎨' },
  { id: 'jcat-16', name: 'Mechanic', icon: '⚙️' },
  { id: 'jcat-17', name: 'Car Wash', icon: '🧽' },
  { id: 'jcat-18', name: 'Domestic Help', icon: '🏠' },
  { id: 'jcat-19', name: 'Retail', icon: '🛍️' },
  { id: 'jcat-20', name: 'Customer Service', icon: '📞' },
  { id: 'jcat-21', name: 'Office Assistant', icon: '📄' },
  { id: 'jcat-22', name: 'Internship', icon: '🎓' },
  { id: 'jcat-23', name: 'Volunteer', icon: '🤝' },
  { id: 'jcat-24', name: 'Freelance', icon: '💻' },
  { id: 'jcat-25', name: 'Temporary', icon: '⏳' },
  { id: 'jcat-26', name: 'Part-Time', icon: '⏱️' },
  { id: 'jcat-27', name: 'Full-Time', icon: '💼' },
  { id: 'jcat-28', name: 'Contract', icon: '📝' },
  { id: 'jcat-29', name: 'Other', icon: '❓' },
];

export const mockJobs: JobOpportunity[] = [
  {
    jobId: 'job-1',
    title: 'House Cleaner Needed for Family Home',
    category: 'House Cleaning',
    employmentType: 'Part-Time',
    description: 'Looking for an experienced and reliable house cleaner to assist a busy family in Peckham. Tasks include general cleaning, dusting, vacuuming, laundry, and ironing. We are a friendly Ghanaian-British household and would love to welcome someone from the community.',
    requirements: [
      'Prior experience in house cleaning or hotel housekeeping',
      'Good communication skills',
      'Honest, punctual, and reliable',
      'Must have references from previous employers'
    ],
    responsibilities: [
      'Deep clean kitchen and bathrooms weekly',
      'Vacuum and mop floors throughout the house',
      'Laundry and folding clothes',
      'Ironing work shirts'
    ],
    benefits: [
      'Flexible working hours (choose your days)',
      'Home-cooked Ghanaian lunch included every day',
      'Competitive daily pay rate'
    ],
    salary: {
      amount: 14,
      currency: 'GBP',
      frequency: 'hourly'
    },
    location: {
      cityName: 'London',
      areaName: 'Peckham',
      distanceKm: 0.8,
      addressLine: '82 Lyndhurst Way, SE15',
      landmark: 'Near Peckham Rye Station'
    },
    employer: {
      providerId: 'user-201',
      name: 'Emmanuel Owusu',
      avatarUrl: null,
      isVerified: true,
      rating: 4.8,
      reputationLevel: 'CommunityExpert',
      contactEmail: 'emmanuel.owusu@diaspora.net',
      contactPhone: '+447700900456',
      preferredContactMethod: 'phone'
    },
    benefitsFlags: {
      accommodationIncluded: false,
      mealsIncluded: true,
      transportIncluded: false
    },
    experienceRequired: false,
    languages: ['English', 'Twi'],
    urgency: 'Urgent',
    publishedAt: '2026-07-12T09:00:00Z',
    expiresAt: '2026-07-19T23:59:59Z',
    status: 'Active',
    viewCount: 42
  },
  {
    jobId: 'job-2',
    title: 'Construction Laborer - Commercial Project',
    category: 'Construction',
    employmentType: 'Temporary',
    description: 'Laborers wanted for a new commercial redevelopment project in Brixton. Work includes site preparation, moving materials, clearing debris, and assisting skilled tradesmen. Hard workers can expect long-term extensions and referrals.',
    requirements: [
      'CSCS Card (Construction Skills Certification Scheme) required',
      'Physical fitness and ability to lift heavy objects (up to 25kg)',
      'Reliable steel-toe boots and high-vis vest',
      'Punctuality is absolutely essential'
    ],
    responsibilities: [
      'Load and unload construction materials',
      'Clear site debris and maintain safety pathways',
      'Operate basic hand tools and mixing equipment',
      'Follow all site safety and supervisor guidelines'
    ],
    benefits: [
      'CSCS renewal assistance for top performers',
      'Weekly pay runs directly to your account',
      'Travel expenses/bus pass reimbursed weekly'
    ],
    salary: {
      amount: 120,
      currency: 'GBP',
      frequency: 'daily'
    },
    location: {
      cityName: 'London',
      areaName: 'Brixton',
      distanceKm: 2.3,
      addressLine: '12 Coldharbour Lane, SW9',
      landmark: 'Opposite Brixton Market'
    },
    employer: {
      providerId: 'user-205',
      name: 'David Okafor',
      avatarUrl: null,
      isVerified: true,
      rating: 4.9,
      reputationLevel: 'TrustedContributor',
      contactEmail: 'david.okafor@diaspora.net',
      contactPhone: '+447700900234',
      preferredContactMethod: 'whatsapp'
    },
    benefitsFlags: {
      accommodationIncluded: false,
      mealsIncluded: false,
      transportIncluded: true
    },
    experienceRequired: true,
    languages: ['English'],
    urgency: 'Normal',
    publishedAt: '2026-07-11T08:30:00Z',
    expiresAt: '2026-07-25T23:59:59Z',
    status: 'Active',
    viewCount: 118
  },
  {
    jobId: 'job-3',
    title: 'Hotel Receptionist (Night Auditor)',
    category: 'Hotel',
    employmentType: 'Full-Time',
    description: 'Curepipe Hospitality Group is seeking a bilingual Night Receptionist / Auditor for our guest lodge. You will manage late check-ins, guest inquiries, billing reconciliations, and overnight safety audits. Perfect for diaspora members relocating to Mauritius or looking for stable careers.',
    requirements: [
      'Fluency in both French and English',
      'Experience in hotel hospitality or administrative operations',
      'Proficiency with hotel reservation systems (Opera, Cloudbeds)',
      'Strong numerical and auditing skills'
    ],
    responsibilities: [
      'Check in late-arrival guests and assist with luggage',
      'Perform night audit transactions and balance daily statements',
      'Address guest queries or security concerns overnight',
      'Prepare light breakfast items for morning shift handover'
    ],
    benefits: [
      'Free on-site double bedroom accommodation (utility bills covered)',
      'Discounted meals at hotel restaurant',
      'Full health and dental insurance plan'
    ],
    salary: {
      amount: 22000,
      currency: 'MUR',
      frequency: 'monthly'
    },
    location: {
      cityName: 'Curepipe',
      areaName: 'Curepipe Town',
      distanceKm: 1.5,
      addressLine: '45 Forest Side Road',
      landmark: 'Next to Curepipe Botanical Gardens'
    },
    employer: {
      providerId: 'user-202',
      name: 'Fatima Diallo',
      avatarUrl: null,
      isVerified: true,
      rating: 4.6,
      reputationLevel: 'TrustedContributor',
      contactEmail: 'fatima.diallo@diaspora.net',
      contactPhone: '+23055001234',
      preferredContactMethod: 'email'
    },
    benefitsFlags: {
      accommodationIncluded: true,
      mealsIncluded: true,
      transportIncluded: false
    },
    experienceRequired: true,
    languages: ['English', 'French'],
    urgency: 'Ending Soon',
    publishedAt: '2026-07-05T14:00:00Z',
    expiresAt: '2026-07-15T23:59:59Z',
    status: 'Active',
    viewCount: 205
  },
  {
    jobId: 'job-4',
    title: 'Multi-Drop Delivery Driver',
    category: 'Driver',
    employmentType: 'Freelance',
    description: 'Delivery drivers wanted for a busy diaspora parcel distribution service in Lewisham. You will deliver packages to local businesses and residential addresses. We provide the delivery van, fuel card, and commercial insurance. You bring the energy and safe driving skills!',
    requirements: [
      'Valid UK Driving License (maximum 3 penalty points)',
      'Aged 21+ for insurance purposes',
      'Previous multi-drop delivery experience (e.g. Amazon, DPD) is a plus',
      'Familiarity with driving medium-sized vans in London traffic'
    ],
    responsibilities: [
      'Perform vehicle safety checks before departing',
      'Sort packages and scan for delivery route order',
      'Safely deliver 60-80 packages per day to residents',
      'Collect delivery confirmations on digital scanner'
    ],
    benefits: [
      'Van, fuel card, and commercial insurance fully provided',
      'Performance bonuses for zero claims and high completion rate',
      'Weekly pay invoice clearing'
    ],
    salary: {
      amount: 650,
      currency: 'GBP',
      frequency: 'weekly'
    },
    location: {
      cityName: 'London',
      areaName: 'Lewisham',
      distanceKm: 4.8,
      addressLine: '144 Lewisham High Street, SE13',
      landmark: 'Near Lewisham Shopping Centre'
    },
    employer: {
      providerId: 'user-203',
      name: 'Chidi Okafor',
      avatarUrl: null,
      isVerified: true,
      rating: 4.5,
      reputationLevel: 'CommunityContributor',
      contactEmail: 'chidi.okafor@diaspora.net',
      contactPhone: '+447700900234',
      preferredContactMethod: 'phone'
    },
    benefitsFlags: {
      accommodationIncluded: false,
      mealsIncluded: false,
      transportIncluded: true
    },
    experienceRequired: false,
    languages: ['English'],
    urgency: 'Urgent',
    publishedAt: '2026-07-12T11:45:00Z',
    expiresAt: '2026-07-20T23:59:59Z',
    status: 'Active',
    viewCount: 19
  },
  {
    jobId: 'job-5',
    title: 'Part-Time Babysitter for Côte d\'Ivoire Family',
    category: 'Babysitting',
    employmentType: 'Part-Time',
    description: 'Looking for a warm, caring, and bilingual babysitter to take care of two children (ages 4 and 7) on Tuesday and Thursday afternoons. We want someone who can speak French to the children and help them with French homework. Ideally looking for someone from the Ivorian or West African community.',
    requirements: [
      'Bilingual in French and English',
      'DBS checked (or willing to obtain one)',
      'Previous experience caring for young children',
      'First Aid certification preferred'
    ],
    responsibilities: [
      'Pick up children from primary school at 3:15 PM',
      'Prepare healthy after-school snacks',
      'Help children practice speaking and reading French',
      'Keep children engaged with fun activities until parents return at 7:00 PM'
    ],
    benefits: [
      'Paid holidays matching school terms',
      'Dinner provided with the family',
      'Supportive and welcoming household environment'
    ],
    salary: {
      amount: 15,
      currency: 'GBP',
      frequency: 'hourly'
    },
    location: {
      cityName: 'London',
      areaName: 'Greenwich',
      distanceKm: 6.2,
      addressLine: '22 Maze Hill, SE10',
      landmark: 'Near Greenwich Park'
    },
    employer: {
      providerId: 'user-123',
      name: 'Amara Kone',
      avatarUrl: null,
      isVerified: true,
      rating: 4.9,
      reputationLevel: 'VerifiedResident',
      contactEmail: 'amara.kone@diaspora.net',
      contactPhone: '+447700900123',
      preferredContactMethod: 'whatsapp'
    },
    benefitsFlags: {
      accommodationIncluded: false,
      mealsIncluded: true,
      transportIncluded: false
    },
    experienceRequired: true,
    languages: ['French', 'English'],
    urgency: 'Normal',
    publishedAt: '2026-07-10T12:00:00Z',
    expiresAt: '2026-07-31T23:59:59Z',
    status: 'Active',
    viewCount: 56
  }
];
