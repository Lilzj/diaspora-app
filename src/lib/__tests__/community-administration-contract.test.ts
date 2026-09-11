// ─────────────────────────────────────────────────────────────────────────────
// Community administration on the wire — 11 Sep 2026
//
// Founding, the members list and role changes, against the shapes the deployed
// platform answers with. The response bodies below are copied from the live
// routes, not written from the adapter's own assumptions — the failure this
// repository has hit most is fixtures that agree with the bug.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import {
  changeCommunityRole,
  fetchCommunityMembers,
  proposeCommunity,
} from '../community-entity-api';

const COMMUNITY_ID = '01a0902e-4289-7f61-9d8b-d50638c7fb1b';
const USER_ID = '0dc73f0c-7efa-4b60-8706-7a60eacace65';

const envelope = <T,>(data: T) => ({ data, meta: {} });

/** A refusal exactly as `PlatformProblem` writes one — note `code`, not `errorCode`. */
const problem = (status: number, code: string, detail: string) => ({
  type: `https://diaspora.app/errors/${code}`,
  title: 'Conflict',
  status,
  detail,
  instance: `/api/v1/communities/${COMMUNITY_ID}/members/${USER_ID}/roles`,
  code,
  correlationId: 'c',
  traceId: 't',
  timestamp: '2026-09-11T12:00:00Z',
});

describe('community administration routes', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('founds a community with POST /communities and returns the founder as owner', async () => {
    mock.onPost('/communities').reply((config) => {
      const body = JSON.parse(config.data);

      expect(body).toEqual({
        name: 'Nigerians in Leeds',
        type: 'NationalDiaspora',
        visibility: 'Public',
        originCountryCode: 'NG',
        tagline: 'For everyone from Nigeria in Leeds.',
      });

      return [
        200,
        envelope({
          communityId: COMMUNITY_ID,
          state: 'Member',
          isPrimary: false,
          roles: ['Owner', 'Administrator'],
          visibility: 'CommunityOnly',
          capabilities: {
            communityId: COMMUNITY_ID,
            roles: ['Owner', 'Administrator'],
            canViewMembers: true,
            canManageRoles: true,
            canAppointAdministrators: true,
          },
        }),
      ];
    });

    const founded = await proposeCommunity({
      name: 'Nigerians in Leeds',
      type: 'NationalDiaspora',
      visibility: 'Public',
      originCountryCode: 'NG',
      tagline: 'For everyone from Nigeria in Leeds.',
    });

    expect(founded.roles).toEqual(['Owner', 'Administrator']);
    expect(founded.capabilities.canManageRoles).toBe(true);
    expect(founded.capabilities.canAppointAdministrators).toBe(true);
  });

  it('does not send empty optional fields as empty strings', async () => {
    mock.onPost('/communities').reply((config) => {
      const body = JSON.parse(config.data);
      expect(body).not.toHaveProperty('originCountryCode');
      expect(body).not.toHaveProperty('tagline');
      return [200, envelope({ communityId: COMMUNITY_ID, state: 'Member', isPrimary: false })];
    });

    await proposeCommunity({
      name: 'Faith Friends',
      type: 'FaithCommunity',
      visibility: 'Unlisted',
      originCountryCode: '',
      tagline: '',
    });
  });

  it('lists members, and keeps a missing name missing rather than using the id', async () => {
    mock.onGet(`/communities/${COMMUNITY_ID}/members`).reply(
      200,
      envelope({
        items: [
          {
            userId: USER_ID,
            displayName: 'David Mensah',
            roles: ['Owner', 'Administrator'],
            visibility: 'CommunityOnly',
            joinedAt: '2026-09-11T11:10:00Z',
            isYou: true,
          },
          { userId: 'u2', displayName: null, roles: [], visibility: 'Public', isYou: false },
        ],
        nextCursor: null,
        hasMore: false,
      })
    );

    const page = await fetchCommunityMembers(COMMUNITY_ID);

    expect(page.items[0]).toMatchObject({ displayName: 'David Mensah', isYou: true });
    expect(page.items[1].displayName).toBeNull();
    expect(page.hasMore).toBe(false);
  });

  it('changes a role with PUT …/members/{userId}/roles', async () => {
    mock.onPut(`/communities/${COMMUNITY_ID}/members/${USER_ID}/roles`).reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ role: 'Moderator', granted: true });
      return [
        200,
        envelope({ userId: USER_ID, displayName: 'Kemi', roles: ['Moderator'], isYou: false }),
      ];
    });

    const member = await changeCommunityRole(COMMUNITY_ID, USER_ID, 'Moderator', true);

    expect(member.roles).toEqual(['Moderator']);
  });

  describe('a refusal reaches the member in the words it was written in', () => {
    // `toFinancialError` shows `detail` for validation errors only, and looks
    // copy up by `errorCode`, which the backend never sends. For these codes the
    // community module writes its details for members, and they are kept.
    it.each([
      [
        409,
        'communities.community.role.needs-visible-membership',
        'This member keeps their membership private. They need to make it visible to the community before they can hold a role.',
      ],
      [
        409,
        'communities.community.role.owner-keeps-administration',
        'The owner of a community is always one of its administrators.',
      ],
      [
        403,
        'communities.community.role.only-owner-appoints-administrators',
        'Only the owner of this community can appoint or remove administrators.',
      ],
    ])('%i %s', async (status, code, detail) => {
      mock
        .onPut(`/communities/${COMMUNITY_ID}/members/${USER_ID}/roles`)
        .reply(status, problem(status, code, detail));

      await expect(
        changeCommunityRole(COMMUNITY_ID, USER_ID, 'Administrator', true)
      ).rejects.toMatchObject({ message: detail, code });
    });

    it('leaves a refusal from anywhere else to the platform copy', async () => {
      // Narrow on purpose. Another module's details are not promised to be
      // written for members, and the platform-wide fix is its own piece.
      mock
        .onPut(`/communities/${COMMUNITY_ID}/members/${USER_ID}/roles`)
        .reply(409, problem(409, 'financial.account.restricted', 'Operator detail: ledger lock 42.'));

      await expect(
        changeCommunityRole(COMMUNITY_ID, USER_ID, 'Moderator', true)
      ).rejects.not.toMatchObject({ message: 'Operator detail: ledger lock 42.' });
    });
  });
});
