// ─────────────────────────────────────────────────────────────────────────────
// A member's own purchases and tenancies, from two routes nobody called
//
// `GET /marketplace/reservations` and `GET /housing/reservations` served a
// member's own transactions the whole time and **no screen called either**, so
// somebody could buy something or move into a property and find no record of it
// in the app. It also left the ratings work unreachable: both review routes are
// gated on a completed transaction, and there was nowhere to offer "rate this".
//
// ── The two shapes disagree in the way that keeps biting ─────────────────────
//
//     marketplace   reservationId   seller: { sellerId, displayName }   completedAt
//     housing       id              landlordId + landlordName (flat)    occupiedAt
//
// Three different spellings apiece for the same three concepts. Reading one and
// hoping is how `listing.host.*` crashed the housing screen and how `evt.id` sent
// every event row to `/community-life/event/undefined`.
// ─────────────────────────────────────────────────────────────────────────────

import {
  fetchMemberReservations,
  sortBySettledThenTitle,
  RATEABLE_STATUS,
  type MemberReservation,
} from '../reservations-api';
import { apiClient } from '../apiClient';

jest.mock('../apiClient', () => ({ apiClient: { get: jest.fn() } }));

const mockGet = apiClient.get as jest.Mock;

/** A marketplace row, spelled as `ReservationMapper` writes it. */
function purchase(overrides: Record<string, unknown> = {}) {
  return {
    reservationId: 'res-m1',
    listingId: 'list-m1',
    listingTitle: 'MacBook Air M1',
    seller: { sellerId: 'sell-1', displayName: 'Fatima Diallo' },
    status: 'Completed',
    completedAt: '2026-08-20T10:00:00Z',
    ...overrides,
  };
}

/** A housing row, spelled as `HousingRelocationMapper` writes it. */
function tenancy(overrides: Record<string, unknown> = {}) {
  return {
    id: 'res-h1',
    listingId: 'list-h1',
    listingTitle: 'Modern 2-Bed Flat',
    landlordId: 'land-1',
    landlordName: 'Kofi Mensah',
    status: 'Occupied',
    occupiedAt: '2026-08-22T10:00:00Z',
    ...overrides,
  };
}

function respondWith(marketplaceRows: unknown[], housingRows: unknown[]) {
  mockGet.mockImplementation((path: string) =>
    Promise.resolve({
      data: { data: { items: path.includes('marketplace') ? marketplaceRows : housingRows } },
    }),
  );
}

beforeEach(() => mockGet.mockReset());

describe('both spellings become one row shape', () => {
  it('reads the marketplace id from `reservationId`', async () => {
    respondWith([purchase()], []);

    const { reservations } = await fetchMemberReservations();

    // Not `id` — that is the housing spelling, and reading it here would give
    // every purchase an empty identifier and a review with nothing to attach to.
    expect(reservations[0].id).toBe('res-m1');
  });

  it('reads the housing id from `id`', async () => {
    respondWith([], [tenancy()]);

    expect((await fetchMemberReservations()).reservations[0].id).toBe('res-h1');
  });

  it('lifts the marketplace counterparty out of its nested seller', async () => {
    respondWith([purchase()], []);

    const [row] = (await fetchMemberReservations()).reservations;

    expect(row.counterpartyId).toBe('sell-1');
    expect(row.counterpartyName).toBe('Fatima Diallo');
  });

  it('reads the housing counterparty from its flat fields', async () => {
    respondWith([], [tenancy()]);

    const [row] = (await fetchMemberReservations()).reservations;

    expect(row.counterpartyId).toBe('land-1');
    expect(row.counterpartyName).toBe('Kofi Mensah');
  });

  it('marks which review route each row would use', async () => {
    respondWith([purchase()], [tenancy()]);

    const { reservations } = await fetchMemberReservations();

    expect(reservations.map((r) => r.subject).sort()).toEqual(['landlord', 'seller']);
  });

  it('never asks either route for a side it does not know', async () => {
    // Both handlers compare `side` only against the owner's side — `"Selling"`
    // and `"landlord"`. The first draft sent `buyer` and `seeker`, which worked
    // only by failing that comparison. A coincidence is not a contract.
    respondWith([], []);

    await fetchMemberReservations();

    for (const call of mockGet.mock.calls) {
      expect(call[1]?.params ?? {}).not.toHaveProperty('side');
    }
  });
});

