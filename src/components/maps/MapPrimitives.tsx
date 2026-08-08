// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — map chrome and state surfaces (Frontend Phase 8)
//
// The reusable pieces every map screen composes: the permission card, the error
// and empty states, the mode switcher, the category filters, the map controls
// and the attribution bar.
//
// Two things here are load-bearing rather than decorative:
//
//   **`<LocationPermissionCard>` offers only the action that can work.** §5
//   lists eight permission states and they do not share a recovery path. A
//   permanent denial cannot be fixed by prompting again, and offering "Try
//   again" there teaches members that this app's buttons do nothing. The card
//   switches on the state and every branch is a different sentence and a
//   different button — including "Continue without location", which is always
//   present because §5 forbids making permission mandatory.
//
//   **`<MapModeSwitcher>` is not a nicety.** §50 requires an accessible
//   alternative to the map, and this is the control that reaches it. It is in
//   the header of every map screen, never behind a menu, and it is a real
//   segmented control with `accessibilityRole="tab"` rather than three icons.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { mapErrorCopy } from '@/lib/maps/errors';
import type {
  DiscoveryCategory,
  LocationPermissionState,
  MapDisplayMode,
  MapErrorKind,
} from '@/types/maps';

// ═════════════════════════════════════════════════════════════════════════════
// LOCATION PERMISSION — §5
// ═════════════════════════════════════════════════════════════════════════════

export interface LocationPermissionCardProps {
  permission: LocationPermissionState;
  isResolving: boolean;
  error?: MapErrorKind | null;
  onRequest: () => void;
  onOpenSettings: () => void;
  onRetry: () => void;
  /** Always offered. §5: location must never be mandatory for discovery. */
  onContinueWithout: () => void;
  /** True when the simulated provider is answering. */
  isSimulated?: boolean;
}

export function LocationPermissionCard({
  permission,
  isResolving,
  error,
  onRequest,
  onOpenSettings,
  onRetry,
  onContinueWithout,
  isSimulated,
}: LocationPermissionCardProps) {
  const { tokens } = useTheme();
  const copy = permissionCopy(permission, error);

  return (
    <View
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="rounded-3xl border p-5"
      testID="location-permission-card"
    >
      <View className="flex-row items-center mb-2">
        <View
          style={{ backgroundColor: tokens.color.primary[50] }}
          className="w-9 h-9 rounded-full items-center justify-center mr-3"
        >
          <Ionicons name={copy.icon} size={18} color={tokens.color.primary[500]} />
        </View>
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-base font-black flex-1"
        >
          {copy.title}
        </Text>
      </View>

      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-xs font-semibold leading-relaxed mb-4"
      >
        {copy.body}
      </Text>

      {isResolving ? (
        <View className="flex-row items-center py-2">
          <ActivityIndicator size="small" color={tokens.color.primary[500]} />
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-xs font-bold ml-2"
          >
            Finding your position…
          </Text>
        </View>
      ) : (
        <View className="gap-2">
          {copy.primary === 'request' ? (
            <PrimaryButton label="Use my location" onPress={onRequest} icon="navigate" />
          ) : null}
          {copy.primary === 'settings' ? (
            <PrimaryButton label="Open settings" onPress={onOpenSettings} icon="settings-outline" />
          ) : null}
          {copy.primary === 'retry' ? (
            <PrimaryButton label="Try again" onPress={onRetry} icon="refresh" />
          ) : null}

          {/* Always present. A member who declines location must still be able
              to use every discovery surface — §5, last line. */}
          <Pressable
            onPress={onContinueWithout}
            accessibilityRole="button"
            accessibilityLabel="Continue without using my location, and choose a neighbourhood instead"
            className="py-3 items-center"
          >
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-black uppercase tracking-wider"
            >
              Choose a neighbourhood instead
            </Text>
          </Pressable>
        </View>
      )}

      {isSimulated ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-bold mt-3 leading-relaxed"
        >
          MAP-PROVIDER-GAP-002 · This build has no device location module, so the position shown is
          a fixed development value.
        </Text>
      ) : null}
    </View>
  );
}

