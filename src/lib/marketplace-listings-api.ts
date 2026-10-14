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
import { coordinatesOf } from './place-coordinates';
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

// ── Editing a listing after it is published — 14 Oct 2026 ───────────────────
//
// `PUT /marketplace/listings/{listingId}` **replaces** rather than merges. The
// request's own summary says so: a patch would need a way to tell "absent" from
// "set to null", and the server chose to have every client send the whole form
// back instead. So a field the edit screen does not show is still a field this
// request sets — leave `brand` out and the brand is gone.
//
// That is the defect `updateSellerContact` exists to avoid, and it is avoided
// here the same way: read the listing, change what the member changed, and send
// back everything else **exactly as it was read**. `toUpdateRequest` is the one
// place that knows the field list, and its test pins that a listing edited only
// in its title comes back with every other field intact.
//
// What the replace cannot reach, and so is not on the edit screen: the
// category, the listing type, the swap terms (`swapWants`/`swapTopUp` are
// attributes, `PUT …/attributes`), tags, stock, and the map pin — the request
// carries no coordinates at all.

/** `ListingMediaResponse`. */
export interface MarketplaceListingMediaRef {
  mediaId: string;
  /** `Cover`, `Gallery`, `Video`, `Document` or `Manual`. */
  role: string;
  order: number;
  caption?: string | null;
}

/**
 * The parts of `ListingResponse` an edit has to send back.
 *
 * Declared field by field from `Contracts/V1/Responses/ListingResponse.cs` and
 * its children rather than read through `any`: a field misspelt here is a
 * field the replace would blank, and only a declared shape lets the compiler
 * see the misspelling.
 */
export interface MarketplaceListingForEdit {
  listingId: string;
  title: string;
  description: string;
  summary: string;
  listingType: string;
  condition: string;
  status: string;
  visibility: string;
  contactPreference: string;
  revision: number;
  canManage?: boolean | null;
  price: {
    isDisclosed: boolean;
    amount?: number | null;
    currency?: string | null;
    isNegotiable: boolean;
    isFree: boolean;
    minimumOffer?: number | null;
  };
  location: {
    countryCode: string;
    regionName?: string | null;
    cityName?: string | null;
    neighbourhood?: string | null;
    areaId?: string | null;
    /** The listing's pin (WGS84), both or neither. */
    latitude?: number | null;
    longitude?: number | null;
    displayName?: string | null;
  };
  fulfillment: {
    offersPickup: boolean;
    offersDelivery: boolean;
    offersShipping: boolean;
    isDigital: boolean;
    deliveryRadiusKm?: number | null;
    notes?: string | null;
  };
  product: {
    brand?: string | null;
    model?: string | null;
    sku?: string | null;
    year?: number | null;
  };
  media: MarketplaceListingMediaRef[];
  seller?: { ownerUserId?: string | null } | null;
}

/** `GET /marketplace/listings/{listingId}` — the listing as its owner will edit it. */
export async function fetchMarketplaceListingForEdit(
  listingId: string
): Promise<MarketplaceListingForEdit> {
  const response = await apiClient.get<Envelope<MarketplaceListingForEdit>>(
    `/marketplace/listings/${encodeURIComponent(listingId)}`
  );
  return response.data.data;
}

/** `UpdateListingRequest`, as `Contracts/V1/Requests/UpdateListingRequest.cs` declares it. */
export interface UpdateMarketplaceListingRequest {
  title: string;
  description: string;
  summary?: string;
  condition?: string;
  price?: number;
  currency?: string;
  isNegotiable: boolean;
  minimumOffer?: number;
  countryCode: string;
  regionName?: string;
  cityName?: string;
  neighbourhood?: string;
  areaId?: string;
  /** Both or neither. Omitted leaves the stored pin alone. */
  latitude?: number;
  longitude?: number;
  offersPickup: boolean;
  offersDelivery: boolean;
  offersShipping: boolean;
  isDigital: boolean;
  deliveryRadiusKm?: number;
  fulfillmentNotes?: string;
  brand?: string;
  model?: string;
  sku?: string;
  year?: number;
  contactPreference?: string;
  visibility?: string;
  baseRevision?: number;
}

/** What the edit screen lets a member change. Anything absent is sent back as read. */
export interface MarketplaceListingEdits {
  title?: string;
  description?: string;
  /**
   * The member's own summary, or `null` to have the server derive it from the
   * description again. Absent leaves it as read — see `toUpdateRequest`.
   */
  summary?: string | null;
  condition?: string;
  /** `null` withdraws the figure ("price on request"). */
  price?: number | null;
  /**
   * Used only when the listing has no currency of its own — a price added to
   * a listing that never had one. The caller passes the member's residence
   * currency; it is never a choice the member makes.
   */
  fallbackCurrency?: string;
  isNegotiable?: boolean;
  minimumOffer?: number | null;
  offersPickup?: boolean;
  offersDelivery?: boolean;
  offersShipping?: boolean;
}

