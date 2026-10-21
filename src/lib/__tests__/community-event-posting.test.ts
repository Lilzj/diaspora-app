// "Post in community" and a community's own events (21 Oct 2026).
//
// The create body carries `communityId` only for a community the server said
// this member may post in; the 403 refusal is recognised by its code; the
// community list asks by community id; and an event's community survives the
// wire mapping so the event page can show it.

import {
  eventCommunityRefusal,
  isEventCommunityForbidden,
  postableCommunities,
} from '../community/event-posting';
import { fetchEvents, toEventBrowseQuery } from '../community-life-api';
import { toEvent } from '../event-wire';
import { apiClient } from '../apiClient';
import type { CommunityMembership } from '@/types/community-directory';
import { noCommunityCapabilities } from '@/types/community-directory';

jest.mock('../apiClient', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
const path = require('path') as { join(...segments: string[]): string };

function membership(communityId: string, canPostToCommunity: boolean, state = 'Member'): CommunityMembership {
  return {
    communityId,
    state: state as CommunityMembership['state'],
    isPrimary: false,
    roles: [],
    capabilities: { ...noCommunityCapabilities(communityId), canPostToCommunity },
    visibility: 'Private' as CommunityMembership['visibility'],
  };
}

describe('the communities a member may post an event in', () => {
  const names: Record<string, { name: string; slug: string }> = {
    c1: { name: 'Mauritians in London', slug: 'mauritians-london' },
    c2: { name: 'Akan Society', slug: 'akan' },
    c3: { name: 'Followed only', slug: 'followed' },
  };

  it('lists only those the server says canPostToCommunity, by name', () => {
    const list = postableCommunities(
      [membership('c1', true), membership('c2', true), membership('c3', false, 'Following')],
      (id) => names[id]
    );

    expect(list.map((entry) => entry.id)).toEqual(['c2', 'c1']);
    expect(list[0]).toEqual({ id: 'c2', name: 'Akan Society', slug: 'akan' });
  });

  it('does not invent permission from a member state the server did not grant', () => {
    expect(postableCommunities([membership('c1', false)], (id) => names[id])).toEqual([]);
  });

  it('still offers a community it cannot name, without inventing one', () => {
    expect(postableCommunities([membership('zz', true)], () => undefined)[0].name).toBe(
      'A community you belong to'
    );
  });
});

describe('the 403 when the community is refused', () => {
  it('is recognised by its code', () => {
    expect(
      isEventCommunityForbidden({
        response: { status: 403, data: { code: 'community-life.event.community-forbidden' } },
      })
    ).toBe(true);
    expect(isEventCommunityForbidden({ response: { status: 403, data: { code: 'other' } } })).toBe(false);
    expect(isEventCommunityForbidden({ response: { status: 400 } })).toBe(false);
  });

  it('is told plainly, with the way forward', () => {
    const text = eventCommunityRefusal('Akan Society');
    expect(text).toContain('Akan Society');
    expect(text).toMatch(/current member/);
    expect(text).toMatch(/Your details are still here/);
  });
});

describe('the create screen sends the choice', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src', 'app', 'community-life', 'event', 'create.tsx'),
    'utf8'
  );

  it('puts communityId on the create body, only for an offered community and never for a series', () => {
    expect(source).toContain('communityId: communityIdToSend,');
    expect(source).toMatch(
      /communityIdToSend = formData\.isRecurring \? undefined : \(postCommunity\?\.id \?\? undefined\)/
    );
    expect(source).toContain('postableCommunities(');
  });

  it('shows the refusal on both create paths', () => {
    expect(source.match(/isEventCommunityForbidden\(err\)/g)).toHaveLength(2);
  });
});

describe('a community’s events', () => {
  const mockGet = apiClient.get as jest.Mock;
  beforeEach(() => mockGet.mockReset());

  it('asks by community id', async () => {
    mockGet.mockResolvedValue({ data: { data: { items: [{ eventId: 'e1', communityId: 'c1' }] } } });

    const page = await fetchEvents({ communityId: 'c1', sortBy: 'date', limit: 2 });

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet.mock.calls[0][1]?.params).toMatchObject({ communityId: 'c1', sort: 'Soonest', limit: 2 });
    expect(page.items[0].communityId).toBe('c1');
  });

  it('sends no communityId when there is none', () => {
    expect(toEventBrowseQuery({}).communityId).toBeUndefined();
  });

  it('keeps an event’s community through the wire mapping, and null when it has none', () => {
    expect(toEvent({ eventId: 'e1', communityId: 'c1' }).communityId).toBe('c1');
    expect(toEvent({ eventId: 'e2', communityId: null }).communityId).toBeNull();
    expect(toEvent({ eventId: 'e3' }).communityId).toBeNull();
  });
});