function permissionCopy(
  permission: LocationPermissionState,
  error?: MapErrorKind | null
): {
  title: string;
  body: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  primary: 'request' | 'settings' | 'retry' | 'none';
} {
  if (error === 'location-unavailable') {
    return {
      title: 'We could not find your position',
      body: 'Your device did not return a location. This happens indoors and where the signal is weak.',
      icon: 'locate-outline',
      primary: 'retry',
    };
  }

  switch (permission.status) {
    case 'notRequested':
      return {
        title: 'See what is near you',
        body: 'Turn on location and the map will show homes, jobs, events and community alerts around where you actually are. You can browse by neighbourhood instead if you prefer.',
        icon: 'navigate-outline',
        primary: 'request',
      };

    case 'requesting':
      return {
        title: 'Waiting for permission',
        body: 'Choose an option in the dialog your device is showing.',
        icon: 'hourglass-outline',
        primary: 'none',
      };

    case 'denied':
      return {
        title: 'Location is off',
        body: 'We cannot show what is near you without it. You can turn it on, or keep browsing by choosing a neighbourhood.',
        icon: 'location-outline',
        primary: 'request',
      };

    case 'deniedPermanently':
      // The one case where re-prompting cannot succeed. Settings is the only
      // path, and offering a retry here would be a button that does nothing.
      return {
        title: 'Location is blocked',
        body: 'Your device is set to always refuse location for Diaspora. You can change that in Settings, or keep browsing by choosing a neighbourhood.',
        icon: 'lock-closed-outline',
        primary: 'settings',
      };

    case 'servicesDisabled':
      return {
        title: 'Location services are off',
        body: 'Your device has location switched off for every app. Turning it on in your device settings will let us show what is near you.',
        icon: 'phone-portrait-outline',
        primary: 'settings',
      };

    case 'grantedApproximate':
      return {
        title: 'Using your approximate location',
        body: 'Your device is sharing a rough position rather than a precise one. Distances will be less accurate. You can change this in Settings.',
        icon: 'ellipse-outline',
        primary: 'settings',
      };

    case 'granted':
      return {
        title: 'Location is on',
        body: 'Showing what is near you.',
        icon: 'navigate',
        primary: 'none',
      };

    case 'unavailable':
      return {
        title: 'Location is not available',
        body: 'This build cannot read your device position. You can still browse by choosing a neighbourhood.',
        icon: 'help-circle-outline',
        primary: 'none',
      };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ERROR & EMPTY — §44, §54
// ═════════════════════════════════════════════════════════════════════════════

export function MapErrorState({
  kind,
  onRetry,
  onOpenSettings,
  onWiden,
  compact = false,
}: {
  kind: MapErrorKind;
  onRetry?: () => void;
  onOpenSettings?: () => void;
  onWiden?: () => void;
  compact?: boolean;
}) {
  const { tokens } = useTheme();
  const copy = mapErrorCopy(kind);

  const action =
    copy.action === 'retry' && onRetry
      ? { label: copy.actionLabel ?? 'Try again', onPress: onRetry, icon: 'refresh' as const }
      : copy.action === 'open-settings' && onOpenSettings
        ? {
            label: copy.actionLabel ?? 'Open settings',
            onPress: onOpenSettings,
            icon: 'settings-outline' as const,
          }
        : copy.action === 'widen-search' && onWiden
          ? {
              label: copy.actionLabel ?? 'Widen the search',
              onPress: onWiden,
              icon: 'resize-outline' as const,
            }
          : null;

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`${copy.title}. ${copy.body}`}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className={`rounded-3xl border items-center ${compact ? 'p-4' : 'p-6'}`}
      testID={`map-error-${kind}`}
    >
      <Ionicons
        name="cloud-offline-outline"
        size={compact ? 22 : 30}
        color={tokens.color.text.placeholder}
      />
      <Text
        style={{ color: tokens.color.text.primary }}
        className={`${compact ? 'text-sm' : 'text-base'} font-black mt-2 text-center`}
      >
        {copy.title}
      </Text>
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-xs font-semibold leading-relaxed mt-1.5 text-center"
      >
        {copy.body}
      </Text>

      {action ? (
        <View className="mt-4 w-full">
          <PrimaryButton label={action.label} onPress={action.onPress} icon={action.icon} />
        </View>
      ) : null}
    </View>
  );
}