/**
 * The summary the server would write for this description.
 *
 * `ListingDescription.Derive`, line for line: newlines and tabs to spaces, runs
 * of spaces collapsed, cut at 400 on a word with an ellipsis. Needed because
 * the read always carries a summary, derived or not, and no surface of this
 * application has ever written one — so nearly every summary on the platform
 * is derived. Sending a derived summary back beside a new description would
 * freeze the old description's opening as the listing's summary.
 */
export function deriveListingSummary(description: string): string {
  const collapsed = description
    .replace(/[\n\t]/g, ' ')
    .split(' ')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' ');

  if (collapsed.length <= 400) return collapsed;

  const cut = collapsed.slice(0, 400);
  const lastSpace = cut.lastIndexOf(' ');

  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Whether the summary as read is the server's derivation rather than the seller's own words. */
export function isDerivedSummary(
  listing: Pick<MarketplaceListingForEdit, 'summary' | 'description'>
): boolean {
  return (listing.summary ?? '') === deriveListingSummary(listing.description ?? '');
}

function orUndefined<T>(value: T | null | undefined): T | undefined {
  return value === null || value === undefined ? undefined : value;
}

/**
 * The whole replacement: the listing as read, with the member's edits on top.
 *
 * `baseRevision` is the revision that was read, so a save from a screen opened
 * before somebody else's edit is refused with a conflict rather than quietly
 * overwriting it.
 */
export function toUpdateRequest(
  listing: MarketplaceListingForEdit,
  edits: MarketplaceListingEdits = {}
): UpdateMarketplaceListingRequest {
  const read = listing.price ?? ({} as Partial<MarketplaceListingForEdit['price']>);
  const readAmount =
    read.isDisclosed === false || typeof read.amount !== 'number' ? null : read.amount;
  const amount = edits.price !== undefined ? edits.price : readAmount;
  const isNegotiable = edits.isNegotiable ?? read.isNegotiable ?? false;
  const minimumOffer =
    edits.minimumOffer !== undefined ? edits.minimumOffer : orUndefined(read.minimumOffer) ?? null;

  const description = edits.description ?? listing.description;

  // A derived summary follows the description; a written one stays until the
  // member changes it. `null` from the screen means "derive it again".
  let summary: string | undefined;
  if (edits.summary !== undefined) {
    summary = edits.summary === null ? undefined : edits.summary;
  } else if (description !== listing.description && isDerivedSummary(listing)) {
    summary = undefined;
  } else {
    summary = orUndefined(listing.summary);
  }

  const location = listing.location ?? ({} as Partial<MarketplaceListingForEdit['location']>);
  const fulfillment =
    listing.fulfillment ?? ({} as Partial<MarketplaceListingForEdit['fulfillment']>);
  const product = listing.product ?? {};

  return {
    title: edits.title ?? listing.title,
    description,
    summary,
    condition: edits.condition ?? orUndefined(listing.condition),

    price: amount === null ? undefined : amount,
    // The listing's own currency wherever it has one, even when the member's
    // residence has since changed: re-denominating a price is not an edit
    // anybody asked for.
    currency: orUndefined(read.currency) ?? (amount === null ? undefined : edits.fallbackCurrency),
    isNegotiable,
    // The server drops a floor on a fixed price; sending none is the same
    // answer without relying on it.
    minimumOffer:
      amount === null || !isNegotiable || minimumOffer === null ? undefined : minimumOffer,

    countryCode: location.countryCode ?? '',
    regionName: orUndefined(location.regionName),
    cityName: orUndefined(location.cityName),
    neighbourhood: orUndefined(location.neighbourhood),
    areaId: orUndefined(location.areaId),
    // The place is not edited here: the pin goes back exactly as read.
    latitude: orUndefined(coordinatesOf(location).latitude),
    longitude: orUndefined(coordinatesOf(location).longitude),

    offersPickup: edits.offersPickup ?? fulfillment.offersPickup ?? false,
    offersDelivery: edits.offersDelivery ?? fulfillment.offersDelivery ?? false,
    offersShipping: edits.offersShipping ?? fulfillment.offersShipping ?? false,
    isDigital: fulfillment.isDigital ?? false,
    deliveryRadiusKm: orUndefined(fulfillment.deliveryRadiusKm),
    fulfillmentNotes: orUndefined(fulfillment.notes),

    brand: orUndefined(product.brand),
    model: orUndefined(product.model),
    sku: orUndefined(product.sku),
    year: orUndefined(product.year),

    contactPreference: orUndefined(listing.contactPreference),
    visibility: orUndefined(listing.visibility),
    baseRevision: typeof listing.revision === 'number' ? listing.revision : undefined,
  };
}

