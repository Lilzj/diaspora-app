// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — routing and navigation surfaces (Frontend Phase 8)
//
// §14–§19's presentation layer: travel estimates, the mode switcher, the route
// summary, the alternatives picker, the transit itinerary and the live
// navigation banner.
//
// ── The rule every component here follows ────────────────────────────────────
//
// **Never state a routed figure as a routed figure unless it is one.** Every
// component takes `isRouted` (and, for driving, `supportsTraffic`) and renders
// `<EstimateQualifier>` when either is false. The difference between a
// crow-flies estimate and a walking route is routinely 30–60% in a city cut by
// a river, and a member who misses a viewing because the app said twelve
// minutes has been misled by a number, not by a caveat.
//
// This is §48 and §18 expressed as a prop that cannot be forgotten: the
// qualifier is inside the component, not something a screen is trusted to add.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import type {
  NavigationState,
  Route,
  RouteSegment,
  TravelEstimate,
  TravelMode,
} from '@/types/maps';
import { navigationPhaseLabel } from '@/lib/maps/navigation-machine';
import { EstimateQualifier } from './MapsGapNotice';
import { PrimaryButton, SecondaryButton } from './MapPrimitives';

// ═════════════════════════════════════════════════════════════════════════════
// FORMATTING
// ═════════════════════════════════════════════════════════════════════════════

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

export function formatMetres(metres: number): string {
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`;
}

export function formatClock(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

const MODE_META: Record<
  TravelMode,
  { label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }
> = {
  walking: { label: 'Walk', icon: 'walk-outline' },
  cycling: { label: 'Cycle', icon: 'bicycle-outline' },
  driving: { label: 'Drive', icon: 'car-outline' },
  transit: { label: 'Transit', icon: 'bus-outline' },
};

// ═════════════════════════════════════════════════════════════════════════════
// TRAVEL MODE SWITCHER — §17
// ═════════════════════════════════════════════════════════════════════════════

export function TravelModeSwitcher({
  mode,
  onChange,
  supportedModes,
  /** Modes the provider serves but whose data is simulated. Marked, not hidden. */
  simulatedModes,
}: {
  mode: TravelMode;
  onChange: (mode: TravelMode) => void;
  supportedModes: TravelMode[];
  simulatedModes?: TravelMode[];
}) {
  const { tokens } = useTheme();
  const modes: TravelMode[] = ['walking', 'driving', 'transit', 'cycling'];

  return (
    <View
      accessibilityRole="tablist"
      style={{ backgroundColor: tokens.color.neutral[100] }}
      className="flex-row rounded-2xl p-1"
      testID="travel-mode-switcher"
    >
      {modes.map((item) => {
        const isActive = mode === item;
        // An unsupported mode is disabled rather than removed. §16 wants transit
        // present with an explanation when no provider serves it — a mode that
        // silently vanishes reads as a bug, not as an unavailable capability.
        const isSupported = supportedModes.includes(item);
        const isSimulated = simulatedModes?.includes(item);

        return (
          <Pressable
            key={item}
            onPress={() => isSupported && onChange(item)}
            disabled={!isSupported}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive, disabled: !isSupported }}
            accessibilityLabel={`${MODE_META[item].label}${
              isSupported ? '' : ', not available in this build'
            }${isSimulated ? ', estimated times only' : ''}`}
            style={{
              backgroundColor: isActive ? tokens.color.surface.card : 'transparent',
              opacity: isSupported ? 1 : 0.4,
            }}
            className="flex-1 items-center py-2.5 rounded-xl"
            testID={`travel-mode-${item}`}
          >
            <Ionicons
              name={MODE_META[item].icon}
              size={17}
              color={isActive ? tokens.color.primary[500] : tokens.color.text.placeholder}
            />
            <Text
              style={{
                color: isActive ? tokens.color.text.primary : tokens.color.text.placeholder,
              }}
              className="text-[10px] font-black mt-0.5"
            >
              {MODE_META[item].label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TRAVEL ESTIMATE — §14, §15
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A distance and a time, with the qualifier attached.
 *
 * Used on listing cards, detail headers and the alert sheet. The qualifier is
 * rendered inside rather than left to the caller, which is the whole point:
 * there is no way to show this figure without also showing what it is.
 */
export function TravelEstimateRow({
  estimate,
  supportsTraffic,
  compact = false,
  onPress,
}: {
  estimate: TravelEstimate;
  supportsTraffic?: boolean;
  compact?: boolean;
  onPress?: () => void;
}) {
  const { tokens } = useTheme();
  const meta = MODE_META[estimate.travelMode];

  const body = (
    <>
      <View className="flex-row items-center">
        <Ionicons name={meta.icon} size={16} color={tokens.color.text.secondary} />
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-sm font-black ml-2"
        >
          {formatDuration(estimate.duration.seconds)}
        </Text>
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-xs font-bold ml-2"
        >
          · {formatMetres(estimate.distance.metres)}
        </Text>
        {estimate.duration.inTrafficSeconds ? (
          <Text
            style={{ color: tokens.color.warning.default }}
            className="text-[10px] font-black ml-2 uppercase tracking-wider"
          >
            {formatDuration(estimate.duration.inTrafficSeconds)} in traffic
          </Text>
        ) : null}
      </View>

      {!compact ? (
        <EstimateQualifier
          isRouted={estimate.isRouted}
          isSimulated={estimate.source === 'simulated'}
          supportsTraffic={supportsTraffic}
          travelMode={estimate.travelMode}
        />
      ) : null}
    </>
  );

  const label = `${meta.label}: ${formatDuration(estimate.duration.seconds)}, ${formatMetres(
    estimate.distance.metres
  )}${estimate.isRouted ? '' : '. This is an estimate from straight-line distance.'}`;

  if (!onPress) {
    return (
      <View accessible accessibilityRole="text" accessibilityLabel={label} testID="travel-estimate">
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} Activate for directions.`}
      testID="travel-estimate"
    >
      {body}
    </Pressable>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ROUTE SUMMARY & ALTERNATIVES — §17
