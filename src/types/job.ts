// Diaspora Platform — Jobs & Opportunities Type Definitions

export type JobCategory =
  | 'Construction'
  | 'House Cleaning'
  | 'Hotel'
  | 'Restaurant'
  | 'Driver'
  | 'Delivery'
  | 'Warehouse'
  | 'Factory'
  | 'Farm Work'
  | 'Security'
  | 'Caregiver'
  | 'Babysitting'
  | 'Electrician'
  | 'Plumber'
  | 'Painter'
  | 'Mechanic'
  | 'Car Wash'
  | 'Domestic Help'
  | 'Retail'
  | 'Customer Service'
  | 'Office Assistant'
  | 'Internship'
  | 'Volunteer'
  | 'Freelance'
  | 'Temporary'
  | 'Part-Time'
  | 'Full-Time'
  | 'Contract'
  | 'Other';

export type EmploymentType =
  | 'Full-Time'
  | 'Part-Time'
  | 'Temporary'
  | 'Contract'
  | 'Freelance'
  | 'Internship'
  | 'Volunteer'
  | 'Other';

export type PaymentFrequency = 'hourly' | 'daily' | 'weekly' | 'monthly';

export interface Salary {
  amount: number;
  maxAmount?: number;
  currency: string;
  frequency: PaymentFrequency;
}

export interface JobLocation {
  latitude?: number;
  longitude?: number;
  cityName: string;
  areaName: string;
  distanceKm?: number;
  addressLine: string;
  landmark?: string;
}

export interface JobEmployer {
  providerId: string;
  name: string;
  avatarUrl: string | null;
  isVerified: boolean;
  rating?: number;
  reputationLevel?: string;
  contactEmail?: string;
  contactPhone?: string;
  preferredContactMethod: 'phone' | 'email' | 'whatsapp' | 'in_app';
}

export interface BenefitsFlags {
  accommodationIncluded: boolean;
  mealsIncluded: boolean;
  transportIncluded: boolean;
}

export interface JobOpportunity {
  jobId: string;
  title: string;
  category: JobCategory;
  employmentType: EmploymentType;
  description: string;
  requirements: string[];
  responsibilities: string[];
  benefits: string[];
  salary: Salary;
  location: JobLocation;
  employer: JobEmployer;
  benefitsFlags: BenefitsFlags;
  experienceRequired: boolean;
  languages: string[];
  urgency: 'Urgent' | 'Normal' | 'Ending Soon';
  publishedAt: string;
  expiresAt: string;
  status: 'Active' | 'Draft' | 'Archived';
  viewCount: number;
}
