import React from 'react';
import { View } from 'react-native';
import { lightTokens } from '@/design-system';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  className?: string;
}

export function Skeleton({ width = '100%', height = 16, borderRadius = 8, className }: SkeletonProps) {
  const opacity = useSharedValue(0.3);

  React.useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.7, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      // A pulsing grey block says nothing to a screen reader, so a member using
      // one previously heard silence and could not tell a loading screen from
      // an empty one. `accessible` is what actually merges this into a single
      // announced element — the role alone is not enough.
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={[
        {
          width: typeof width === 'number' ? width : undefined,
          height,
          borderRadius,
          backgroundColor: lightTokens.color.neutral[200],
        },
        animatedStyle,
      ]}
      className={`${typeof width === 'string' ? 'w-full' : ''} ${className ?? ''}`}
    />
  );
}

/**
 * Announces the placeholder once and hides the bars inside it, so a screen
 * reader says "Loading" rather than reading it five times per card.
 */
function SkeletonCard({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <View
      className={className}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
    >
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {children}
      </View>
    </View>
  );
}

export function ProviderCardSkeleton() {
  return (
    <SkeletonCard className="flex-row bg-surface-card rounded-xl p-3 mb-3">
      <Skeleton width={104} height={104} borderRadius={12} />
      <View className="flex-1 ml-3 justify-center">
        <Skeleton width="70%" height={18} className="mb-2" />
        <Skeleton width="50%" height={14} className="mb-2" />
        <Skeleton width="30%" height={14} />
      </View>
    </SkeletonCard>
  );
}

export function JobCardSkeleton() {
  return (
    <SkeletonCard className="bg-surface-card rounded-2xl p-4 mb-3 border border-subtle">
      <View className="flex-row justify-between mb-3">
        <Skeleton width="30%" height={16} />
        <Skeleton width="20%" height={16} />
      </View>
      <Skeleton width="80%" height={20} className="mb-2" />
      <Skeleton width="40%" height={14} className="mb-3" />
      <View className="flex-row gap-2 mb-3">
        <Skeleton width={80} height={18} borderRadius={10} />
        <Skeleton width={80} height={18} borderRadius={10} />
      </View>
      <View className="flex-row justify-between border-t border-neutral-50 pt-3 items-center">
        <Skeleton width="30%" height={24} />
        <Skeleton width="40%" height={32} borderRadius={12} />
      </View>
    </SkeletonCard>
  );
}
