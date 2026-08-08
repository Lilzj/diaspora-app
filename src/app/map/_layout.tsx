import React from 'react';
import { Stack } from 'expo-router';

/**
 * Diaspora Platform — Maps & Navigation stack (Frontend Phase 8)
 *
 * A plain stack. Headers are drawn by the screens themselves, because a map
 * screen's header carries the mode switcher, the search field and the filters
 * and cannot be expressed as a title string.
 */
export default function MapLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
