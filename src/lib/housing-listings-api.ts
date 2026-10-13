// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Housing listing creation and publication
//
// `housing/create.tsx` posted the listing and then said:
//
//     Listing Published!
//     Your property has been listed for the community.
//
// with a button offering to go and look at it in Discover. The listing was not
// published and was not in Discover, and **the screen's own comment said so**:
//
//   > The listing is created as a private draft whatever the payload says —
//   > publishing is a separate route (`POST /housing/listings/{id}/publish`)
//   > that this screen does not yet call, so a newly created listing is not yet
//   > discoverable.
//
// That is the rarest kind of defect in this sweep: the fix was known, written
// down next to the bug, and not applied. The member paid for it — a landlord
// with an empty room believed it was advertised to the whole community, and the
// only feedback available to them was an empty Discover tab that they had been
// told to expect their listing in.
//
// ── The contract, which is a two-step on purpose ─────────────────────────────
//
//   POST /housing/listings              → 201, always Draft, always Private
//   POST /housing/listings/{id}/publish → the listing becomes discoverable
//
// `CreateHousingListingCommand`'s own summary is *"Draft a property. Always
// private until published."*, and the domain enforces it: `HousingListing.Draft`
// sets `Status = Draft` "whatever the caller asked for". The old payload's
// `status: 'Active'` field was therefore not merely ignored — there is no
// `status` on `CreateHousingListingRequest` at all — and sending it never had
// any chance of publishing anything.
//
// The split is not an accident to paper over. Publishing runs checks that
// drafting does not, and either of them can refuse:
//
//   * **`housing.listing.not-publishable`** (400). `IsPublishable` demands at
//     least one media reference, a non-empty summary and an accommodation type,
//     and refuses a listing that is Hidden or Suspended. A member who skipped
//     the photo step gets this, and needs to be told *which* thing is missing
//     rather than "publish failed".
//   * **`housing.fraud.suspected`** (403). `HousingFraudAssessor` runs inside
//     the publish handler and can hide the listing outright. This one must not
//     be dressed up as a transient error and must not invite a retry loop —
//     retrying is precisely what a fraudulent lister would do.
//
// ── Why publication failure is not a creation failure ────────────────────────
//
// The two calls fail independently, and conflating them would lose the
// member's work. If create succeeds and publish is refused, **the draft exists
// and is safe** — the correct thing to tell the member is that their listing
// was saved and why it is not yet visible, not that posting failed. So
// `createAndPublishListing` reports three distinct outcomes rather than
// throwing on anything short of total success, and the screen renders all
// three differently.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { toList } from './platform-envelope';

interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/** The fields of `HousingListingResponse` this flow actually needs. */
export interface CreatedHousingListing {
  id: string;
  status?: string;
  slug?: string | null;
}

// ── The landlord profile ─────────────────────────────────────────────────────
//
// Found by the E2E completion phase, as the housing twin of DEFECT-008.
// `HousingAuthorizationService` resolves a landlord before **any** listing
// write, and answers
//
//     403 housing.not-landlord — "Set up a landlord profile before listing a property."
//
// `POST /housing/landlords` is published and takes three fields — `displayName`,
// `kind`, `countryCode` — and **no surface in this application called it**. Only
// `GET /housing/landlords/{idOrSlug}` was wired, from `housing/host/[id].tsx`.
// So a member letting a room for the first time met a refusal on their first
// request, exactly as a first-time seller did in the marketplace.
//
// Recorded in `runtime-remediation/e2e-completion/housing-e2e.md` as a FRONTEND
// GAP established by contract rather than observed on a screen — it is fixed
// here alongside the device verification that observes it.

/** `GET /housing/dashboard` answers 403 `housing.not-landlord` when there is none. */
export async function hasLandlordProfile(): Promise<boolean> {
  try {
    await apiClient.get('/housing/dashboard');
    return true;
  } catch (cause) {
    if (problemCode(cause) === 'housing.not-landlord') return false;
    // Any other failure is not evidence that the member has no profile, and
    // answering `false` would make the caller create a duplicate.
    throw cause;
  }
}