/** `PUT /marketplace/listings/{listingId}` — a whole replacement; build it with `toUpdateRequest`. */
export async function updateMarketplaceListing(
  listingId: string,
  body: UpdateMarketplaceListingRequest
): Promise<MarketplaceListingForEdit> {
  const response = await apiClient.put<Envelope<MarketplaceListingForEdit>>(
    `/marketplace/listings/${encodeURIComponent(listingId)}`,
    body
  );
  return response.data.data;
}

/**
 * `POST /marketplace/listings/{listingId}/media` — attach an uploaded asset.
 *
 * `Gallery` when no role is named, which is also the server's default; sent
 * explicitly so a reader of the request does not have to know that.
 */
export async function addMarketplaceListingPhoto(
  listingId: string,
  mediaId: string,
  role: 'Cover' | 'Gallery' = 'Gallery'
): Promise<void> {
  await apiClient.post(`/marketplace/listings/${encodeURIComponent(listingId)}/media`, {
    mediaId,
    role,
  });
}

/**
 * `DELETE /marketplace/listings/{listingId}/media/{mediaId}` — detach, never delete.
 *
 * Without `role` the server detaches the asset from **every** role it holds on
 * the listing, which is what "remove this photo" means. With one, only that
 * reference goes — used to move a photograph from the gallery to the cover.
 */
export async function removeMarketplaceListingPhoto(
  listingId: string,
  mediaId: string,
  role?: 'Cover' | 'Gallery'
): Promise<void> {
  await apiClient.delete(
    `/marketplace/listings/${encodeURIComponent(listingId)}/media/${encodeURIComponent(mediaId)}`,
    role ? { params: { role } } : undefined
  );
}

/** The most references a listing may hold — `MarketplaceLimits.MaxMediaReferences`. */
export const MAX_MARKETPLACE_LISTING_MEDIA = 24;

/**
 * Applies photo removals and additions, and leaves the listing with a cover.
 *
 * Removals first, so a member at the limit can swap one photograph for
 * another. Then, if no cover is left — the member removed it, or the listing
 * never had one — the first photograph that remains becomes the cover: cards
 * draw `coverMediaId` and nothing else, so a listing with a gallery and no
 * cover shows the "no photo" panel in every list.
 *
 * Sequential rather than concurrent, because the server numbers references in
 * the order it receives them and that order is the gallery's.
 *
 * Returns the server's sentence for each change it refused. One refused
 * photograph does not stop the rest.
 */
export async function applyMarketplaceListingPhotoChanges(
  listingId: string,
  held: readonly MarketplaceListingMediaRef[],
  changes: { remove: readonly string[]; add: readonly string[] }
): Promise<string[]> {
  const failures: string[] = [];
  const attempt = async (step: () => Promise<void>): Promise<boolean> => {
    try {
      await step();
      return true;
    } catch (cause) {
      failures.push(problemDetail(cause) ?? 'A photo change did not go through.');
      return false;
    }
  };

  const removed = new Set<string>();
  for (const mediaId of changes.remove) {
    if (await attempt(() => removeMarketplaceListingPhoto(listingId, mediaId))) removed.add(mediaId);
  }

  const kept = held.filter((ref) => !removed.has(ref.mediaId));
  const hasCover = kept.some((ref) => ref.role === 'Cover');
  const keptGallery = kept
    .filter((ref) => ref.role === 'Gallery')
    .sort((a, b) => a.order - b.order)
    .map((ref) => ref.mediaId);

  // Which photograph becomes the cover, when one has to: one already on the
  // listing before one just added, because it is the one buyers have seen.
  const promoted = hasCover ? null : keptGallery[0] ?? changes.add[0] ?? null;

  for (const mediaId of changes.add) {
    await attempt(() =>
      addMarketplaceListingPhoto(listingId, mediaId, mediaId === promoted ? 'Cover' : 'Gallery')
    );
  }

  if (promoted && keptGallery.includes(promoted)) {
    // Moved rather than copied: attached as the cover, then its gallery
    // reference detached, so the photograph is not shown twice.
    if (await attempt(() => addMarketplaceListingPhoto(listingId, promoted, 'Cover'))) {
      await attempt(() => removeMarketplaceListingPhoto(listingId, promoted, 'Gallery'));
    }
  }

  return failures;
}
