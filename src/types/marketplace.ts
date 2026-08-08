import type { ReputationLevel } from './reputation';
import type { CountryVerificationSummary } from './verification';
import type { CountryRef } from './guide';

export type ListingIntent =
  | 'Selling'
  | 'Buying Request'
  | 'Giving Away'
  | 'Exchange / Swap'
  | 'Wanted'
  | 'Donation';

export type ListingCondition =
  | 'New'
  | 'Like New'
  | 'Very Good'
  | 'Good'
  | 'Fair';

export type ListingStatus =
  | 'Active'
  | 'Reserved'
  | 'Sold'
  | 'Expired'
  | 'Archived'
  | 'Hidden'
  | 'Draft';

export interface MarketplaceLocation {
  cityName: string;
  areaName: string;
  addressLine: string;
  landmark?: string;
  distanceKm?: number;
  latitude?: number;
  longitude?: number;
}

export interface SellerInfo {
  sellerId: string;
  name: string;
  avatarUrl: string | null;
  isVerified: boolean;
  rating: number;
  reputationLevel: ReputationLevel;
  yearsOnPlatform: number;
  responseTime?: string;
  languagesSpoken: string[];
  contactPhone: string;
  contactWhatsapp: string;
  preferredContactMethod: 'phone' | 'whatsapp' | 'email';
  countryVerifications: CountryVerificationSummary[];
  totalHelpfulVotes?: number;
  guidesPublished?: number;
  providerVerified?: boolean;
  originCountry?: CountryRef;
}

export interface MarketplaceCategory {
  id: string;
  name: string;
  icon: string;
  parentCategoryId?: string;
  subcategories?: string[];
}

export interface MarketplaceListing {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string; // e.g. GBP, MUR, USD, EUR, NGN, GHS...
  negotiable: boolean;
  quantity: number;
  condition: ListingCondition;
  intent: ListingIntent;
  category: string; // matching category.id
  subcategory?: string;
  brand?: string;
  coverImage: string;
  gallery: string[];
  location: MarketplaceLocation;
  seller: SellerInfo;
  status: ListingStatus;
  createdAt: string;
  viewCount: number;
  isFeatured?: boolean;
  deliveryAvailable: boolean;
  pickupOnly: boolean;
}

export interface MarketplaceFilters {
  query?: string;
  intent?: ListingIntent;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  condition?: ListingCondition;
  brand?: string;
  distanceRadius?: number;
  verifiedSellerOnly?: boolean;
  negotiable?: boolean;
  deliveryAvailable?: boolean;
  pickupOnly?: boolean;
  freeItemsOnly?: boolean;
  buyingRequestsOnly?: boolean;
}
