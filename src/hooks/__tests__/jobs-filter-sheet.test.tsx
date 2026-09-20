// ─────────────────────────────────────────────────────────────────────────────
// Discover's Jobs filters reach the route — 20 Sep 2026
//
// The Jobs sheet offered five controls. `filteredJobs` applied one thing, the
// lister's origin country, and the request carried neither the employment type
// nor the verified-employer toggle. Choosing "Part-Time" moved the chip and
// changed nothing on screen.
//
// **The hyphen is why this is tested at the network boundary.** `GET /jobs`
// parses `type` with `Enum.TryParse(..., ignoreCase: true)` against `JobType`,
// whose members are `FullTime` and `PartTime`. `Full-Time` does not parse, and
// an unparseable value is not refused — the filter is dropped and every job
// comes back. Asserting on the hook's own state would pass on that; asserting
// on the request the route receives does not.
// ─────────────────────────────────────────────────────────────────────────────

import { jobFilterParams, JOB_TYPE_CHOICES } from '@/lib/discover-filters';

describe('jobFilterParams', () => {
  it('sends the name the route parses, not the one on the chip', () => {
    expect(jobFilterParams('Full-Time', false)).toEqual({ type: 'FullTime' });
    expect(jobFilterParams('Part-Time', false)).toEqual({ type: 'PartTime' });
  });

  it('sends the verified filter only when it is on', () => {
    expect(jobFilterParams(null, true)).toEqual({ verified: true });
    expect(jobFilterParams(null, false)).toEqual({});
  });

  it('carries both together', () => {
    expect(jobFilterParams('Volunteer', true)).toEqual({
      type: 'Volunteer',
      verified: true,
    });
  });

  /**
   * An unknown chip sends nothing. The alternative is sending a value the route
   * discards without saying so, which is the shape of the defect this fixes.
   */
  it('sends nothing for a type the route would not recognise', () => {
    expect(jobFilterParams('Full Time', false)).toEqual({});
    expect(jobFilterParams('', false)).toEqual({});
  });

  /**
   * Every chip the sheet renders has to map. A chip added to the list without a
   * wire name silently filters nothing, which is exactly how the sheet spent
   * its life.
   */
  it('maps every chip the sheet offers', () => {
    for (const choice of JOB_TYPE_CHOICES) {
      expect(jobFilterParams(choice, false).type).toBeDefined();
    }
  });
});

describe('the Jobs sheet', () => {
  const fs = require('fs');
  const path = require('path');

  const discover = fs.readFileSync(
    path.join(process.cwd(), 'src', 'app', '(tabs)', 'discover.tsx'),
    'utf8'
  );

  it('sends the sheet filters with the jobs request', () => {
    expect(discover).toContain('jobFilterParams(selectedJobType, filterVerified)');
  });

  it('renders its chips from the mapping rather than a second list of labels', () => {
    expect(discover).toContain('JOB_TYPE_CHOICES.map(');
    expect(discover).not.toMatch(/\['Full-Time', 'Part-Time'/);
  });

  /**
   * **Offered nothing the platform cannot answer.** No job search filters on
   * accommodation, meals or transport, and the browse row carries no
   * `benefitsFlags` — `JobCard`'s own header records that the wire has none. The
   * three toggles set state nobody read.
   */
  it('no longer offers benefit filters the platform cannot apply', () => {
    expect(discover).not.toMatch(/perkAccommodation|perkMeals|perkTransport/);
    expect(discover).not.toContain('Include Benefits');
  });
});
