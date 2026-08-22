// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Housing viewings client (Remediation Wave B′)
//
// `housing/[id].tsx` had a button labelled "Submit Booking Inquiry". Pressing it
// asked "would you like to send an accommodation application request?", and on
// "Apply Now" it showed:
//
//     Application Sent!
//     {host} has received your request and will contact you shortly.
//
// The host had received nothing. There was no request, no record, and no way for
// the member to discover that — they were told a named person was going to ring
// them about a home. That is the most expensive sentence in this wave, because a
// member who believes it stops looking.
//
// ── Why this is a viewing and not an application ─────────────────────────────
//
// **`Diaspora.Modules.Housing` has no application concept at all.** There is no
// `HousingApplication` entity, no apply route, and nothing that carries "my
// verified residency and community profile details" to a landlord — which the
// old confirmation dialog also promised. Inventing a client-side application
// would have been the same defect wearing a request.
//
// What the module *does* have is the relocation workflow —
// `Api/HousingRelocationEndpoints.cs` — and its entry point is:
//
//     POST /api/v1/housing/listings/{listingId:guid}/viewings
//
// That is the platform's answer to "I am interested in this home, put me in
// front of the landlord". The handler's own summary is worth quoting, because it
// explains why the control is shaped the way it now is:
//
//   *"Requesting a viewing does not hold a unit, and that asymmetry with
//   reservations is the whole design: ten people may hold a viewing on the same
//   flat on the same Saturday, and the property stays on the market throughout."*
//
// So the button no longer implies exclusivity or a decision. It asks to be shown
// the property, which is the thing the server will actually do.
//
// ── The four properties a caller has to know ─────────────────────────────────
//
// **1. It is gated on a verified identity, not on being signed in.** The route
// carries `RequireAuthorization(HousingPolicies.ViewingSchedule)` and the command
// repeats it as `[Authorize(Permission = HousingPermissions.ViewingSchedule)]`.
// A merely-authenticated member gets **403**, and the reason is not bureaucratic:
// a confirmed viewing is what unlocks a street address, so a member who could
// arrange viewings without proving who they are could map the empty homes in a
// city. `viewingRefusal` names verification as the way through, because it is.
//
// **2. A second request on the same property is a 409, not a duplicate.** The
// handler looks for an open viewing by this seeker on this listing first
// (`GetOpenForSeekerAsync`) and refuses with `housing.viewing.already-open`. That
// is a *success* from the member's point of view — the landlord already has their
// request — and it is worded as one below rather than as an error.
//
// **3. There is a ceiling on open viewings, and it is a security control.**
// `housing.viewings.too-many` is `Error.RateLimited`, bounded by
// `HousingOptions.MaxOpenViewingsPerSeeker`. Same reasoning as (1): it stops
// address harvesting rather than queue flooding. The client does not guess the
// limit and does not pre-empt the check — a client-side rate limiter here would
// be a second opinion about a number it cannot see.
//
// **4. Every field on the request is optional.** `PreferredAt` null "leaves it
// to the landlord", and `DurationMinutes` null takes
// `HousingOptions.DefaultViewingDurationMinutes`. An empty body is a valid
// viewing request, so this client sends only what the member actually chose. It
// does not invent a preferred time to fill the field, because a fabricated
// appointment time is how a member misses one.
//
// ── What this deliberately does not offer ────────────────────────────────────
//
//   * **Cancelling or rescheduling.** `POST /housing/viewings/{viewingId}` does
//     both, behind `HousingPolicies.ViewingManage`, and it belongs on a "my
//     viewings" screen that can list them — `GET /housing/viewings` — rather than
//     on a listing page that knows about one. Closing the inert button did not
//     require it, and shipping a cancel control with nowhere to see the result
//     would be the next thing to go stale.
//   * **A reservation.** `POST /housing/listings/{id}/reservations` exists and is
//     the expensive half of the pair — it holds the unit and involves money.
//     Nothing in this wave should quietly upgrade a member's tap on "enquire"
//     into one.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';

interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/**
 * `RequestViewingRequest`.
 *
 * Every field optional, exactly as the contract has it. See property 4 above:
 * an empty body is valid, and this type says so rather than making the caller
 * supply a placeholder.
 */
export interface RequestViewingRequest {
  /** When the member would like to come. Omitted leaves it to the landlord. */
  preferredAt?: string;
  /**
   * A video walk-through rather than a visit.
   *
   * The backend's comment on this field is not a nicety and is repeated here
   * because it changes how the control should be presented: *"most members
   * choosing a home are doing it from another country, and this is the only
   * viewing they can have before they fly."*
   */
  isVirtual?: boolean;
  durationMinutes?: number;
  /** What the member wants to say to the landlord. */
  message?: string;
}

/** One step in a viewing's life, as it happened. `ViewingHistoryEntryResponse`. */
export interface ViewingHistoryEntry {
  entryId: string;
  status: string;
  /** Who did it. Null when the expiry sweep did. */
  actorId: string | null;
  reason: string | null;
  occurredAt: string;
}

/** `HousingViewingStatus`, as the response carries it. */
export type HousingViewingStatus =
  | 'Requested'
  | 'Scheduled'
  | 'Completed'
  | 'Cancelled'
  | 'NoShow'
  | 'Expired';