/**
 * How a landlord may be reached, and whether the platform says so.
 *
 * `showContactPublicly` is the whole of it. The platform models no preferred
 * channel for housing — `LandlordContact` holds a number, an address, a website
 * and one flag — so a screen offering WhatsApp against a phone call against
 * email is offering a distinction nothing keeps. What it does keep is whether a
 * browsing member sees any of it, and the default is no.
 */
export interface LandlordContact {
  phoneNumber: string | null;
  email: string | null;
  showContactPublicly: boolean;
}

/** The fields of `LandlordProfileResponse` this flow reads. */
interface LandlordProfileShape {
  id: string;
  phoneNumber?: string | null;
  email?: string | null;
  showContactPublicly?: boolean | null;
}

/** The landlord summary on `GET /housing/dashboard`. */
interface HousingDashboardShape {
  landlord?: { id?: string | null } | null;
}

/**
 * The contact details the platform holds for this member, or null when they
 * have never let anything.
 *
 * Two requests, because neither one answers it alone: the dashboard names the
 * landlord profile but carries no contact fields, and the profile read carries
 * them but has to be asked for by id. `showContactPublicly` comes back only for
 * the owner — it is a setting, not a fact about them — which is what makes this
 * readable at all; before 21 Sep 2026 it could be written and never read.
 */
export async function fetchMyLandlordContact(): Promise<LandlordContact | null> {
  let landlordId: string | undefined;

  try {
    const dashboard = await apiClient.get<Envelope<HousingDashboardShape>>('/housing/dashboard');
    landlordId = dashboard.data.data?.landlord?.id ?? undefined;
  } catch (cause) {
    // No profile is an answer, not a failure: it is the state a first-time
    // landlord is in, and the create screen has nothing to prefill from.
    if (isNotLandlordError(cause)) return null;
    throw cause;
  }

  if (!landlordId) return null;

  const profile = await apiClient.get<Envelope<LandlordProfileShape>>(
    `/housing/landlords/${encodeURIComponent(landlordId)}`
  );

  const held = profile.data.data;

  return {
    phoneNumber: held.phoneNumber ?? null,
    email: held.email ?? null,
    // False when the platform did not say. A missing flag is not permission to
    // publish somebody's telephone number.
    showContactPublicly: held.showContactPublicly === true,
  };
}

/**
 * `PATCH /housing/landlords/me` — changes only what it is given.
 *
 * Every field is optional on the wire and the handler coalesces against what is
 * stored, so **an empty string is not the same as an omission**: sending
 * `email: ''` would replace an address the member had, and the create screen
 * leaves that field blank by default. Nothing empty is sent from here.
 */
export async function updateLandlordContact(contact: Partial<LandlordContact>): Promise<void> {
  const changes: Record<string, unknown> = {};

  if (contact.phoneNumber) changes.phoneNumber = contact.phoneNumber;
  if (contact.email) changes.email = contact.email;
  if (contact.showContactPublicly !== undefined) {
    changes.showContactPublicly = contact.showContactPublicly;
  }

  if (Object.keys(changes).length === 0) return;

  await apiClient.patch('/housing/landlords/me', changes);
}

/**
 * `POST /housing/landlords` — the step the client never took.
 *
 * `kind` defaults to `Individual`: a member listing a spare room is a person,
 * and asking them to declare a letting-agency type before they can post is a
 * step neither the contract nor the product needs. A member who *is* an agency
 * can say so afterwards through `PATCH /housing/landlords/me`.
 */
export async function createLandlordProfile(input: {
  displayName: string;
  countryCode: string;
  kind?: string;
  contact?: Partial<LandlordContact>;
}): Promise<void> {
  await apiClient.post('/housing/landlords', {
    displayName: input.displayName,
    countryCode: input.countryCode,
    kind: input.kind ?? 'Individual',
    // Sent on the way in rather than patched afterwards: the member typed them
    // on the same form, and a second request is a second thing to fail.
    phoneNumber: input.contact?.phoneNumber || undefined,
    email: input.contact?.email || undefined,
    showContactPublicly: input.contact?.showContactPublicly,
  });
}

/**
 * Make sure the member can write to housing, creating the profile once if they
 * have never let anything before.
 *
 * A 409 is treated as success: it means the profile already existed, which is
 * the state this function exists to guarantee.
 */
