// ─────────────────────────────────────────────────────────────────────────────
// An employer's public profile — 15 Sep 2026
//
// The employer page called `GET /employers/{id}`, which no module serves, and
// read a fixture with a star rating and followers. The server answers
// `GET /jobs/employers/{idOrSlug}` — anonymously, trimmed for outsiders — and
// lists an employer's jobs through `POST /jobs/search`. These tests pin the two
// reads and the words the page builds from them, using the profile production
// served for Okonkwo Consulting Mauritius that morning.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '@/lib/apiClient';
import {
  employerContactLinks,
  employerStatusNotice,
  fetchEmployerJobs,
  fetchEmployerProfile,
  hiringRegionLines,
  onDiasporaSince,
  openJobsLabel,
  teamRoleSentence,
} from '@/lib/employer-profile-api';
import type { EmployerResponse } from '@/types/jobs-hiring';

const EMPLOYER = '01a05770-33f2-7637-af0e-2e1ccb4f5890';

/** `GET /jobs/employers/01a05770-33f2-…` as production answered an anonymous reader on 15 Sep 2026. */
function okonkwo(overrides: Partial<EmployerResponse> = {}): EmployerResponse {
  return {
    employerId: EMPLOYER,
    slug: 'okonkwo-consulting-mauritius',
    displayName: 'Okonkwo Consulting Mauritius',
    legalName: null,
    registrationNumber: null,
    organizationType: 'Company',
    isIntermediary: false,
    companySize: 'Unspecified',
    foundedYear: null,
    countryCode: 'MU',
    description: null,
    tagline: null,
    logoMediaId: null,
    coverMediaId: null,
    contactEmail: null,
    contactPhone: null,
    websiteUrl: null,
    careersUrl: null,
    status: 'Active',
    isVerified: false,
    verificationState: 'None',
    verificationBadge: null,
    hiringRegions: [],
    members: null,
    responsiveness: { averageResponseHours: null, ghostingRate: null, offerAcceptanceRate: null, decidedCount: 0 },
    openJobCount: 2,
    registeredAt: '2026-08-31T10:49:26.374887+00:00',
    revision: 0,
    viewerRole: null,
    ...overrides,
  };
}

const envelope = <T,>(data: T) => ({ data, meta: { requestId: 'r1' } });

let api: MockAdapter;

beforeEach(() => {
  api = new MockAdapter(apiClient);
});

afterEach(() => {
  api.restore();
});

describe('reading an employer', () => {
  it('reads the route the server serves, not the one the page used to call', async () => {
    api.onGet(`/jobs/employers/${EMPLOYER}`).reply(200, envelope(okonkwo()));

    await expect(fetchEmployerProfile(EMPLOYER)).resolves.toMatchObject({ displayName: 'Okonkwo Consulting Mauritius' });
    expect(api.history.get[0].url).toBe(`/jobs/employers/${EMPLOYER}`);
  });

  it('answers null only when the platform says the employer is not there', async () => {
    api.onGet('/jobs/employers/gone').reply(404, { status: 404, code: 'jobs.employer.not-found', title: 'Not found' });
    await expect(fetchEmployerProfile('gone')).resolves.toBeNull();
  });

  it('throws for a read that failed, so a timeout never says a named organisation does not exist', async () => {
    api.onGet(`/jobs/employers/${EMPLOYER}`).networkError();
    await expect(fetchEmployerProfile(EMPLOYER)).rejects.toBeDefined();
  });

  it('lists the employer’s open jobs through search, the one route that filters by employer', async () => {
    api.onPost('/jobs/search').reply(200, envelope({ items: [{ jobId: 'j1' }], nextCursor: 'c2', hasMore: true, totalCount: null }));

    const page = await fetchEmployerJobs(EMPLOYER);

    expect(JSON.parse(api.history.post[0].data)).toMatchObject({ employerId: EMPLOYER, openOnly: true, cursor: null });
    expect(page).toEqual({ items: [{ jobId: 'j1' }], nextCursor: 'c2', hasMore: true });
  });
});

describe('the words the page uses', () => {
  it('warns about a suspended or closed employer, and says nothing about an active one', () => {
    expect(employerStatusNotice(okonkwo())).toBeNull();
    expect(employerStatusNotice(okonkwo({ status: 'Suspended' }))).toMatch(/suspended/);
    expect(employerStatusNotice(okonkwo({ status: 'Closed' }))).toMatch(/closed its profile/);
  });

  it('says how long the employer has been here', () => {
    expect(onDiasporaSince('2026-08-31T10:49:26.374887+00:00')).toBe('On Diaspora since Aug 2026');
    expect(onDiasporaSince(null)).toBe('');
  });

  it('names the countries an employer hires into, and where it sponsors visas', () => {
    expect(
      hiringRegionLines([
        { countryCode: 'GB', sponsorsVisas: true },
        { countryCode: 'MU', sponsorsVisas: false },
      ])
    ).toEqual(['United Kingdom — sponsors visas', 'Mauritius']);
    expect(hiringRegionLines(undefined)).toEqual([]);
  });

  it('counts open jobs in words', () => {
    expect(openJobsLabel(0)).toBe('No open jobs right now');
    expect(openJobsLabel(1)).toBe('1 open job');
    expect(openJobsLabel(2)).toBe('2 open jobs');
  });

  it('tells a team member their role, and says nothing to an outsider', () => {
    expect(teamRoleSentence(okonkwo())).toBeNull();
    expect(teamRoleSentence(okonkwo({ viewerRole: 'Owner' }))).toBe('You are an owner of Okonkwo Consulting Mauritius.');
  });

  it('offers only contact details that will open', () => {
    expect(employerContactLinks(okonkwo())).toEqual([]);

    expect(
      employerContactLinks(
        okonkwo({
          websiteUrl: 'https://okonkwo.example',
          careersUrl: 'javascript:alert(1)',
          contactEmail: 'jobs@okonkwo.example',
          contactPhone: '+230 5 123 4567',
        })
      )
    ).toEqual([
      { kind: 'website', label: 'Website', url: 'https://okonkwo.example' },
      { kind: 'email', label: 'Email', url: 'mailto:jobs@okonkwo.example' },
      { kind: 'phone', label: 'Call', url: 'tel:+23051234567' },
    ]);

    expect(employerContactLinks(okonkwo({ contactEmail: 'not an email', contactPhone: 'ask' }))).toEqual([]);
  });
});
