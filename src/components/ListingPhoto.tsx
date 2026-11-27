// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — ListingPhoto (Remediation Wave E)
//
// One image slot that can be empty, and says so.
//
// ── Why this exists ─────────────────────────────────────────────────────────
//
// Until this wave a listing could not have no photograph. `ImagePickerInput`
// handed a create screen `result.assets[0].uri` — a `file:///…` path on the
// device — and where the member chose nothing, the development handlers
// substituted an Unsplash photograph of somebody else's flat. Between them, the
// question "does this listing have a picture?" never reached a renderer, so no
// renderer ever had to answer it.
//
// Wave E removed both halves. A listing created with no photograph now arrives
// with `coverImage: ''` and `gallery: []`, and `<Image source={{ uri: '' }} />`
// is not a rendering of that: it is a silent blank box, indistinguishable from a
// photograph that failed to load and from one still being fetched.
//
// So this component makes the absence explicit and legible. It is deliberately
// the *only* answer to an empty slot in the listing surfaces — a second one
// would be a second opinion about what "no photo" looks like, which is how the
// thirty-one media fields happened in the first place.
//
// ── Why the empty state is not an illustration ──────────────────────────────
//
// A placeholder that looks like a photograph is the same lie in a lighter shade:
// a member scanning a list of results should be able to tell, without reading,
// which sellers photographed their item. A flat muted panel and a short label
// does that; a generic house drawing does not.
//
// ── Identifiers as well as addresses — 15 Sep 2026 ──────────────────────────
//
// Cards hold a media identifier, and this used to hand it to `<Image>` as an
// address, so no listing card ever showed its photograph. `photoUriOf` turns an
// identifier or a `{ mediaId }` reference into the platform's image route
// (`lib/media-url.ts`). A photograph that fails to load — withdrawn, not yet
// scanned, no connection — falls back to the same panel with its own words,
// rather than leaving a blank box that looks like a slow one.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import type { ImageStyle, StyleProp, ViewStyle } from 'react-native';

import { photoUriOf, type MediaImageVariant } from '@/lib/platform/media-url';

interface ListingPhotoProps {
  /**
   * The photograph, or nothing: an address, a media identifier, or a media
   * reference (`{ mediaId }`).
   *
   * Empty string as well as null and undefined, because `coverImage` is a
   * non-nullable `string` on both listing types and `''` is what this codebase
   * already uses for an absent cover.
   */
  uri?: string | { mediaId?: string | null } | null;
  /** Which rendition to ask for when `uri` is a media identifier. A card wants `medium`. */
  variant?: MediaImageVariant;
  /** Applied to the image and to the empty panel alike, so the layout is identical either way. */
  style: StyleProp<ImageStyle> & StyleProp<ViewStyle>;
  /** Extra classes for the empty panel only — a rounded corner the style cannot express. */
  emptyClassName?: string;
  /**
   * What is missing, in the member's words. "No photo" on a card, where space is
   * the constraint; something fuller on a detail screen, where it is not.
   */
  label?: string;
  /** Hidden on the smallest slots, where a label would wrap to three lines. */
  showLabel?: boolean;
}

export function ListingPhoto({
  uri,
  variant = 'medium',
  style,
  emptyClassName = '',
  label = 'No photo',
  showLabel = true,
}: ListingPhotoProps) {
  const source = photoUriOf(uri, variant);

  // ── A failure belongs to the photograph that failed ────────────────────────
  //
  // Held as *which* address failed rather than as a flag, so a different
  // photograph gets its own chance to load in the same render. A flag was
  // cleared by an effect after the render, and a list that recycles its rows
  // (FlashList, FARCH-004) hands this component the next listing's photograph:
  // for one frame that listing said "Photo unavailable" about a picture it had
  // not yet tried to load.
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const failed = source !== null && source === failedSource;

  if (source && !failed) {
    return (
      <Image
        source={{ uri: source }}
        // Blank, rather than the previous listing's photograph, while a
        // recycled row loads this one.
        recyclingKey={source}
        style={style}
        contentFit="cover"
        // Faded in when it is fetched, and shown at once from the cache: a row
        // scrolled back into view is handed its photograph again, and it should
        // not fade in a second time.
        transition={{ duration: 150, skipOnCacheHit: 'all' }}
        accessibilityLabel="Photo"
        onError={() => setFailedSource(source)}
      />
    );
  }

  if (source && failed) {
    return (
      <View
        style={style}
        className={`bg-surface-muted items-center justify-center border border-faint ${emptyClassName}`}
        accessible
        accessibilityRole="image"
        accessibilityLabel="Photo unavailable"
      >
        <Text className="text-lg opacity-40">🖼️</Text>
        {showLabel && (
          <Text className="text-[9px] font-bold uppercase tracking-wider text-content-faint mt-1">
            Photo unavailable
          </Text>
        )}
      </View>
    );
  }

  return (
    <View
      style={style}
      className={`bg-surface-muted items-center justify-center border border-faint ${emptyClassName}`}
      // Read out as one thing rather than as an unlabelled decorative box. A
      // screen-reader user browsing a marketplace needs the same fact a sighted
      // one gets from the panel: this seller posted no picture.
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      <Text className="text-lg opacity-40">🖼️</Text>
      {showLabel && (
        <Text className="text-[9px] font-bold uppercase tracking-wider text-content-faint mt-1">
          {label}
        </Text>
      )}
    </View>
  );
}