export async function ensureLandlordProfile(input: {
  displayName: string;
  countryCode: string;
  kind?: string;
  contact?: Partial<LandlordContact>;
}): Promise<'created' | 'existing'> {
  // The caller needs to know which happened. A profile that was just created
  // already carries the contact details; one that existed has its own, and
  // overwriting them is a decision for whoever asked.
  if (await hasLandlordProfile()) return 'existing';

  try {
    await createLandlordProfile(input);
    return 'created';
  } catch (cause) {
    const status = (cause as { response?: { status?: number } })?.response?.status;
    if (status === 409) return 'existing';
    throw cause;
  }
}

/** `housing.not-landlord` — the member has no landlord profile. */
export function isNotLandlordError(cause: unknown): boolean {
  return problemCode(cause) === 'housing.not-landlord';
}

/** One amenity the platform knows about, as the create form offers it. */
export interface HousingAmenity {
  key: string;
  name: string;
  group: string;
  isAccessibilityFeature: boolean;
}

/**
 * `GET /housing/amenities` — the catalogue a listing's amenities must come from.
 *
 * **The create form used to send free text, and every listing failed.** The
 * field was pre-filled with `High-speed Internet, Washing Machine, Heating`,
 * split on commas and posted as amenity *keys*. The catalogue's keys are slugs
 * — `air-conditioning`, `parking`, `elevator` — so the server answered
 * `housing.amenity.not-found`, which is a 404, and refused the whole listing.
 * A landlord who never touched the field still hit it, which is why production
 * held a landlord profile and no listings at all.
 *
 * Anonymous, so the form can fill itself before anything else is known.
 */
export async function fetchHousingAmenities(): Promise<HousingAmenity[]> {
  const response = await apiClient.get('/housing/amenities');

  // `toList`, not `response.data.data`. The route answers a bare array today,
  // and the platform's own guard is right that reading it that way is a
  // decision rather than an observation: the day it gains paging the list moves
  // to `data.items` and a direct read becomes an empty form. `toList` takes
  // either shape.
  //
  // Order is the server's — it groups the catalogue the way a listing form
  // renders it, and re-sorting here would be this screen inventing a taxonomy.
  return toList<HousingAmenity>(response.data);
}

/** One row of `GET /housing/accommodation-types`. `key` is what a listing sends. */
export interface AccommodationType {
  key: string;
  name: string;
  description?: string | null;
  isShared: boolean;
  isTemporary: boolean;
  order: number;
  isActive: boolean;
}

/**
 * `GET /housing/accommodation-types` — the property types a listing may be filed under.
 *
 * Until 13 Oct 2026 the form kept its own twelve labels ("Single Room", "Vacation
 * Rental", "Serviced Apartment"…) and guessed a server key from each; most of them
 * guessed nothing and the listing was refused. The server's list is the only one.
 */
export async function fetchAccommodationTypes(): Promise<AccommodationType[]> {
  const response = await apiClient.get('/housing/accommodation-types');
  return toList<AccommodationType>(response.data)
    .filter((type) => type.isActive !== false)
    .sort((a, b) => a.order - b.order);
}

/** A served choice: `key` is sent, `label` is shown. */
export interface HousingChoice {
  key: string;
  label: string;
}

export interface HousingListingOptions {
  furnishing: HousingChoice[];
  leaseTypes: HousingChoice[];
}

/**
 * `GET /housing/listing-options` — furnishing and lease length, as the server names them.
 *
 * Added 13 Oct 2026. The form offered "6 Months", "1 Year", "Flexible", "Short-let"
 * and "Partially Furnished"; none is a value the server has, and its parser turns an
 * unknown value into "unspecified" without a word, so every lease the form sent was lost.
 */
export async function fetchHousingListingOptions(): Promise<HousingListingOptions> {
  const response = await apiClient.get('/housing/listing-options');
  const data = (response.data?.data ?? response.data ?? {}) as Partial<HousingListingOptions>;
  return { furnishing: data.furnishing ?? [], leaseTypes: data.leaseTypes ?? [] };
}

/**
 * `POST /housing/listings` — **201**, and the result is a private draft.
 *
 * The request type is deliberately left to the caller: `housing/create.tsx`
 * assembles a large `CreateHousingListingRequest` across seven steps, and
 * restating all of it here would be a second place to keep in step with the
 * server. What this module owns is the *lifecycle*, not the field list.
 */
