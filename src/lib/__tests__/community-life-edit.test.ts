// ─────────────────────────────────────────────────────────────────────────────
// Owner edits for events and organisations (14 Oct 2026)
//
// What the edit screens send, pinned at the wire:
//
//   * a PATCH carries **only the fields that changed** — the routes are partial,
//     and a field sent back unchanged is still a write;
//   * a changed contact channel sends **every** channel, because the server
//     replaces the contact whole (`ApplyContent`), and a partial one would erase
//     the email the member did not touch;
//   * no `baseRevision`: one PATCH checks it at each step and bumps it between
//     them, so a two-field save would conflict with itself;
//   * clearing the places goes to the capacity route as null — the PATCH cannot
//     say "no limit";
//   * photos detach and attach on their own paths, once per reference.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import {
  editErrorMessage,
  eventEditFormFrom,
  eventEditMissing,
  eventEditProblem,
  organizationEditFormFrom,
  organizationEditProblem,
  planPhotoChanges,
  saveEventEdits,
  saveOrganizationEdits,
} from '../community-life-api';
import type { EventWire } from '../event-wire';
import type { OrganizationWire } from '@/types/community-life';

const EVENT_ID = '0b6d2f4e-4f1c-4d1a-9a55-2b7c1e0f9a01';
const ORG_ID = '7c1e0f9a-2b7c-4d1a-9a55-0b6d2f4e4f1c';
const COVER = '11111111-1111-4111-8111-111111111111';
const GALLERY = '22222222-2222-4222-8222-222222222222';
const NEW_PHOTO = '33333333-3333-4333-8333-333333333333';

const envelope = <T,>(data: T) => ({ data, meta: {} });

const eventWire = (over: Partial<EventWire> = {}): EventWire => ({
  eventId: EVENT_ID,
  title: 'Diwali night',
  summary: 'Lamps, food and music',
  description: 'All welcome.',
  categoryKey: 'cultural',
  capacity: { maximum: 80, goingCount: 3, interestedCount: 0, waitlistCount: 0, isFull: false },
  isFree: true,
  contact: {
    phone: '+230 5555 0000',
    whatsApp: null,
    email: 'host@example.org',
    website: null,
    contactName: 'Priya',
  },
  media: [
    { mediaId: COVER, role: 'Cover', order: 0 },
    { mediaId: GALLERY, role: 'Gallery', order: 0 },
  ],
  status: 'Published',
  revision: 4,
  ...over,
});

const orgWire = (over: Partial<OrganizationWire> = {}): OrganizationWire => ({
  organizationId: ORG_ID,
  name: 'Mauritian Association of Leeds',
  summary: 'Bringing Mauritians in Leeds together',
  description: 'Founded 1998.',
  mission: 'Community first',
  organizationTypeKey: 'association',
  contact: { phone: null, whatsApp: null, email: 'hello@example.org', website: null, contactName: 'Desk' },
  socialLinks: { facebook: 'https://facebook.com/mal', instagram: null },
  media: [{ mediaId: COVER, role: 'Cover', order: 0 }],
  revision: 2,
  ...over,
});

const noPhotos = { removed: [], added: [] };

