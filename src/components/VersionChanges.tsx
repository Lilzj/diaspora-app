import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface VersionChangesProps {
  versionNumber: number;
  updatedAt: string;
  changeSummary: string[];
  authorName: string;
  onViewAllVersions?: () => void;
}

export function VersionChanges({
  versionNumber,
  updatedAt,
  changeSummary,
  authorName,
  onViewAllVersions,
}: VersionChangesProps) {
  const date = new Date(updatedAt).toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  if (changeSummary.length === 0) return null;

  return (
    <View className="bg-surface-background rounded-xl p-4">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-sm font-semibold text-content-primary">
          Version {versionNumber} · {date}
        </Text>
        <Text className="text-xs text-content-muted">by {authorName}</Text>
      </View>

      <Text className="text-xs font-medium text-content-tertiary mb-1.5">What's Changed:</Text>
      {changeSummary.map((change, i) => (
        <View key={i} className="flex-row items-start mb-1">
          <Text className="text-xs text-content-faint mr-1.5">•</Text>
          <Text className="text-xs text-content-secondary flex-1">{change}</Text>
        </View>
      ))}

      {onViewAllVersions && (
        <TouchableOpacity onPress={onViewAllVersions} className="mt-2">
          <Text className="text-xs text-primary-500 font-medium">View all versions</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
