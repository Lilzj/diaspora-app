// ─────────────────────────────────────────────────────────────────────────────
// What a phone number says about where somebody is
//
// The rule under test is the platform's, and it is a trust rule rather than a
// formatting one: the number a member verifies must belong to the country they
// say they live in. A Nigerian living in Britain verifies a British number.
// Verifying the Nigerian number they kept would leave the Trust Centre showing
// "Phone Linked" as a step towards country standing while the number proves
// nothing about the country in question.
// ─────────────────────────────────────────────────────────────────────────────

import {
  callingCodeForCountry,
  composeE164,
  formatE164,
  matchCallingCode,
  matchesCountry,
  splitE164,
} from '@/lib/calling-code';

describe('callingCodeForCountry', () => {
  it.each([
    ['NG', '+234'],
    ['GB', '+44'],
    ['US', '+1'],
    ['KE', '+254'],
    ['MU', '+230'],
  ])('knows %s', (country, expected) => {
    expect(callingCodeForCountry(country)).toBe(expected);
  });

  it('is case-insensitive, because a country code arrives from four different screens', () => {
    expect(callingCodeForCountry('gb')).toBe('+44');
  });

  it('answers null for a country it does not carry rather than guessing', () => {
    // A default here would silently attach the wrong country to somebody's number.
    expect(callingCodeForCountry('ZZ')).toBeNull();
    expect(callingCodeForCountry('')).toBeNull();
    expect(callingCodeForCountry(null)).toBeNull();
  });
});

describe('splitE164', () => {
  it('separates the calling code from the national part', () => {
    expect(splitE164('+2348100200001')).toEqual({
      callingCode: '+234',
      nationalNumber: '8100200001',
    });
  });

  it('reads a number however it was typed', () => {
    // Members paste numbers with spaces, dashes and brackets in them.
    expect(splitE164('+44 7700 900123')?.nationalNumber).toBe('7700900123');
    expect(splitE164('+44-7700-900123')?.nationalNumber).toBe('7700900123');
  });

  it('answers null for something with no recognisable code', () => {
    // The honest answer for a half-typed number, and the reason a caller must
    // check the result before rendering it.
    expect(splitE164('12345')).not.toBeNull(); // +1 is real, so this does resolve
    expect(splitE164('')).toBeNull();
    expect(splitE164(null)).toBeNull();
    expect(splitE164('not a number')).toBeNull();
  });
});

describe('matchCallingCode', () => {
  it('identifies the country when only one uses the code', () => {
    const match = matchCallingCode('+2348100200001');

    expect(match?.isUnambiguous).toBe(true);
    expect(match?.countries.map((c) => c.code)).toEqual(['NG']);
  });

  it('reports ambiguity rather than picking a country', () => {
    // ── The limit of this rule, asserted rather than described ──
    //
    // +1 is the whole North American Numbering Plan. A member in Toronto and a
    // member in Chicago have indistinguishable calling codes, and the reference
    // list carries no area codes to separate them. Reporting one country here
    // would make the check look stronger than it is.
    const match = matchCallingCode('+12025550142');

    expect(match?.isUnambiguous).toBe(false);
    expect(match?.countries.map((c) => c.code)).toEqual(
      expect.arrayContaining(['US', 'CA', 'JM'])
    );
  });

  it('reports the other shared code too', () => {
    const match = matchCallingCode('+79161234567');

    expect(match?.isUnambiguous).toBe(false);
    expect(match?.countries.map((c) => c.code)).toEqual(
      expect.arrayContaining(['RU', 'KZ'])
    );
  });
});

describe('matchesCountry — the residence rule', () => {
  it('accepts a number from the country of residence', () => {
    expect(matchesCountry('+447700900123', 'GB')).toBe(true);
  });

  it('rejects the number a member kept from the country they left', () => {
    // The case the whole rule exists for. A Nigerian living in Britain verifying
    // a Nigerian number proves they still hold a Nigerian SIM, which is not the
    // claim the Trust Centre is making on their behalf.
    expect(matchesCountry('+2348100200001', 'GB')).toBe(false);
  });

  it('rejects a number for a country the reference list does not carry', () => {
    expect(matchesCountry('+447700900123', 'ZZ')).toBe(false);
  });

  it('rejects rather than throws on an unusable number', () => {
    expect(matchesCountry('', 'GB')).toBe(false);
    expect(matchesCountry(null, 'GB')).toBe(false);
    expect(matchesCountry('+447700900123', null)).toBe(false);
  });

  it('accepts across a shared calling area, which is the weaker answer and the honest one', () => {
    // A Canadian number passes a US residence check. Stated as a test rather than
    // left as a surprise: this is the documented limit of routing by calling code,
    // and `/verification/country` — which takes documents — is what actually
    // establishes residence.
    expect(matchesCountry('+14165550142', 'US')).toBe(true);
  });
});

describe('composeE164', () => {
  it('joins a calling code and a national number', () => {
    expect(composeE164('+234', '8100200001')).toBe('+2348100200001');
  });

  it('drops the trunk zero a member writes without thinking', () => {
    // A British member writes their own number 07700 900123. +4407700900123 is
    // not a number; it is a support ticket that looks like a backend fault.
    expect(composeE164('+44', '07700900123')).toBe('+447700900123');
  });

  it('ignores the spaces and dashes people type', () => {
    expect(composeE164('+44', '7700 900 123')).toBe('+447700900123');
    expect(composeE164('44', '7700-900-123')).toBe('+447700900123');
  });
});

describe('formatE164', () => {
  it('shows the code and the national part apart', () => {
    expect(formatE164('+2348100200001')).toBe('+234 8100200001');
  });

  it('returns an unrecognised number unchanged rather than mangling it', () => {
    expect(formatE164('nonsense')).toBe('nonsense');
    expect(formatE164(null)).toBe('');
  });
});