describe('what the server will actually accept a review for', () => {
  it('pins the two statuses the eligibility rule hinges on', () => {
    // Both read off the module enums. Housing is `Occupied` rather than
    // `LeaseSigned` on purpose: a signed lease is a promise, and only occupancy
    // gives somebody a tenancy to describe.
    expect(RATEABLE_STATUS.seller).toBe('Completed');
    expect(RATEABLE_STATUS.landlord).toBe('Occupied');
  });

  it('offers the control only on a completed purchase', async () => {
    respondWith([purchase({ status: 'AwaitingCollection' }), purchase({ reservationId: 'r2' })], []);

    const { reservations } = await fetchMemberReservations();

    expect(reservations.filter((r) => r.isRateable)).toHaveLength(1);
  });

  it('does not offer it on a signed lease', async () => {
    // The row a member is most likely to expect to be rateable, and the one the
    // server would refuse.
    respondWith([], [tenancy({ status: 'LeaseSigned', occupiedAt: null })]);

    expect((await fetchMemberReservations()).reservations[0].isRateable).toBe(false);
  });

  it('reads PascalCase, because these mappers use ToString()', async () => {
    // Unlike Community, whose `ToWire` camel-cases every enum and whose casing
    // mismatch crashed `UpdateCard`. Both reservation mappers call
    // `reservation.Status.ToString()`, so the wire carries `Completed`.
    respondWith([purchase({ status: 'completed' })], []);

    expect((await fetchMemberReservations()).reservations[0].isRateable).toBe(false);
  });
});

describe('one module failing does not empty the other', () => {
  it('keeps the purchases when housing fails', async () => {
    mockGet.mockImplementation((path: string) =>
      path.includes('marketplace')
        ? Promise.resolve({ data: { data: { items: [purchase()] } } })
        : Promise.reject(new Error('housing is down')),
    );

    const { reservations, failed } = await fetchMemberReservations();

    // A member with purchases and no tenancies should see their purchases,
    // rather than an error page for a module they were not asking about.
    expect(reservations).toHaveLength(1);
    expect(failed).toEqual(['housing']);
  });

  it('reports both when both fail, rather than looking empty', async () => {
    mockGet.mockRejectedValue(new Error('offline'));

    const { reservations, failed } = await fetchMemberReservations();

    // Empty-and-fine and empty-because-broken must stay distinguishable.
    expect(reservations).toEqual([]);
    expect(failed.sort()).toEqual(['housing', 'marketplace']);
  });
});

describe('ordering', () => {
  const row = (id: string, settledAt: string | null, listingTitle = 'Zed'): MemberReservation => ({
    id,
    listingId: 'l',
    listingTitle,
    counterpartyId: null,
    counterpartyName: null,
    status: 'Completed',
    subject: 'seller',
    settledAt,
    isRateable: true,
  });

  it('puts the most recently settled first', () => {
    const sorted = sortBySettledThenTitle([
      row('old', '2026-01-01T00:00:00Z'),
      row('new', '2026-08-22T00:00:00Z'),
    ]);

    expect(sorted.map((r) => r.id)).toEqual(['new', 'old']);
  });

  it('does not bury an unsettled row below an old one', () => {
    // A null date is *unknown*, not *ancient*. Sorting it as a zero date would
    // push an in-progress purchase below one from last year.
    const sorted = sortBySettledThenTitle([row('settled', '2026-01-01T00:00:00Z'), row('pending', null)]);

    expect(sorted.map((r) => r.id)).toEqual(['settled', 'pending']);
  });

  it('falls back to the title so the order is stable', () => {
    const sorted = sortBySettledThenTitle([row('b', null, 'Beta'), row('a', null, 'Alpha')]);

    expect(sorted.map((r) => r.id)).toEqual(['a', 'b']);
  });
});
