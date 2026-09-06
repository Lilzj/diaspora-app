// ─────────────────────────────────────────────────────────────────────────────
// The revenue dashboard reads the platform's own attribution
//
// ── What this replaces ───────────────────────────────────────────────────────
//
// `useCreatorRevenue` was two-armed and honest about it: B15's wallet balance
// was real, the attribution beside it was `/creator-gap/v0`, and the screen said
// so. `Diaspora.Modules.Creator` now records an earning against every payment it
// can attribute, so the second arm is real too — and the tests that matter are
// the ones that would catch this arm being *subtly* wrong rather than absent.
//
// ── The four failures this is written against ───────────────────────────────
//
//   **The rows are named `items`.** Every paged route on this platform has been
//   a coin toss — the referral history names them `referrals`, the rewards
//   catalogue names them `rewards`, the activity feed names them `items`. A
//   client reading the wrong one gets an empty page and no error at all, which
//   is indistinguishable from a creator who has never earned anything. That is
//   the failure mode `backend-row-property-drift` exists for and it is checked
//   here directly.
//
//   **Gross and share are not amount and fee.** The server sends what a member
//   paid and what the creator's rate gives them; the client's type is an amount
//   with a fee taken off it. Getting the direction wrong shows a creator the
//   platform's cut as their income, or the reverse — off by the whole fee, on
//   the one screen where being wrong about money is the entire problem.
//
//   **A cursor is the server's and not the client's.** It encodes an instant
//   *and* a row, because two earnings settling in the same instant is ordinary
//   here. A client that built one from a timestamp would silently skip whichever
//   of them the page boundary fell between.
//
//   **`transactionId` has no source and must stay null.** An earning is a claim;
//   the transaction that settles it belongs to a payout that does not exist. A
//   fabricated reference is a row that opens a screen showing nothing.
// ─────────────────────────────────────────────────────────────────────────────

import { fetchEarnings, fetchRevenueSummary } from '../creator-earning-api';
import { apiClient } from '../apiClient';

jest.mock('../apiClient', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

const mockGet = apiClient.get as jest.Mock;

/** One earning, in the shape `CreatorEarningResponse` serialises to. */
function earning(overrides: Record<string, unknown> = {}) {
  return {
    earningId: 'a3f0e2c1-0000-4000-8000-000000000001',
    source: 'SponsoredContent',
    state: 'Pending',
    // £10.00 paid, £7.00 to the creator. Deliberately not equal, and
    // deliberately not a round fraction of each other.
    amountMinorUnits: 700,
    grossMinorUnits: 1_000,
    currency: 'GBP',
    exponent: 2,
    subjectType: 'guide',
    subjectId: 'b1c2d3e4-0000-4000-8000-000000000002',
    occurredAt: '2026-09-01T10:00:00+00:00',
    settledAt: null,
    stateReason: null,
    availableAt: '2026-10-01T10:00:00+00:00',
    description: 'Promotion of a guide',
    ...overrides,
  };
}

function page(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      data: {
        items: [earning()],
        nextCursor: '2026-09-01T10:00:00.0000000+00:00|a3f0e2c1000040008000000000000001',
        hasMore: true,
        ...overrides,
      },
    },
  };
}

function summary(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      data: {
        currency: 'GBP',
        exponent: 2,
        lifetimeMinorUnits: 14_865,
        pendingMinorUnits: 275,
        availableMinorUnits: 420,
        processingMinorUnits: 0,
        paidMinorUnits: 14_170,
        reversedMinorUnits: 270,
        clearingDays: 30,
        hasOtherCurrencies: true,
        currentPeriodMinorUnits: 695,
        currentPeriodLabel: 'The last 30 days',
        generatedAt: '2026-09-06T09:00:00+00:00',
        bySource: [
          {
            source: 'SponsoredContent',
            label: 'Sponsored content',
            minorUnits: 11_840,
            count: 7,
            sharePercentage: 79.7,
          },
        ],
        ...overrides,
      },
    },
  };
}

beforeEach(() => mockGet.mockReset());

describe('the earnings page', () => {
  it('reads rows from `items`, which is what this route names them', async () => {
    mockGet.mockResolvedValue(page());

    const result = await fetchEarnings();

    // The whole point. A client keyed on `earnings` — the development arm's
    // name for the same rows — would return an empty page and throw nothing.
    expect(result.earnings).toHaveLength(1);
    expect(result.earnings[0].earningId).toBe('a3f0e2c1-0000-4000-8000-000000000001');
  });

  it('calls the certified route and never the gap prefix', async () => {
    mockGet.mockResolvedValue(page());

    await fetchEarnings({ state: 'Pending', source: 'Donation', take: 20 });

    const [path, config] = mockGet.mock.calls[0];

    expect(path).toBe('/creators/me/earnings');
    expect(String(path)).not.toContain('creator-gap');
    expect(config.params).toMatchObject({ state: 'Pending', source: 'Donation', take: 20 });
  });

  it('sends the cursor back exactly as it was issued', async () => {
    const issued = '2026-09-01T10:00:00.0000000+00:00|a3f0e2c1000040008000000000000001';
    mockGet.mockResolvedValue(page({ nextCursor: null, hasMore: false }));

    await fetchEarnings({ cursor: issued });

    // Not re-encoded, not truncated to the timestamp, not URL-mangled. The
    // server parses this back into an instant and a row id; anything this
    // client did to it would page past a row or refuse to page at all.
    expect(mockGet.mock.calls[0][1].params.cursor).toBe(issued);
  });

  it('carries the server’s paging answer rather than inferring one', async () => {
    mockGet.mockResolvedValue(page());
    const more = await fetchEarnings();
    expect(more.hasMore).toBe(true);
    expect(more.nextCursor).toContain('|');

    mockGet.mockResolvedValue(page({ nextCursor: null, hasMore: false }));
    const last = await fetchEarnings();
    expect(last.hasMore).toBe(false);
    expect(last.nextCursor).toBeNull();
  });
});

