// ─────────────────────────────────────────────────────────────────────────────
// Organisations — the organisations you hold a role in
//
// Lifted out of `/profile/creator-dashboard` unchanged: the same heading, the
// same "+ Create Org" button, the same `OrganizationSwitcher` with its role
// filters and cards, and the same management sheet behind Manage.
//
// ── What moved here rather than staying in the header ────────────────────────
//
// The "Publishing as" bar. On Studio it sat in the screen header, above the
// section selector, so it was on screen while you were reading analytics — a
// control about *attribution* pinned over a section that has nothing to
// attribute.
//
// It belongs with the organisations, because switching identity is the same
// decision as choosing which organisation you are acting for. It is still
// sticky, and it still opens the same bottom sheet. Only its position and its
// colour changed, and the colour is recorded in
// `components/creator/PublishingIdentitySelector`.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';

import { OrganizationSwitcher } from '@/components/creator/OrganizationSwitcher';

export function OrganisationsSection() {

  return (
    <View>
      {/* No "Publishing as" switch (20 Oct 2026): it offered a fixture member
          ("Joshua", a stock photo, 980 followers) and organisations, and
          nothing read the choice. */}
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-xs font-black text-content-faint uppercase tracking-widest">
          Your organisations
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/community-life/org/create')}
          accessibilityRole="button"
          accessibilityLabel="Create an organisation"
          className="bg-primary-500 px-3.5 py-1.5 rounded-xl"
        >
          <Text className="text-xs font-black text-white">+ Create Org</Text>
        </TouchableOpacity>
      </View>

      {/* Real organisations, managed on their own pages (20 Oct 2026). */}
      <OrganizationSwitcher />
    </View>
  );
}
