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
}): Promise<void> {
  await apiClient.post('/housing/landlords', {
    displayName: input.displayName,
    countryCode: input.countryCode,
    kind: input.kind ?? 'Individual',
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
}): Promise<void> {
  if (await hasLandlordProfile()) return;

  try {
    await createLandlordProfile(input);
  } catch (cause) {
    const status = (cause as { response?: { status?: number } })?.response?.status;
    if (status === 409) return;
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
  landlord?: { displayName: string; countryCode: string }
): Promise<PublishOutcome> {
  // Optional so existing callers and tests keep working unchanged: a member who
  // already has a landlord profile needs nothing here, and the guarantee is
  // only worth buying when the caller can say what to open it under.
  if (landlord) {
    await ensureLandlordProfile(landlord);
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
