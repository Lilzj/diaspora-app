/**
 * A home card says only what the platform said — 15 Sep 2026.
 *
 * The first real home to reach a card on a phone wore a "Verified Provider"
 * badge: the card passed the literal `true`. Nobody had verified the landlord.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/design-system';
import { HousingCard } from '../HousingCard';
import { toHousingCardListing } from '@/lib/housing-cards';

jest.mock('@/store/saved', () => ({
  useSavedStore: () => ({ save: jest.fn(), unsave: jest.fn(), isSaved: () => false }),
}));

function card(overrides: Record<string, unknown> = {}) {
  return toHousingCardListing(
    {
      id: 'home-1',
      title: 'Single room in a shared house, Rose Hill',
      accommodationTypeName: 'Studio',
      price: { isDisclosed: true, amount: 9500, currencyCode: 'MUR', period: 'PerMonth', utilitiesIncluded: true },
      capacity: { bedrooms: 1, bathrooms: 1 },
      location: { countryCode: 'MU', cityName: 'Rose Hill' },
      stayPolicy: { isSharedAccommodation: true },
      furnishedStatus: 'Furnished',
      landlord: { id: 'landlord-1', displayName: 'Mensah Property Rentals', isVerified: false },
      isLandlordVerified: false,
      distanceKm: 0.3,
      ...overrides,
    },
    new Date('2026-09-15T12:00:00Z')
  );
}

function renderCard(listing: ReturnType<typeof card>) {
  return render(
    <ThemeProvider>
      <HousingCard listing={listing} />
    </ThemeProvider>
  );
}

describe('a home card', () => {
  it('claims no verification nobody granted', () => {
    renderCard(card());

    expect(screen.queryByText(/Verified Provider/i)).toBeNull();
  });

  it('shows the rent with its period, and how far away the home is', () => {
    renderCard(card());

    expect(screen.getByText(/Rs 9500\/month/)).toBeTruthy();
    expect(screen.getByText(/300m away/)).toBeTruthy();
  });

  it('says "Price on request" when the landlord published no rent', () => {
    renderCard(card({ price: { isDisclosed: false, amount: null, currencyCode: null, period: null } }));

    expect(screen.getByText('Price on request')).toBeTruthy();
    expect(screen.queryByText(/undefined/)).toBeNull();
  });
});
