// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the viewings diary
//
// Over `lib/housing-viewings-api.ts`: the caller's viewings as a landlord or as
// the member who asked, and the one route that moves a viewing on. Every move
// refreshes both sides, because a member can be both at once.
// ─────────────────────────────────────────────────────────────────────────────

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchViewings,
  updateViewing,
  type HousingViewing,
  type UpdateViewingRequest,
  type ViewingSide,
} from '@/lib/housing-viewings-api';

export const housingViewingKeys = {
  all: ['housing', 'viewings'] as const,
  side: (side: ViewingSide) => ['housing', 'viewings', side] as const,
};

/** Refusals are answers; only a failure that might pass is worth a second try. */
function shouldRetry(failureCount: number, cause: unknown): boolean {
  const status = (cause as { response?: { status?: number } })?.response?.status;
  if (status === 401 || status === 403 || status === 404) return false;
  return failureCount < 1;
}

/** `GET /housing/viewings?side=…`, open and closed, newest first. */
export function useViewings(side: ViewingSide) {
  return useQuery<HousingViewing[]>({
    queryKey: housingViewingKeys.side(side),
    queryFn: () => fetchViewings(side),
    staleTime: 30 * 1000,
    retry: shouldRetry,
  });
}

/** `POST /housing/viewings/{id}` — schedule, complete, cancel or record a no-show. */
export function useUpdateViewing() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ viewingId, request }: { viewingId: string; request: UpdateViewingRequest }) =>
      updateViewing(viewingId, request),
    onSettled: () => client.invalidateQueries({ queryKey: housingViewingKeys.all }),
  });
}
