// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — map error copy (Frontend Phase 8, §44, §54)
//
// §44 lists eleven failure modes and §54 adds more, and both require *graceful*
// handling. Graceful means a specific sentence and a specific next step per
// case, not a spinner that resolves into "Something went wrong".
//
// The exhaustive switch is the mechanism. `MapErrorKind` is a closed union and
// `mapErrorCopy` returns for every member, so adding a failure mode without
// deciding what a member should read about it is a compile error rather than a
// gap somebody notices in production.
//
// Three rules the copy follows:
//
//   **Say what happened, in the member's terms.** "We could not work out a
//   route" — not "ROUTING_FAILED", not "Provider returned 502".
//
//   **Offer the action that can actually succeed.** A permanently-denied
//   permission gets "Open settings"; a temporarily-denied one gets "Try again".
//   Offering the retry on the permanent case teaches people the button is a
//   decoration.
//
//   **Never leak the provider.** No vendor name, no status code, no raw
//   message. Provider messages occasionally contain the coordinate that was
//   queried, and §59 does not exempt an error string.
// ─────────────────────────────────────────────────────────────────────────────

import type { MapError, MapErrorKind } from '@/types/maps';

/** What the member is offered next. Drives which button the error state shows. */
export type MapErrorAction = 'retry' | 'open-settings' | 'enable-location' | 'widen-search' | 'none';

export interface MapErrorCopy {
  /** Short, for a banner. */
  title: string;
  /** One or two sentences. */
  body: string;
  action: MapErrorAction;
  actionLabel?: string;
  retryable: boolean;
}