// ═════════════════════════════════════════════════════════════════════════════

export function RouteSummaryCard({
  route,
  isSelected,
  onSelect,
  supportsTraffic,
}: {
  route: Route;
  isSelected: boolean;
  onSelect: () => void;
  supportsTraffic?: boolean;
}) {
  const { tokens } = useTheme();

  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`${route.summary}. ${formatDuration(
        route.duration.seconds
      )}, ${formatMetres(route.distance.metres)}${
        route.transferCount ? `, ${route.transferCount} changes` : ''
      }${route.source === 'simulated' ? '. Estimated route.' : ''}`}
      style={{
        backgroundColor: isSelected ? tokens.color.primary[50] : tokens.color.surface.card,
        borderColor: isSelected ? tokens.color.primary[500] : tokens.color.border.default,
      }}
      className="rounded-2xl border p-4 mb-2"
      testID={`route-option-${route.id}`}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-lg font-black"
          >
            {formatDuration(route.duration.seconds)}
          </Text>
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-xs font-semibold mt-0.5"
          >
            {formatMetres(route.distance.metres)} · {route.summary}
          </Text>
        </View>

        {route.isPrimary ? (
          <View
            style={{ backgroundColor: tokens.color.success.surface }}
            className="px-2 py-1 rounded-full"
          >
            <Text
              style={{ color: tokens.color.success.default }}
              className="text-[9px] font-black uppercase tracking-wider"
            >
              Best
            </Text>
          </View>
        ) : null}
      </View>

      {route.travelMode === 'transit' && route.departureAt ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-bold mt-1.5"
        >
          Leave {formatClock(route.departureAt)} · arrive {formatClock(route.arrivalAt)}
        </Text>
      ) : null}

      <EstimateQualifier
        isRouted={route.source !== 'simulated'}
        isSimulated={route.source === 'simulated'}
        supportsTraffic={supportsTraffic}
        travelMode={route.travelMode}
      />

      {/* Verbatim and never paraphrased: Google's beta notice on walking and
          cycling routes is a condition of using them, not advice. */}
      {(route.warnings ?? []).map((warning) => (
        <Text
          key={warning}
          testID="route-provider-warning"
          style={{ color: tokens.color.warning.default }}
          className="text-[11px] font-bold mt-1.5"
        >
          {warning}
        </Text>
      ))}

      {route.attribution ? (
        <Text
          testID="route-attribution"
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-semibold mt-1"
        >
          Directions: {route.attribution}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * The transit itinerary.
 *
 * §16 asks for the walking and riding portions separately, the transfers, and
 * the departure and arrival times — because a transit plan is something a
 * member reviews *before* they set off, and a total duration alone does not let
 * them decide whether it is workable.
 */
export function TransitItinerary({ route }: { route: Route }) {
  const { tokens } = useTheme();
  if (route.travelMode !== 'transit') return null;

  return (
    <View testID="transit-itinerary">
      {route.segments.map((segment, index) => (
        <TransitLeg
          key={segment.id}
          segment={segment}
          isLast={index === route.segments.length - 1}
        />
      ))}

      {typeof route.transferCount === 'number' ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-bold mt-2"
        >
          {route.transferCount === 0
            ? 'No changes'
            : `${route.transferCount} change${route.transferCount === 1 ? '' : 's'}`}
        </Text>
      ) : null}
    </View>
  );
}

function TransitLeg({ segment, isLast }: { segment: RouteSegment; isLast: boolean }) {
  const { tokens } = useTheme();
  const isRide = segment.travelMode === 'transit';

  return (
    <View
      className="flex-row"
      accessible
      accessibilityRole="text"
      accessibilityLabel={
        isRide && segment.transit
          ? `Take ${segment.transit.mode} ${segment.transit.line} towards ${
              segment.transit.headsign ?? segment.transit.arrivalStop
            } from ${segment.transit.departureStop} at ${formatClock(
              segment.transit.departureAt
            )}, arriving ${segment.transit.arrivalStop} at ${formatClock(
              segment.transit.arrivalAt
            )}. About ${segment.transit.stopCount} stops.`
          : `${segment.summary}, ${formatDuration(segment.duration.seconds)}, ${formatMetres(
              segment.distance.metres
            )}.`
      }
    >
      <View className="items-center mr-3" style={{ width: 24 }}>
        <View
          style={{
            backgroundColor: isRide ? tokens.color.primary[500] : tokens.color.neutral[300],
            width: 10,
            height: 10,
          }}
          className="rounded-full mt-1.5"
        />
        {!isLast ? (
          <View
            style={{ backgroundColor: tokens.color.neutral[200], width: 2, flex: 1 }}
            className="my-1"
          />
        ) : null}
      </View>

      <View className="flex-1 pb-4">
        <View className="flex-row items-center">
          <Ionicons
            name={isRide ? 'bus-outline' : 'walk-outline'}
            size={14}
            color={tokens.color.text.secondary}
          />
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-xs font-black ml-1.5"
          >
            {segment.summary}
          </Text>
        </View>

        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-bold mt-0.5"
        >
          {formatDuration(segment.duration.seconds)} · {formatMetres(segment.distance.metres)}
        </Text>

        {isRide && segment.transit ? (
          <View className="mt-1.5">
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[11px] font-semibold"
            >
              {segment.transit.departureStop} {formatClock(segment.transit.departureAt)} →{' '}
              {segment.transit.arrivalStop} {formatClock(segment.transit.arrivalAt)}
            </Text>
            {segment.transit.agency ? (
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[10px] font-bold mt-0.5"
              >
                {segment.transit.agency}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** The full turn list, for review before departure and for screen readers. */
export function RouteInstructionList({ route }: { route: Route }) {
  const { tokens } = useTheme();
  const instructions = route.segments.flatMap((segment) => segment.instructions);

  return (
    <View testID="route-instructions">
      {instructions.map((instruction, index) => (
        <View
          key={instruction.id}
          className="flex-row items-start py-2.5"
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Step ${index + 1}. ${instruction.text}. ${formatMetres(
            instruction.distance.metres
          )}.`}
          style={{
            borderTopWidth: index === 0 ? 0 : 1,
            borderTopColor: tokens.color.border.default,
          }}
        >
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-black w-6 mt-0.5"
          >
            {index + 1}
          </Text>
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-xs font-semibold flex-1 leading-relaxed"
          >
            {instruction.text}
          </Text>
          {instruction.distance.metres > 0 ? (
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-bold ml-2"
            >
              {formatMetres(instruction.distance.metres)}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// LIVE NAVIGATION — §18, §19
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The live navigation banner.
 *
 * Every §19 phase renders something specific here. The unhappy ones matter
 * most: `OffRoute` and `Recalculating` are the two a member actually
 * experiences, and both say what is happening rather than showing a spinner
 * over a stale instruction.
 */
export function NavigationBanner({
  state,
  onCancel,
  onRecalculate,
  onOpenExternal,
}: {
  state: NavigationState;
  onCancel: () => void;
  onRecalculate?: () => void;
  onOpenExternal?: () => void;
}) {
  const { tokens } = useTheme();
  const { phase, progress, route } = state;

  const tone =
    phase === 'OffRoute' || phase === 'Recalculating'
      ? tokens.color.warning
      : phase === 'Failed' || phase === 'PermissionDenied' || phase === 'ProviderUnavailable'
        ? tokens.color.error
        : phase === 'Arrived'
          ? tokens.color.success
          : tokens.color.info;

  return (
    <View
      style={{ backgroundColor: tone.surface, borderColor: `${tone.default}44` }}
      className="rounded-3xl border p-4"
      accessible
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={navigationAccessibilityLabel(state)}
      testID={`navigation-banner-${phase}`}
    >
      <View className="flex-row items-center justify-between mb-1.5">
        <Text
          style={{ color: tone.default }}
          className="text-[10px] font-black uppercase tracking-widest"
        >
          {navigationPhaseLabel(state)}
        </Text>

        {phase !== 'Idle' && phase !== 'Cancelled' ? (
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Stop navigating"
            testID="navigation-cancel"
          >
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[10px] font-black uppercase tracking-wider"
            >
              Stop
            </Text>
          </Pressable>
        ) : null}
      </View>

      {progress?.currentInstruction ? (
        <>
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-base font-black leading-snug"
          >
            {progress.currentInstruction.text}
          </Text>

          {progress.nextInstruction ? (
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-semibold mt-1"
            >
              Then {progress.nextInstruction.text.toLowerCase()}
            </Text>
          ) : null}

          <View className="flex-row items-center gap-3 mt-2.5">
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[11px] font-black uppercase tracking-wider"
            >
              {formatMetres(progress.remainingDistance.metres)} left
            </Text>
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[11px] font-black uppercase tracking-wider"
            >
              {formatDuration(progress.remainingDuration.seconds)}
            </Text>
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[11px] font-black uppercase tracking-wider"
            >
              Arrive {formatClock(progress.estimatedArrivalAt)}
            </Text>
          </View>
        </>
      ) : (
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-xs font-semibold leading-relaxed"
        >
          {state.errorDetail ?? phaseBody(state)}
        </Text>
      )}

      {phase === 'OffRoute' && onRecalculate ? (
        <View className="mt-3">
          <PrimaryButton label="Get a new route" onPress={onRecalculate} icon="refresh" />
        </View>
      ) : null}

      {/* §18/MAP-PROVIDER-GAP-006: where in-app guidance is unavailable, the
          honest option is the device's own navigation app — a real capability
          rather than a placeholder. */}
      {(phase === 'ProviderUnavailable' || phase === 'Failed') && onOpenExternal ? (
        <View className="mt-3">
          <SecondaryButton
            label="Open in your maps app"
            onPress={onOpenExternal}
            icon="open-outline"
          />
        </View>
      ) : null}

      {route?.source === 'simulated' && phase !== 'Idle' ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-bold mt-2.5 leading-relaxed"
        >
          Guidance is a preview. The route is estimated, not calculated from real roads, and the
          directions do not name streets.
        </Text>
      ) : null}
    </View>
  );
}

function phaseBody(state: NavigationState): string {
  switch (state.phase) {
    case 'Idle':
      return 'Choose somewhere to go.';
    case 'Planning':
      return 'Pick a starting point and a destination.';
    case 'RouteLoading':
      return 'Working out the best way there.';
    case 'RouteReady':
      return 'Your route is ready. Start when you are.';
    case 'Arrived':
      return 'You have reached your destination.';
    case 'Cancelled':
      return 'Navigation stopped.';
    case 'PermissionDenied':
      return 'We need location access to guide you. You can still see the route on the map.';
    case 'LocationUnavailable':
      return 'We have lost your position. The route is still on the map.';
    case 'ProviderUnavailable':
      return 'Turn-by-turn guidance is not connected in this build. You can open the route in your own maps app.';
    default:
      return '';
  }
}

/**
 * What a screen reader announces as navigation progresses.
 *
 * The live region above re-announces on change, so this is deliberately short
 * and front-loads the instruction — a member walking does not want to hear the
 * arrival time before they hear which way to turn.
 */
function navigationAccessibilityLabel(state: NavigationState): string {
  const { progress, phase } = state;

  if (!progress?.currentInstruction) return `${navigationPhaseLabel(state)}. ${phaseBody(state)}`;

  return [
    progress.currentInstruction.text,
    `in ${formatMetres(progress.distanceToInstruction.metres)}`,
    progress.nextInstruction ? `Then ${progress.nextInstruction.text}` : '',
    `${formatMetres(progress.remainingDistance.metres)} remaining`,
    `arriving about ${formatClock(progress.estimatedArrivalAt)}`,
    phase === 'OffRoute' ? 'You have moved off the route.' : '',
    phase === 'Recalculating' ? 'Updating your route.' : '',
  ]
    .filter(Boolean)
    .join('. ');
}
