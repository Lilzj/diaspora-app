// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — registering a provider (UAT-002)
//
// ✅ EVERY ROUTE HERE IS REAL, read from
//    `src/Diaspora.Modules.Providers/Api/ProviderEndpoints.cs` in the backend
//    repository rather than inferred from a name.
//
//      POST   /providers                                   RegisterProviderCommand
//      POST   /providers/{providerId}/services             AddProviderServiceCommand
//      PUT    /providers/{providerId}/operating-hours      SetProviderOperatingHoursCommand
//      PUT    /providers/{providerId}/status               ChangeProviderStatusCommand
//
// `providers-api.ts` is the read half of the same module and is left alone; the
// split follows `housing-listings-api.ts`, which separates the write surface for
// the same reason — the reads are used by a dozen screens and the writes by one.
//
// ── What this file replaces ──────────────────────────────────────────────────
//
// The provider wizard at `app/(tabs)/post.tsx` had **no API import of any
// kind**. Six steps of the member's work ended at:
//
//     const handlePublish = () => {
//       globalDraftStorage = null;
//       router.push('/listing-success');
//     };
//
// — which cleared the only copy of their draft and showed them *"🎉 Listing
// Published! Your business is now live on Diaspora."* Nothing was created. The
// member had no listing, no draft, and no reason to think anything was wrong
// until they went looking for it.
//
// ── Why publication is a separate call, and why that matters here ────────────
//
// `POST /providers` creates a **draft** — the endpoint's own summary says so,
// and `RegisterProviderRequest` explains why: publishing is "a separate,
// explicit act, so nobody discovers a half-written listing of theirs already
// live". A client that treats 201 as "published" is making the same claim the
// old screen made, just with a network call behind it.
//
// So `createAndPublishProvider` reports what actually happened, in the shape
// `createAndPublishListing` established for housing: **published**, or
// **draft-only with a reason**. The screen renders the two differently, and only
// the first is allowed to say "published".
//
// ── The steps between create and publish ─────────────────────────────────────
//
// Photos, services and opening hours are three further calls, and each can fail
// on its own. None of them is a reason to tell the member their listing failed —
// the provider exists by then. `incomplete` names the steps that did not land so
// the screen can say precisely what to redo rather than "something went wrong".
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { uploadDirect } from './media-api';
import type { LocalFile } from '@/types/media';

interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

const ROOT = '/providers';

// ── Requests, shaped exactly as the backend binds them ───────────────────────

/** `RegisterProviderRequest`. Only the first three are `required` server-side. */
export interface RegisterProviderRequest {
  name: string;
  /** `ProviderType`: Business, Individual, Church, CommunityGroup, … */
  providerType: string;
  /**
   * An identifier, slug, name or **legacy alias**. `ServiceCategoryResolver`
   * resolves all four, which is why the wizard's own display labels
   * ("Hair & Beauty") are accepted without a lookup first.
   */
  category: string;
  description?: string;
  tagline?: string;
  deliveryMode?: string;
  countryCode?: string;
  cityName?: string;
  addressLine?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  whatsApp?: string;
  email?: string;
  website?: string;
  tags?: string[];
}

/** `PricingRequest`. */
export interface ProviderPricingRequest {
  /** `PricingModel`. Omitted means `Unspecified`. */
  model?: string;
  minAmount?: number;
  maxAmount?: number;
  /** ISO 4217. Required by the server whenever an amount is published. */
  currency?: string;
  unit?: string;
  isNegotiable?: boolean;
}

/** `ProviderServiceRequest`. One thing the provider offers. */
export interface ProviderServiceRequest {
  name: string;
  description?: string;
  category?: string;
  pricing?: ProviderPricingRequest;
  deliveryMode?: string;
  durationMinutes?: number;
  imageMediaId?: string;
  isAvailable?: boolean;
  isFeatured?: boolean;
}

/** `AvailabilityWindowEntry`. Times are `HH:mm`, wall-clock, provider's own zone. */
export interface ProviderHoursWindow {
  opensAt: string;
  closesAt: string;
  label?: string;
}

