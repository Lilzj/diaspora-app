// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — where a photograph's bytes are
//
// **Listing cards never showed a photograph.** A card holds a media identifier
// (`coverMediaId` on a marketplace card, `coverImage.mediaId` on a home), and
// `ListingPhoto` handed that identifier to `<Image>` as if it were an address —
// so every card drew an empty box or the "no photo" panel, for listings that
// provably had a photograph.
//
// The platform serves an asset's bytes at
//
//   GET /media/{mediaId}/content
//   GET /media/{mediaId}/variants/{variant}
//
// without a bearer token, because an image tag cannot send one. Access is
// decided from the asset: a listing photograph (cover, gallery) is readable
// exactly when the listing carrying it is visible to the reader —
// `MarketplaceListingMediaPolicy` and `HousingListingMediaPolicy` answer that
// with the listing's own rule — so a draft's photograph stays unreadable and a
// published one renders for anyone, signed in or not. Checked against the live
// API on 15 Sep 2026: every published cover answered 200 image/png.
//
// A variant that has not been produced yet is served as the original, so asking
// for `medium` costs nothing today and gets a smaller file once renditions exist.
// ─────────────────────────────────────────────────────────────────────────────

import { API_BASE_URL } from './apiClient';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `MediaVariantPurpose`, as the route spells it. */
export type MediaImageVariant = 'original' | 'thumbnail' | 'small' | 'medium' | 'large' | 'preview';

/** Whether a value is a media identifier rather than an address. */
export function isMediaId(value: unknown): value is string {
  return typeof value === 'string' && GUID.test(value.trim());
}

/**
 * The address of a media asset's bytes, or null for anything that is not a
 * media identifier — never a URL with "undefined" in it.
 */
export function mediaImageUrl(
  mediaId: string | null | undefined,
  variant: MediaImageVariant = 'medium'
): string | null {
  if (!isMediaId(mediaId)) return null;
  const id = mediaId.trim();
  const base = API_BASE_URL.replace(/\/+$/, '');
  return variant === 'original'
    ? `${base}/media/${id}/content`
    : `${base}/media/${id}/variants/${variant}`;
}

/**
 * Something `<Image>` can load, from whatever a listing carries for its photo:
 * a media identifier, a media reference (`{ mediaId }`), or an address already
 * (a signed link, a device file chosen a moment ago). Null for anything else.
 */
export function photoUriOf(
  value: string | { mediaId?: string | null } | null | undefined,
  variant: MediaImageVariant = 'medium'
): string | null {
  if (!value) return null;

  if (typeof value === 'object') return mediaImageUrl(value.mediaId, variant);

  const text = value.trim();
  if (!text) return null;
  if (isMediaId(text)) return mediaImageUrl(text, variant);
  if (/^(https?:|file:|content:|data:image\/)/i.test(text)) return text;

  return null;
}
