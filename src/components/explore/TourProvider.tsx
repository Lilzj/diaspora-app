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
import { router, usePathname } from 'expo-router';
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
  // Where the member actually is, which is not necessarily where the tour thinks.
  const pathname = usePathname();
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

  // ── The tour used to follow the member around the whole application ────────
  //
  // This component rendered on `activeTour` alone. `TourNavigator` pushes each
  // step's route, but nothing compared the route the member is *actually* on to
  // the one the step describes — so a member who navigated themselves (back
  // button, a tab, a deep link) kept the overlay.
  //
  // Observed on a release build: the Jobs tour, started on Discover, sat on top
  // of the Wallet spotlighting the balance card, and on top of Withdraw where it
  // covered the sentence "Withdrawals are not available yet" — the one thing
  // that screen exists to say. It still read "STEP 1 OF 3 — Filter Openings".
  // The member's only escape was to find "Skip Tour" (UAT-128).
  //
  // The overlay now renders only where its step belongs. The tour is not ended:
  // a member who wanders off and comes back picks it up where they left it,
  // which is kinder than discarding their progress for a mistaken tap.
  if (step.route && pathname && !pathname.startsWith(step.route)) return null;

  const targetLayout: ElementLayout | undefined = step.targetKey
    ? registeredElements[step.targetKey]
    : undefined;

  const screenWidth = dimensions.width;
  const screenHeight = dimensions.height;

  // Mask colors (dim background)
  const maskColor = 'rgba(15, 17, 23, 0.65)'; // Sleek modern dark mode glass mask

  if (!targetLayout) {
    // ── The step has nothing to point at ──────────────────────────────────
    //
    // Either the target was never registered, or the member is on a different
    // screen from the one the tour was written for. The second is the common
    // case and used to be silent: a delayed trigger fired the Marketplace tour
    // after the member had opened a listing, and this branch masked the whole
    // detail screen with a card describing something not on it.
    //
    // The trigger is fixed at its source, but this branch has to stay honest
    // for the cases that remain — a step whose target is off-screen, or a
    // screen that has not finished laying out. Tapping anywhere leaves.
    return (
      <View style={StyleSheet.absoluteFill} className="justify-center items-center">
        <TouchableWithoutFeedback onPress={skipTour} accessibilityLabel="Close the walkthrough">
          <View style={[StyleSheet.absoluteFill, { backgroundColor: maskColor }]} />
        </TouchableWithoutFeedback>

        <View className="w-[90%] max-w-[380px]">
          <CoachMark step={step} totalSteps={tourConfig.steps.length} stepNumber={currentStepIndex + 1} />
        </View>
      </View>
    );
  }

  // ── Clamped to the screen ─────────────────────────────────────────────────
  //
  // A measured element can extend past the viewport — a list row at the bottom
  // of a scroll view routinely does. Unclamped, `screenHeight - (targetY +
  // targetH)` goes negative and the bottom mask renders at zero height, which
  // is why the navigation bar showed through un-dimmed while everything above
  // it was masked: the tour looked like it had highlighted the nav bar.
  const targetX = Math.max(0, targetLayout.pageX);
  const targetY = Math.max(0, targetLayout.pageY);
  const targetW = Math.max(0, Math.min(targetLayout.width, screenWidth - targetX));
  const targetH = Math.max(0, Math.min(targetLayout.height, screenHeight - targetY));

  // Every mask dismisses the tour.
  //
  // Before this, the only way out of a spotlit step was the card's own
  // controls. If the card was positioned off-screen — a `top` placement on a
  // target near the top of the screen puts it at a negative offset — the
  // member was left under a full-screen mask with nothing to press and no back
  // gesture that would clear it. Tapping the dimmed area is what everybody
  // tries first, and it now does the obvious thing.
  const Mask = ({ style }: { style: object }) => (
    <TouchableWithoutFeedback onPress={skipTour} accessibilityLabel="Close the walkthrough">
      <View style={[style, { backgroundColor: maskColor }]} />
    </TouchableWithoutFeedback>
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" className="z-[9999]">
      {/* Top blocking mask */}
      <Mask
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: targetY,
        }}
      />

      {/* Left blocking mask */}
      <Mask
        style={{
          position: 'absolute',
          top: targetY,
          left: 0,
          width: targetX,
          height: targetH,
        }}
      />

      {/* Right blocking mask */}
      <Mask
        style={{
          position: 'absolute',
          top: targetY,
          left: targetX + targetW,
          width: Math.max(0, screenWidth - (targetX + targetW)),
          height: targetH,
        }}
      />

      {/* Bottom blocking mask */}
      <Mask
        style={{
          position: 'absolute',
          top: targetY + targetH,
          left: 0,
          right: 0,
          height: Math.max(0, screenHeight - (targetY + targetH)),
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
          borderColor: '#F59300',
          borderWidth: 2,
          borderRadius: 8,
          backgroundColor: 'transparent',
          shadowColor: '#F59300',
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

/**
 * Takes the member to the screen a step's target lives on.
 *
 * Without this a tour could only ever spotlight elements on the screen it
 * started from, which is how six of the eight tours came to reference keys that
 * were never on screen: the launcher sent every tour to the home dashboard, and
 * their targets are on Discover, Creator, the Trust Center and Community Life.
 *
 * `push`, never `replace` — the same rule as the launcher. A walkthrough is
 * something a member steps into and comes back from, and `replace` would throw
 * away the history that Close depends on.
 *
 * Only fires when the route actually changes between steps, so a tour whose
 * steps share a screen does not re-navigate on every Next and reset the scroll
 * position under the spotlight.
 */
const TourNavigator: React.FC = () => {
  const activeTour = useExploreStore((state) => state.activeTour);
  const currentStepIndex = useExploreStore((state) => state.currentStepIndex);
  const lastRoute = useRef<string | null>(null);

  useEffect(() => {
    if (!activeTour) {
      lastRoute.current = null;
      return;
    }

    const step = getTourConfig(activeTour)?.steps[currentStepIndex];
    const route = step?.route;
    if (!route || route === lastRoute.current) return;

    lastRoute.current = route;
    router.push(route as never);
  }, [activeTour, currentStepIndex]);

  return null;
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
      <TourNavigator />
      <TourOverlay />
    </TourContext.Provider>
  );
};
export default TourProvider;
