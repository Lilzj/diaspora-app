import {
  homeConversationSubtitle,
  hostFromLandlord,
  hostWithDisclosedContact,
  isHostedBy,
} from '@/lib/housing-host';
import { placeLabelOf } from '@/lib/listing-place';

const fs = require('fs') as { readFileSync(p: string, e: string): string };
const path = require('path') as { join(...s: string[]): string };

// A home's Message button — 14 Sep 2026, found with a second account.
//
// Aisha tapped Message on David's apartment and read "Cannot start this
// conversation". The button sent `host.ownerUserId`, and the screen's inline
// mapping never copied that field from `landlord`, so every message about every
// home was addressed to `''`.

/** `LandlordSummaryResponse` as the listing read sends it, camel-cased. */
function landlordSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: '5b0c2d0e-9a51-4c4f-8f7e-1d2b3c4d5e6f',
    ownerUserId: '0f8e7d6c-5b4a-4938-8271-6a5b4c3d2e1f',
    slug: 'mensah-property-rentals',
    displayName: 'Mensah Property Rentals',
    kind: 'Individual',
    isVerified: false,
    badge: null,
    logoMediaId: null,
    providerId: null,
    rating: null,
    ...overrides,
  };
}

/** A source file with comments stripped, so a guard reads code rather than prose. */
function code(...segments: string[]): string {
  return fs
    .readFileSync(path.join(process.cwd(), ...segments), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

describe('hostFromLandlord', () => {
  it('carries the member who owns the landlord profile, which is who a message reaches', () => {
    const host = hostFromLandlord(landlordSummary());

    expect(host.ownerUserId).toBe('0f8e7d6c-5b4a-4938-8271-6a5b4c3d2e1f');
    expect(host.ownerUserId).not.toBe(host.landlordId);
  });

  it('keeps every other field the summary sends', () => {
    expect(hostFromLandlord(landlordSummary({ providerId: 'p-1', badge: 'Verified host' }))).toEqual({
      landlordId: '5b0c2d0e-9a51-4c4f-8f7e-1d2b3c4d5e6f',
      ownerUserId: '0f8e7d6c-5b4a-4938-8271-6a5b4c3d2e1f',
      name: 'Mensah Property Rentals',
      slug: 'mensah-property-rentals',
      kind: 'Individual',
      isVerified: false,
      badge: 'Verified host',
      logoMediaId: null,
      providerId: 'p-1',
      rating: null,
    });
  });

  it('leaves a missing owner as null rather than an empty recipient', () => {
    expect(hostFromLandlord(landlordSummary({ ownerUserId: null })).ownerUserId).toBeNull();
    expect(hostFromLandlord(undefined).ownerUserId).toBeNull();
    expect(hostFromLandlord(undefined).name).toBe('Landlord');
  });
});

describe('isHostedBy', () => {
  const host = hostFromLandlord(landlordSummary({ providerId: 'shared-id' }));

  it('is the owner by user id, whatever case the id arrives in', () => {
    expect(isHostedBy(host, '0f8e7d6c-5b4a-4938-8271-6a5b4c3d2e1f')).toBe(true);
    expect(isHostedBy(host, '0F8E7D6C-5B4A-4938-8271-6A5B4C3D2E1F')).toBe(true);
  });

  it('is not the owner because a provider id happens to match', () => {
    // The old check. A provider id is not a person's id.
    expect(isHostedBy(host, 'shared-id')).toBe(false);
  });

  it('is never the owner when either side is unknown', () => {
    expect(isHostedBy(hostFromLandlord(landlordSummary({ ownerUserId: null })), undefined)).toBe(false);
    expect(isHostedBy(host, undefined)).toBe(false);
    expect(isHostedBy(undefined, '0f8e7d6c-5b4a-4938-8271-6a5b4c3d2e1f')).toBe(false);
  });
});

describe('homeConversationSubtitle', () => {
  // `HousingLocationResponse` for David's Rose Hill room, camel-cased.
  const listing = {
    location: {
      countryCode: 'MU',
      regionName: 'Plaines Wilhems',
      cityName: 'Rose Hill',
      neighborhoodName: null,
      neighborhoodAreaId: null,
      displayName: 'Rose Hill, Mauritius',
    },
  };

  it('names the host and where the home is, from the location the listing read sends', () => {
    expect(homeConversationSubtitle('Mensah Property Rentals', placeLabelOf(listing))).toBe(
      'Host: Mensah Property Rentals · Rose Hill'
    );
  });

  it('leaves an unknown place off instead of storing "undefined" on the conversation', () => {
    // The first real enquiry about a home was stored as "Host: … · undefined".
    for (const place of ['', '   ', null, undefined]) {
      expect(homeConversationSubtitle('Mensah Property Rentals', place)).toBe('Host: Mensah Property Rentals');
    }
  });
});

describe('the housing listing screen', () => {
  const screen = code('src', 'app', 'housing', '[id].tsx');

  it('builds its host from the landlord summary through the shared mapping', () => {
    expect(screen).toContain('host: hostFromLandlord(raw.landlord)');
  });

  it('decides ownership by the owner user id, not the provider id', () => {
    expect(screen).toContain('isHostedBy(listing?.host, user?.userId)');
    expect(screen).not.toMatch(/host\??\.providerId\s*===\s*user/);
  });

  it('messages the owner user id', () => {
    expect(screen).toContain('recipientId: listing.host.ownerUserId');
  });

  it('writes the conversation subtitle from the place it shows, never a field the read omits', () => {
    expect(screen).toContain('entitySubtitle: homeConversationSubtitle(listing.host.name, placeLabelOf(listing as never))');
    expect(screen).not.toMatch(/entitySubtitle:[^\n]*areaName/);
  });
});

/**
 * **Both buttons were dead on every listing.** `host.contactPhone` and
 * `host.contactEmail` are declared on the type and read by the detail screen's
 * Call and Email buttons, and nothing anywhere set them: the listing response
 * carries a `LandlordSummaryResponse`, which has no contact fields, and
 * `hostFromLandlord` cannot invent what it was not sent.
 *
 * They come from the landlord profile read instead, where
 * `LandlordContact.Disclose` decides per viewer. The rule these tests hold is
 * that the client makes no such decision itself — it shows what came back, and
 * nothing when nothing did.
 */
describe('the channels a landlord published', () => {
  const host = hostFromLandlord({
    id: 'l-1',
    ownerUserId: 'u-1',
    displayName: 'Mensah Property Rentals',
  });

  it('are absent until the profile read supplies them', () => {
    expect(host.contactPhone).toBeUndefined();
    expect(host.contactEmail).toBeUndefined();
  });

  it('reach the host once the platform discloses them', () => {
    const reachable = hostWithDisclosedContact(host, {
      phoneNumber: '+23057912345',
      email: 'mensah@example.com',
    });

    expect(reachable.contactPhone).toBe('+23057912345');
    expect(reachable.contactEmail).toBe('mensah@example.com');

    // Everything the listing already knew survives the merge.
    expect(reachable.name).toBe('Mensah Property Rentals');
    expect(reachable.ownerUserId).toBe('u-1');
  });

  /**
   * A landlord who kept their details private, a viewer with no viewing, or a
   * profile read that failed — all three arrive here as nothing, and all three
   * must leave the buttons disabled rather than linking to `tel:`.
   */
  it.each([
    ['withheld', { phoneNumber: null, email: null }],
    ['empty', { phoneNumber: '   ', email: '' }],
    ['missing', undefined],
    ['unreadable', null],
  ])('leave the buttons dead when the platform said nothing (%s)', (_case, profile) => {
    const quiet = hostWithDisclosedContact(host, profile as never);

    expect(quiet.contactPhone).toBeUndefined();
    expect(quiet.contactEmail).toBeUndefined();
  });
});
