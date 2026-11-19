// ─────────────────────────────────────────────────────────────────────────────
// The Community Life hub's rails are reached by the invalidations (FARCH-003)
//
// ── The defect this fixes ───────────────────────────────────────────────────
//
// The hub reads four B18 lists — a country's campaigns, a city's volunteer
// opportunities, the open polls, the latest announcements. All four were array
// literals in `hooks/community-life.ts`, written under
// `['community-programme', 'hub', …]`, a namespace `communityProgrammeKeys` did
// not own.
//
// The mutations that change those things invalidated the family the factory did
// own: `['community-programme', 'campaigns']`, `['community-programme',
// 'polls']`, `['community-programme', 'announcements']`,
// `['community-programme', 'volunteer']`.
//
// **React Query matches a query key prefix positionally.** A filter of
// `['community-programme', 'campaigns']` matches a key whose element 1 is
// `campaigns`. The hub's element 1 is `hub`. So none of those invalidations
// could ever reach the rail the member was looking at, and after creating a
// campaign, opening a poll, posting an announcement or publishing an
// opportunity the hub went on showing the previous list until its own
// `staleTime` expired — 60 seconds for the rails, 30 for everything else.
//
// Bounded, then, rather than permanent: a refetch was coming. But every other
// list in the application refreshes on the member's own action, and these four
// did not.
//
// ── Why the first test here is the one that matters ─────────────────────────
//
// `the factory family alone does not reach the hub` asserts the *defect*: that
// invalidating `campaignsAll()` leaves the hub entry untouched. It is there so
// that the second invalidation each mutation now performs cannot be deleted as
// redundant — remove it and the rail test below fails, with this one explaining
// why.
// ─────────────────────────────────────────────────────────────────────────────

import { QueryClient } from '@tanstack/react-query';

import { communityProgrammeKeys } from '../community-programme-api';

const COUNTRY = 'NG';
const CITY = 'Lagos';

/** A hub rail: the key the hub reads, and the prefix its mutation invalidates. */
const RAILS = [
  {
    rail: 'campaigns',
    read: () => communityProgrammeKeys.hubCampaigns(COUNTRY),
    invalidatedBy: () => communityProgrammeKeys.hubCampaignsAll(),
    factoryFamily: () => communityProgrammeKeys.campaignsAll(),
  },
  {
    rail: 'opportunities',
    read: () => communityProgrammeKeys.hubOpportunities(CITY),
    invalidatedBy: () => communityProgrammeKeys.hubOpportunitiesAll(),
    factoryFamily: () => communityProgrammeKeys.volunteerAll(),
  },
  {
    rail: 'polls',
    read: () => communityProgrammeKeys.hubPolls(),
    invalidatedBy: () => communityProgrammeKeys.hubPolls(),
    factoryFamily: () => communityProgrammeKeys.pollsAll(),
  },
  {
    rail: 'announcements',
    read: () => communityProgrammeKeys.hubAnnouncements(),
    invalidatedBy: () => communityProgrammeKeys.hubAnnouncements(),
    factoryFamily: () => communityProgrammeKeys.announcementsAll(),
  },
] as const;

describe('the hub rails are invalidated by the mutations that change them', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    client.clear();
  });

  it.each(RAILS.map((rail) => [rail.rail, rail] as const))(
    '%s: the factory family alone does NOT reach the hub — this is the defect',
    async (_name, rail) => {
      client.setQueryData(rail.read(), { items: ['the list the member is looking at'] });

      await client.invalidateQueries({ queryKey: rail.factoryFamily() });

      expect(client.getQueryState(rail.read())?.isInvalidated).toBe(false);
    }
  );

  it.each(RAILS.map((rail) => [rail.rail, rail] as const))(
    '%s: the hub prefix the mutation now also invalidates does reach it',
    async (_name, rail) => {
      client.setQueryData(rail.read(), { items: ['the list the member is looking at'] });

      await client.invalidateQueries({ queryKey: rail.invalidatedBy() });

      expect(client.getQueryState(rail.read())?.isInvalidated).toBe(true);
    }
  );
});

describe('the hub keys are shaped so a prefix can reach them', () => {
  it.each(RAILS.map((rail) => [rail.rail, rail] as const))(
    '%s: the invalidation prefix is a prefix of the key the hub reads',
    (_name, rail) => {
      const read = rail.read() as readonly unknown[];
      const prefix = rail.invalidatedBy() as readonly unknown[];

      expect(read.slice(0, prefix.length)).toEqual([...prefix]);
    }
  );

  it('every hub key sits under the hub namespace, so hubAll() clears the lot', () => {
    const hubAll = communityProgrammeKeys.hubAll() as readonly unknown[];

    for (const rail of RAILS) {
      const read = rail.read() as readonly unknown[];
      expect(read.slice(0, hubAll.length)).toEqual([...hubAll]);
    }
  });

  it('the hub namespace is distinct from every family it mirrors', () => {
    for (const rail of RAILS) {
      const read = rail.read() as readonly unknown[];
      const family = rail.factoryFamily() as readonly unknown[];

      // Same root, different element 1 — which is exactly why the family
      // prefix could not match, and why both are invalidated.
      expect(read[0]).toBe(family[0]);
      expect(read[1]).not.toBe(family[1]);
    }
  });
});
