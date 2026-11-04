/**
 * The administrators' grant form (UAT, 3 Nov 2026, item 7: "the platform admin
 * did not post this grants"). The form speaks in whole amounts, country codes
 * and dates; the server takes minor units, ISO codes and instants.
 */
import {
  emptyGrantForm,
  grantFormFrom,
  grantFormProblems,
  toSaveGrantRequest,
} from '@/lib/creator/grant-admin-form';

declare const process: { cwd(): string };
const fs: { readFileSync(path: string, encoding: string): string; existsSync(path: string): boolean } =
  require('fs');
const path: { join(...parts: string[]): string } = require('path');

const filled = {
  ...emptyGrantForm(),
  title: 'Lagos newcomers fund',
  summary: 'Up to ₦500,000 for a project that helps people settle in.',
  description: 'For members running something for other members.',
  category: 'Community',
  amount: '500,000',
  minimumAmount: '100000',
  currency: 'ngn',
  countries: 'ng, gh',
  deadline: '2026-12-31',
  minimumStatus: 'VerifiedCreator' as const,
};

describe('the grant form', () => {
  it('sends minor units, upper-case codes and an end-of-day deadline', () => {
    expect(toSaveGrantRequest(filled, { publish: true })).toEqual({
      title: 'Lagos newcomers fund',
      summary: 'Up to ₦500,000 for a project that helps people settle in.',
      description: 'For members running something for other members.',
      category: 'community',
      fundingMinorUnits: 50_000_000,
      fundingMinimumMinorUnits: 10_000_000,
      currency: 'NGN',
      countryCodes: ['NG', 'GH'],
      opensAt: null,
      deadlineAt: new Date('2026-12-31T23:59:59').toISOString(),
      minimumStatus: 'VerifiedCreator',
      requiresVerifiedCreator: false,
      publish: true,
    });
  });

  it('sends no minimum when the grant is one fixed amount', () => {
    expect(toSaveGrantRequest({ ...filled, minimumAmount: '' }, { publish: false }).fundingMinimumMinorUnits).toBeNull();
  });

  it('names what is missing or wrong before anything is sent', () => {
    expect(grantFormProblems(emptyGrantForm())).toEqual(
      expect.arrayContaining(['Give the grant a title.', 'Say how much the grant awards.']),
    );
    expect(grantFormProblems({ ...filled, currency: 'naira' })).toContain(
      'The currency is a three-letter code, such as NGN or GBP.',
    );
    expect(grantFormProblems({ ...filled, countries: 'Nigeria' })).toContain(
      'Countries are two-letter codes, such as NG, GH.',
    );
    expect(grantFormProblems({ ...filled, minimumAmount: '900000' })).toContain(
      'The minimum must be below the most the grant awards.',
    );
    expect(grantFormProblems({ ...filled, deadline: '31/12/2026' })).toContain(
      'Write the deadline as a date, such as 2026-12-31.',
    );
    expect(grantFormProblems(filled)).toEqual([]);
  });

  it('opens an existing grant with its own values', () => {
    const form = grantFormFrom({
      title: 'Accra kit',
      summary: 'Kit.',
      description: 'A microphone.',
      category: 'creators',
      fundingAmount: { minorUnits: 300_000, currency: 'GHS', exponent: 2 },
      fundingMinimum: null,
      countryCodes: ['GH'],
      opensAt: null,
      deadlineAt: '2026-12-31T22:59:59.000Z',
      minimumStatus: 'Contributor',
      requiresVerifiedCreator: true,
    });

    expect(form).toMatchObject({
      title: 'Accra kit',
      amount: '3000',
      minimumAmount: '',
      currency: 'GHS',
      countries: 'GH',
      minimumStatus: 'Contributor',
      requiresVerifiedCreator: true,
    });
    expect(form.deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('who reaches it', () => {
  it('is linked from Settings only for members allowed to manage the programme', () => {
    const settings = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'settings', 'index.tsx'), 'utf8');
    expect(settings).toContain("'creator:programme:manage'");
    expect(settings).toContain('/moderation/grants');
    expect(fs.existsSync(path.join(process.cwd(), 'src', 'app', 'moderation', 'grants', 'index.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), 'src', 'app', 'moderation', 'grants', 'edit.tsx'))).toBe(true);
  });
});
