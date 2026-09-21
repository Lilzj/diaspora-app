// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Marketplace listing creation and publication
//
// The exact defect `housing-listings-api.ts` was written to fix, in the module
// next door, found by driving the journey end to end against the real backend.
// `marketplace/create.tsx` posted the listing and then said:
//
//     Listing Published!
//     Your item is now visible on the Diaspora Marketplace.
//
// Neither sentence was true, for two independent reasons.
//
// ── DEFECT-008: no member could create a listing at all ──────────────────────
//
// `MarketplaceAuthorizationService.ResolveSellerAsync` requires a
// `SellerProfile` before *any* listing write and answers
//
//     403 marketplace.not-seller — "Set up a seller profile before doing that."
//
// **No frontend surface has ever called `POST /marketplace/sellers`.** A search
// of the client for that route finds one comment in a development handler and
// no call. So every attempt to list an item, by every member, failed at the
// first request — and the screen's catch branch discarded the server's message
// and rendered *"Failed to publish marketplace listing. Please review the
// inputs."*, sending the member back to check a form that was never the problem.
//
// A seller profile is not additional information: `displayName` and
// `countryCode` are all it requires, and both are already known. So it is
// created on demand, once, and only when the member is actually listing
// something — which is the moment the platform's own model says a member
// becomes a seller.
//
// ── DEFECT-011: create is a draft, and publish is a separate route ───────────
//
//   POST /marketplace/listings              → 201, Status = Draft
//   POST /marketplace/listings/{id}/publish → Status = Active, PublishedAt set
//
// Verified against PostgreSQL rather than inferred: after create the row reads
// `Draft | publishedAt=null`, and only after the publish call does it read
// `Active | publishedAt=…`. The create screen never called publish, so every
// listing a member believed they had posted sat as an invisible draft while the
// screen offered them a button to go and admire it in Discover.
//
// Publication has a prerequisite of its own, and it is the one DEFECT-004 was
// about:
//
//   * **`marketplace.listing.not-publishable`** (400) — *"Before this listing
//     can be published it still needs at least one photograph. [missing:
//     photograph]"*. The message names what is missing, so it is shown rather
//     than replaced.
//
// ── Why publication failure is not creation failure ──────────────────────────
//
// The same reasoning as housing, and it is worth repeating rather than
// cross-referencing: if create succeeds and publish is refused, the member's
// work is **saved**. "We could not publish it" and "we could not save it" are
// different sentences and only one of them is true, so this module resolves
// three outcomes rather than throwing on anything short of total success.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { swapTermsOf } from './marketplace-wire';
import type {
  ListingCondition,
  ListingIntent,
  ListingStatus,
  MarketplaceListing,
  MarketplaceListingCardResponse,
} from '@/types/marketplace';

interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFECT-009 — the shape the screens were reading did not exist
//
// `discover.tsx` cast the search response to `MarketplaceListing[]` and handed
// it straight to `MarketplaceCard`, which destructures `id`, `price`,
// `currency`, `negotiable`, `intent`, `coverImage`, `createdAt` and
// `location.areaName`. The server sends `listingId`, a `price` **object**,
// `coverMediaId`, `publishedAt` and a location keyed `regionName`/`cityName`.
//
// A cast asserts rather than checks — the same mechanism as DEFECT-007 — so
// nothing failed loudly. What happened instead, on every marketplace card in
// the application:
//
//   * `key={item.id}` was `undefined` for every card in the list;
//   * `router.push('/marketplace/' + id)` navigated to `/marketplace/undefined`,
//     so **tapping any listing went nowhere**;
//   * `save(id, 'Marketplace')` and `isSaved(id)` operated on `undefined`;
//   * the price rendered as `undefined`, and the photograph never resolved.
//
// Observed in the runtime evidence rather than deduced: the search items are
// keyed `listingId` and carry no `id`, `price` is
// `{"isDisclosed":true,"amount":45000,"currency":"NGN",…}`, and the cover is
// `coverMediaId`. Recorded in `runtime-validation/e2e/evidence-marketplace.json`
// under the `[contract]` rows.
//
// `toMarketplaceListing` is the one place that knows the difference. It fills
// only what the server actually sends and **invents nothing** — in particular no
// rating, no reputation level and no country verifications, which is the field
// set `create.tsx` used to fabricate on the object a buyer uses to decide
// whether a stranger is safe to meet.
// ─────────────────────────────────────────────────────────────────────────────

