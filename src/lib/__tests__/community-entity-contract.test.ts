// ─────────────────────────────────────────────────────────────────────────────
// The community entity, after the gap closed.
//
// `community-gap-directory-api.ts` served every one of these against a
// simulated adapter for the whole of Phase 13. They now call B18's real routes,
// and these pin the five things that would regress without a screen changing:
//
//   1. **The URL space.** A call reaching `/community-directory/v0` would 404
//      against a real deployment; one reaching a *wrong* certified route would
//      not, and that is worse. Two routes are deliberately not where the
//      register sketched them, so the paths are asserted literally.
//   2. **The comma-joined filters.** The route binds `types` as a string and
//      splits it. An array here serializes as `types[]=…`, binds nothing, and
//      the model binder discards it without an error — a 200 with an unfiltered
//      list under a lit filter chip.
//   3. **The removal actions.** They go in the query string, because minimal
//      APIs refuse to infer a body on DELETE. A body would be silently ignored
//      and the route would fall back to its default, which is `leave` — so
//      "unfollow" would remove somebody from a community they had joined.
//   4. **The privacy floor.** An absent visibility reads as `Private` and an
//      absent capability reads as `false`. §41 and §62: a missing field must
//      never be consent, and never authority.
//   5. **A withheld member count stays absent.** Rendering it as zero would be
//      a statement the server declined to make.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import {
  fetchCapabilities,
  fetchCommunity,
  fetchCommunityDirectory,
  fetchMembershipSet,
  performMembershipAction,
  setMembershipVisibility,
  setPrimaryCommunity,
} from '../community-entity-api';
import type { CommunityId } from '@/types/community-directory';

const COMMUNITY_ID = '2f1c9a30-0d5e-4c1a-9f21-5b6a7c8d9e01' as CommunityId;

const envelope = <T,>(data: T) => ({ data, meta: {} });

const community = (over: Record<string, unknown> = {}) => ({
  id: COMMUNITY_ID,
  slug: 'nigerians-in-london',
  name: 'Nigerians in London',
  type: 'NationalDiaspora',
  status: 'Active',
  visibility: 'Public',
  origin: { countryCode: 'NG', countryName: null, flag: null, regionName: null },
  identity: { logoMediaId: null, iconName: 'people', accentColor: '#0f7b6c' },
  memberCount: { value: 412, source: 'backend' },
  ...over,
});

