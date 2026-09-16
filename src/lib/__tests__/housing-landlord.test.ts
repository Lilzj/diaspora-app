/**
 * A landlord's own page, from what the platform sends — 16 Sep 2026.
 *
 * The screen read `host` and `listings` from `GET /housing/landlords/{id}`,
 * which sends neither, and rendered a fixture's `description`, `followerCount`,
 * `responseTime` and `verificationDate` — none of which exist on the wire. So
 * the page named nobody and listed nothing.
 */
import {
  landlordHomesParams,
  landlordKindLabel,
  landlordProfileFromWire,
  landlordResponseLabel,
  memberSinceLabel,
} from '../housing-landlord';

const WIRE = {
  id: '01a05770-2d93-7e65-99ff-d16c25bb0182',
  ownerUserId: '0dc73f0c-7efa-4b60-8706-7a60eacace65',
  slug: 'mensah-property-rentals',
  displayName: 'Mensah Property Rentals',
  kind: 'Agency',
  primaryCountryCode: 'MU',
  bio: '  Family-run lettings in Plaines Wilhems.  ',
  trust: { state: 'Verified', isVerified: true, badge: 'Verified landlord' },
  statistics: { activeListings: 3, totalListings: 4, completedLets: 2, responseRate: 0.75 },
  websiteUrl: 'https://example.mu',
  isOwner: false,
  createdAt: '2026-03-02T09:00:00Z',
};

describe('the landlord a profile page shows', () => {
  it('reads the fields the route actually sends', () => {
    expect(landlordProfileFromWire(WIRE)).toEqual({
      landlordId: WIRE.id,
      ownerUserId: WIRE.ownerUserId,
      name: 'Mensah Property Rentals',
      kind: 'Agency',
      legalName: null,
      bio: 'Family-run lettings in Plaines Wilhems.',
      logoMediaId: null,
      isVerified: true,
      badge: 'Verified landlord',
      countryCode: 'MU',
      phoneNumber: null,
      email: null,
      websiteUrl: 'https://example.mu',
      completedLets: 2,
      responseRate: 0.75,
      isOwner: false,
      memberSince: '2026-03-02T09:00:00Z',
    });
  });

  it('is null when the response was not a landlord, so "no such landlord" stays distinguishable', () => {
    expect(landlordProfileFromWire(null)).toBeNull();
    expect(landlordProfileFromWire(undefined)).toBeNull();
    expect(landlordProfileFromWire({})).toBeNull();
    expect(landlordProfileFromWire({ id: '   ' })).toBeNull();
  });

  it('leaves out what the landlord did not publish, rather than inventing it', () => {
    const sparse = landlordProfileFromWire({ id: 'abc', displayName: 'Rose Hill Rooms' })!;

    expect(sparse.phoneNumber).toBeNull();
    expect(sparse.email).toBeNull();
    expect(sparse.websiteUrl).toBeNull();
    expect(sparse.bio).toBeNull();
    expect(sparse.isVerified).toBe(false);
    // Never "undefined lets" or a rate nobody measured.
    expect(sparse.completedLets).toBe(0);
    expect(sparse.responseRate).toBeNull();
    expect(sparse.ownerUserId).toBeNull();
  });
});

describe('their homes', () => {
  it('are asked for by the name the search route binds', () => {
    expect(landlordHomesParams('abc')).toEqual({ landlordId: 'abc', limit: 20 });
    expect(landlordHomesParams('abc', 5)).toEqual({ landlordId: 'abc', limit: 5 });
  });
});

describe('the lines under the name', () => {
  it('say what kind of landlord this is, and nothing for a kind we have no word for', () => {
    expect(landlordKindLabel('Individual')).toBe('Private landlord');
    expect(landlordKindLabel('agency')).toBe('Letting agency');
    expect(landlordKindLabel('Company')).toBe('Property company');
    expect(landlordKindLabel('Syndicate')).toBeNull();
    expect(landlordKindLabel(null)).toBeNull();
  });

  it('read the response rate as the share it is, not a hundred times bigger', () => {
    expect(landlordResponseLabel(0.75)).toBe('Answers 75% of viewing requests');
    expect(landlordResponseLabel(1)).toBe('Answers 100% of viewing requests');
    // Below the platform's floor it sends nothing, and the page says nothing.
    expect(landlordResponseLabel(null)).toBeNull();
    expect(landlordResponseLabel(undefined)).toBeNull();
  });

  it('name the year they joined, and nothing for a date the platform did not send', () => {
    expect(memberSinceLabel('2026-03-02T09:00:00Z')).toBe('Member since 2026');
    expect(memberSinceLabel(null)).toBeNull();
    expect(memberSinceLabel('not a date')).toBeNull();
  });
});

describe('where it is used', () => {
  const fs = require('fs') as { readFileSync(p: string, e: string): string };
  const path = require('path') as { join(...s: string[]): string };
  const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');

  const profile = read('src', 'app', 'housing', 'host', '[id].tsx');
  const home = read('src', 'app', 'housing', '[id].tsx');
  const item = read('src', 'app', 'marketplace', '[id].tsx');

  it('reads the landlord route through the mapper, not through fields it does not send', () => {
    expect(profile).toContain('landlordProfileFromWire(');
    expect(profile).toContain('landlordHomesParams(');
    // The fields it used to read and render; the header still names them, so
    // these match the code that used them rather than the prose about them.
    expect(profile).not.toMatch(/response\.data\.data\.host|setHost\(|host\.followerCount|host\.responseTime/);
  });

  it('opens a landlord by their own identifier, never a Providers one', () => {
    expect(home).toContain('/housing/host/${listing.host.landlordId}');
    expect(home).not.toContain('/housing/host/${listing.host.providerId}');
  });

  it('tells a failed read from a listing that is gone, on both item screens', () => {
    for (const screen of [home, item, profile]) {
      expect(screen).toContain("from '@/lib/read-outcome'");
      expect(screen).toContain('readOutcome(');
    }
    // The sentences that told members a listing had gone when the phone never asked.
    expect(home).not.toMatch(/This property listing may have been rented/);
    expect(item).not.toMatch(/This listing might have been sold/);
  });

  it('lets an owner reach their own figures from the thing itself', () => {
    expect(home).toContain("itemAnalyticsRoute('Housing', listing.id)");
    expect(item).toContain("itemAnalyticsRoute('Marketplace', listing.id)");
    expect(home).toMatch(/How it is doing/);
    expect(item).toMatch(/How it is doing/);
  });
});