/** `FixedPrice` / `Auction` / `Wanted` → the vocabulary the cards render. */
function toIntent(listingType: string | null | undefined, isFree: boolean): ListingIntent {
  // A swap first: its price is a top-up, and an even swap with a stated zero is
  // still a swap rather than a giveaway.
  if ((listingType ?? '').toLowerCase() === 'swap') return 'Exchange / Swap' as ListingIntent;
  if (isFree) return 'Giving Away' as ListingIntent;
  switch ((listingType ?? '').toLowerCase()) {
    case 'wanted':
    case 'buyingrequest':
      return 'Buying Request' as ListingIntent;
    case 'swap':
    case 'exchange':
      return 'Exchange / Swap' as ListingIntent;
    case 'donation':
      return 'Donation' as ListingIntent;
    default:
      return 'Selling' as ListingIntent;
  }
}

/**
 * Maps one server card into the view model the screens render.
 *
 * Total, and deliberately forgiving of absent members: a card the server widens
 * must not stop a list rendering, and a missing photograph is something
 * `ListingPhoto` already draws. The one thing it will not do is manufacture an
 * identifier — a listing with no `listingId` is unusable and is dropped by
 * `toMarketplaceListings` rather than rendered as a card that goes nowhere.
 */
export function toMarketplaceListing(card: MarketplaceListingCardResponse): MarketplaceListing {
  const price = card.price ?? {};
  const location = card.location ?? {};
  const seller = card.seller ?? {};

  return {
    id: card.listingId,
    title: card.title ?? '',
    description: card.description ?? card.summary ?? '',

    // `isDisclosed: false` means the seller chose not to publish a figure, and
    // it stays undefined so the card says "Price on request". It used to become
    // 0, which the cards render as FREE — so a wanted advert with no budget, and
    // every even swap, was advertised as free.
    price: price.isDisclosed === false || typeof price.amount !== 'number' ? undefined : price.amount,
    currency: price.currency ?? '',
    negotiable: price.isNegotiable ?? false,

    quantity: typeof card.available === 'number' ? card.available : 1,
    condition: (card.condition ?? 'Good') as ListingCondition,
    intent: toIntent(card.listingType, price.isFree ?? false),
    category: card.categoryKey ?? '',
    subcategory: card.tags?.[0],

    // An identifier, not a URL. `ListingPhoto` resolves it through Media, which
    // is the whole point of storing `mediaId` rather than a link.
    coverImage: card.coverMediaId ?? '',
    gallery: [],

    location: {
      cityName: location.cityName ?? '',
      areaName: location.regionName ?? location.neighbourhood ?? '',
      addressLine: location.displayName ?? '',
      landmark: location.neighbourhood ?? undefined,
      distanceKm: typeof card.distanceKm === 'number' ? card.distanceKm : undefined,
      latitude: typeof location.latitude === 'number' ? location.latitude : undefined,
      longitude: typeof location.longitude === 'number' ? location.longitude : undefined,
    },

    seller: {
      sellerId: seller.sellerId ?? '',
      name: seller.displayName ?? '',
      avatarUrl: seller.logoMediaId ?? null,
      isVerified: seller.isVerified ?? false,
      // rating, reputationLevel, yearsOnPlatform, languagesSpoken and
      // countryVerifications are deliberately absent: the server does not send
      // them on a listing card, and a number invented here would appear to a
      // buyer as a fact about a stranger.
    },

    swap: swapTermsOf(card),

    status: (card.status ?? 'Active') as ListingStatus,
    createdAt: card.publishedAt ?? '',
    viewCount: typeof card.viewCount === 'number' ? card.viewCount : 0,
    isFeatured: card.isFeatured ?? false,
    deliveryAvailable: card.offersDelivery ?? false,
    pickupOnly: !(card.offersDelivery ?? false) && !(card.offersShipping ?? false),
  };
}

