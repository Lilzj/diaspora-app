// ─────────────────────────────────────────────────────────────────────────────
// A seller's contact details reach the platform — 21 Sep 2026
//
// Step 6 of the marketplace wizard asked for a phone number and offered three
// ways to be reached, wrote both into the draft, restored them — and sent
// neither. The two have different homes, and the wizard was missing both:
//
//   the preference  `CreateListingRequest.ContactPreference`, on the listing.
//                   `ConversationReferenceResponse` carries it, so a buyer
//                   opening a thread is told how this seller asked to be
//                   reached. Every listing on the platform therefore carried
//                   the handler's fallback, `InApp`, whatever its seller chose.
//
//   the number      `RegisterSellerRequest.Phone` on the seller profile, which
//                   is where `SellerProfileResponse.Phone` serves it from. A
//                   seller choosing "Direct Call" on a profile holding no
//                   number gives a buyer a preference with nothing behind it.
//
// The rules below are mostly about `PUT /marketplace/sellers/me`, which
// **replaces rather than merges**: every field left out of the body is set to
// null. Changing a phone number means sending the whole profile back, and this
// is only safe now that the read returns all of it.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import {
  createAndPublishMarketplaceListing,
  fetchMySellerContact,
  updateSellerContact,
} from '../marketplace-listings-api';

let api: MockAdapter;

const envelope = <T,>(data: T) => ({ data, meta: { requestId: 'test' } });

const NOT_SELLER = {
  code: 'marketplace.not-seller',
  detail: 'Set up a seller profile before listing an item.',
  title: 'Error',
  status: 403,
};

const LISTING = { listingId: '01a01b39-8265-70a9-a056-80f3e844a54c', status: 'Draft' };

/** A business seller, with everything a replace has to carry back. */
const BUSINESS = {
  displayName: 'Nwosu Electronics',
  countryCode: 'NG',
  kind: 'Business',
  legalName: 'Nwosu Electronics Limited',
  registrationNumber: 'RC-8841203',
  bio: 'Refurbished laptops, three-month warranty.',
  website: 'https://nwosu.example.com',
  phone: '+234 800 000 0000',
  email: 'sales@nwosu.example.com',
  contactPreference: 'Phone',
};

function existingSeller(seller: Record<string, unknown> = BUSINESS) {
  api.onGet('/marketplace/sellers/me/dashboard').reply(200, envelope({ seller }));
}

const puts = () => api.history.put.filter((r) => r.url === '/marketplace/sellers/me');
const registrations = () => api.history.post.filter((r) => r.url === '/marketplace/sellers');

beforeEach(() => {
  api = new MockAdapter(apiClient);
  api.onPost('/marketplace/listings').reply(201, envelope(LISTING));
  api.onPost(`/marketplace/listings/${LISTING.listingId}/publish`).reply(200, envelope(LISTING));
});

afterEach(() => {
  api.restore();
});

describe('what the platform already holds', () => {
  it('is nothing at all for a member who has never sold', async () => {
    api.onGet('/marketplace/sellers/me/dashboard').reply(403, NOT_SELLER);

    await expect(fetchMySellerContact()).resolves.toBeNull();
  });

  it('comes back for a seller, so the form can show it rather than ask again', async () => {
    existingSeller();

    await expect(fetchMySellerContact()).resolves.toEqual({
      phone: '+234 800 000 0000',
      email: 'sales@nwosu.example.com',
      contactPreference: 'Phone',
    });
  });

  it('does not answer "no profile" when the read merely failed', async () => {
    api.onGet('/marketplace/sellers/me/dashboard').reply(500);

    await expect(fetchMySellerContact()).rejects.toBeDefined();
  });
});

describe('changing a seller’s number', () => {
  /**
   * The one that matters. `UpdateSellerCommandHandler` passes `request.Bio`,
   * `request.LegalName` and the rest straight into the aggregate, so a body
   * that names only the phone sets everything else to null — and a business
   * would lose the legal name and company number Trust verified it by.
   */
  it('sends the whole profile back, so a replace loses nothing', async () => {
    existingSeller();
    api.onPut('/marketplace/sellers/me').reply(200, envelope({ sellerId: 's-1' }));

    await updateSellerContact({ phone: '+234 700 111 2222' });

    expect(puts()).toHaveLength(1);
    expect(JSON.parse(puts()[0].data)).toEqual({
      displayName: 'Nwosu Electronics',
      countryCode: 'NG',
      kind: 'Business',
      legalName: 'Nwosu Electronics Limited',
      registrationNumber: 'RC-8841203',
      bio: 'Refurbished laptops, three-month warranty.',
      website: 'https://nwosu.example.com',
      phone: '+234 700 111 2222',
      email: 'sales@nwosu.example.com',
      contactPreference: 'Phone',
    });
  });

  it('writes nothing when nothing differs, because a replace is still a write', async () => {
    existingSeller();
    api.onPut('/marketplace/sellers/me').reply(200, envelope({ sellerId: 's-1' }));

    await updateSellerContact({ phone: BUSINESS.phone });

    expect(puts()).toHaveLength(0);
  });

  it('leaves what is stored alone when it is handed an empty field', async () => {
    existingSeller();
    api.onPut('/marketplace/sellers/me').reply(200, envelope({ sellerId: 's-1' }));

    await updateSellerContact({ phone: '' });

    expect(puts()).toHaveLength(0);
  });
});

describe('publishing a listing', () => {
  it('carries a new seller’s number on the registration itself', async () => {
    api.onGet('/marketplace/sellers/me/dashboard').reply(403, NOT_SELLER);
    api.onPost('/marketplace/sellers').reply(201, envelope({ sellerId: 's-1' }));

    await createAndPublishMarketplaceListing(
      { title: 'A laptop' },
      {
        displayName: 'Adaeze Nwosu',
        countryCode: 'NG',
        contact: { phone: '+234 800 000 0000' },
      }
    );

    expect(JSON.parse(registrations()[0].data)).toEqual({
      displayName: 'Adaeze Nwosu',
      countryCode: 'NG',
      kind: 'Individual',
      phone: '+234 800 000 0000',
    });

    expect(puts()).toHaveLength(0);
  });

  it('replaces the profile of a seller who already has one', async () => {
    existingSeller();
    api.onPut('/marketplace/sellers/me').reply(200, envelope({ sellerId: 's-1' }));

    await createAndPublishMarketplaceListing(
      { title: 'A laptop' },
      {
        displayName: 'Nwosu Electronics',
        countryCode: 'NG',
        contact: { phone: '+234 700 111 2222' },
      }
    );

    expect(registrations()).toHaveLength(0);
    expect(JSON.parse(puts()[0].data).phone).toBe('+234 700 111 2222');
  });

  /**
   * Before the listing, and allowed to stop it — the alternative is a listing
   * that published while the number behind its "Direct Call" quietly did not
   * save, which is the defect this file exists to correct wearing a hat.
   */
  it('fails the publish when the platform refuses the number', async () => {
    existingSeller();
    api.onPut('/marketplace/sellers/me').reply(400, {
      code: 'marketplace.seller.contact-invalid',
      detail: 'That telephone number is not valid.',
      status: 400,
    });

    await expect(
      createAndPublishMarketplaceListing(
        { title: 'A laptop' },
        { displayName: 'Nwosu Electronics', countryCode: 'NG', contact: { phone: 'nonsense' } }
      )
    ).rejects.toBeDefined();

    expect(api.history.post.filter((r) => r.url === '/marketplace/listings')).toHaveLength(0);
  });
});
