// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the creator workspace's lifecycle actions
//
// ── Why these could not be written before, and can be now ────────────────────
//
// `QuickActionsMenu` and `ArchiveCard` both explained, at length and correctly,
// that their controls did nothing:
//
//   > The routes exist per module (`POST /{module}/listings/{id}/archive`,
//   > `DELETE /{module}/listings/{id}`) and are the right ones to call once these
//   > items are real. Until then the dialog must not ask a member to confirm an
//   > irreversible action that will not happen.
//
// The blocker was never the routes. It was that the items were fixtures, so
// `item.id` was `cnt-hou-1` rather than a Guid the server could resolve. The
// workspace now reads real rows out of `GET /guides/mine`,
// `/marketplace/listings/mine`, `/housing/listings/mine` and
// `/community-life/events/mine`, so the ids are real and the routes can be
// called. This file is that call.
//
// ── One verb, four modules, and no unified route ─────────────────────────────
//
// There is still no cross-module lifecycle endpoint, so each verb dispatches on
// `contentType`. That is not a workaround to be replaced later — it is what the
// platform's shape actually is, and pretending otherwise is what produced a
// client-side `ContentStatus` union with five members no module has ever heard
// of (`Reserved`, `Paused`, `Interviewing`, `Filled`, `Open`).
//
// **Unsupported combinations return `notSupported` rather than throwing.** A
// caller must be able to ask "can I archive this?" and get an answer it can
// render, because half of what this menu offers is genuinely unavailable for
// half of what it is offered on.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';

import { apiClient } from '../apiClient';
import type { ContentType } from '@/types/creator';

export type WorkspaceActionKind =
  | 'archive' | 'restore' | 'delete' | 'markSold' | 'markOccupied' | 'duplicate';

export type WorkspaceActionResult =
  | { outcome: 'done' }
  /** The platform has no route for this verb on this kind of content. */
  | { outcome: 'notSupported'; reason: string }
  /** It was refused. `reason` is the server's own words where it gave any. */
  | { outcome: 'refused'; reason: string; status: number };

/**
 * Where each verb lives, per content type.
 *
 * `null` is a deliberate entry, not an omission: it records that the platform has
 * no route, and it is what `canPerform` reads to decide whether to offer a
 * control at all. An `Update`, a `Provider` and a `Job` are all in the workspace's
 * `ContentType` union and none of them has an archive route.
 */
const ROUTES: Record<
  WorkspaceActionKind,
  Partial<Record<ContentType, (id: string) => { method: 'post' | 'delete'; path: string }>>
> = {
  archive: {
    Guide: (id) => ({ method: 'post', path: `/guides/${id}/archive` }),
    Marketplace: (id) => ({ method: 'post', path: `/marketplace/listings/${id}/archive` }),
    Housing: (id) => ({ method: 'post', path: `/housing/listings/${id}/archive` }),
  },
  restore: {
    Guide: (id) => ({ method: 'post', path: `/guides/${id}/restore` }),
    Marketplace: (id) => ({ method: 'post', path: `/marketplace/listings/${id}/restore` }),
    Housing: (id) => ({ method: 'post', path: `/housing/listings/${id}/restore` }),
  },
  delete: {
    Guide: (id) => ({ method: 'delete', path: `/guides/${id}` }),
    Marketplace: (id) => ({ method: 'delete', path: `/marketplace/listings/${id}` }),
    Housing: (id) => ({ method: 'delete', path: `/housing/listings/${id}` }),
  },
  // The two status transitions the platform actually models. The client's own
  // `ContentStatus` union carries five more and no module implements any of them.
  markSold: {
    Marketplace: (id) => ({ method: 'post', path: `/marketplace/listings/${id}/sold` }),
  },
  markOccupied: {
    Housing: (id) => ({ method: 'post', path: `/housing/listings/${id}/occupied` }),
  },

  // BG-07. This row was the whole of the gap: a "Duplicate" control sat in the
  // quick-actions sheet across several phases with no route in any module behind
  // it, and the client eventually said so rather than offering a button that
  // failed. The product decision was taken to build it, and these are the four
  // routes it built.
  //
  // `Update`, `Provider` and `Job` are absent on purpose and not by oversight —
  // the same reason they are absent from `archive`. A duplicate of a job advert
  // is a second advert for one role, which is a moderation problem rather than a
  // convenience.
  duplicate: {
    Guide: (id) => ({ method: 'post', path: `/guides/${id}/duplicate` }),
    Marketplace: (id) => ({ method: 'post', path: `/marketplace/listings/${id}/duplicate` }),
    Housing: (id) => ({ method: 'post', path: `/housing/listings/${id}/duplicate` }),
    Event: (id) => ({ method: 'post', path: `/community-life/events/${id}/duplicate` }),
  },
};

/** What to say when the platform has no route for this verb on this content. */
const UNSUPPORTED: Record<WorkspaceActionKind, string> = {
  archive: 'Diaspora does not archive this kind of content.',
  restore: 'Diaspora does not restore this kind of content.',
  delete: 'Diaspora does not delete this kind of content from here.',
  markSold: 'Only a marketplace listing can be marked sold.',
  markOccupied: 'Only a property can be marked occupied.',
  duplicate: 'Diaspora does not copy this kind of content.',
};

/**
 * Whether the platform can do this verb to this kind of content at all.
 *
 * Exported so a menu can *withhold* a control rather than offer one that
 * explains itself after being pressed. §28's "no silent capabilities" has an
 * opposite that matters just as much: no controls for capabilities that are not
 * there.
 */
export function canPerform(kind: WorkspaceActionKind, contentType: ContentType): boolean {
  return !!ROUTES[kind][contentType];
}

/** A Guid, which is what every one of these routes binds. */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Performs one lifecycle verb against the module that owns it.
 *
 * The id is checked before the request, because the failure this file exists to
 * end was a control that *looked* like it worked. A fixture id would answer 400
 * and the member would read a validation error about their own listing.
 */
export async function performWorkspaceAction(
  kind: WorkspaceActionKind,
  contentType: ContentType,
  id: string
): Promise<WorkspaceActionResult> {
  const route = ROUTES[kind][contentType];
  if (!route) return { outcome: 'notSupported', reason: UNSUPPORTED[kind] };

  if (!GUID.test(id)) {
    return {
      outcome: 'notSupported',
      reason: 'This item did not come from the server, so there is nothing to change.',
    };
  }

  const { method, path } = route(id);

  try {
    if (method === 'delete') await apiClient.delete(path);
    else await apiClient.post(path, {});
    return { outcome: 'done' };
  } catch (cause) {
    const status = axios.isAxiosError(cause) ? (cause.response?.status ?? 0) : 0;
    const detail = axios.isAxiosError(cause)
      ? ((cause.response?.data as { detail?: string } | undefined)?.detail ?? cause.message)
      : String(cause);
    return { outcome: 'refused', reason: detail, status };
  }
}
