/**
 * Recording a move — 19 Sep 2026.
 *
 * The Trust Centre drew a Country Experience timeline and the verification flow
 * could add a country to it, but no screen in this app could close one. A member
 * who left Mauritius for the UK stayed a current, verified resident of Mauritius,
 * and their timeline went on saying "2019 – Present" about a country they had not
 * lived in for a year.
 *
 * `/location/me/countries` has served all of this since the Location module
 * shipped. What was missing was a caller — on both sides, as it turned out: the
 * backend raised a departure event nothing consumed, and closed a standing
 * through a method nothing called.
 *
 * These tests cover the client half. What a departure *means* is pinned in the
 * backend's `CountryStandingDepartureTests`; what travels is pinned here.
 */
import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import {
  declareResidence,
  fetchResidenceTimeline,
  recordMove,
  toIsoDay,
  withdrawResidence,
} from '../location/residence';

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(apiClient, { delayResponse: 0 });
});

afterEach(() => {
  mock.restore();
});

const MAURITIUS = {
  id: 'e1',
  countryCode: 'MU',
  countryName: 'Mauritius',
  flag: '🇲🇺',
  arrivedOn: '2019-03-01',
  departedOn: null,
  startYear: 2019,
  endYear: null,
  years: 7,
  isCurrentResidence: true,
  experienceLevel: 'Seasoned',
  role: 'Verified Resident',
  languageFamiliarity: 'Fluent',
  culturalFamiliarity: 'Deep',
  isVerified: true,
  verificationState: 'Verified',
  expertiseAreas: ['Housing'],
};

function timeline(experiences: unknown[]) {
  return {
    data: {
      experiences,
      currentResidence: experiences[0] ?? null,
      countryCount: experiences.length,
      verifiedCountryCount: experiences.length,
      totalYearsAbroad: 7,
    },
  };
}

describe('reading where a member has lived', () => {
  it('reads the timeline from the route that holds it', async () => {
    mock.onGet('/location/me/countries').reply(200, timeline([MAURITIUS]));

    const result = await fetchResidenceTimeline();

    expect(result?.experiences).toHaveLength(1);
    expect(result?.experiences[0].countryCode).toBe('MU');
    expect(result?.currentResidence?.isCurrentResidence).toBe(true);
  });

  /**
   * Trust owns the proof, Location owns the claim. A member can say they live
   * somewhere before anybody has confirmed it, and the screen must be able to
   * tell the two apart — otherwise an unverified claim renders as a verified one.
   */
  it('carries the verification state, which is Trust answering and not Location', async () => {
    mock.onGet('/location/me/countries').reply(200, timeline([
      { ...MAURITIUS, isVerified: false, verificationState: 'UnderReview' },
    ]));

    const result = await fetchResidenceTimeline();

    expect(result?.experiences[0].isVerified).toBe(false);
    expect(result?.experiences[0].verificationState).toBe('UnderReview');
  });
});

describe('recording a move', () => {
  /**
   * The whole point. A departure date on the country being left is the fact the
   * backend turns into a closed standing; without it in the body, nothing
   * downstream ever hears that the member moved.
   */
  it('sends a departure date for the country being left', async () => {
    const bodies: Record<string, unknown>[] = [];

    mock.onPost('/location/me/countries').reply((config) => {
      bodies.push(JSON.parse(config.data));
      return [201, { data: MAURITIUS }];
    });

    await recordMove({
      leaving: { countryCode: 'MU', arrivedOn: '2019-03-01', role: 'Verified Resident' },
      departedOn: '2025-06-30',
      arriving: { countryCode: 'GB', arrivedOn: '2025-06-30' },
    });

    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatchObject({ countryCode: 'MU', departedOn: '2025-06-30' });
  });

  /**
   * Order matters, and not only for tidiness. Opening the new residence first
   * would leave two open residences if the close failed — which reads as living
   * in both, a state the member never chose.
   */
  it('closes the old country before opening the new one', async () => {
    const order: string[] = [];

    mock.onPost('/location/me/countries').reply((config) => {
      order.push(JSON.parse(config.data).countryCode);
      return [201, { data: MAURITIUS }];
    });

    await recordMove({
      leaving: { countryCode: 'MU', arrivedOn: '2019-03-01' },
      departedOn: '2025-06-30',
      arriving: { countryCode: 'GB', arrivedOn: '2025-06-30' },
    });

    expect(order).toEqual(['MU', 'GB']);
  });

  it('opens the new country with no departure date', async () => {
    const bodies: Record<string, unknown>[] = [];

    mock.onPost('/location/me/countries').reply((config) => {
      bodies.push(JSON.parse(config.data));
      return [201, { data: MAURITIUS }];
    });

    await recordMove({
      leaving: { countryCode: 'MU', arrivedOn: '2019-03-01' },
      departedOn: '2025-06-30',
      arriving: { countryCode: 'GB', arrivedOn: '2025-06-30' },
    });

    expect(bodies[1]).toMatchObject({ countryCode: 'GB', arrivedOn: '2025-06-30' });
    expect(bodies[1].departedOn).toBeNull();
  });

  /**
   * A failure to open the new residence must not be reported as success. The
   * member has correctly recorded that they left, and needs to be told the other
   * half did not land so they can retry it.
   */
  it('reports a failure to open the new country', async () => {
    let call = 0;

    mock.onPost('/location/me/countries').reply(() => {
      call += 1;
      return call === 1 ? [201, { data: MAURITIUS }] : [500, {}];
    });

    await expect(
      recordMove({
        leaving: { countryCode: 'MU', arrivedOn: '2019-03-01' },
        departedOn: '2025-06-30',
        arriving: { countryCode: 'GB', arrivedOn: '2025-06-30' },
      })
    ).rejects.toThrow();
  });
});

describe('declaring and withdrawing one country', () => {
  it('declares a country the member still lives in with no departure date', async () => {
    let body: Record<string, unknown> = {};

    mock.onPost('/location/me/countries').reply((config) => {
      body = JSON.parse(config.data);
      return [201, { data: MAURITIUS }];
    });

    await declareResidence({ countryCode: 'MU', arrivedOn: '2019-03-01' });

    expect(body).toEqual({ countryCode: 'MU', arrivedOn: '2019-03-01' });
  });

  /**
   * Withdrawing is not leaving. Leaving is a departure date; this says the
   * residence should never have been listed — and, on the server, does not touch
   * a verification Trust has already granted.
   */
  it('withdraws a claim by country code, not by a departure date', async () => {
    let path = '';

    mock.onDelete(/\/location\/me\/countries\/.+/).reply((config) => {
      path = config.url ?? '';
      return [204];
    });

    await withdrawResidence('MU');

    expect(path).toBe('/location/me/countries/MU');
  });
});

describe('the date format these routes bind', () => {
  /**
   * `DateOnly` on the wire. Sending a full ISO timestamp is a 400, and taking
   * the day from `toISOString()` would shift it by a day for anybody east of
   * UTC — which is most of this platform's members.
   */
  it('takes the local day, not the UTC one', () => {
    const lateEveningInMauritius = new Date(2025, 5, 30, 23, 30);

    expect(toIsoDay(lateEveningInMauritius)).toBe('2025-06-30');
  });

  it('pads single-digit months and days', () => {
    expect(toIsoDay(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
