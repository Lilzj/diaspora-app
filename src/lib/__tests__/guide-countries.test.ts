import { guideCountryOptions, guideCountryTieLabel } from '../guide-countries';

describe('guideCountryOptions', () => {
  it('offers where the member lives first, then where they are from, then their standings', () => {
    const options = guideCountryOptions({
      residence: 'mu',
      origin: 'NG',
      standings: [
        { countryCode: 'GB', countryName: 'United Kingdom', flag: '🇬🇧' },
        { countryCode: 'MU', countryName: 'Mauritius', flag: '🇲🇺' },
      ],
    });

    expect(options.map((option) => option.countryCode)).toEqual(['MU', 'NG', 'GB']);
    expect(options.map((option) => option.tie)).toEqual(['residence', 'origin', 'standing']);
    expect(options[0].countryName).toBe('Mauritius');
    expect(options[0].flag).toBe('🇲🇺');
    expect(options[2].countryName).toBe('United Kingdom');
  });

  it('does not require a verified standing — nobody had one', () => {
    const options = guideCountryOptions({ residence: 'MU', standings: [] });

    expect(options).toHaveLength(1);
    expect(options[0].countryCode).toBe('MU');
  });

  it('leaves out anything the server would refuse as a country', () => {
    const options = guideCountryOptions({
      residence: 'Mauritius',
      origin: '',
      standings: [{ countryCode: 'G' }, { countryCode: null }, { countryCode: 'ke' }],
    });

    expect(options.map((option) => option.countryCode)).toEqual(['KE']);
  });

  it('names each tie, and says nothing for a standing', () => {
    expect(guideCountryTieLabel('residence')).toBe('Where you live');
    expect(guideCountryTieLabel('origin')).toBe('Where you are from');
    expect(guideCountryTieLabel('standing')).toBe('');
  });
});
