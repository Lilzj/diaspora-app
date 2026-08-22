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
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import type { ImageStyle, StyleProp, ViewStyle } from 'react-native';

interface ListingPhotoProps {
  /**
   * The photograph, or nothing.
   *
   * Empty string as well as null and undefined, because `coverImage` is a
   * non-nullable `string` on both listing types and `''` is what this codebase
   * already uses for an absent cover.
   */
  uri?: string | null;
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
  style,
  emptyClassName = '',
  label = 'No photo',
  showLabel = true,
}: ListingPhotoProps) {
  const hasPhoto = typeof uri === 'string' && uri.trim().length > 0;

  if (hasPhoto) {
    return <Image source={{ uri }} style={style} contentFit="cover" />;
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