describe('community life owner edits', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
    mock.onPatch(/.*/).reply(200, envelope(eventWire()));
    mock.onPut(/.*/).reply(200, envelope(eventWire()));
    mock.onPost(/.*/).reply(200, envelope(eventWire()));
    mock.onDelete(/.*/).reply(200, envelope(eventWire()));
  });

  afterEach(() => {
    mock.restore();
  });

  describe('event', () => {
    it('PATCHes only the title when only the title changed', async () => {
      const wire = eventWire();
      const form = { ...eventEditFormFrom(wire), title: 'Diwali night 2026' };

      await saveEventEdits(EVENT_ID, wire, form, noPhotos);

      expect(mock.history.patch).toHaveLength(1);
      expect(mock.history.patch[0].url).toBe(`/community-life/events/${EVENT_ID}`);
      expect(JSON.parse(mock.history.patch[0].data)).toEqual({ title: 'Diwali night 2026' });
      expect(mock.history.put).toHaveLength(0);
      expect(mock.history.post).toHaveLength(0);
      expect(mock.history.delete).toHaveLength(0);
    });

    it('sends the catalogue key, the capacity and isFree in the wire spelling, without baseRevision', async () => {
      const wire = eventWire();
      const form = { ...eventEditFormFrom(wire), categoryKey: 'music', capacity: '120', isFree: false };

      await saveEventEdits(EVENT_ID, wire, form, noPhotos);

      const sent = JSON.parse(mock.history.patch[0].data);
      expect(sent).toEqual({ categoryKey: 'music', capacity: 120, isFree: false });
      expect(sent).not.toHaveProperty('baseRevision');
      expect(sent).not.toHaveProperty('category');
    });

    it('sends the whole contact, the hidden contact name included, when one channel changes', async () => {
      const wire = eventWire();
      const form = { ...eventEditFormFrom(wire), phone: '+230 5555 1111' };

      await saveEventEdits(EVENT_ID, wire, form, noPhotos);

      expect(JSON.parse(mock.history.patch[0].data)).toEqual({
        contact: {
          phone: '+230 5555 1111',
          whatsApp: null,
          email: 'host@example.org',
          website: null,
          contactName: 'Priya',
        },
      });
    });

    it('clears the place limit through the capacity route as null, not the PATCH', async () => {
      const wire = eventWire();
      const form = { ...eventEditFormFrom(wire), capacity: '' };

      await saveEventEdits(EVENT_ID, wire, form, noPhotos);

      expect(mock.history.patch).toHaveLength(0);
      expect(mock.history.put).toHaveLength(1);
      expect(mock.history.put[0].url).toBe(`/community-life/events/${EVENT_ID}/capacity`);
      expect(JSON.parse(mock.history.put[0].data).capacity).toBeNull();
    });

    it('sends nothing for an untouched form', async () => {
      const wire = eventWire();
      await saveEventEdits(EVENT_ID, wire, eventEditFormFrom(wire), noPhotos);
      expect(mock.history.patch).toHaveLength(0);
      expect(mock.history.put).toHaveLength(0);
    });

    it('detaches removed photos and attaches new ones on the media paths', async () => {
      const wire = eventWire();
      await saveEventEdits(EVENT_ID, wire, eventEditFormFrom(wire), {
        removed: [GALLERY],
        added: [NEW_PHOTO],
      });

      expect(mock.history.patch).toHaveLength(0);
      expect(mock.history.delete.map((r) => r.url)).toEqual([
        `/community-life/events/${EVENT_ID}/media/${GALLERY}`,
      ]);
      expect(mock.history.post).toHaveLength(1);
      expect(mock.history.post[0].url).toBe(`/community-life/events/${EVENT_ID}/media`);
      expect(JSON.parse(mock.history.post[0].data)).toEqual({ mediaId: NEW_PHOTO, role: 'Gallery' });
    });

    it('keeps the form when the PATCH is refused, and says why', async () => {
      mock.onPatch(/.*/).reply(400, { title: 'Invalid', detail: 'The title is too long.' });
      const wire = eventWire();
      const form = { ...eventEditFormFrom(wire), title: 'Changed' };

      const failure = await saveEventEdits(EVENT_ID, wire, form, { removed: [], added: [NEW_PHOTO] }).catch(
        (cause: unknown) => cause
      );

      expect(editErrorMessage(failure)).toBe('The title is too long.');
      // Photos wait for the fields: nothing attached after a refused PATCH.
      expect(mock.history.post).toHaveLength(0);
    });

    it('names the missing required fields and refuses a bad capacity before saving', () => {
      const form = { ...eventEditFormFrom(eventWire()), title: ' ', summary: '' };
      expect(eventEditMissing(form)).toEqual(['Title', 'Summary']);
      expect(eventEditProblem({ ...eventEditFormFrom(eventWire()), capacity: '0' })).toMatch(/whole number/);
      expect(eventEditProblem({ ...eventEditFormFrom(eventWire()), capacity: '' })).toBeNull();
    });
  });

  describe('organisation', () => {
    it('PATCHes only the changed name and mission', async () => {
      const wire = orgWire();
      const form = { ...organizationEditFormFrom(wire), name: 'MAL', mission: 'People first' };

      await saveOrganizationEdits(ORG_ID, wire, form, noPhotos);

      expect(mock.history.patch).toHaveLength(1);
      expect(mock.history.patch[0].url).toBe(`/community-life/organizations/${ORG_ID}`);
      expect(JSON.parse(mock.history.patch[0].data)).toEqual({ name: 'MAL', mission: 'People first' });
    });

    it('sends every social link when one changes, so the others are not erased', async () => {
      const wire = orgWire();
      const form = { ...organizationEditFormFrom(wire), instagram: 'https://instagram.com/mal' };

      await saveOrganizationEdits(ORG_ID, wire, form, noPhotos);

      expect(JSON.parse(mock.history.patch[0].data)).toEqual({
        socialLinks: {
          facebook: 'https://facebook.com/mal',
          instagram: 'https://instagram.com/mal',
          twitter: null,
          youTube: null,
          linkedIn: null,
          tikTok: null,
        },
      });
    });

    it('sends the type as organizationTypeKey', async () => {
      const wire = orgWire();
      const form = { ...organizationEditFormFrom(wire), organizationTypeKey: 'charity' };
      await saveOrganizationEdits(ORG_ID, wire, form, noPhotos);
      expect(JSON.parse(mock.history.patch[0].data)).toEqual({ organizationTypeKey: 'charity' });
    });

    it('replaces a removed cover with the first new photo, on the organisation media paths', async () => {
      const wire = orgWire();
      await saveOrganizationEdits(ORG_ID, wire, organizationEditFormFrom(wire), {
        removed: [COVER],
        added: [NEW_PHOTO, GALLERY],
      });

      expect(mock.history.delete.map((r) => r.url)).toEqual([
        `/community-life/organizations/${ORG_ID}/media/${COVER}`,
      ]);
      expect(mock.history.post.map((r) => r.url)).toEqual([
        `/community-life/organizations/${ORG_ID}/media`,
        `/community-life/organizations/${ORG_ID}/media`,
      ]);
      expect(mock.history.post.map((r) => JSON.parse(r.data))).toEqual([
        { mediaId: NEW_PHOTO, role: 'Cover' },
        { mediaId: GALLERY, role: 'Gallery' },
      ]);
    });

    it('refuses a social link that is not an http(s) address, naming it', () => {
      const form = { ...organizationEditFormFrom(orgWire()), tikTok: '@mal' };
      expect(organizationEditProblem(form)).toBe('The TikTok link must start with https://');
    });
  });

  it('detaches a photo once per reference it has', () => {
    const plan = planPhotoChanges(
      [
        { mediaId: COVER, role: 'Cover' },
        { mediaId: COVER, role: 'Gallery' },
      ],
      [COVER],
      []
    );
    expect(plan.detach).toEqual([COVER, COVER]);
  });
});
