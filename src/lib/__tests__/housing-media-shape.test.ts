// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the housing media shape (Android UAT, 31 Aug 2026)
//
// ── The crash this exists to prevent ────────────────────────────────────────
//
// `app/housing/[id].tsx` built its photo carousel as:
//
//     const photos = [
//       ...(listing.gallery ?? []),
//       ...(listing.coverImage ? [listing.coverImage] : []),
//     ].filter((uri) => uri.trim().length > 0 && …);
//
// Against the deployed contract both reads are wrong:
//
//   * `HousingListingResponse` has **no `gallery`**. Photographs are in `media`.
//   * `coverImage` is **not a string**. It is `{ mediaId, role, order, caption }`.
//
// So `uri` was an object, `uri.trim` was `undefined`, and calling it threw
// `TypeError: undefined is not a function` **during render**. React could not
// recover: the process died to the launcher, deterministically, for every
// listing that had a photograph.
//
// Every publishable listing has one — `POST /housing/listings/{id}/publish`
// refuses without it — so the entire housing detail surface was unreachable on
// the release build.
//
// ── Why nothing caught it ───────────────────────────────────────────────────
//
// The database held **zero housing listings**. Type-checking passed because the
// client's `HousingListing` declared `coverImage: string` and `gallery: string[]`
// — a shape the server has never sent. Contract drift that both sides agree on
// internally and disagree on across the wire is invisible to `tsc` and to any
// test that builds its own fixture. It took seeding two real listings and
// opening them on a device.
// ─────────────────────────────────────────────────────────────────────────────

import { coverImageUri, housingMediaIds, type HousingMediaRef } from '@/types/housing';

/** Exactly what `GET /housing/listings/{id}` returned for a seeded listing. */
const WIRE = {
  coverImage: {
    mediaId: 'ddcb0b0d-8ec9-495c-9889-d64913122a02',
    role: 'Gallery',
    order: 0,
    caption: null,
  } satisfies HousingMediaRef,
  media: [
    {
      mediaId: 'ddcb0b0d-8ec9-495c-9889-d64913122a02',
      role: 'Gallery',
      order: 0,
      caption: null,
    },
    { mediaId: '11111111-2222-3333-4444-555555555555', role: 'Gallery', order: 1, caption: null },
  ] satisfies HousingMediaRef[],
};

describe('housingMediaIds', () => {
  it('reads the identifiers the wire actually sends', () => {
    expect(housingMediaIds(WIRE)).toEqual([
      'ddcb0b0d-8ec9-495c-9889-d64913122a02',
      '11111111-2222-3333-4444-555555555555',
    ]);
  });

  it('does not list the cover twice when it also appears in media', () => {
    expect(housingMediaIds(WIRE)).toHaveLength(2);
  });

  it('survives a listing with no media at all', () => {
    expect(housingMediaIds({})).toEqual([]);
    expect(housingMediaIds({ coverImage: null, media: [] })).toEqual([]);
  });

  it('still accepts the string form, so older fixtures keep working', () => {
    expect(housingMediaIds({ coverImage: 'https://example.test/a.jpg' })).toEqual([
      'https://example.test/a.jpg',
    ]);
  });
});

describe('coverImageUri', () => {
  it('refuses a media reference rather than handing an object to an <Image>', () => {
    // This is the assertion that would have failed before the fix: the old code
    // passed this object straight into a string position.
    expect(coverImageUri(WIRE.coverImage)).toBeNull();
  });

  it('returns a real string unchanged', () => {
    expect(coverImageUri('https://example.test/a.jpg')).toBe('https://example.test/a.jpg');
  });

  it('treats blank and absent alike', () => {
    expect(coverImageUri('')).toBeNull();
    expect(coverImageUri('   ')).toBeNull();
    expect(coverImageUri(null)).toBeNull();
    expect(coverImageUri(undefined)).toBeNull();
  });

  it('never returns something without .trim — the exact call that crashed', () => {
    for (const input of [WIRE.coverImage, null, undefined, '', 'https://example.test/a.jpg']) {
      const result = coverImageUri(input as never);
      if (result !== null) expect(typeof result.trim).toBe('function');
    }
  });
});

describe('the screen no longer reads fields the wire does not send', () => {
  const fs = require('fs') as { readFileSync(p: string, e: string): string };
  const path = require('path') as { join(...p: string[]): string };

  const SOURCE = fs
    .readFileSync(path.join(process.cwd(), 'src', 'app', 'housing', '[id].tsx'), 'utf8')
    // Comments document the removed lie; they must not read as committing it.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');

  it('does not spread listing.gallery into the carousel', () => {
    expect(SOURCE).not.toContain('listing.gallery');
  });

  it('does not call .trim() on a carousel entry', () => {
    expect(SOURCE).not.toMatch(/\(uri[^)]*\)\s*=>\s*uri\.trim\(\)/);
  });

  it('resolves media identifiers through the signed-url route', () => {
    expect(SOURCE).toContain('housingMediaIds');
    expect(SOURCE).toContain('createSignedUrl');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The rest of the housing detail shape (same UAT, same cause)
//
// Once the crash above was fixed the screen rendered — and showed, to a member
// looking at a real Mauritian listing:
//
//     MONTHLY RENT   undefined
//     Deposit: undefined       Lease:
//     BEDROOMS  Bedroom        BATHROOMS  Bathroom
//
// `HousingListingResponse` nests the listing's facts — `price.amount`,
// `price.depositAmount`, `price.currencyCode`, `capacity.bedrooms`,
// `capacity.bathrooms`, `availability.availableFrom`, and `furnishedStatus` /
// `leaseType` as top-level strings. The screen read `listing.rent`,
// `listing.deposit`, `listing.currency`, `listing.bedrooms`,
// `listing.bathrooms`, `listing.availabilityDate`, `listing.furnished` and
// `listing.leaseDuration`. None of those is a field the server sends.
//
// The rent is the single most important fact on a rental listing.
// ─────────────────────────────────────────────────────────────────────────────

describe('the housing detail screen flattens the wire shape', () => {
  const fs = require('fs') as { readFileSync(p: string, e: string): string };
  const path = require('path') as { join(...p: string[]): string };

  const SOURCE = fs
    .readFileSync(path.join(process.cwd(), 'src', 'app', 'housing', '[id].tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');

  it.each([
    ['rent', 'price.amount'],
    ['currency', 'price.currencyCode'],
    ['deposit', 'price.depositAmount'],
    ['bedrooms', 'capacity.bedrooms'],
    ['bathrooms', 'capacity.bathrooms'],
    ['availabilityDate', 'availability.availableFrom'],
  ])('maps %s from the wire', (flat) => {
    expect(SOURCE).toMatch(new RegExp(`${flat}:`));
  });

  it('reads price, capacity and availability off the raw response', () => {
    expect(SOURCE).toContain('raw.price');
    expect(SOURCE).toContain('raw.capacity');
    expect(SOURCE).toContain('raw.availability');
  });

  it('says "On application" rather than printing undefined next to a currency symbol', () => {
    expect(SOURCE).toContain('On application');
    expect(SOURCE).not.toMatch(/\{getCurrencySymbol\(\)\}\{listing\.rent\}/);
  });

  it('drops the server’s "Unspecified" lease rather than showing it as a term', () => {
    expect(SOURCE).toContain("'Unspecified'");
  });
});
