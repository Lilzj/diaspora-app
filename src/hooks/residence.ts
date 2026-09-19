// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — reading and editing where a member lives
//
// Backed by `/location/me/countries`, which this app never called. See
// `lib/location/residence.ts` for why the routes were there all along and what
// a declaration is and is not allowed to do.
//
// Invalidating the trust profile after every write is the point of these hooks
// rather than an afterthought. Closing a residence reaches Trust out of band —
// Location publishes, Trust consumes, the standing closes — so the Trust
// Centre's own timeline changes without this device asking for anything. Left
// to React Query's five-minute `staleTime`, the member would record their move
// and watch the old country go on saying "Present".
// ─────────────────────────────────────────────────────────────────────────────

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { trustKeys } from '@/lib/trust-api';
import {
  declareResidence,
  fetchResidenceTimeline,
  recordMove,
  residenceKeys,
  withdrawResidence,
  type DeclareResidenceBody,
  type ResidenceTimelineWire,
  type ResidenceWire,
} from '@/lib/location/residence';

function messageFor(query: { isError: boolean; error: unknown }): string | null {
  if (!query.isError) return null;

  const cause = query.error;
  const message = (cause as { message?: string } | null)?.message;

  return message?.trim() || 'Something went wrong. Please try again.';
}

function shouldRetry(failureCount: number, cause: unknown): boolean {
  const httpStatus = (cause as { response?: { status?: number } })?.response?.status;

  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 404 || httpStatus === 429) {
    return false;
  }

  return failureCount < 1;
}

/** Residence changes rarely; a five-minute answer is never stale to a member. */
const RESIDENCE_STALE_MS = 5 * 60 * 1000;

export interface UseResidenceTimelineResult {
  timeline: ResidenceTimelineWire | null;
  residences: ResidenceWire[];
  /** Where the member lives now. Null when every residence is closed. */
  current: ResidenceWire | null;
  /** More than one open residence is legal: plenty of members split their time. */
  openResidences: ResidenceWire[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/** `GET /location/me/countries`. */
export function useResidenceTimeline(
  options: { enabled?: boolean } = {}
): UseResidenceTimelineResult {
  const query = useQuery({
    queryKey: residenceKeys.timeline(),
    queryFn: ({ signal }) => fetchResidenceTimeline(signal),
    enabled: options.enabled ?? true,
    staleTime: RESIDENCE_STALE_MS,
    retry: shouldRetry,
  });

  const timeline = query.data ?? null;
  const residences = timeline?.experiences ?? [];

  return {
    timeline,
    residences,
    current: timeline?.currentResidence ?? null,
    openResidences: residences.filter((residence) => residence.isCurrentResidence),
    isLoading: query.isLoading,
    error: messageFor(query),
    refresh: () => void query.refetch(),
  };
}

export interface UseResidenceEditorResult {
  declare: (body: DeclareResidenceBody) => Promise<ResidenceWire | null>;
  /** Closes the country being left and opens the one arrived in. */
  move: (move: Parameters<typeof recordMove>[0]) => Promise<ResidenceWire | null>;
  /** Marks one country as left, without declaring where the member went. */
  leave: (
    residence: Pick<ResidenceWire, 'countryCode' | 'arrivedOn' | 'role'>,
    departedOn: string
  ) => Promise<ResidenceWire | null>;
  withdraw: (countryCode: string) => Promise<void>;
  isPending: boolean;
  error: string | null;
}

/**
 * The write half.
 *
 * **Not retried.** These routes have no idempotency key, and while the server
 * upserts — so a repeated declaration is harmless — a retry after a call that
 * succeeded without being acknowledged would report an error for a move that
 * actually happened. The member would then record it twice.
 */
export function useResidenceEditor(): UseResidenceEditorResult {
  const client = useQueryClient();

  const settle = () => {
    void client.invalidateQueries({ queryKey: residenceKeys.all });

    // The standing Trust closed on the back of this is on the other read.
    void client.invalidateQueries({ queryKey: trustKeys.profile() });
  };

  const declaration = useMutation({
    mutationFn: declareResidence,
    retry: false,
    onSuccess: settle,
  });

  const movement = useMutation({
    mutationFn: recordMove,
    retry: false,
    onSuccess: settle,
  });

  const withdrawal = useMutation({
    mutationFn: withdrawResidence,
    retry: false,
    onSuccess: settle,
  });

  return {
    declare: (body) => declaration.mutateAsync(body),
    move: (move) => movement.mutateAsync(move),
    leave: (residence, departedOn) =>
      declaration.mutateAsync({
        countryCode: residence.countryCode,
        arrivedOn: residence.arrivedOn,
        departedOn,
        role: residence.role ?? null,
      }),
    withdraw: (countryCode) => withdrawal.mutateAsync(countryCode),
    isPending: declaration.isPending || movement.isPending || withdrawal.isPending,
    error: messageFor(declaration) ?? messageFor(movement) ?? messageFor(withdrawal),
  };
}