/**
 * A listing for a card, whichever shape arrived.
 *
 * The Search tab's marketplace section hands `MarketplaceCard` the raw rows
 * `/marketplace/search` sent, which carry `listingId`, a `price` object and
 * `coverMediaId` — so the card printed "Rs [object Object]" and no photograph.
 * A raw row (it has `listingId` and no `id`) is mapped here; a mapped one is left
 * alone.
 */
export function asMarketplaceCardListing(
  value: MarketplaceListing | MarketplaceListingCardResponse
): MarketplaceListing {
  const candidate = value as Partial<MarketplaceListing> & { listingId?: string };
  if (candidate && !candidate.id && typeof candidate.listingId === 'string') {
    return toMarketplaceListing(value as MarketplaceListingCardResponse);
  }
  return value as MarketplaceListing;
}

/** Maps a page of cards, dropping any the server sent without an identifier. */
export function toMarketplaceListings(
  cards: readonly MarketplaceListingCardResponse[]
): MarketplaceListing[] {
  return cards.filter((card) => !!card?.listingId).map(toMarketplaceListing);
}

/**
 * The identifier field on a created listing.
 *
 * `CreateListingResponse` carries **`listingId`**, not `id` — the same naming
 * the search results use, and the reason `MarketplaceCard` was reading
 * `undefined`. `id` is accepted as a fallback so this keeps working if the
 * envelope is ever widened, but `listingId` is the field the server sends today.
 */
export interface CreatedMarketplaceListing {
  listingId?: string;
  id?: string;
  status?: string;
  slug?: string | null;
}

export function listingIdOf(created: CreatedMarketplaceListing): string {
  const id = created.listingId ?? created.id;
  if (!id) {
    throw new Error('The marketplace create response carried no listing identifier.');
  }
  return id;
}

// ── The seller profile ───────────────────────────────────────────────────────

/** `GET /marketplace/sellers/me/dashboard` answers 403 `marketplace.not-seller` when there is none. */
export async function hasSellerProfile(): Promise<boolean> {
  try {
    await apiClient.get('/marketplace/sellers/me/dashboard');
    return true;
  } catch (cause) {
    if (problemCode(cause) === 'marketplace.not-seller') return false;
    // Any other failure — a 500, a dropped connection — is not evidence that
    // the member has no seller profile, and answering `false` would make the
    // caller create a duplicate. Rethrow and let the caller decide.
    throw cause;
  }
}

/**
 * `POST /marketplace/sellers` — the step the client never took.
 *
 * `displayName` and `countryCode` are the only required fields. Nothing is
 * invented for the optional ones: a legal name, a registration number and a
 * website belong to a member who chooses to supply them, and guessing a
 * business identity on somebody's behalf is worse than leaving it blank.
 */
/**
 * How a buyer reaches a seller.
 *
 * `contactPreference` here is the seller's own default. The one the create
 * wizard asks about is the *listing's* — `ListingResponse.ContactPreference`,
 * which is what a buyer opening a conversation about that item is told — and
 * the two are deliberately not the same field. What the wizard needs from this
 * one is the phone number: choosing "Direct Call" on a profile that holds no
 * number gives a buyer a preference with nothing behind it.
 */
export interface SellerContact {
  phone: string | null;
  email: string | null;
  contactPreference: string;
}

/**
 * Everything `PUT /marketplace/sellers/me` replaces.
 *
 * **It replaces rather than merges.** `UpdateSellerCommandHandler` passes
 * `request.Bio`, `request.LegalName`, `request.Website` and the rest straight
 * into the aggregate, so a field left out of the body is a field set to null —
 * changing a telephone number means sending the whole profile back. That is
 * only safe because the profile read returns all of it; until 21 Sep 2026 it
 * returned neither `legalName` nor `registrationNumber`, and any client doing
 * this would have quietly blanked a business's legal identity.
 */
interface SellerProfileSnapshot extends SellerContact {
  displayName: string;
  countryCode: string;
  kind: string | null;
  legalName: string | null;
  registrationNumber: string | null;
  bio: string | null;
  website: string | null;
}

