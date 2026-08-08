import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  AccessibilityInfo,
  Pressable,
  TouchableWithoutFeedback,
  Platform,
  LayoutChangeEvent,
} from 'react-native';
import { useExploreStore, ElementLayout } from '@/store/explore';
import { getTourConfig } from '@/config/featureRegistry';
import { CoachMark } from './CoachMark';

interface TourContextType {
  measureElement: (key: string, ref: any) => void;
}

const TourContext = createContext<TourContextType | null>(null);

export const useTourContext = () => {
  const ctx = useContext(TourContext);
  if (!ctx) {
    throw new Error('useTourContext must be used within a TourProvider');
  }
  return ctx;
};

/**
 * TourSpotlight component.
 * Wraps any component that needs to be highlighted during a tour.
 * Measures the child element's layout coordinates on screen and registers them.
 */
export const TourSpotlight: React.FC<{
  spotlightKey: string;
  children: React.ReactElement;
  style?: any;
}> = ({ spotlightKey, children, style }) => {
  const viewRef = useRef<View>(null);
  const registerElementLayout = useExploreStore((state) => state.registerElementLayout);
  const activeTour = useExploreStore((state) => state.activeTour);

  const measure = () => {
    if (viewRef.current) {
      // Small delay for layout calculation
      viewRef.current.measure((x, y, width, height, pageX, pageY) => {
        if (width > 0 && height > 0) {
          registerElementLayout(spotlightKey, { x, y, width, height, pageX, pageY });
        }
      });
    }
  };

  useEffect(() => {
    if (activeTour) {
      const timer = setTimeout(measure, 300);
      return () => clearTimeout(timer);
    } else {
      registerElementLayout(spotlightKey, null);
    }
  }, [activeTour]);

  // Merge ref and onLayout support
  return (
    <View
      ref={viewRef}
      onLayout={measure}
      collapsable={false}
      style={style}
    >
      {children}
    </View>
  );
};

/**
 * Fullscreen Tour overlay layout.
 * Draws four blocking overlays surrounding the target element's coordinates,
 * keeping the spotlight area clear and tapable.
 */
const TourOverlay: React.FC = () => {
  const activeTour = useExploreStore((state) => state.activeTour);
  const currentStepIndex = useExploreStore((state) => state.currentStepIndex);
  const registeredElements = useExploreStore((state) => state.registeredElements);
  const skipTour = useExploreStore((state) => state.skipTour);

  const [dimensions, setDimensions] = useState(Dimensions.get('window'));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(window);
    });

    // Check accessibility reduced motion setting
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      setReduceMotion(enabled);
    });

    return () => subscription.remove();
  }, []);

  if (!activeTour) return null;

  const tourConfig = getTourConfig(activeTour);
  if (!tourConfig) return null;

  const step = tourConfig.steps[currentStepIndex];
  if (!step) return null;

  const targetLayout: ElementLayout | undefined = step.targetKey
    ? registeredElements[step.targetKey]
    : undefined;

  const screenWidth = dimensions.width;
  const screenHeight = dimensions.height;

  // Mask colors (dim background)
  const maskColor = 'rgba(15, 17, 23, 0.65)'; // Sleek modern dark mode glass mask

  if (!targetLayout) {
    // If no target element or offscreen, render standard center modal overlay
    return (
      <View style={StyleSheet.absoluteFill} className="justify-center items-center">
        {/* Full screen backdrop */}
        <TouchableWithoutFeedback onPress={skipTour}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: maskColor }]} />
        </TouchableWithoutFeedback>
        
        {/* Central Coach Mark */}
        <View className="w-[90%] max-w-[380px]">
          <CoachMark step={step} totalSteps={tourConfig.steps.length} stepNumber={currentStepIndex + 1} />
        </View>
      </View>
    );
  }

  // Calculate coordinates of target bounds
  const targetX = targetLayout.pageX;
  const targetY = targetLayout.pageY;
  const targetW = targetLayout.width;
  const targetH = targetLayout.height;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" className="z-[9999]">
      {/* Top blocking mask */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: targetY,
          backgroundColor: maskColor,
        }}
      />

      {/* Left blocking mask */}
      <View
        style={{
          position: 'absolute',
          top: targetY,
          left: 0,
          width: targetX,
          height: targetH,
          backgroundColor: maskColor,
        }}
      />

      {/* Right blocking mask */}
      <View
        style={{
          position: 'absolute',
          top: targetY,
          left: targetX + targetW,
          width: screenWidth - (targetX + targetW),
          height: targetH,
          backgroundColor: maskColor,
        }}
      />

      {/* Bottom blocking mask */}
      <View
        style={{
          position: 'absolute',
          top: targetY + targetH,
          left: 0,
          right: 0,
          height: screenHeight - (targetY + targetH),
          backgroundColor: maskColor,
        }}
      />

      {/* Transparent spotlight zone (user can tap the underlying component directly) */}
      <View
        style={{
          position: 'absolute',
          top: targetY,
          left: targetX,
          width: targetW,
          height: targetH,
          borderColor: '#FF6B00',
          borderWidth: 2,
          borderRadius: 8,
          backgroundColor: 'transparent',
          shadowColor: '#FF6B00',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: reduceMotion ? 0 : 0.6,
          shadowRadius: 10,
        }}
        pointerEvents="none"
      />

      {/* Floating Tooltip Manager */}
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="box-none"
        className="justify-center items-center"
      >
        <CoachMark
          step={step}
          totalSteps={tourConfig.steps.length}
          stepNumber={currentStepIndex + 1}
          targetLayout={targetLayout}
          screenWidth={screenWidth}
          screenHeight={screenHeight}
        />
      </View>
    </View>
  );
};

export const TourProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const activeTour = useExploreStore((state) => state.activeTour);
  const registerElementLayout = useExploreStore((state) => state.registerElementLayout);

  const measureElement = (key: string, ref: any) => {
    if (ref && ref.measure) {
      ref.measure((x: number, y: number, width: number, height: number, pageX: number, pageY: number) => {
        registerElementLayout(key, { x, y, width, height, pageX, pageY });
      });
    }
  };

  return (
    <TourContext.Provider value={{ measureElement }}>
      <View
        style={{ flex: 1 }}
        importantForAccessibility={activeTour ? 'no-hide-descendants' : 'yes'}
        accessibilityElementsHidden={!!activeTour}
      >
        {children}
      </View>
      <TourOverlay />
    </TourContext.Provider>
  );
};
export default TourProvider;