export function mapErrorCopy(kind: MapErrorKind): MapErrorCopy {
  switch (kind) {
    case 'provider-unavailable':
      return {
        title: 'Maps are limited in this build',
        body: 'This part of the map needs a service that has not been connected yet. Everything else on this screen still works.',
        action: 'none',
        retryable: false,
      };

    case 'tiles-unavailable':
      return {
        title: 'Map background unavailable',
        body: 'We could not load the map background, so we are showing a simplified map. Distances and positions are still correct.',
        action: 'retry',
        actionLabel: 'Try again',
        retryable: true,
      };

    case 'geocoding-failed':
      return {
        title: 'Place search is unavailable',
        body: 'We could not look that place up just now. You can try again, or pick a neighbourhood from the list.',
        action: 'retry',
        actionLabel: 'Try again',
        retryable: true,
      };

    case 'routing-failed':
      return {
        title: 'We could not work out a route',
        body: 'Something went wrong while planning the journey. Try again, or open the directions in your maps app.',
        action: 'retry',
        actionLabel: 'Try again',
        retryable: true,
      };

    case 'transit-unavailable':
      return {
        title: 'No transit information here',
        body: 'We do not have public transport data for this area yet. Walking and driving estimates are still available.',
        action: 'none',
        retryable: false,
      };

    case 'no-route':
      // Distinct from `routing-failed` on purpose: a retry cannot conjure a
      // road across the sea, and offering one wastes the member's time.
      return {
        title: 'No route between these places',
        body: 'There is no journey we can plan between these two points with this travel mode. Try a different mode or a nearer starting point.',
        action: 'none',
        retryable: false,
      };

    case 'location-unavailable':
      return {
        title: 'We could not find your position',
        body: 'Your device did not return a location. This can happen indoors or with a weak signal.',
        action: 'retry',
        actionLabel: 'Try again',
        retryable: true,
      };

    case 'location-permission-denied':
      return {
        title: 'Location access is off',
        body: 'Diaspora needs permission to use your location to show what is near you. You can turn this on in Settings, or keep browsing by choosing a neighbourhood instead.',
        action: 'open-settings',
        actionLabel: 'Open settings',
        retryable: false,
      };

    case 'location-services-disabled':
      return {
        title: 'Location services are turned off',
        body: 'Your device has location switched off entirely. Turning it on in your device settings will let us show what is near you.',
        action: 'open-settings',
        actionLabel: 'Open settings',
        retryable: false,
      };

    case 'network-unavailable':
      return {
        title: 'No connection',
        body: 'We could not reach Diaspora. Check your connection and try again.',
        action: 'retry',
        actionLabel: 'Try again',
        retryable: true,
      };

    case 'offline':
      return {
        title: 'You are offline',
        body: 'We are showing what was saved the last time you were connected. Alerts and travel times may have changed since.',
        action: 'retry',
        actionLabel: 'Try again',
        retryable: true,
      };

    case 'rate-limited':
      return {
        title: 'Too many requests',
        body: 'The map is being asked for more than it can answer right now. Give it a moment and try again.',
        action: 'retry',
        actionLabel: 'Try again',
        retryable: true,
      };

    case 'quota-exceeded':
      return {
        title: 'Map service limit reached',
        body: 'Map services are temporarily unavailable. This is on our side, not yours, and we are aware of it.',
        action: 'none',
        retryable: false,
      };

    case 'invalid-coordinates':
      return {
        title: 'That location does not look right',
        body: 'We could not make sense of that position, so we have not moved the map.',
        action: 'none',
        retryable: false,
      };

    case 'no-results':
      return {
        title: 'Nothing here yet',
        body: 'There is nothing matching your filters in this part of the map. Try zooming out or clearing a filter.',
        action: 'widen-search',
        actionLabel: 'Widen the search',
        retryable: false,
      };

    case 'too-many-results':
      return {
        title: 'Too much to show at once',
        body: 'There is more here than we can draw. Zoom in or add a filter to narrow it down.',
        action: 'none',
        retryable: false,
      };

    case 'not-found':
      return {
        title: 'Not found',
        body: 'We could not find what you were looking for. It may have been removed.',
        action: 'none',
        retryable: false,
      };

    case 'unauthorized':
      return {
        title: 'Please sign in',
        body: 'You need to be signed in to see this.',
        action: 'none',
        retryable: false,
      };

    case 'forbidden':
      return {
        title: 'Not available to you',
        body: 'You do not have access to this. If you think that is wrong, get in touch.',
        action: 'none',
        retryable: false,
      };

    case 'stale-data':
      return {
        title: 'This may be out of date',
        body: 'We have not been able to refresh this recently, so what you are seeing may have changed.',
        action: 'retry',
        actionLabel: 'Refresh',
        retryable: true,
      };

    case 'unknown':
      return {
        title: 'Something went wrong',
        body: 'We could not load this part of the map. Try again in a moment.',
        action: 'retry',
        actionLabel: 'Try again',
        retryable: true,
      };
  }
}

/** Builds a `MapError` with the copy already resolved. */
export function toMapError(kind: MapErrorKind, gapKey?: string): MapError {
  const copy = mapErrorCopy(kind);
  return { kind, message: copy.body, retryable: copy.retryable, gapKey };
}

/**
 * Classifies a thrown value into the map error vocabulary.
 *
 * Deliberately conservative: anything not recognised becomes `unknown` rather
 * than being guessed at. A wrong classification produces confidently wrong copy
 * and an action that cannot work, which is worse than a generic message.
 */
export function classifyError(error: unknown): MapErrorKind {
  if (!error || typeof error !== 'object') return 'unknown';

  const candidate = error as {
    response?: { status?: number };
    code?: string;
    message?: string;
  };

  // No response at all is the only proof of a network failure. A 500 is a
  // server the device could reach, which is a different problem with a
  // different message — `apiClient`'s interceptor draws the same distinction.
  if (!candidate.response) {
    if (candidate.code === 'ECONNABORTED') return 'network-unavailable';
    if (typeof candidate.message === 'string' && candidate.message.includes('Network'))
      return 'network-unavailable';
  }

  const status = candidate.response?.status;
  if (typeof status === 'number') {
    if (status === 401) return 'unauthorized';
    if (status === 403) return 'forbidden';
    if (status === 404) return 'not-found';
    if (status === 429) return 'rate-limited';
    if (status >= 500) return 'provider-unavailable';
  }

  return 'unknown';
}