interface SellerDashboardShape {
  seller?: {
    displayName?: string | null;
    countryCode?: string | null;
    kind?: string | null;
    legalName?: string | null;
    registrationNumber?: string | null;
    bio?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    contactPreference?: string | null;
  } | null;
}

/**
 * The seller profile this member owns, or null when they have never sold.
 *
 * One request: the dashboard carries the whole `SellerProfileResponse`, not a
 * summary of it, which is why this needs no second call the way housing does.
 */
async function fetchMySellerProfile(): Promise<SellerProfileSnapshot | null> {
  let held: SellerDashboardShape['seller'];

  try {
    const dashboard = await apiClient.get<Envelope<SellerDashboardShape>>(
      '/marketplace/sellers/me/dashboard'
    );
    held = dashboard.data.data?.seller;
  } catch (cause) {
    // No profile is an answer, not a failure.
    if (problemCode(cause) === 'marketplace.not-seller') return null;
    throw cause;
  }

  if (!held?.displayName || !held.countryCode) return null;

  return {
    displayName: held.displayName,
    countryCode: held.countryCode,
    kind: held.kind ?? null,
    legalName: held.legalName ?? null,
    registrationNumber: held.registrationNumber ?? null,
    bio: held.bio ?? null,
    phone: held.phone ?? null,
    email: held.email ?? null,
    website: held.website ?? null,
    contactPreference: held.contactPreference ?? 'InApp',
  };
}

/** What the platform holds for this member, for a form to show rather than ask again. */
export async function fetchMySellerContact(): Promise<SellerContact | null> {
  const held = await fetchMySellerProfile();

  if (!held) return null;

  return { phone: held.phone, email: held.email, contactPreference: held.contactPreference };
}

/**
 * Changes one part of a seller's contact details without losing the rest.
 *
 * Read, change, send it all back — see `SellerProfileSnapshot` for why the
 * whole profile has to travel. Nothing is sent when nothing differs, because a
 * replace that changes nothing is still a write and still bumps the revision.
 */
export async function updateSellerContact(changes: Partial<SellerContact>): Promise<void> {
  const held = await fetchMySellerProfile();

  if (!held) return;

  const wanted: SellerContact = {
    phone: changes.phone || held.phone,
    email: changes.email || held.email,
    contactPreference: changes.contactPreference || held.contactPreference,
  };

  if (
    wanted.phone === held.phone
    && wanted.email === held.email
    && wanted.contactPreference === held.contactPreference
  ) {
    return;
  }

  await apiClient.put('/marketplace/sellers/me', {
    displayName: held.displayName,
    countryCode: held.countryCode,
    kind: held.kind ?? undefined,
    legalName: held.legalName ?? undefined,
    registrationNumber: held.registrationNumber ?? undefined,
    bio: held.bio ?? undefined,
    website: held.website ?? undefined,
    phone: wanted.phone ?? undefined,
    email: wanted.email ?? undefined,
    contactPreference: wanted.contactPreference,
  });
}

export async function createSellerProfile(input: {
  displayName: string;
  countryCode: string;
  kind?: string;
  contact?: Partial<SellerContact>;
}): Promise<void> {
  await apiClient.post('/marketplace/sellers', {
    displayName: input.displayName,
    countryCode: input.countryCode,
    kind: input.kind ?? 'Individual',
    // On the way in, where nothing can be lost: a create has no stored profile
    // to overwrite, so the details the member typed travel with it.
    phone: input.contact?.phone || undefined,
    email: input.contact?.email || undefined,
    contactPreference: input.contact?.contactPreference || undefined,
  });
}

/**
 * Make sure the member can write to the marketplace, creating the profile once
 * if they have never sold anything before.
 *
 * A 409 is treated as success: it means the profile already existed, which is
 * the state this function exists to guarantee. Racing two create screens should
 * not produce an error message about a profile the member never asked about.
 */