export function MapLoadingState({ label = 'Loading the map…' }: { label?: string }) {
  const { tokens } = useTheme();

  return (
    <View
      className="items-center justify-center py-10"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      testID="map-loading"
    >
      <ActivityIndicator color={tokens.color.primary[500]} />
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-xs font-bold mt-3"
      >
        {label}
      </Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MODE SWITCHER — §10, §11, §50
// ═════════════════════════════════════════════════════════════════════════════

const MODES: { id: MapDisplayMode; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { id: 'map', label: 'Map', icon: 'map-outline' },
  { id: 'split', label: 'Both', icon: 'grid-outline' },
  { id: 'list', label: 'List', icon: 'list-outline' },
];

export function MapModeSwitcher({
  mode,
  onChange,
}: {
  mode: MapDisplayMode;
  onChange: (mode: MapDisplayMode) => void;
}) {
  const { tokens } = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      // The hint says *why* the control matters, which is the thing a screen
      // reader user needs and a sighted user gets from the icons.
      accessibilityHint="Switch between the map and a readable list of the same results"
      style={{ backgroundColor: tokens.color.neutral[100] }}
      className="flex-row rounded-full p-1"
      testID="map-mode-switcher"
    >
      {MODES.map((item) => {
        const isActive = mode === item.id;
        return (
          <Pressable
            key={item.id}
            onPress={() => onChange(item.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${item.label} view`}
            style={{
              backgroundColor: isActive ? tokens.color.surface.card : 'transparent',
            }}
            className="flex-1 flex-row items-center justify-center py-2 px-3 rounded-full"
            testID={`map-mode-${item.id}`}
          >
            <Ionicons
              name={item.icon}
              size={14}
              color={isActive ? tokens.color.primary[500] : tokens.color.text.placeholder}
            />
            <Text
              style={{
                color: isActive ? tokens.color.text.primary : tokens.color.text.placeholder,
              }}
              className="text-[11px] font-black ml-1.5"
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CATEGORY FILTERS — §12
// ═════════════════════════════════════════════════════════════════════════════

export const CATEGORY_LABELS: Record<DiscoveryCategory, string> = {
  housing: 'Homes',
  marketplace: 'For sale',
  job: 'Jobs',
  provider: 'Services',
  guide: 'Guides',
  organization: 'Groups',
  event: 'Events',
  alert: 'Alerts',
};

const CATEGORY_ICONS: Record<DiscoveryCategory, React.ComponentProps<typeof Ionicons>['name']> = {
  housing: 'home-outline',
  marketplace: 'pricetag-outline',
  job: 'briefcase-outline',
  provider: 'construct-outline',
  guide: 'book-outline',
  organization: 'people-outline',
  event: 'calendar-outline',
  alert: 'warning-outline',
};

export function CategoryFilterBar({
  categories,
  active,
  counts,
  onToggle,
}: {
  categories: readonly DiscoveryCategory[];
  active: DiscoveryCategory[];
  counts?: Partial<Record<DiscoveryCategory, number>>;
  onToggle: (category: DiscoveryCategory) => void;
}) {
  const { tokens } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      testID="map-category-filters"
    >
      {categories.map((category) => {
        const isActive = active.includes(category);
        const count = counts?.[category];

        return (
          <Pressable
            key={category}
            onPress={() => onToggle(category)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isActive }}
            accessibilityLabel={
              // A count the server could not produce renders as absent rather
              // than as zero — "we could not ask" and "there are none" are
              // different facts and the filter chip must not conflate them.
              `${CATEGORY_LABELS[category]}${
                typeof count === 'number' ? `, ${count} on the map` : ''
              }`
            }
            style={{
              backgroundColor: isActive ? tokens.color.primary[500] : tokens.color.surface.card,
              borderColor: isActive ? tokens.color.primary[500] : tokens.color.border.default,
            }}
            className="flex-row items-center px-3.5 py-2 rounded-full border"
            testID={`map-filter-${category}`}
          >
            <Ionicons
              name={CATEGORY_ICONS[category]}
              size={13}
              color={isActive ? '#FFFFFF' : tokens.color.text.secondary}
            />
            <Text
              style={{ color: isActive ? '#FFFFFF' : tokens.color.text.secondary }}
              className="text-[11px] font-black ml-1.5"
            >
              {CATEGORY_LABELS[category]}
            </Text>
            {typeof count === 'number' ? (
              <Text
                style={{ color: isActive ? '#FFFFFFCC' : tokens.color.text.placeholder }}
                className="text-[10px] font-black ml-1"
              >
                {count}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAP CONTROLS — §7
// ═════════════════════════════════════════════════════════════════════════════

export function MapControls({
  onRecentre,
  onZoomIn,
  onZoomOut,
  onOpenLayers,
  followUser,
  canRecentre,
  hasLayers,
}: {
  onRecentre: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onOpenLayers?: () => void;
  followUser: boolean;
  canRecentre: boolean;
  hasLayers?: boolean;
}) {
  const { tokens } = useTheme();

  return (
    <View className="absolute right-4 top-4 gap-2" testID="map-controls">
      {canRecentre ? (
        <ControlButton
          icon={followUser ? 'navigate' : 'navigate-outline'}
          label={followUser ? 'Stop following your position' : 'Centre the map on your position'}
          onPress={onRecentre}
          tint={followUser ? tokens.color.primary[500] : tokens.color.text.secondary}
          testID="map-recentre"
        />
      ) : null}

      {hasLayers && onOpenLayers ? (
        <ControlButton
          icon="layers-outline"
          label="Choose a map layer"
          onPress={onOpenLayers}
          tint={tokens.color.text.secondary}
          testID="map-layers"
        />
      ) : null}

      <ControlButton
        icon="add"
        label="Zoom in"
        onPress={onZoomIn}
        tint={tokens.color.text.secondary}
        testID="map-zoom-in"
      />
      <ControlButton
        icon="remove"
        label="Zoom out"
        onPress={onZoomOut}
        tint={tokens.color.text.secondary}
        testID="map-zoom-out"
      />
    </View>
  );
}

function ControlButton({
  icon,
  label,
  onPress,
  tint,
  testID,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  tint: string;
  testID?: string;
}) {
  const { tokens } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
        // 44 dp. Below this the control is unusable for anyone without precise
        // motor control, and a map is mostly small controls.
        width: 44,
        height: 44,
      }}
      className="rounded-full border items-center justify-center"
      testID={testID}
    >
      <Ionicons name={icon} size={19} color={tint} />
    </Pressable>
  );
}

/**
 * The "search this area" button.
 *
 * §13's other half: with debouncing and a movement threshold, the map
 * deliberately does *not* refetch on every pan — so there must be a way to say
 * "yes, I meant here". Appears only when the camera has moved past the
 * threshold, and disappears when the results catch up.
 */
export function SearchThisAreaButton({
  visible,
  isFetching,
  onPress,
}: {
  visible: boolean;
  isFetching: boolean;
  onPress: () => void;
}) {
  const { tokens } = useTheme();
  if (!visible) return null;

  return (
    <View className="absolute left-0 right-0 top-4 items-center" pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        disabled={isFetching}
        accessibilityRole="button"
        accessibilityLabel="Search this area of the map"
        accessibilityState={{ busy: isFetching }}
        style={{
          backgroundColor: tokens.color.surface.card,
          borderColor: tokens.color.border.default,
        }}
        className="flex-row items-center px-4 py-2.5 rounded-full border"
        testID="search-this-area"
      >
        {isFetching ? (
          <ActivityIndicator size="small" color={tokens.color.primary[500]} />
        ) : (
          <Ionicons name="search" size={14} color={tokens.color.primary[500]} />
        )}
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-xs font-black ml-2"
        >
          {isFetching ? 'Searching…' : 'Search this area'}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * The strip along the bottom of the map.
 *
 * Carries two obligations at once: the tile licence's attribution requirement,
 * and — when the schematic renderer is active — an honest statement that the
 * background is a diagram rather than a map of real streets. Somebody looking
 * at a grid needs to be told it is a grid.
 */
export function MapAttributionBar({
  attribution,
  rendersRealGeography,
}: {
  attribution?: string;
  rendersRealGeography: boolean;
}) {
  const { tokens } = useTheme();

  const text = rendersRealGeography
    ? attribution
    : 'Simplified map — positions and distances are accurate, streets are not shown';

  if (!text) return null;

  return (
    <View
      className="absolute bottom-1 right-2 px-2 py-0.5 rounded"
      style={{ backgroundColor: `${tokens.color.surface.card}CC` }}
      pointerEvents="none"
      accessible
      accessibilityRole="text"
      accessibilityLabel={text}
      testID="map-attribution"
    >
      <Text style={{ color: tokens.color.text.placeholder }} className="text-[8px] font-bold">
        {text}
      </Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SHARED
// ═════════════════════════════════════════════════════════════════════════════

export function PrimaryButton({
  label,
  onPress,
  icon,
  disabled,
}: {
  label: string;
  onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  disabled?: boolean;
}) {
  const { tokens } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={{
        backgroundColor: disabled ? tokens.color.neutral[200] : tokens.color.primary[500],
        opacity: disabled ? 0.6 : 1,
      }}
      className="flex-row items-center justify-center py-3.5 rounded-2xl"
    >
      {icon ? <Ionicons name={icon} size={16} color="#FFFFFF" /> : null}
      <Text className="text-white text-xs font-black uppercase tracking-wider ml-2">{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  icon,
}: {
  label: string;
  onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}) {
  const { tokens } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="flex-row items-center justify-center py-3.5 rounded-2xl border"
    >
      {icon ? <Ionicons name={icon} size={16} color={tokens.color.text.secondary} /> : null}
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-xs font-black uppercase tracking-wider ml-2"
      >
        {label}
      </Text>
    </Pressable>
  );
}
