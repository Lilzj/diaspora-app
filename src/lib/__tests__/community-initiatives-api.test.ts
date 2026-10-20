// ─────────────────────────────────────────────────────────────────────────────
// A community's initiatives, after the gap closed — 20 Oct 2026.
//
// CommunityProgramme serves them (backend e57082e) at the path the Phase 13
// adapter already called. These pin what would regress without a screen
// changing:
//
//   1. The paths, literally, and never the gap prefix.
//   2. The server's shape, not the simulated one: `organisers`, `startedAt`,
//      `targetDate`, `updateCount` — and no progress figure, ever.
//   3. The bodies the routes bind, including the partial PUT.
//   4. The module's own sentence on a refusal, on reads as well as writes.
//   5. An unanswered write is reported as unanswered, not as refused.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import {
  createCommunityInitiative,
  fetchCommunityInitiative,
  fetchCommunityInitiativeParticipants,
  fetchCommunityInitiatives,
  fetchCommunityInitiativeUpdates,
  joinCommunityInitiative,
  leaveCommunityInitiative,
  postCommunityInitiativeUpdate,
  updateCommunityInitiative,
} from '../community-entity-api';
import type { CommunityId } from '@/types/community-directory';

const ID = '2f1c9a30-0d5e-4c1a-9f21-5b6a7c8d9e01' as CommunityId;
const INIT = '9b1c9a30-0d5e-4c1a-9f21-5b6a7c8d9e03';
const BASE = `/communities/${ID}/initiatives`;

const envelope = <T,>(data: T) => ({ data });

function wire(overrides: Record<string, unknown> = {}) {
  return {
    id: INIT,
    communityId: ID,
    title: 'Winter coat drive',
    description: 'Coats for people who arrived this autumn.',
    status: 'Active',
    targetDate: '2026-12-31',
    startedAt: '2026-10-01T09:00:00Z',
    closedAt: null,
    organisers: [{ userId: 'u1', displayName: 'Ada', role: 'Ambassador', since: '2026-01-01T00:00:00Z' }],
    participantCount: 4,
    updateCount: 2,
    isParticipant: false,
    isOrganiser: false,
    canJoin: true,
    canEdit: false,
    canPostUpdate: false,
    createdAt: '2026-09-30T09:00:00Z',
    updatedAt: '2026-10-01T09:00:00Z',
    ...overrides,
  };
}

