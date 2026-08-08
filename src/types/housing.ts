import type { CountryRef } from './guide';

export interface HousingLocation {
  cityName: string;
  areaName: string;
  addressLine: string;
  landmark?: string;
  distanceKm?: number;
  latitude?: number;
  longitude?: number;
}

export interface HousingHost {
  providerId: string;
  name: string;
  avatarUrl: string | null;
  isVerified: boolean;
  rating: number;
  reputationLevel: string; // e.g., 'VerifiedResident', 'TrustedHost'
  yearsOnPlatform: number;
  responseTime?: string;
  languagesSpoken: string[];
  contactPhone: string;
  contactEmail: string;
  preferredContactMethod: 'phone' | 'email' | 'whatsapp' | 'in_app';
  originCountry?: CountryRef;
}

export interface HousingListing {
  id: string;
  title: string;
  description: string;
  listingType: string; // e.g. 'Apartment', 'Studio', 'Single Room', 'Shared Room', 'Roommate Needed', 'Family House', 'Hostel', 'Student Accommodation'
  propertyType: string; // 'Rent' or 'Share' (e.g. room vs complete flat)
  bedrooms: number;
  bathrooms: number;
  rent: number;
  currency: string; // GBP, MUR, USD, EUR, etc.
  deposit: number;
  billsIncluded: boolean;
  internetIncluded: boolean;
  parkingAvailable: boolean;
  furnished: 'Furnished' | 'Unfurnished' | 'Partially Furnished';
  availabilityDate: string; // YYYY-MM-DD or custom string
  leaseDuration: string; // e.g. '6 Months', '1 Year', 'Flexible'
  coverImage: string;
  gallery: string[];
  location: HousingLocation;
  host: HousingHost;
  amenities: string[];
  houseRules: string[];
  lifestyleMatches: string[]; // e.g., ['Student Friendly', 'Quiet Environment']
  verificationStatus: 'Verified' | 'Unverified';
  isFeatured?: boolean;
  status: 'Active' | 'Draft';
  createdAt: string;
  viewCount: number;
}

export interface HousingFilters {
  query?: string;
  propertyType?: string; // listing category (Apartment, Studio...)
  listingType?: string; // Rent / Share
  minPrice?: number;
  maxPrice?: number;
  currency?: string;
  bedrooms?: number;
  bathrooms?: number;
  furnished?: string;
  billsIncluded?: boolean;
  internetIncluded?: boolean;
  parking?: boolean;
  balcony?: boolean;
  airConditioning?: boolean;
  petFriendly?: boolean;
  smokingAllowed?: boolean;
  verifiedHostOnly?: boolean;
  distanceRadius?: number;
  lifestyleMatches?: string[];
}
