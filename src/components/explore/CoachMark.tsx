import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  AccessibilityInfo,
  findNodeHandle,
  Platform,
} from 'react-native';
import { useExploreStore, ElementLayout } from '@/store/explore';
import { TourStep } from '@/types/explore';

interface CoachMarkProps {
  step: TourStep;
  totalSteps: number;
  stepNumber: number;
  targetLayout?: ElementLayout;
  screenWidth?: number;
  screenHeight?: number;
}

export const CoachMark: React.FC<CoachMarkProps> = ({
  step,
  totalSteps,
  stepNumber,
  targetLayout,
  screenWidth = 375,
  screenHeight = 812,
}) => {
  const nextStep = useExploreStore((state) => state.nextStep);
  const prevStep = useExploreStore((state) => state.prevStep);
  const skipTour = useExploreStore((state) => state.skipTour);
  const pauseTour = useExploreStore((state) => state.pauseTour);

  const containerRef = useRef<View>(null);

  // Announcement description for screen readers
  const announcementText = `Step ${stepNumber} of ${totalSteps}. ${step.title}. ${step.description}`;

  useEffect(() => {
    // Automatically grab screen reader focus when step changes
    const timer = setTimeout(() => {
      if (Platform.OS !== 'web' && containerRef.current) {
        try {
          const reactTag = findNodeHandle(containerRef.current);
          if (reactTag) {
            AccessibilityInfo.setAccessibilityFocus(reactTag);
          }
        } catch (err) {
          console.warn('Failed to set accessibility focus:', err);
        }
      } else if (Platform.OS === 'web' && containerRef.current) {
        try {
          const domNode = containerRef.current as any;
          if (domNode && domNode.focus) {
            domNode.focus();
          }
        } catch (err) {
          // fallback ignore
        }
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [stepNumber]);

  // Position calculations
  const padding = 12;
  let top = 'auto' as any;
  let bottom = 'auto' as any;
  let left = 16;
  const cardWidth = screenWidth - 32; // Default horizontal sizing with safe margins

  if (targetLayout) {
    const targetY = targetLayout.pageY;
    const targetH = targetLayout.height;
    const placement = step.placement || 'bottom';

    if (placement === 'top') {
      // Position above the spotlight target
      bottom = screenHeight - targetY + padding;
    } else if (placement === 'bottom') {
      // Position below the spotlight target
      top = targetY + targetH + padding;
    } else {
      // Placement 'center' or fallback
      top = screenHeight / 2 - 80;
    }

    // Horizontal centering adjustment if layout supports it
    const targetCenterX = targetLayout.pageX + targetLayout.width / 2;
    const idealLeft = targetCenterX - cardWidth / 2;
    // Bounds check to prevent sliding off-screen
    left = Math.max(16, Math.min(idealLeft, screenWidth - cardWidth - 16));
  } else {
    // Center of screen if no targetLayout is registered
    top = screenHeight / 2 - 100;
  }

  const isLastStep = stepNumber === totalSteps;

  return (
    <View
      ref={containerRef}
      accessible={true}
      accessibilityRole="alert"
      accessibilityLabel={announcementText}
      style={[
        styles.card,
        {
          position: 'absolute',
          top,
          bottom,
          left,
          width: cardWidth,
          maxWidth: 400,
        },
      ]}
      className="bg-surface-card rounded-3xl border border-subtle p-5 shadow-2xl z-[10000]"
    >
      {/* Step Progress Tracker Badge */}
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-[10px] font-black text-primary-500 uppercase tracking-widest">
          Step {stepNumber} of {totalSteps}
        </Text>
        
        {/* Always visible accessible Skip button */}
        <TouchableOpacity
          onPress={skipTour}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Skip product tour"
          className="bg-surface-background px-2.5 py-1 rounded-full border border-faint"
        >
          <Text className="text-[10px] font-bold text-content-faint">Skip Tour</Text>
        </TouchableOpacity>
      </View>

      {/* Main Educational Copy */}
      <Text className="text-base font-black text-content-primary leading-snug mb-1.5 flex-wrap">
        {step.title}
      </Text>
      
      <Text className="text-xs text-content-tertiary leading-relaxed mb-4 flex-wrap">
        {step.description}
      </Text>

      {/* Actions toolbar */}
      <View className="flex-row items-center justify-between pt-3 border-t border-faint flex-wrap gap-2">
        {/* Pause Button */}
        <TouchableOpacity
          onPress={pauseTour}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Pause tour, continue later"
          className="py-2"
        >
          <Text className="text-[10px] font-black text-content-faint uppercase tracking-wider">
            Pause Tour
          </Text>
        </TouchableOpacity>

        <View className="flex-row items-center gap-2">
          {/* Previous Step Button */}
          {stepNumber > 1 && (
            <TouchableOpacity
              onPress={prevStep}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Go to previous step"
              className="bg-surface-background px-4 py-2 rounded-xl border border-subtle"
            >
              <Text className="text-xs font-bold text-content-tertiary">Back</Text>
            </TouchableOpacity>
          )}

          {/* Next/Finish Button */}
          <TouchableOpacity
            onPress={nextStep}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={isLastStep ? 'Finish onboarding tour' : 'Go to next step'}
            className="bg-primary-500 px-5 py-2 rounded-xl shadow-sm"
          >
            <Text className="text-xs font-bold text-white">
              {isLastStep ? 'Finish' : 'Next'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    // Add subtle visual enhancements in CSS that shadow styling doesn't fully capture
    elevation: 20,
    shadowColor: '#0F1117',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
  },
});
export default CoachMark;
