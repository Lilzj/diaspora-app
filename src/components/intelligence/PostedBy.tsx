// Who wrote a piece of official information.
//
// Decided 7 Oct 2026: notices, visa advisories and embassy details are written
// by Diaspora platform admins, and members must see that, not a government's
// name. `postedByPlatform` comes from the server. "Official" is shown only for
// a confirmed issuing body, which the platform never is.

import React from 'react';
import { Text, View } from 'react-native';

export const PLATFORM_ATTRIBUTION = 'Posted by Diaspora platform admin';

export function PostedBy({
  postedByPlatform,
  authorityName,
  isOfficial = false,
  compact = false,
}: {
  postedByPlatform?: boolean;
  authorityName?: string | null;
  isOfficial?: boolean;
  compact?: boolean;
}) {
  const label = postedByPlatform ? PLATFORM_ATTRIBUTION : authorityName || null;
  if (!label) return null;

  return (
    <View className="flex-row items-center flex-wrap" accessible accessibilityLabel={label}>
      <Text
        className={`${compact ? 'text-[11px]' : 'text-xs'} font-bold text-content-faint mr-2`}
        numberOfLines={1}
      >
        {label}
      </Text>
      {isOfficial && !postedByPlatform ? (
        <Text className="text-[10px] font-black text-success-default">🛡️ OFFICIAL</Text>
      ) : null}
    </View>
  );
}
