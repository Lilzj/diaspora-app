import React from 'react';
import { View } from 'react-native';
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
      style={[
        {
          width: typeof width === 'number' ? width : undefined,
          height,
          borderRadius,
          backgroundColor: '#E5E7EF',
        },
        animatedStyle,
      ]}
      className={`${typeof width === 'string' ? 'w-full' : ''} ${className ?? ''}`}
    />
  );
}

export function ProviderCardSkeleton() {
  return (
    <View className="flex-row bg-white rounded-xl p-3 mb-3">
      <Skeleton width={104} height={104} borderRadius={12} />
      <View className="flex-1 ml-3 justify-center">
        <Skeleton width="70%" height={18} className="mb-2" />
        <Skeleton width="50%" height={14} className="mb-2" />
        <Skeleton width="30%" height={14} />
      </View>
    </View>
  );
}

export function JobCardSkeleton() {
  return (
    <View className="bg-white rounded-2xl p-4 mb-3 border border-neutral-200">
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
    </View>
  );
}
