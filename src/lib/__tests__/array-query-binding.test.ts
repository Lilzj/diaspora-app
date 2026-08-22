// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — array query parameters (Remediation Wave M-4)
//
// Found by the request-binding drift check, which compares what the client
// *sends* against what the backend *binds* — and which exists because almost
// every defect this remediation has found returns a 200.
//
// This one returned a 200 carrying the **unfiltered set**. A member filtering
// their job applications to "Rejected" saw every application they had ever
// sent, presented as their rejections. Nothing failed; the list was simply
// longer than it should have been, which is invisible without knowing the
// right answer.
//
// The test asserts the serialised URL rather than `config.params`, because
// `config.params` shows the object the caller passed and is identical either
// way. The bug lives entirely in the encoding.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from '../apiClient';

describe('array query parameters', () => {
  it('repeats the bare key, which is what ASP.NET binds', () => {
    // `string[] statuses` binds from `?status=A&status=B`. Axios 1.x defaults
    // to `?status[]=A&status[]=B`, which matches no parameter — so the filter
    // is discarded and the route answers unfiltered.
    const uri = apiClient.getUri({ url: '/jobs/applications', params: { status: ['A', 'B'] } });

    expect(uri).toContain('status=A');
    expect(uri).toContain('status=B');
    expect(uri).not.toContain('status%5B%5D');
    expect(uri).not.toContain('status[]');
  });

  it('leaves scalars exactly as they were', () => {
    // The reason this fix is safe to make globally: it reaches only requests
    // that carry an array, and those were already broken. Verified rather than
    // assumed — the previous belief about axios was also stated confidently, in
    // a comment, and was wrong.
    const uri = apiClient.getUri({
      url: '/providers',
      params: { query: 'plumber', cityName: 'London', limit: 20 },
    });

    expect(uri).toContain('query=plumber');
    expect(uri).toContain('cityName=London');
    expect(uri).toContain('limit=20');
  });

  it('does not index a mixed request’s array', () => {
    const uri = apiClient.getUri({
      url: '/notifications',
      params: { category: ['billing', 'community'], unreadOnly: true },
    });

    expect(uri).toContain('category=billing');
    expect(uri).toContain('category=community');
    expect(uri).toContain('unreadOnly=true');
    expect(uri).not.toContain('%5B%5D');
  });
});
