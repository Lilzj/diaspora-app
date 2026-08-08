// ─────────────────────────────────────────────────────────────────────────────
// Community Life Module — Types and Interfaces
// ─────────────────────────────────────────────────────────────────────────────

export type EventCategory =
  | 'Wedding'
  | 'Naming Ceremony'
  | 'Birthday'
  | 'Graduation'
  | 'Football Match'
  | 'Basketball'
  | 'Concert'
  | 'Comedy Show'
  | 'Networking'
  | 'Career Fair'
  | 'Job Fair'
  | 'Business Seminar'
  | 'Conference'
  | 'Training'
  | 'Workshop'
  | 'Church Program'
  | 'Mosque Event'
  | 'Bible Study'
  | 'Prayer Meeting'
  | 'Youth Program'
  | 'Cultural Festival'
  | 'Independence Celebration'
  | 'Food Festival'
  | 'Picnic'
  | 'Volunteer Activity'
  | 'Charity Event'
  | 'Embassy Event'
  | 'Student Orientation'
  | 'Other';

export type OrgCategory =
  | 'Churches'
  | 'Mosques'
  | 'Associations'
  | 'Embassies'
  | 'Student Associations'
  | 'Professional Associations'
  | 'Community Centres'
  | 'NGOs'
  | 'Doctors'
  | 'Lawyers'
  | 'Accountants'
  | 'Immigration Consultants'
  | 'Cultural Organizations'
  | 'Sports Clubs'
  | 'Business Associations'
  | 'Volunteer Organizations'
  | 'Restaurants' // future-ready
  | 'Other';

export type RSVPStatus = 'Going' | 'Interested' | 'Maybe' | null;

export interface EventLocation {
  cityName: string;
  areaName: string;
  addressLine: string;
  landmark?: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
}

export interface EventContact {
  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
}

export interface AgendaItem {
  id: string;
  time: string;
  title: string;
  description?: string;
}

export interface EventHost {
  id: string;
  name: string;
  avatarUrl?: string;
  type: 'Organization' | 'User';
  isVerified: boolean;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  coverImage: string;
  gallery: string[];
  category: EventCategory;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  endTime: string; // HH:MM
  timezone: string;
  location: EventLocation;
  price?: number; // 0 or undefined means Free
  currency?: string; // GBP, USD, NGN, etc.
  host: EventHost;
  agenda?: AgendaItem[];
  contact?: EventContact;
  rsvpStatus: RSVPStatus;
  isSaved?: boolean;
  viewCount: number;
  shareCount: number;
  saveCount: number;
  createdAt: string;
}

export interface OrgContact {
  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  facebook?: string;
  instagram?: string;
  twitter?: string;
  youtube?: string;
}

export interface OrgLeader {
  name: string;
  role: string;
  avatarUrl?: string;
}

export interface OpeningHour {
  day: string; // Monday, Tuesday, etc.
  hours: string; // e.g. "09:00 - 17:00" or "Closed"
}

export interface CommunityOrganization {
  id: string;
  name: string;
  logo: string;
  coverImage: string;
  category: OrgCategory;
  description: string;
  mission: string;
  services: string[];
  location: EventLocation;
  contact: OrgContact;
  openingHours: OpeningHour[];
  isVerified: boolean;
  rating?: number;
  reputationLevel?: string;
  followersCount: number;
  isFollowing?: boolean;
  leaders?: OrgLeader[];
  gallery?: string[];
  createdAt: string;
}

export interface Holiday {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  type: 'National' | 'Community';
  countryCode: string;
  description?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string;
  type: 'Event' | 'Holiday' | 'Reminder';
  associatedId?: string; // event id or holiday id
  color?: string;
}

// Creation Wizard Form states
export interface EventFormState {
  category: EventCategory;
  title: string;
  description: string;
  coverImage: string;
  gallery: string[];
  date: string;
  time: string;
  endTime: string;
  timezone: string;
  cityName: string;
  areaName: string;
  addressLine: string;
  landmark?: string;
  organizerName: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  email?: string;
  price?: string;
  currency: string;
  isRecurring?: boolean;
  recurrencePattern?: string;
  neighborhood?: string;
}

export interface OrgFormState {
  category: OrgCategory;
  name: string;
  description: string;
  mission: string;
  logo: string;
  coverImage: string;
  services: string[];
  cityName: string;
  areaName: string;
  addressLine: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  openingHours: OpeningHour[];
  verificationDocument?: string;
  hasMembershipPlans?: boolean;
}