export async function ensureSellerProfile(input: {
  displayName: string;
  countryCode: string;
  kind?: string;
  contact?: Partial<SellerContact>;
}): Promise<'created' | 'existing'> {
  // Which happened matters to the caller: a profile just created already holds
  // the contact details it was given, and one that was already there has its
  // own, which only a full replace may change.
  if (await hasSellerProfile()) return 'existing';

  try {
    await createSellerProfile(input);
    return 'created';
  } catch (cause) {
    const status = (cause as { response?: { status?: number } })?.response?.status;
    if (status === 409) return 'existing';
    throw cause;
  }
}

// ── Create and publish ───────────────────────────────────────────────────────

/**
 * `POST /marketplace/listings` — **201**, and the result is a Draft.
 *
 * The request type is left to the caller for the same reason housing does:
 * `marketplace/create.tsx` assembles it across several steps, and restating the
 * field list here would be a second place to keep in step with the server.
 */
export async function createMarketplaceListing(
  request: Record<string, unknown>
): Promise<CreatedMarketplaceListing> {
  const response = await apiClient.post<Envelope<CreatedMarketplaceListing>>(
    '/marketplace/listings',
    request
  );
  return response.data.data;
}

/**
 * `POST /marketplace/listings/{listingId}/publish`.
 *
 * `activateImmediately` is what turns a publication into a visible listing
 * rather than a scheduled one; the server defaults it, and it is sent
 * explicitly because this screen's member pressed a button that said publish.
 */
export async function publishMarketplaceListing(listingId: string): Promise<void> {
  await apiClient.post(`/marketplace/listings/${encodeURIComponent(listingId)}/publish`, {
    activateImmediately: true,
  });
}

// ── Reading a refusal ────────────────────────────────────────────────────────

function problemCode(cause: unknown): string | null {
  const code = (cause as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === 'string' ? code : null;
}

/** The server's own sentence, which names what is missing. Worth showing. */
export function problemDetail(cause: unknown): string | null {
  const detail = (cause as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' && detail.length > 0 ? detail : null;
}

/** `marketplace.listing.not-publishable` — recoverable by editing the draft. */
export function isNotPublishableError(cause: unknown): boolean {
  return problemCode(cause) === 'marketplace.listing.not-publishable';
}

/** `marketplace.not-seller` — the member has no seller profile. */
export function isNotSellerError(cause: unknown): boolean {
  return problemCode(cause) === 'marketplace.not-seller';
}

/** What happened, in the shapes the screen has to render differently. */
export type MarketplacePublishOutcome =
  /** Created and published. The only case that may say "published". */
  | { kind: 'published'; listingId: string }
  /**
   * Created, but publication was refused. **The member's work is saved**, and
   * `detail` carries the server's sentence — which for the common case names
   * the photograph the listing still needs.
   */
  | { kind: 'draft-only'; listingId: string; reason: 'incomplete' | 'unknown'; detail: string | null };

/**
 * Ensure the seller profile, create the listing, then publish it.
 *
 * Throws only when the seller profile or the *creation* failed — the cases
 * where the member has nothing. A publication failure resolves as `draft-only`.
 */
export async function createAndPublishMarketplaceListing(
  request: Record<string, unknown>,
  seller: {
    displayName: string;
    countryCode: string;
    /** Only what the member changed; see `updateSellerContact`. */
    contact?: Partial<SellerContact>;
  }
): Promise<MarketplacePublishOutcome> {
  const profile = await ensureSellerProfile(seller);

  // Before the listing, and allowed to fail it. A number the platform refused
  // is one the member should be told about rather than one that quietly did
  // not save behind a listing that published.
  if (profile === 'existing' && seller.contact) {
    await updateSellerContact(seller.contact);
  }

  const created = await createMarketplaceListing(request);
  const listingId = listingIdOf(created);

  try {
    await publishMarketplaceListing(listingId);
    return { kind: 'published', listingId };
  } catch (cause) {
    if (isNotPublishableError(cause)) {
      return { kind: 'draft-only', listingId, reason: 'incomplete', detail: problemDetail(cause) };
    }
    return { kind: 'draft-only', listingId, reason: 'unknown', detail: problemDetail(cause) };
  }
}
