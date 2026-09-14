/**
 * Registering an employer on the way to posting a job — 14 Sep 2026.
 *
 * Posting a job needs an employer, so Post a job sends a member without one to
 * register first and expects them back. Registration used to go to the hiring
 * workspace whatever the member was doing, and a route parameter is something
 * anyone can put in a link — so only known screens are honoured.
 */
import { afterRegistrationRoute } from '../employer/register';

describe('where registering an employer leads', () => {
  it('returns to Post a job when that is where the member came from', () => {
    expect(afterRegistrationRoute('/job/create')).toBe('/job/create');
    expect(afterRegistrationRoute(['/job/create'])).toBe('/job/create');
  });

  it('goes to the hiring workspace otherwise', () => {
    expect(afterRegistrationRoute(undefined)).toBe('/job/hiring');
  });

  it('ignores a destination it does not know', () => {
    expect(afterRegistrationRoute('https://example.com/phish')).toBe('/job/hiring');
    expect(afterRegistrationRoute('/settings/delete-account')).toBe('/job/hiring');
  });
});
