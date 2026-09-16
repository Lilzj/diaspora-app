// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — saved places, kept by the platform rather than by a tab
//
// The location selector wrote Home, Work and School into an in-memory store, so
// they were gone when the app restarted and had never existed on any other
// device. These hooks read and write the routes that were there all along; see
// `lib/location/saved-places.ts`.
//
// A failed read is not an empty list. `isError` is reported so the selector can
// say it could not be read rather than drawing every row as "Not configured",
// which is the same sentence a member reads after saving nothing.
// ─────────────────────────────────────────────────────────────────────────────

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  byLabel,
  fetchSavedPlaces,
  removeSavedPlace,
  saveSavedPlace,
  type SavedPlace,
} from '@/lib/location/saved-places';
import type { PlatformLocation } from '@/store/location';

const savedPlaceKeys = {
  all: ['location', 'saved-places'] as const,
};

export interface UseSavedPlacesResult {
  places: SavedPlace[];
  /** The same places keyed by lower-case label, for fixed rows. */
  byLabel: Record<string, SavedPlace>;
  isLoading: boolean;
  /** True when the read failed. The rows say so rather than reading as empty. */
  isError: boolean;
  refetch: () => void;
}

export function useSavedPlaces(enabled = true): UseSavedPlacesResult {
  const query = useQuery({
    queryKey: savedPlaceKeys.all,
    queryFn: ({ signal }) => fetchSavedPlaces(signal),
    enabled,
    // A saved place changes when the member changes it, and this screen is the
    // place they change it from.
    staleTime: 5 * 60_000,
  });

  const places = query.data ?? [];

  return {
    places,
    byLabel: byLabel(places),
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}

export interface UseSavePlaceResult {
  save: (label: string, location?: PlatformLocation | null) => Promise<void>;
  forget: (label: string) => Promise<void>;
  /** The label being written, so one row can show its own progress. */
  pendingLabel: string | null;
  isError: boolean;
}

/**
 * Saving and forgetting, with the list refreshed from the server afterwards.
 *
 * Refetched rather than patched into the cache: the server decides what a save
 * resolved to — a bare country can come back as a named town — and a client
 * that wrote its own guess into the list would show a place nobody saved.
 */
export function useSavePlace(): UseSavePlaceResult {
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: savedPlaceKeys.all });

  const saving = useMutation({
    mutationFn: ({ label, location }: { label: string; location?: PlatformLocation | null }) =>
      saveSavedPlace(label, location),
    onSuccess: invalidate,
  });

  const forgetting = useMutation({
    mutationFn: (label: string) => removeSavedPlace(label),
    onSuccess: invalidate,
  });

  return {
    save: async (label, location) => {
      await saving.mutateAsync({ label, location });
    },
    forget: async (label) => {
      await forgetting.mutateAsync(label);
    },
    pendingLabel:
      (saving.isPending ? saving.variables?.label : undefined)
      ?? (forgetting.isPending ? forgetting.variables : undefined)
      ?? null,
    isError: saving.isError || forgetting.isError,
  };
}