describe('community initiatives read and write the real routes', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('lists with the server’s shape and invents no progress figure', async () => {
    mock.onGet(BASE).reply((config) => {
      expect(config.params).toEqual({ status: 'Active' });
      return [200, envelope([wire()])];
    });

    const [initiative] = await fetchCommunityInitiatives(ID, 'Active');

    expect(initiative.status).toBe('Active');
    expect(initiative.organisers.map((o) => o.displayName)).toEqual(['Ada']);
    expect(initiative.targetDate).toBe('2026-12-31');
    expect(initiative.startedAt).toBe('2026-10-01T09:00:00Z');
    expect(initiative.updateCount).toBe(2);
    expect(initiative.participantCount).toBe(4);
    expect(initiative).not.toHaveProperty('progress');
    expect(initiative).not.toHaveProperty('leads');
  });

  it('sends no status filter when none is asked for, and reads an empty answer as none', async () => {
    mock.onGet(BASE).reply((config) => {
      expect(config.params).toBeUndefined();
      return [200, envelope(null)];
    });

    await expect(fetchCommunityInitiatives(ID)).resolves.toEqual([]);
  });

  it('never names somebody by their id, and fills in no date it was not sent', async () => {
    mock
      .onGet(`${BASE}/${INIT}`)
      .reply(200, envelope(wire({ organisers: [{ userId: 'u2', displayName: ' ', role: 'Member' }], targetDate: undefined, startedAt: undefined })));

    const initiative = await fetchCommunityInitiative(ID, INIT);

    expect(initiative.organisers[0].displayName).toBe('A member');
    expect(initiative.targetDate).toBeNull();
    expect(initiative.startedAt).toBeNull();
  });

  it('keeps the module’s sentence when a read is refused', async () => {
    mock.onGet(`${BASE}/${INIT}`).reply(404, {
      code: 'communities.community.initiative.not-found',
      detail: 'This community has no such initiative.',
    });

    const error = await fetchCommunityInitiative(ID, INIT).catch((e: unknown) => e);

    expect((error as { message: string }).message).toBe('This community has no such initiative.');
  });

  it('starts one with the body the route binds', async () => {
    mock.onPost(BASE).reply((config) => {
      expect(JSON.parse(config.data)).toEqual({
        title: 'T',
        description: 'D',
        targetDate: '2026-12-31',
        status: 'Planned',
      });
      return [200, envelope(wire({ status: 'Planned', isOrganiser: true, canEdit: true }))];
    });

    const created = await createCommunityInitiative(ID, {
      title: 'T',
      description: 'D',
      targetDate: '2026-12-31',
      status: 'Planned',
    });

    expect(created.canEdit).toBe(true);
  });

  it('sends only what changed — the PUT is partial', async () => {
    mock.onPut(`${BASE}/${INIT}`).reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ status: 'Completed', clearTargetDate: true });
      return [200, envelope(wire({ status: 'Completed', targetDate: null }))];
    });

    const updated = await updateCommunityInitiative(ID, INIT, {
      status: 'Completed',
      clearTargetDate: true,
    });

    expect(updated.status).toBe('Completed');
  });

  it('joins and leaves at /participation and answers the initiative as it stands', async () => {
    mock.onPost(`${BASE}/${INIT}/participation`).reply(200, envelope(wire({ isParticipant: true, canJoin: false, participantCount: 5 })));
    mock.onDelete(`${BASE}/${INIT}/participation`).reply(200, envelope(wire({ participantCount: 4 })));

    const joined = await joinCommunityInitiative(ID, INIT);
    expect(joined.isParticipant).toBe(true);
    expect(joined.participantCount).toBe(5);

    const left = await leaveCommunityInitiative(ID, INIT);
    expect(left.isParticipant).toBe(false);
  });

  it('keeps the refusal’s own words when a non-member tries to join', async () => {
    mock.onPost(`${BASE}/${INIT}/participation`).reply(403, {
      code: 'communities.community.initiative.join.members-only',
      detail: 'Join the community first to take part in its initiatives.',
    });

    const error = await joinCommunityInitiative(ID, INIT).catch((e: unknown) => e);

    expect((error as { message: string }).message).toBe(
      'Join the community first to take part in its initiatives.'
    );
    expect((error as { isIndeterminate?: boolean }).isIndeterminate).toBeFalsy();
  });

  it('reports a write with no answer as unanswered, not refused', async () => {
    mock.onPost(`${BASE}/${INIT}/updates`).timeout();

    const error = await postCommunityInitiativeUpdate(ID, INIT, { title: 'T', body: 'B' }).catch(
      (e: unknown) => e
    );

    expect((error as { isIndeterminate?: boolean }).isIndeterminate).toBe(true);
  });

  it('reads participants and updates, with an unseen author left unnamed', async () => {
    mock.onGet(`${BASE}/${INIT}/participants`).reply(200, envelope([{ userId: 'u3', displayName: 'Kofi', joinedAt: '2026-10-02T00:00:00Z' }]));
    mock.onGet(`${BASE}/${INIT}/updates`).reply(
      200,
      envelope([{ id: 'up1', initiativeId: INIT, title: 'First week', body: '12 coats', postedAt: '2026-10-08T00:00:00Z' }])
    );

    const participants = await fetchCommunityInitiativeParticipants(ID, INIT);
    expect(participants.map((p) => p.displayName)).toEqual(['Kofi']);

    const updates = await fetchCommunityInitiativeUpdates(ID, INIT);
    expect(updates[0].author).toBeNull();
  });

  it('posts an update with the body the route binds', async () => {
    mock.onPost(`${BASE}/${INIT}/updates`).reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ title: 'T', body: 'B' });
      return [200, envelope({ id: 'up2', initiativeId: INIT, title: 'T', body: 'B', postedAt: 'x', author: { userId: 'u1', displayName: 'Ada' } })];
    });

    const posted = await postCommunityInitiativeUpdate(ID, INIT, { title: 'T', body: 'B' });
    expect(posted.author?.displayName).toBe('Ada');
  });

  it('never reaches the gap prefix', async () => {
    mock.onAny(/community-directory\/v0/).reply(() => {
      throw new Error('a real read reached the simulated prefix');
    });
    mock.onAny().reply(200, envelope([]));

    await fetchCommunityInitiatives(ID);
    await fetchCommunityInitiativeParticipants(ID, INIT);
    await fetchCommunityInitiativeUpdates(ID, INIT);

    expect(mock.history.get.every((request) => !String(request.url).includes('/community-directory/v0'))).toBe(true);
  });
});
