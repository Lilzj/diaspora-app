// List a home: the steps, and the fixed choices the form offers.
// Lifted out of `app/housing/create.tsx` (FSOLID-001), which composes it.


export const steps = [
  'Listing & Property Type',
  'Property Details',
  'Location & Landmark',
  'Pricing & Lease',
  'Contact Channels',
  'Gallery Photos',
  'Preview & Publish'
];

/**
 * Property types, furnishing and lease length all come from the server since
 * 13 Oct 2026 (`/housing/accommodation-types`, `/housing/listing-options`). The
 * form used to keep its own copies: twelve property labels mapped to keys by
 * guesswork, and four lease lengths and one furnishing value the server does not
 * have, which its parser turned into "unspecified" without a word.
 *
 * Only the pictures are the app's: an icon per key, and a house for any key the
 * server adds later.
 */
export const PROPERTY_ICONS: Record<string, string> = {
  apartment: '🏢', studio: '📦', house: '🏡', duplex: '🏘️', villa: '🏝️',
  'shared-apartment': '👥', 'private-room': '🛏️', 'shared-room': '🛌', 'roommate-wanted': '🤝',
  'family-stay': '👨‍👩‍👧', hostel: '🏫', 'student-hostel': '🎓', 'guest-house': '🛎️',
  'temporary-accommodation': '⏱️', 'hotel-partnership': '🏨', 'company-accommodation': '💼',
};

export const AVAILABILITY_OPTIONS = ['Available Now', 'Available This Week', 'Available Next Month', 'Custom Date'];

export const LIFESTYLE_OPTIONS = [
  { label: '👨🎓 Student Friendly', value: 'Student Friendly' },
  { label: '👨👩👧 Family Friendly', value: 'Family Friendly' },
  { label: '👩 Women Preferred', value: 'Women Preferred' },
  { label: '🧑💻 Remote Worker Friendly', value: 'Remote Worker Friendly' },
  { label: '🌙 Quiet Environment', value: 'Quiet Environment' },
  { label: '🏠 Shared Living', value: 'Shared Living' },
  { label: '🚭 Non-Smoking Home', value: 'Non-Smoking Home' },
  { label: '🐶 Pet Friendly', value: 'Pet Friendly' },
  { label: '🚗 Parking Available', value: 'Parking Available' },
];