/**
 * `OperatingHoursRequest`. One day.
 *
 * `isClosed` with no windows is **not** the same as omitting the day: the first
 * says "we do not open on Sundays", the second says nothing at all and leaves
 * whatever was stored untouched.
 */
export interface ProviderHoursDay {
  /** "Monday". Spelled as `DayOfWeek` parses it. */
  dayOfWeek: string;
  isClosed?: boolean;
  windows?: ProviderHoursWindow[];
}

/** The fields of `ProviderResponse` this flow needs. */
export interface CreatedProvider {
  id: string;
  slug?: string | null;
  status?: string;
}

/** `ProviderResponse` as the server sends it: the identifier is `providerId`. */
interface ProviderResponseWire {
  providerId: string;
  slug?: string | null;
  status?: string;
}

// ── The four calls ───────────────────────────────────────────────────────────

/** `POST /providers`. Creates a **draft** — publishing is `publishProvider`. */
export async function registerProvider(
  request: RegisterProviderRequest
): Promise<CreatedProvider> {
  const response = await apiClient.post<Envelope<ProviderResponseWire>>(ROOT, request);
  const created = response.data.data;

  // `providerId`, not `id`. This read `.id`, which the server never sends, so
  // every call after creation went to `/providers/undefined/...` and answered
  // 404: photos, services, hours and publishing all failed, and every listing
  // was left a draft (found on an emulator, 13 Oct 2026). Refused outright when
  // missing rather than letting `undefined` into a URL again.
  if (!created?.providerId) {
    throw new Error('The server created the listing but did not say which one.');
  }

  return { id: created.providerId, slug: created.slug, status: created.status };
}

/** `POST /providers/{id}/services`. */
export async function addProviderService(
  providerId: string,
  service: ProviderServiceRequest
): Promise<void> {
  await apiClient.post(`${ROOT}/${providerId}/services`, service);
}

/**
 * `PUT /providers/{id}/operating-hours`.
 *
 * The whole week in one call. The server applies it inside a single transaction,
 * so a schedule either lands complete or not at all — seven separate calls could
 * leave a business advertising three days it never agreed to.
 */
export async function setProviderOperatingHours(
  providerId: string,
  hours: ProviderHoursDay[]
): Promise<void> {
  await apiClient.put(`${ROOT}/${providerId}/operating-hours`, { hours });
}

/**
 * `PUT /providers/{id}/status`.
 *
 * **The status is `Active`, not `Published`.** `ProviderStatus` has no
 * `Published` member — Draft, PendingReview, Active, Paused, Suspended, Closed,
 * Archived — and sending the word the UI uses would be refused.
 */
export async function publishProvider(providerId: string): Promise<void> {
  await apiClient.put(`${ROOT}/${providerId}/status`, { status: 'Active' });
}

/**
 * Takes a business off every surface (`Archived`). The owner's removal: the
 * server has no DELETE for a provider, and `Archived` is the status it removes
 * from discovery, search and the map. Requires `canManageStatus`.
 */
export async function archiveProvider(providerId: string): Promise<void> {
  await apiClient.put(`${ROOT}/${providerId}/status`, { status: 'Archived', reason: 'Removed by its owner.' });
}

// ── The orchestration ────────────────────────────────────────────────────────

/** A step that ran after creation and did not land. */
export type ProviderPublishStep = 'photos' | 'services' | 'hours';

export type ProviderPublishOutcome =
  | { kind: 'published'; providerId: string; incomplete: ProviderPublishStep[] }
  | {
      kind: 'draft-only';
      providerId: string;
      reason: 'incomplete' | 'refused' | 'unknown';
      incomplete: ProviderPublishStep[];
    };

export interface CreateProviderInput {
  provider: RegisterProviderRequest;
  /** Local files chosen by the member. The first becomes the cover. */
  photos?: LocalFile[];
  services?: ProviderServiceRequest[];
  hours?: ProviderHoursDay[];
}