/** `HousingViewingResponse`. Visible only to the two parties; staff get no bypass. */
export interface HousingViewing {
  id: string;
  listingId: string;
  listingTitle: string;
  listingSlug: string | null;
  landlordId: string;
  landlordName: string;
  seekerUserId: string;
  status: HousingViewingStatus | string;
  preferredAt: string | null;
  confirmedAt: string | null;
  durationMinutes: number;
  isVirtual: boolean;
  /** Where to meet, or how to join. **Never the property address.** */
  place: string | null;
  message: string | null;
  landlordFailedToAttend: boolean | null;
  closureReason: string | null;
  /** Whether this viewing entitles the member to the full address. */
  unlocksAddress: boolean;
  /** Whether it satisfies a landlord viewing-before-reservation requirement. */
  satisfiesReservationRequirement: boolean;
  history: ViewingHistoryEntry[];
  createdAt: string;
}

/**
 * `POST /housing/listings/{listingId}/viewings` — **201**.
 *
 * The path parameter is constrained `:guid` on the server, so this must be the
 * listing's `id` and never its slug. The *read* route
 * (`GET /housing/listings/{idOrSlug}`) accepts either, which is exactly how a
 * screen ends up holding a slug and sending it here — so the caller passes
 * `listing.id` from the loaded listing rather than the route parameter it
 * navigated with.
 */
export async function requestViewing(
  listingId: string,
  request: RequestViewingRequest = {}
): Promise<HousingViewing> {
  const response = await apiClient.post<Envelope<HousingViewing>>(
    `/housing/listings/${encodeURIComponent(listingId)}/viewings`,
    request
  );
  return response.data.data;
}

// ── Reading a refusal ────────────────────────────────────────────────────────

function problemCode(cause: unknown): string | null {
  const code = (cause as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === 'string' ? code : null;
}

function status(cause: unknown): number | null {
  const value = (cause as { response?: { status?: number } })?.response?.status;
  return typeof value === 'number' ? value : null;
}

/**
 * Whether the member already has an open viewing on this property.
 *
 * `housing.viewing.already-open`, HTTP 409. Property 2: this is the one refusal
 * in the set that means the member's goal is **already met**. A screen that
 * rendered it as a failure would push somebody into asking again for something
 * they have.
 */
export function isViewingAlreadyOpenError(cause: unknown): boolean {
  return status(cause) === 409 && problemCode(cause) === 'housing.viewing.already-open';
}

/**
 * Whether the member lacks `housing:viewing:schedule`.
 *
 * A 403 here is the verification gate rather than a listing-level permission —
 * see property 1. It is separated from the other refusals because it is the only
 * one with a next step the member can take today.
 */
export function isViewingNotPermittedError(cause: unknown): boolean {
  return status(cause) === 403 && !isLandlordSuspendedError(cause);
}

/** `housing.landlord.suspended` — also a 403, and not about the member at all. */
export function isLandlordSuspendedError(cause: unknown): boolean {
  return problemCode(cause) === 'housing.landlord.suspended';
}

/**
 * A sentence the member can act on, from the platform's problem envelope.
 *
 * Every string here is anchored to a specific `HousingErrorCodes` constant, and
 * the fallback is the server's own `detail` before it is anything of ours. The
 * one thing this function will never return is a claim that the request
 * succeeded.
 */
export function viewingRefusal(cause: unknown): { title: string; message: string } {
  if (status(cause) === 401) {
    return {
      title: 'Sign in to ask',
      message: 'Sign in to your Diaspora account to ask this host to show you the property.',
    };
  }

  if (isLandlordSuspendedError(cause)) {
    return {
      title: 'This host cannot take viewings',
      message:
        'This host is not currently able to let property on Diaspora, so we have not sent your request. Nothing was shared with them.',
    };
  }

  if (isViewingNotPermittedError(cause)) {
    return {
      title: 'Verify your identity first',
      message:
        'A confirmed viewing reveals the property address, so Diaspora asks you to verify your identity before booking one. Finish verification and you can ask straight away.',
    };
  }

  switch (problemCode(cause)) {
    case 'housing.viewing.not-accepted-here':
      return {
        title: 'Not taking viewings',
        message:
          'This property is not accepting viewing requests at the moment. You can still message the host from this page.',
      };
    case 'housing.viewing.self':
      return {
        title: 'This is your property',
        message: 'You cannot book a viewing on your own listing.',
      };
    case 'housing.viewings.too-many':
      return {
        title: 'Too many viewings open',
        message:
          'You have too many viewing requests open at once. Close or complete some of them before asking for another.',
      };
    case 'housing.viewing.slot.in-past':
      return {
        title: 'That time has passed',
        message: 'Pick a time in the future and we will send it to the host.',
      };
    case 'housing.viewing.window.invalid':
      return {
        title: 'That time will not work',
        message: 'Pick a different time and we will send it to the host.',
      };
    case 'housing.listing.not-found':
      return {
        title: 'This listing is gone',
        message: 'It may have been rented, expired or archived since you opened it.',
      };
    default:
      break;
  }

  const detail = (cause as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim().length > 0) {
    return { title: 'We could not send your request', message: detail };
  }

  // Deliberately not "something went wrong". The member needs to know the host
  // did **not** get their request, because the alternative is waiting for a call
  // that is never coming.
  return {
    title: 'We could not send your request',
    message:
      'We could not reach Diaspora just now, so the host has not received anything. Try again in a moment.',
  };
}
