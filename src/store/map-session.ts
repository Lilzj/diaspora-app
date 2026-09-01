// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — map session state (Frontend Phase 8, §6, §11, §40)
//
// The UI state a map screen owns: where the camera is, what is selected, which
// mode the member is in, which layers are on, and the device's current position.
//
// It is deliberately **not** persisted. `store/location.ts` already owns the
// member's chosen place, their saved locations and their search radius, and it
// is the right home for all of those — a second persisted location store would
// be the duplication §2 warns about and would double the surface where a home
// address could be written to disk.
//
// What this adds is the ephemeral half: a camera position, a selected pin, a
// device fix. Every one of those is session state, and the device fix in
// particular is session state **by policy**, not by convenience.
//
// ── §40, the retention rule, stated plainly ──────────────────────────────────
//
// A precise device fix is held in memory only, for at most
// `DEVICE_LOCATION_RETENTION_MS` (15 minutes), and is dropped when it expires.
// There is no `persist` middleware on this store, nothing writes a coordinate
// to AsyncStorage, and `pruneExpiredLocation()` clears the fix rather than
// merely marking it stale. That is the whole retention story for precise
// location in this application, and it is short enough to state in one
// sentence — which was the design goal.
//
// Recent destinations are a different category: a label and a coordinate the
// member deliberately routed to. Those are capped at `MAX_RECENT_DESTINATIONS`
// and TTL-pruned, and they are still not persisted to disk in this phase — see
// FRONTEND-MAPS-GAP-011 for why a home address needs a retention policy agreed
// before anything writes one down.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import {
  DEVICE_LOCATION_RETENTION_MS,
  LOCATION_STALE_AFTER_MS,
  MAX_RECENT_DESTINATIONS,
  RECENT_DESTINATION_TTL_MS,
  type DeviceLocation,
  type DiscoveryCategory,
  type GeoCoordinate,
  type LocationPermissionState,
  type MapDisplayMode,
  type MapErrorKind,
  type MapLayerId,
  type MapViewport,
  type RecentDestination,
} from '@/types/maps';
import { viewportFromCenter } from '@/lib/maps/geo';

/**
 * The camera's opening position before anything is known.
 *
 * ── Why this is the whole world ─────────────────────────────────────────────
 *
 * It used to be `DEFAULT_LOCATION` — Peckham, London — at zoom 3, so every map
 * in the product opened over south London regardless of who was holding the
 * phone. That constant is gone; there is no default place any more.
 *
 * A world view is the honest opening frame for "we do not know yet". The map
 * screens recentre on the member's active location as soon as there is one, and
 * a member whose country has been adopted gets their national centroid.
 */
export const DEFAULT_VIEWPORT: MapViewport = viewportFromCenter(
  { latitude: 0, longitude: 0 },
  0
);

const DEFAULT_CATEGORIES: DiscoveryCategory[] = ['housing', 'event', 'provider', 'alert'];

interface MapSessionState {
  // ── Camera ────────────────────────────────────────────────────────────────
  viewport: MapViewport;
  /** The viewport a search last ran for. Drives the "search this area" button. */
  searchedViewport: MapViewport | null;
  followUser: boolean;

  // ── Presentation ──────────────────────────────────────────────────────────
  displayMode: MapDisplayMode;
  categories: DiscoveryCategory[];
  activeLayer: MapLayerId | null;
  query: string;

  // ── Selection ─────────────────────────────────────────────────────────────
  selectedMarkerId: string | null;
  /**
   * Which side initiated the selection.
   *
   * §11 wants the map and the list to follow each other, and the naive
   * implementation — each scrolls to the other's selection — is an infinite
   * loop: the list scrolls, which fires a selection, which scrolls the list.
   * Recording the origin lets each side ignore the echo of its own action.
   */
  selectionOrigin: 'map' | 'list' | null;

  // ── Device location ───────────────────────────────────────────────────────
  deviceLocation: DeviceLocation | null;
  permission: LocationPermissionState;
  isResolvingLocation: boolean;
  locationError: MapErrorKind | null;

  // ── Destinations ──────────────────────────────────────────────────────────
  recentDestinations: RecentDestination[];

  // ── Actions ───────────────────────────────────────────────────────────────
  setViewport: (viewport: MapViewport) => void;
  markViewportSearched: (viewport: MapViewport) => void;
  setFollowUser: (follow: boolean) => void;
  recentreOnUser: () => void;

  setDisplayMode: (mode: MapDisplayMode) => void;
  toggleCategory: (category: DiscoveryCategory) => void;
  setCategories: (categories: DiscoveryCategory[]) => void;
  setActiveLayer: (layer: MapLayerId | null) => void;
  setQuery: (query: string) => void;

  selectMarker: (id: string | null, origin: 'map' | 'list') => void;
  clearSelection: () => void;

  setDeviceLocation: (location: DeviceLocation | null) => void;
  setPermission: (permission: LocationPermissionState) => void;
  setResolvingLocation: (resolving: boolean) => void;
  setLocationError: (error: MapErrorKind | null) => void;
  /** §40. Drops the fix once it is past its retention window. */
  pruneExpiredLocation: () => void;
  /** Explicit erase, for sign-out and for the privacy screen. */
  forgetLocation: () => void;

  addRecentDestination: (destination: Omit<RecentDestination, 'visitedAt'>) => void;
  clearRecentDestinations: () => void;

  reset: () => void;
}

const INITIAL_PERMISSION: LocationPermissionState = {
  status: 'notRequested',
  accuracy: 'unknown',
  canOpenSettings: false,
  checkedAt: null,
};