/** 409/422 from publish — the listing is real but not complete enough to show. */
function isNotPublishableError(cause: unknown): boolean {
  const status = (cause as { response?: { status?: number } })?.response?.status;

  return status === 409 || status === 422;
}

/** 403 from publish — the platform declined, and a retry is not the answer. */
function isRefusedError(cause: unknown): boolean {
  return (cause as { response?: { status?: number } })?.response?.status === 403;
}

/**
 * `POST /providers/{id}/photos` — puts an uploaded photograph on a business.
 *
 * Added 14 Oct 2026, with the server route. A `cover` is the card and header
 * image; the first photograph becomes the cover when there is none yet.
 */
export async function addProviderPhoto(
  providerId: string,
  mediaId: string,
  role: 'cover' | 'gallery'
): Promise<void> {
  await apiClient.post(`${ROOT}/${providerId}/photos`, { mediaId, role });
}

/**
 * Create, furnish, then publish — reporting what actually happened.
 *
 * Modelled on `createAndPublishListing` in `housing-listings-api.ts`, including
 * the reason it exists: **creation and publication fail independently, and
 * conflating them loses the member's work.** If the provider is created and
 * anything after it fails, the draft is safe, and the honest thing to say is
 * that it was saved and why it is not visible — not that posting failed.
 *
 * Only a creation failure throws. Everything after it is reported.
 */
export async function createAndPublishProvider(
  input: CreateProviderInput
): Promise<ProviderPublishOutcome> {
  // Deliberately unguarded: if this throws there is no provider, nothing was
  // saved, and the screen must say so. That is the one failure the member needs
  // reported as a failure.
  const created = await registerProvider(input.provider);

  const incomplete: ProviderPublishStep[] = [];

  // ── Photos ─────────────────────────────────────────────────────────────────
  //
  // Attached to the provider as they upload, so a partial upload leaves the
  // photos that did land attached rather than orphaned in the media store.
  if (input.photos?.length) {
    try {
      for (const [index, photo] of input.photos.entries()) {
        const asset = await uploadDirect(photo, {
          kind: 'image',
          owner: {
            ownerType: 'provider',
            ownerId: created.id,
            role: index === 0 ? 'cover' : 'gallery',
          },
        });
        // Uploading only stamped the photo with an owner; nothing put it on the
        // business, so every provider was published with no picture (14 Oct
        // 2026). This is the call that does, and the first one is the cover.
        await addProviderPhoto(created.id, asset.mediaId, index === 0 ? 'cover' : 'gallery');
      }
    } catch {
      incomplete.push('photos');
    }
  }

  // ── Services ───────────────────────────────────────────────────────────────
  //
  // One call each, because the server takes them one at a time and a member
  // editing one dish should never have to resend the menu. Reported as a single
  // incomplete step: the screen's remedy is the same whether one failed or all
  // of them, and a count the member cannot act on is noise.
  if (input.services?.length) {
    try {
      for (const service of input.services) {
        await addProviderService(created.id, service);
      }
    } catch {
      incomplete.push('services');
    }
  }

  // ── Opening hours ──────────────────────────────────────────────────────────
  if (input.hours?.length) {
    try {
      await setProviderOperatingHours(created.id, input.hours);
    } catch {
      incomplete.push('hours');
    }
  }

  // ── Publish ────────────────────────────────────────────────────────────────
  try {
    await publishProvider(created.id);

    return { kind: 'published', providerId: created.id, incomplete };
  } catch (cause) {
    if (isNotPublishableError(cause)) {
      return { kind: 'draft-only', providerId: created.id, reason: 'incomplete', incomplete };
    }

    if (isRefusedError(cause)) {
      return { kind: 'draft-only', providerId: created.id, reason: 'refused', incomplete };
    }

    // A 500, a dropped connection, an unrecognised code. The draft exists, so
    // the member is told that rather than being told nothing happened.
    return { kind: 'draft-only', providerId: created.id, reason: 'unknown', incomplete };
  }
}
