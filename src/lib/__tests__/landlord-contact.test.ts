// ─────────────────────────────────────────────────────────────────────────────
// A landlord's contact details reach the platform — 21 Sep 2026
//
// Step 5 of the housing wizard asked for a phone number, an email address and a
// preferred channel, wrote all three into the draft, restored them when the
// draft came back — and sent none of them anywhere. The publish payload had no
// contact fields at all, and `CreateHousingListingRequest` has nowhere to put
// them: contact lives on the landlord profile, which `createAndPublishListing`
// was already opening with a display name and a country and nothing else.
//
// So a landlord typed a number, was let through, and the number went nowhere.
//
// Two rules here are about not destroying what a member already has, and both
// exist because `PATCH /housing/landlords/me` coalesces against what is stored:
// an omitted field is left alone, and an empty string is a value. The create
// screen's fields are empty by default.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import {
  createAndPublishListing,
  fetchMyLandlordContact,
  updateLandlordContact,
} from '../housing-listings-api';

let api: MockAdapter;

const envelope = <T,>(data: T) => ({ data, meta: { requestId: 'test' } });

const NOT_LANDLORD = {
  code: 'housing.not-landlord',
  detail: 'Set up a landlord profile before listing a property.',
  title: 'Error',
  status: 403,
};

const LANDLORD_ID = '7b1d2f4e-3a55-4c21-9f77-0b0d5e6a4f33';
const LISTING = { id: '01a01b39-8265-70a9-a056-80f3e844a54c', status: 'Draft' };

/** A member who already lets something, with the details the platform holds. */
function existingLandlord(held: { phoneNumber?: string | null; email?: string | null; showContactPublicly?: boolean | null }) {
  api.onGet('/housing/dashboard').reply(200, envelope({ landlord: { id: LANDLORD_ID } }));
  api.onGet(`/housing/landlords/${LANDLORD_ID}`).reply(200, envelope({ id: LANDLORD_ID, ...held }));
}

function patches() {
  return api.history.patch.filter((request) => request.url === '/housing/landlords/me');
}

function registrations() {
  return api.history.post.filter((request) => request.url === '/housing/landlords');
}

beforeEach(() => {
  api = new MockAdapter(apiClient);
  api.onPost('/housing/listings').reply(201, envelope(LISTING));
  api.onPost(`/housing/listings/${LISTING.id}/publish`).reply(200, envelope(LISTING));
});

afterEach(() => {
  api.restore();
});

describe('what the platform already holds', () => {
  it('is nothing at all for a member who has never let anything', async () => {
    api.onGet('/housing/dashboard').reply(403, NOT_LANDLORD);

    await expect(fetchMyLandlordContact()).resolves.toBeNull();
  });

  it('comes back for a landlord, so the form can show it rather than ask again', async () => {
    existingLandlord({
      phoneNumber: '+230 5791 2345',
      email: 'host@example.com',
      showContactPublicly: true,
    });

    await expect(fetchMyLandlordContact()).resolves.toEqual({
      phoneNumber: '+230 5791 2345',
      email: 'host@example.com',
      showContactPublicly: true,
    });
  });

  /**
   * The platform answers `null` for anybody who is not the landlord, and that
   * is not permission. Reading a missing flag as "yes" would publish somebody's
   * telephone number on the strength of a field that was not there.
   */
  it('does not read a missing flag as permission to publish a number', async () => {
    existingLandlord({ phoneNumber: '+230 5791 2345', showContactPublicly: null });

    await expect(fetchMyLandlordContact()).resolves.toEqual({
      phoneNumber: '+230 5791 2345',
      email: null,
      showContactPublicly: false,
    });
  });

  it('does not answer "no profile" when the read merely failed', async () => {
    api.onGet('/housing/dashboard').reply(500);

    await expect(fetchMyLandlordContact()).rejects.toBeDefined();
  });
});

