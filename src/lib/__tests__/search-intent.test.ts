// ─────────────────────────────────────────────────────────────────────────────
// Reading a search sentence without AI (owner, 5 Nov 2026)
//
// "providers near me", "where to braid my hair in Grand Baie", "3-bedroom flat
// in Grand Baie", "individual house in Port Louis". The Home bar reads what
// kind of thing is wanted, the words to match, the place, and the filters a
// sentence names, with plain rules. These pin the rules.
// ─────────────────────────────────────────────────────────────────────────────

import { readSearch, searchWords } from '../search-intent';

describe("readSearch: the owner's sentences", () => {
  it('"providers near me" searches services around the member', () => {
    expect(readSearch('providers near me')).toMatchObject({
      tab: 'Providers',
      words: '',
      place: { kind: 'near-me' },
    });
  });

  it('"housing near me" and "jobs near me" open their own tabs', () => {
    expect(readSearch('housing near me')).toMatchObject({ tab: 'Housing', words: '', place: { kind: 'near-me' } });
    expect(readSearch('Jobs near me')).toMatchObject({ tab: 'Jobs', words: '', place: { kind: 'near-me' } });
  });

  it('"where to braid my hair near me" keeps the words that say what', () => {
    expect(readSearch('where to braid my hair near me')).toMatchObject({
      tab: 'Providers',
      words: 'braid hair',
      place: { kind: 'near-me' },
    });
  });

  it('"where to braid my hair in Grand Baie" names the town', () => {
    const intent = readSearch('Where to braid my hair in Grand Baie?');

    expect(intent).toMatchObject({ tab: 'Providers', words: 'braid hair' });
    expect(intent.place).toMatchObject({ kind: 'named', said: 'grand baie' });
    expect(intent.place?.kind === 'named' && intent.place.candidates[0]).toEqual({ name: 'grand baie', rest: '' });
  });

  it('"3-bedroom flat in Grand Baie" is a home with three bedrooms or more', () => {
    const intent = readSearch('3-bedroom flat in Grand Baie');

    expect(intent).toMatchObject({ tab: 'Housing', words: '', minBedrooms: 3, homeTypes: ['apartment'] });
    expect(intent.place).toMatchObject({ kind: 'named', said: 'grand baie' });
  });

  it('"individual house in Port Louis" is a house', () => {
    const intent = readSearch('individual house in Port Louis');

    expect(intent).toMatchObject({ tab: 'Housing', words: '', homeTypes: ['house'] });
    expect(intent.place).toMatchObject({ kind: 'named', said: 'port louis' });
  });
});

describe('readSearch: what kind of thing', () => {
  it('a home word next to a service is a service: "house cleaning"', () => {
    expect(readSearch('house cleaning near me')).toMatchObject({
      tab: 'Providers',
      words: 'house cleaning',
      homeTypes: [],
    });
  });

  it('a job, its hours, and the town', () => {
    const intent = readSearch('part-time job in Curepipe');

    expect(intent).toMatchObject({ tab: 'Jobs', words: '', jobType: 'Part-Time' });
    expect(intent.place).toMatchObject({ kind: 'named', said: 'curepipe' });
  });

  it('bedrooms in words, and a room on its own', () => {
    expect(readSearch('two bed apartment for rent')).toMatchObject({
      tab: 'Housing',
      minBedrooms: 2,
      homeTypes: ['apartment'],
      place: null,
    });
    expect(readSearch('room for rent near me')).toMatchObject({ tab: 'Housing', homeTypes: ['private-room'] });
    expect(readSearch('shared room')).toMatchObject({ tab: 'Housing', homeTypes: ['shared-room'] });
  });

  it('a studio is a home only when the sentence is about homes', () => {
    expect(readSearch('studio for rent')).toMatchObject({ tab: 'Housing', homeTypes: ['studio'] });
    expect(readSearch('recording studio')).toMatchObject({ tab: 'Providers', words: 'recording studio' });
  });

  it('buying and selling is the marketplace', () => {
    expect(readSearch('buy a second hand fridge')).toMatchObject({ tab: 'Marketplace', words: 'fridge' });
  });

  it('anything else is a service, searched by its words', () => {
    expect(readSearch('plumber')).toMatchObject({ tab: 'Providers', words: 'plumber', place: null });
    expect(readSearch('car rental')).toMatchObject({ tab: 'Providers', words: 'car rental' });
  });

  it('keeps what was typed, and an empty sentence asks for nothing', () => {
    expect(readSearch('  Plumber  ').said).toBe('Plumber');
    expect(readSearch('   ')).toMatchObject({ said: '', tab: 'Providers', words: '', place: null });
  });
});

describe('readSearch: where', () => {
  it('a town ends at the next linking word, and the shorter names are tried after', () => {
    const intent = readSearch('flat in Grand Baie for rent');

    expect(intent.place?.kind === 'named' && intent.place.candidates).toEqual([
      { name: 'grand baie', rest: '' },
      { name: 'grand', rest: 'baie' },
    ]);
  });

  it('words after the town are still searched', () => {
    const intent = readSearch('hair salon in Rose Hill with parking');

    expect(intent.words).toBe('hair salon');
    expect(intent.place?.kind === 'named' && intent.place.candidates[0]).toEqual({ name: 'rose hill', rest: 'parking' });
    expect(searchWords(intent, { name: 'rose hill', rest: 'parking' })).toBe('hair salon parking');
  });

  it('a price or a bare number is not a word to match', () => {
    const intent = readSearch('flat in Port Louis under 20000 per month');

    expect(intent.place?.kind === 'named' && intent.place.candidates[0]).toEqual({ name: 'port louis', rest: '' });
    expect(readSearch('room under Rs 5,000')).toMatchObject({ tab: 'Housing', words: '' });
    expect(readSearch('plumber 24/7')).toMatchObject({ words: 'plumber' });
  });

  it('"my area", "my town" and "around here" are near the member', () => {
    expect(readSearch('jobs in my area').place).toEqual({ kind: 'near-me' });
    expect(readSearch('tailor in my town').place).toEqual({ kind: 'near-me' });
    expect(readSearch('nanny around here').place).toEqual({ kind: 'near-me' });
    expect(readSearch('mechanic nearby').place).toEqual({ kind: 'near-me' });
    expect(readSearch('jobs near us').place).toEqual({ kind: 'near-me' });
  });

  it('"at home" and "in the evening" are not places', () => {
    expect(readSearch('hairdresser at home')).toMatchObject({ place: null, words: 'hairdresser home' });
    expect(readSearch('nanny in the evening').place).toBeNull();
  });

  it('"the" before a place is skipped: "jobs in the UK", but not "in the city"', () => {
    expect(readSearch('jobs in the UK').place).toMatchObject({ kind: 'named', said: 'uk' });
    expect(readSearch('flat in the city centre').place).toBeNull();
  });

  it('a name with accents is kept as typed for the town search', () => {
    expect(readSearch('hair in Mahébourg').place).toMatchObject({ kind: 'named', said: 'mahébourg' });
  });

  it('when no town is found the words come back into the search', () => {
    const intent = readSearch('work in construction');

    expect(intent).toMatchObject({ tab: 'Jobs', words: '' });
    expect(intent.place).toMatchObject({ kind: 'named', said: 'construction', asWords: 'construction' });
    expect(searchWords(intent, null)).toBe('construction');
  });
});
