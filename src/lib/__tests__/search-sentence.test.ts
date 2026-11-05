// ─────────────────────────────────────────────────────────────────────────────
// A search sentence, carried from Home to Discover (owner, 5 Nov 2026)
//
// Discover opens already filtered: the tab, the words, the filters the sentence
// named and the place it found, as route parameters (strings, which is all a
// route carries), and one line saying what was understood, so a member can see
// a wrong reading and clear it.
// ─────────────────────────────────────────────────────────────────────────────

import { describeSentence, outsideMessage, sentenceFromParams, sentenceParams, sentenceScope } from '../search-sentence';
import type { SentenceSearch } from '../search-place';

const FLAT_IN_GRAND_BAIE: SentenceSearch = {
  said: '3-bedroom flat in Grand Baie',
  tab: 'Housing',
  words: '',
  minBedrooms: 3,
  homeTypes: ['apartment'],
  jobType: null,
  place: {
    kind: 'town',
    name: 'Grand Baie',
    countryCode: 'MU',
    latitude: -20.01,
    longitude: 57.58,
    radiusKm: 5,
    source: 'world-list',
  },
};

const BRAIDS_NEAR_ME: SentenceSearch = {
  said: 'where to braid my hair near me',
  tab: 'Providers',
  words: 'braid hair',
  minBedrooms: null,
  homeTypes: [],
  jobType: null,
  place: { kind: 'near-me', name: 'Curepipe', countryCode: 'MU', latitude: -20.31, longitude: 57.52, radiusKm: 10 },
};

describe('sentenceParams and sentenceFromParams', () => {
  it('carry everything as strings, and read it back the same', () => {
    const params = sentenceParams(FLAT_IN_GRAND_BAIE, '1730790000000');

    for (const value of Object.values(params)) expect(typeof value).toBe('string');
    expect(params).toMatchObject({ tab: 'Housing', query: '', said: '3-bedroom flat in Grand Baie', at: '1730790000000' });
    expect(sentenceFromParams(params)).toEqual(FLAT_IN_GRAND_BAIE);
    expect(sentenceFromParams(sentenceParams(BRAIDS_NEAR_ME, '2'))).toEqual(BRAIDS_NEAR_ME);
  });

  it('read every kind of place back', () => {
    const places: SentenceSearch['place'][] = [
      { kind: 'country', countryCode: 'NG', name: 'Nigeria' },
      { kind: 'near-me-unknown' },
      { kind: 'not-found', said: 'construction' },
      { kind: 'town', name: 'Trou aux Biches', countryCode: 'MU', latitude: null, longitude: null, radiusKm: 5, source: 'google' },
      null,
    ];

    for (const place of places) {
      const search = { ...BRAIDS_NEAR_ME, place };
      expect(sentenceFromParams(sentenceParams(search, '3'))).toEqual(search);
    }
  });

  it('a Discover opened without a sentence reads none', () => {
    expect(sentenceFromParams({ tab: 'Housing' })).toBeNull();
    expect(sentenceFromParams({})).toBeNull();
  });
});

describe('sentenceScope', () => {
  it('a town with a point is searched round it; jobs and items fall back to its name', () => {
    expect(sentenceScope(FLAT_IN_GRAND_BAIE)).toEqual({
      kind: 'distance',
      countryCode: 'MU',
      cityName: 'Grand Baie',
      latitude: -20.01,
      longitude: 57.58,
      radiusKm: 5,
    });
  });

  it('a town without a point is searched by name, a country as a whole', () => {
    expect(
      sentenceScope({
        ...FLAT_IN_GRAND_BAIE,
        place: { kind: 'town', name: 'Trou aux Biches', countryCode: 'MU', latitude: null, longitude: null, radiusKm: 5, source: 'google' },
      })
    ).toEqual({ kind: 'town', countryCode: 'MU', cityName: 'Trou aux Biches' });
    expect(sentenceScope({ ...FLAT_IN_GRAND_BAIE, place: { kind: 'country', countryCode: 'NG', name: 'Nigeria' } })).toEqual({
      kind: 'country',
      countryCode: 'NG',
    });
  });

  it('near me is the distance round the member', () => {
    expect(sentenceScope(BRAIDS_NEAR_ME)).toMatchObject({ kind: 'distance', latitude: -20.31, radiusKm: 10 });
  });

  it("leaves Discover's own place when the sentence found none", () => {
    expect(sentenceScope({ ...BRAIDS_NEAR_ME, place: { kind: 'near-me-unknown' } })).toBeNull();
    expect(sentenceScope({ ...BRAIDS_NEAR_ME, place: { kind: 'not-found', said: 'x' } })).toBeNull();
    expect(sentenceScope({ ...BRAIDS_NEAR_ME, place: null })).toBeNull();
  });
});

describe('outsideMessage (owner, 5 Nov 2026: search stays in the country the member is in)', () => {
  it('says where search looks, and where the place is', () => {
    expect(outsideMessage({ kind: 'outside', name: 'Nigeria', countryCode: 'NG', countryName: 'Nigeria' }, 'Mauritius')).toBe(
      'You can search only in Mauritius, where you are now. Nigeria is another country.'
    );
    expect(outsideMessage({ kind: 'outside', name: 'London', countryCode: 'GB', countryName: 'United Kingdom' }, 'Mauritius')).toBe(
      'You can search only in Mauritius, where you are now. London is in the United Kingdom.'
    );
    expect(outsideMessage({ kind: 'outside', name: 'Lagos', countryCode: 'NG', countryName: 'Nigeria' }, 'United States')).toBe(
      'You can search only in the United States, where you are now. Lagos is in Nigeria.'
    );
  });

  it('a place outside is never searched', () => {
    expect(
      sentenceScope({ ...BRAIDS_NEAR_ME, place: { kind: 'outside', name: 'Nigeria', countryCode: 'NG', countryName: 'Nigeria' } })
    ).toBeNull();
  });
});

describe('describeSentence', () => {
  it('says what was understood, in the order the member reads it', () => {
    expect(describeSentence(FLAT_IN_GRAND_BAIE, 'MU')).toBe('Homes · 3+ bedrooms · flat · in Grand Baie');
    expect(describeSentence(BRAIDS_NEAR_ME, 'MU')).toBe('Services · “braid hair” · near you');
  });

  it('names the country of a town abroad', () => {
    expect(
      describeSentence(
        {
          ...FLAT_IN_GRAND_BAIE,
          minBedrooms: null,
          homeTypes: ['house', 'villa'],
          place: { kind: 'town', name: 'Grand Bay', countryCode: 'US', latitude: 30.48, longitude: -88.34, radiusKm: 5, source: 'world-list' },
        },
        'MU'
      )
    ).toBe('Homes · house or villa · in Grand Bay, United States');
  });

  it('says when a place was not found, or the phone would not say where it is', () => {
    expect(
      describeSentence(
        { ...BRAIDS_NEAR_ME, tab: 'Jobs', words: 'construction', jobType: 'Part-Time', place: { kind: 'not-found', said: 'construction' } },
        'MU'
      )
    ).toBe('Jobs · “construction” · part-time · no place called “construction” was found');
    expect(describeSentence({ ...BRAIDS_NEAR_ME, place: { kind: 'near-me-unknown' } }, 'MU')).toBe(
      'Services · “braid hair” · near you needs your location'
    );
    expect(describeSentence({ ...BRAIDS_NEAR_ME, tab: 'Jobs', words: '', place: { kind: 'country', countryCode: 'NG', name: 'Nigeria' } }, 'MU')).toBe(
      'Jobs · across Nigeria'
    );
  });
});