describe('changing what the platform holds', () => {
  it('sends only the fields it was given', async () => {
    existingLandlord({});
    api.onPatch('/housing/landlords/me').reply(200, envelope({ id: LANDLORD_ID }));

    await updateLandlordContact({ phoneNumber: '+230 5700 0001' });

    expect(patches()).toHaveLength(1);
    expect(JSON.parse(patches()[0].data)).toEqual({ phoneNumber: '+230 5700 0001' });
  });

  /**
   * An empty field is a field the member left alone, not an instruction to
   * clear one. The wizard's email box is empty by default, so sending it would
   * wipe the address of every landlord who did not retype it.
   */
  it('never sends an empty string, which would clear what is stored', async () => {
    existingLandlord({});
    api.onPatch('/housing/landlords/me').reply(200, envelope({ id: LANDLORD_ID }));

    await updateLandlordContact({ phoneNumber: '', email: '' });

    expect(patches()).toHaveLength(0);
  });

  it('sends the flag even when it is false, because false is a choice', async () => {
    existingLandlord({});
    api.onPatch('/housing/landlords/me').reply(200, envelope({ id: LANDLORD_ID }));

    await updateLandlordContact({ showContactPublicly: false });

    expect(JSON.parse(patches()[0].data)).toEqual({ showContactPublicly: false });
  });
});

describe('publishing a listing', () => {
  /**
   * A first listing opens the profile, so the details ride in on the
   * registration. A second request to set them would be a second thing to fail
   * between a member and their listing.
   */
  it('carries a new landlord’s details on the registration itself', async () => {
    api.onGet('/housing/dashboard').reply(403, NOT_LANDLORD);
    api.onPost('/housing/landlords').reply(201, envelope({ id: LANDLORD_ID }));

    await createAndPublishListing(
      { title: 'A flat' },
      {
        displayName: 'Adaeze Nwosu',
        countryCode: 'NG',
        contact: {
          phoneNumber: '+234 800 000 0000',
          email: 'adaeze@example.com',
          showContactPublicly: true,
        },
      }
    );

    expect(JSON.parse(registrations()[0].data)).toEqual({
      displayName: 'Adaeze Nwosu',
      countryCode: 'NG',
      kind: 'Individual',
      phoneNumber: '+234 800 000 0000',
      email: 'adaeze@example.com',
      showContactPublicly: true,
    });

    expect(patches()).toHaveLength(0);
  });

  it('patches the profile of a landlord who already has one', async () => {
    existingLandlord({ phoneNumber: '+230 5791 2345' });
    api.onPatch('/housing/landlords/me').reply(200, envelope({ id: LANDLORD_ID }));

    await createAndPublishListing(
      { title: 'A flat' },
      {
        displayName: 'Adaeze Nwosu',
        countryCode: 'MU',
        contact: { phoneNumber: '+230 5700 0001' },
      }
    );

    expect(registrations()).toHaveLength(0);
    expect(JSON.parse(patches()[0].data)).toEqual({ phoneNumber: '+230 5700 0001' });
  });

  /** Nothing changed on the step, so nothing is written. */
  it('writes nothing when the caller has no changes to make', async () => {
    existingLandlord({ phoneNumber: '+230 5791 2345' });
    api.onPatch('/housing/landlords/me').reply(200, envelope({ id: LANDLORD_ID }));

    await createAndPublishListing(
      { title: 'A flat' },
      { displayName: 'Adaeze Nwosu', countryCode: 'MU', contact: {} }
    );

    expect(patches()).toHaveLength(0);
  });

  /**
   * Before the listing, and allowed to stop it. A number the platform refused
   * is one the member should be told about — and the alternative, a listing
   * that published while the contact details silently did not save, is the
   * shape this whole file exists to correct.
   */
  it('fails the publish when the platform refuses the contact details', async () => {
    existingLandlord({});
    api.onPatch('/housing/landlords/me').reply(400, {
      code: 'housing.landlord.contact-invalid',
      detail: 'That email address is not valid.',
      status: 400,
    });

    await expect(
      createAndPublishListing(
        { title: 'A flat' },
        { displayName: 'Adaeze Nwosu', countryCode: 'MU', contact: { email: 'not-an-address' } }
      )
    ).rejects.toBeDefined();

    expect(api.history.post.filter((request) => request.url === '/housing/listings')).toHaveLength(0);
  });
});
