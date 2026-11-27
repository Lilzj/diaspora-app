// Community Life: the outline of a tab's rows while its list is first read.
// The route drew this over the whole page, controls included, while any of the three reads ran;
// each tab's `ListState` draws it below its own search and filters now (FARCH-007).

import React from 'react';
import { View } from 'react-native';

export function ListSkeleton({ label }: { label: string }) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} className="gap-4">
      <View className="h-44 bg-subtle rounded-3xl animate-pulse" />
      <View className="h-6 bg-subtle rounded w-2/3" />
      <View className="h-4 bg-subtle rounded w-1/2" />
    </View>
  );
}