describe('the community routes are the certified ones', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  // ── The URL space ─────────────────────────────────────────────────────────

  it('reads the directory from /communities, never a gap prefix', async () => {
    mock.onGet('/communities').reply(200, envelope({ items: [], hasMore: false }));

    await fetchCommunityDirectory();

    expect(mock.history.get[0].url).toBe('/communities');
    expect(mock.history.get[0].url).not.toContain('community-directory/v0');
  });

  it('reads the membership set from /communities/me/memberships', async () => {
    // Not `/communities/memberships/me`, which the register named and which has
    // answered B18's *programme* memberships since the module shipped.
    mock.onGet('/communities/me/memberships').reply(200, envelope({ memberships: [] }));

    await fetchMembershipSet();

    expect(mock.history.get[0].url).toBe('/communities/me/memberships');
  });

  it('writes the primary community to /communities/me/primary', async () => {
    // Not `/users/me/primary-community`: no module on this platform owns a
    // `/users` prefix, so the register sketched a route into a space that does
    // not exist.
    mock.onPut('/communities/me/primary').reply(200, envelope({ memberships: [] }));

    await setPrimaryCommunity(COMMUNITY_ID);

    expect(mock.history.put[0].url).toBe('/communities/me/primary');
    expect(JSON.parse(mock.history.put[0].data)).toEqual({ communityId: COMMUNITY_ID });
  });

  it('clears the primary with a null rather than a second route', async () => {
    mock.onPut('/communities/me/primary').reply(200, envelope({ memberships: [] }));

    await setPrimaryCommunity(null);

    expect(JSON.parse(mock.history.put[0].data)).toEqual({ communityId: null });
  });

  it('resolves a profile by handle as well as by id', async () => {
    mock.onGet(/\/communities\/.+/).reply(200, envelope(community()));

    await fetchCommunity('nigerians-in-london');

    expect(mock.history.get[0].url).toBe('/communities/nigerians-in-london');
  });

  // ── The comma-joined filters ──────────────────────────────────────────────

  it('sends types and origins as comma-joined strings, not arrays', async () => {
    mock.onGet('/communities').reply(200, envelope({ items: [], hasMore: false }));

    await fetchCommunityDirectory({
      types: ['NationalDiaspora', 'CityChapter'],
      originCountryCodes: ['NG', 'GH'],
    });

    const params = mock.history.get[0].params;

    expect(params.types).toBe('NationalDiaspora,CityChapter');
    expect(params.originCountryCodes).toBe('NG,GH');

    expect(Array.isArray(params.types)).toBe(false);
  });

  it('sends the ordering the route actually serves', async () => {
    // `members` and `name` are refused with their own error codes rather than
    // silently served in another order, so the default must be one that works.
    mock.onGet('/communities').reply(200, envelope({ items: [], hasMore: false }));

    await fetchCommunityDirectory();

    expect(mock.history.get[0].params.sort).toBe('relevance');
  });

  // ── The removal actions ───────────────────────────────────────────────────

  it('puts a removal action in the query string, never a body', async () => {
    mock.onDelete(/\/membership/).reply(200, envelope({
      communityId: COMMUNITY_ID,
      state: 'None',
      isPrimary: false,
    }));

    await performMembershipAction(COMMUNITY_ID, 'unfollow');

    const request = mock.history.delete[0];

    expect(request.params).toEqual({ action: 'unfollow' });
    expect(request.data).toBeUndefined();
  });

  it('posts a joining action as a body', async () => {
    mock.onPost(/\/membership/).reply(200, envelope({
      communityId: COMMUNITY_ID,
      state: 'Member',
      isPrimary: false,
    }));

    await performMembershipAction(COMMUNITY_ID, 'join');

    expect(JSON.parse(mock.history.post[0].data)).toEqual({ action: 'join' });
  });

  // ── The privacy floor ─────────────────────────────────────────────────────

  it('reads an absent visibility as private', async () => {
    mock.onGet('/communities/me/memberships').reply(200, envelope({
      memberships: [{ communityId: COMMUNITY_ID, state: 'Member', isPrimary: false }],
    }));

    const set = await fetchMembershipSet();

    expect(set.memberships[0].visibility).toBe('Private');
  });

  it('reads an absent capability as false, never as unknown', async () => {
    mock.onGet(/\/capabilities$/).reply(200, envelope({ communityId: COMMUNITY_ID }));

    const capabilities = await fetchCapabilities(COMMUNITY_ID);

    expect(capabilities.canModerateContent).toBe(false);
    expect(capabilities.canViewMembers).toBe(false);
    expect(capabilities.roles).toEqual([]);
  });

  it('sends the visibility the member chose', async () => {
    mock.onPut(/\/membership\/visibility$/).reply(200, envelope({
      communityId: COMMUNITY_ID,
      state: 'Member',
      isPrimary: false,
      visibility: 'CommunityOnly',
    }));

    const membership = await setMembershipVisibility(COMMUNITY_ID, 'CommunityOnly');

    expect(JSON.parse(mock.history.put[0].data)).toEqual({ visibility: 'CommunityOnly' });
    expect(membership.visibility).toBe('CommunityOnly');
  });

  // ── Provenance and absence ────────────────────────────────────────────────

  it('marks every figure from this arm as a backend one', async () => {
    mock.onGet(/\/communities\/.+/).reply(200, envelope(community()));

    const result = await fetchCommunity(COMMUNITY_ID);

    expect(result.memberCount).toEqual({ value: 412, source: 'backend' });
  });

  it('keeps a withheld member count absent rather than zero', async () => {
    // A private community the viewer does not belong to reports no size at all.
    mock.onGet(/\/communities\/.+/).reply(200, envelope(community({ memberCount: null })));

    const result = await fetchCommunity(COMMUNITY_ID);

    expect(result.memberCount).toBeNull();
    expect(result.memberCount).not.toEqual({ value: 0, source: 'backend' });
  });

  it('marks a directory page as backend data', async () => {
    mock.onGet('/communities').reply(200, envelope({
      items: [{ community: community(), membershipState: 'None', isPrimary: false }],
      hasMore: false,
    }));

    const page = await fetchCommunityDirectory();

    expect(page.source).toBe('backend');
    expect(page.items[0].membershipState).toBe('None');
  });

  it('resolves a logo id to a media URL rather than passing the id through', async () => {
    mock.onGet(/\/communities\/.+/).reply(200, envelope(community({
      identity: { logoMediaId: 'a1b2c3', iconName: null, accentColor: null },
    })));

    const result = await fetchCommunity(COMMUNITY_ID);

    expect(result.identity.logoUrl).toContain('/media/a1b2c3/content');
  });

  it('carries a suspended status and its reason rather than failing', async () => {
    // §75 keeps suspended distinct from deleted so a link resolves to an
    // explanation. A client that treated a non-Active status as an error would
    // throw the explanation away.
    mock.onGet(/\/communities\/.+/).reply(200, envelope(community({
      status: 'Suspended',
      statusReason: 'Paused while we review a report from a member.',
    })));

    const result = await fetchCommunity(COMMUNITY_ID);

    expect(result.status).toBe('Suspended');
    expect(result.statusReason).toBe('Paused while we review a report from a member.');
  });

  it('leaves the country name and flag to the device', async () => {
    // §58: a server-supplied English name as the only label is not localizable.
    mock.onGet(/\/communities\/.+/).reply(200, envelope(community()));

    const result = await fetchCommunity(COMMUNITY_ID);

    expect(result.origin.countryCode).toBe('NG');
    expect(result.origin.countryName).toBeNull();
    expect(result.origin.flag).toBeNull();
  });
});