export const useMapSessionStore = create<MapSessionState>((set, get) => ({
  viewport: DEFAULT_VIEWPORT,
  searchedViewport: null,
  followUser: false,

  displayMode: 'map',
  categories: DEFAULT_CATEGORIES,
  activeLayer: null,
  query: '',

  selectedMarkerId: null,
  selectionOrigin: null,

  deviceLocation: null,
  permission: INITIAL_PERMISSION,
  isResolvingLocation: false,
  locationError: null,

  recentDestinations: [],

  setViewport: (viewport) => set({ viewport }),

  markViewportSearched: (viewport) => set({ searchedViewport: viewport }),

  setFollowUser: (followUser) => set({ followUser }),

  recentreOnUser: () => {
    const { deviceLocation, viewport } = get();
    if (!deviceLocation) return;
    set({
      viewport: { ...viewport, center: deviceLocation.coordinate },
      followUser: true,
    });
  },

  setDisplayMode: (displayMode) => set({ displayMode }),

  toggleCategory: (category) =>
    set((state) => {
      const next = state.categories.includes(category)
        ? state.categories.filter((c) => c !== category)
        : [...state.categories, category];

      // Never empty. An empty category set produces a blank map with no
      // explanation, which members read as a broken map rather than as a filter
      // they cleared. The last chip stays on.
      return { categories: next.length > 0 ? next : state.categories };
    }),

  setCategories: (categories) =>
    set({ categories: categories.length > 0 ? categories : DEFAULT_CATEGORIES }),

  setActiveLayer: (activeLayer) => set({ activeLayer }),

  setQuery: (query) => set({ query }),

  selectMarker: (selectedMarkerId, selectionOrigin) =>
    set({ selectedMarkerId, selectionOrigin: selectedMarkerId ? selectionOrigin : null }),

  clearSelection: () => set({ selectedMarkerId: null, selectionOrigin: null }),

  setDeviceLocation: (deviceLocation) =>
    set((state) => ({
      deviceLocation,
      locationError: deviceLocation ? null : state.locationError,
      // A fix arriving does not turn follow mode on. Following is a thing the
      // member asked for, and a background refresh yanking the camera back is
      // the behaviour that makes people stop using a map.
    })),

  setPermission: (permission) =>
    set((state) => ({
      permission,
      // Losing permission invalidates the fix immediately. Keeping it would
      // mean a member who revoked access still had their position on screen,
      // which is the opposite of what revoking means.
      deviceLocation:
        permission.status === 'granted' || permission.status === 'grantedApproximate'
          ? state.deviceLocation
          : null,
      followUser:
        permission.status === 'granted' || permission.status === 'grantedApproximate'
          ? state.followUser
          : false,
    })),

  setResolvingLocation: (isResolvingLocation) => set({ isResolvingLocation }),

  setLocationError: (locationError) => set({ locationError, isResolvingLocation: false }),

  pruneExpiredLocation: () =>
    set((state) => {
      if (!state.deviceLocation) return {};
      const age = Date.now() - state.deviceLocation.timestamp;
      if (age < DEVICE_LOCATION_RETENTION_MS) return {};
      // Cleared, not flagged. §40 asks for the shortest practical retention,
      // and a fix that is merely marked stale is a fix that is still in memory.
      return { deviceLocation: null, followUser: false };
    }),

  forgetLocation: () =>
    set({ deviceLocation: null, followUser: false, recentDestinations: [], locationError: null }),

  addRecentDestination: (destination) =>
    set((state) => {
      const now = Date.now();
      const withoutDuplicate = state.recentDestinations.filter((d) => d.id !== destination.id);
      const pruned = withoutDuplicate.filter((d) => now - d.visitedAt < RECENT_DESTINATION_TTL_MS);

      return {
        recentDestinations: [{ ...destination, visitedAt: now }, ...pruned].slice(
          0,
          MAX_RECENT_DESTINATIONS
        ),
      };
    }),

  clearRecentDestinations: () => set({ recentDestinations: [] }),

  reset: () =>
    set({
      viewport: DEFAULT_VIEWPORT,
      searchedViewport: null,
      followUser: false,
      displayMode: 'map',
      categories: DEFAULT_CATEGORIES,
      activeLayer: null,
      query: '',
      selectedMarkerId: null,
      selectionOrigin: null,
      deviceLocation: null,
      permission: INITIAL_PERMISSION,
      isResolvingLocation: false,
      locationError: null,
      recentDestinations: [],
    }),
}));

// ═════════════════════════════════════════════════════════════════════════════
// SELECTORS
//
// Free functions over a snapshot rather than store methods, so they can be
// unit-tested without a store and reused by the hooks without subscribing to
// more state than they need.
// ═════════════════════════════════════════════════════════════════════════════

/** Whether the fix is old enough to be shown as "last known" rather than current. */
export function isLocationStale(location: DeviceLocation | null): boolean {
  if (!location) return false;
  return Date.now() - location.timestamp > LOCATION_STALE_AFTER_MS;
}

/** Whether a location-dependent affordance may be offered at all. */
export function canUseLocation(permission: LocationPermissionState): boolean {
  return permission.status === 'granted' || permission.status === 'grantedApproximate';
}

/**
 * Whether asking again could plausibly succeed.
 *
 * The distinction that decides which button the permission card shows. A
 * permanent denial or a disabled location service cannot be resolved by a
 * prompt — only by the device settings — and offering "Try again" there is how
 * an app teaches people its buttons do nothing.
 */
export function canRequestPermission(permission: LocationPermissionState): boolean {
  return permission.status === 'notRequested' || permission.status === 'denied';
}

/** The point searches are centred on, in priority order. */
export function activeSearchCenter(
  deviceLocation: DeviceLocation | null,
  fallback: GeoCoordinate
): GeoCoordinate {
  return deviceLocation?.coordinate ?? fallback;
}