describe('an earning’s money', () => {
  it('maps gross to `amount` and the share to `netAmount`, not the other way round', async () => {
    mockGet.mockResolvedValue(page());

    const [row] = (await fetchEarnings()).earnings;

    // £10.00 was paid; £7.00 is the creator's. Reversing these shows somebody
    // the platform's cut as their income.
    expect(row.amount.minorUnits).toBe(1_000);
    expect(row.netAmount.minorUnits).toBe(700);
    expect(row.fee?.minorUnits).toBe(300);
  });

  it('divides by the exponent once, at the boundary', async () => {
    mockGet.mockResolvedValue(page());

    const [row] = (await fetchEarnings()).earnings;

    expect(row.amount.amount).toBe(10);
    expect(row.netAmount.amount).toBe(7);
    expect(row.amount.exponent).toBe(2);
    expect(row.amount.currency).toBe('GBP');
  });

  it('honours an exponent that is not two', async () => {
    // JPY has no minor unit. A client that assumed two would show ¥1,200 as
    // ¥12.00 — the same class of error as a hardcoded currency symbol, and
    // invisible in a GBP-only fixture.
    mockGet.mockResolvedValue(
      page({ items: [earning({ currency: 'JPY', exponent: 0, grossMinorUnits: 1_200, amountMinorUnits: 1_200 })] })
    );

    const [row] = (await fetchEarnings()).earnings;

    expect(row.amount.amount).toBe(1_200);
    expect(row.amount.currency).toBe('JPY');
  });

  it('leaves `fee` null when the creator keeps all of it', async () => {
    // A donation seeds at 100%. A zero-valued `fee` would render as "Diaspora
    // took £0.00", which is a sentence about a cut nobody takes.
    mockGet.mockResolvedValue(
      page({ items: [earning({ source: 'Donation', grossMinorUnits: 500, amountMinorUnits: 500 })] })
    );

    const [row] = (await fetchEarnings()).earnings;

    expect(row.fee).toBeNull();
    expect(row.amount.minorUnits).toBe(500);
    expect(row.netAmount.minorUnits).toBe(500);
  });

  it('leaves `transactionId` null rather than inventing one', async () => {
    mockGet.mockResolvedValue(page());

    const [row] = (await fetchEarnings()).earnings;

    // Nothing on the wire carries it. A row that claimed one would offer a link
    // to a transaction screen that has nothing to show.
    expect(row.transactionId).toBeNull();
  });

  it('carries the clearing date the server computed', async () => {
    mockGet.mockResolvedValue(page());

    const [row] = (await fetchEarnings()).earnings;

    expect(row.availableAt).toBe('2026-10-01T10:00:00+00:00');
    expect(row.description).toBe('Promotion of a guide');
  });
});

describe('the revenue summary', () => {
  it('reads every balance the server sends', async () => {
    mockGet.mockResolvedValue(summary());

    const result = await fetchRevenueSummary();

    expect(mockGet.mock.calls[0][0]).toBe('/creators/me/revenue/summary');
    expect(result.lifetimeEarned.minorUnits).toBe(14_865);
    expect(result.available.minorUnits).toBe(420);
    expect(result.pending.minorUnits).toBe(275);
    expect(result.paidOut.minorUnits).toBe(14_170);
  });

  it('keeps the three facts a summary would otherwise lose', async () => {
    mockGet.mockResolvedValue(summary());

    const result = await fetchRevenueSummary();

    // Each of these is served and each was, at one point, dropped on the floor
    // by this client. `hasOtherCurrencies` is the sharpest: dropping it turns an
    // honest partial total into a wrong complete one.
    expect(result.hasOtherCurrencies).toBe(true);
    expect(result.clearingDays).toBe(30);
    expect(result.reversed?.minorUnits).toBe(270);
  });

  it('does not net reversals out of the lifetime figure', async () => {
    mockGet.mockResolvedValue(summary());

    const result = await fetchRevenueSummary();

    // The server already excluded them. Subtracting again here would understate
    // a creator's lifetime earnings by the amount that was refunded.
    expect(result.lifetimeEarned.minorUnits).toBe(14_865);
    expect(result.lifetimeEarned.minorUnits).toBe(
      result.pending.minorUnits +
        result.available.minorUnits +
        result.processing.minorUnits +
        result.paidOut.minorUnits
    );
  });

  it('takes the share percentage from the server and computes none', async () => {
    mockGet.mockResolvedValue(summary());

    const [row] = (await fetchRevenueSummary()).breakdown;

    // 11,840 of 14,865 is 79.65%. The server said 79.7. A client that divided
    // would disagree with the figure beside it, and §11 forbids it deciding.
    expect(row.sharePercentage).toBe(79.7);
    expect(row.label).toBe('Sponsored content');
    expect(row.transactionCount).toBe(7);
    expect(row.amount.minorUnits).toBe(11_840);
  });

  it('passes a day window through without touching the balances', async () => {
    mockGet.mockResolvedValue(summary());

    await fetchRevenueSummary(30);

    // `days`, not `period`. The development arm took a period name and this
    // route does not; sending the wrong one is silently ignored by the binder
    // and returns an all-time window under a "last 30 days" heading.
    expect(mockGet.mock.calls[0][1].params).toEqual({ days: 30 });
  });
});