export async function createHousingListing(
  request: Record<string, unknown>
): Promise<CreatedHousingListing> {
  const response = await apiClient.post<Envelope<CreatedHousingListing>>(
    '/housing/listings',
    request
  );
  return response.data.data;
}

/**
 * `POST /housing/listings/{listingId}/publish`.
 *
 * The path parameter is `:guid`-constrained on the server, so this takes the
 * `id` from the create response and never a slug — the same trap
 * `housing-viewings-api` documents, and the reason the id is threaded through
 * rather than re-derived.
 *
 * The body is optional on the server, so nothing is invented to fill it.
 */
export async function publishHousingListing(listingId: string): Promise<void> {
  await apiClient.post(`/housing/listings/${encodeURIComponent(listingId)}/publish`);
}

// ── Reading a refusal ────────────────────────────────────────────────────────

function problemCode(cause: unknown): string | null {
  const code = (cause as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === 'string' ? code : null;
}

/**
 * The listing saved, but it is missing something publication requires.
 *
 * `housing.listing.not-publishable`. Recoverable by editing the draft, which is
 * why the member is told what to add rather than told to try again.
 */
export function isNotPublishableError(cause: unknown): boolean {
  return problemCode(cause) === 'housing.listing.not-publishable';
}

/**
 * The fraud assessor refused publication and may have hidden the listing.
 *
 * `housing.fraud.suspected`. Not retryable, and not to be softened into a
 * network-sounding message: a member seeing this needs to understand a human
 * decision is involved, and an honest lister needs a route to appeal it.
 */
export function isSuspectedFraudError(cause: unknown): boolean {
  return problemCode(cause) === 'housing.fraud.suspected';
}

/** What happened, in the three shapes the screen has to render differently. */
export type PublishOutcome =
  /** Created and published. This is the only case that may say "published". */
  | { kind: 'published'; listingId: string }
  /**
   * Created, but publication was refused. **The member's work is saved.** The
   * draft id is carried so the screen can offer to go back and fix it.
   */
  | { kind: 'draft-only'; listingId: string; reason: 'incomplete' | 'refused' | 'unknown' };

/**
 * Create the listing, then publish it.
 *
 * Throws only when *creation* failed — that is the case where the member has
 * lost nothing but also has nothing, and the screen's catch branch is right.
 * A publication failure resolves as `draft-only` instead, because "we could not
 * publish it" and "we could not save it" are different sentences and only one
 * of them is true.
 */
export async function createAndPublishListing(
  request: Record<string, unknown>,
  landlord?: {
    displayName: string;
    countryCode: string;
    /**
     * Only what the member changed. The screen prefills these fields from the
     * profile, so passing them unconditionally would send a round trip on every
     * listing to store what is already stored.
     */
    contact?: Partial<LandlordContact>;
  }
): Promise<PublishOutcome> {
  // Optional so existing callers and tests keep working unchanged: a member who
  // already has a landlord profile needs nothing here, and the guarantee is
  // only worth buying when the caller can say what to open it under.
  if (landlord) {
    const profile = await ensureLandlordProfile(landlord);

    // Before the listing, and allowed to fail the whole thing. Contact details
    // are part of setting a landlord up, exactly as the profile itself is, and
    // a number the platform refused is one the member should be told about
    // rather than one that quietly did not save.
    if (profile === 'existing' && landlord.contact) {
      await updateLandlordContact(landlord.contact);
    }
  }

  const created = await createHousingListing(request);

  try {
    await publishHousingListing(created.id);
    return { kind: 'published', listingId: created.id };
  } catch (cause) {
    if (isNotPublishableError(cause)) {
      return { kind: 'draft-only', listingId: created.id, reason: 'incomplete' };
    }
    if (isSuspectedFraudError(cause)) {
      return { kind: 'draft-only', listingId: created.id, reason: 'refused' };
    }
    // Anything else — a 500, a dropped connection, an unrecognised code. The
    // draft still exists, so the member is told that rather than being told
    // nothing happened. Swallowing the cause here is deliberate: every branch
    // resolves to the same member-facing fact (saved, not visible), and the
    // screen has no use for a distinction it cannot act on.
    return { kind: 'draft-only', listingId: created.id, reason: 'unknown' };
  }
}
