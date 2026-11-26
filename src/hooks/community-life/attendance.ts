// Community Life hooks: attendance. ./index.ts is the overview of the whole module.

import { useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { joinRsvpsToEvents } from '@/lib/domain/my-rsvps';
import * as gapApi from '@/lib/api/community-gap-api';
import { communityGapKeys } from '@/lib/api/community-gap-api';
import * as b12 from '@/lib/api/community-life-api';
import { communityLifeKeys } from '@/lib/api/community-life-api';
import { shouldRetryQuery, type FinancialError } from '@/lib/transport/financial-errors';
import {
  acquireIdempotencyKey,
  releaseIdempotencyKey,
  type OperationScope,
} from '@/lib/domain/idempotency';
import { useAuthStore } from '@/store/auth';
import * as attendeesApi from '@/lib/api/event-attendees';
import { LIVE_STALE_MS, backendRead, mutationOptions, readOptions } from './shared';

/**
 * The real RSVP contract.
 *
 * Remediation Wave A′: `null` is no longer a status but a *withdrawal*, and it
 * routes to `DELETE .../rsvp` rather than to a partial update carrying a null.
 * `'Maybe'` is gone — the platform has never had it.
 *
 * The mutation now returns an `RsvpRecord` rather than an `Event`, so the cache
 * update writes the event key by id from the arguments instead of from the
 * response. That is not a loss: the record carries the *stored* status, which is
 * the authoritative answer when the server waitlists a member who asked to go.
 */
/**
 * What the caller said they would go to.
 *
 * **`GET /rsvps/mine` was served and consumed by nothing.** A member could RSVP
 * to an event and then had nowhere to see what they had committed to: the
 * commitment existed on the server and nowhere a person could look.
 *
 * The join happens here rather than in the screen, because the route answers
 * the RSVPs and their events as two arrays and a join written twice eventually
 * disagrees with itself. Pages are flattened before joining so an event summary
 * on page one still finds its RSVP on page two — the server repeats summaries
 * per page, and joining page by page would drop a row whose event happened to
 * arrive in a different one.
 */
export function useMyRsvps(options: { upcomingOnly?: boolean } = {}) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const upcomingOnly = options.upcomingOnly ?? true;

  const query = useInfiniteQuery({
    queryKey: communityLifeKeys.myRsvps(upcomingOnly),
    queryFn: ({ pageParam }) =>
      b12.fetchMyRsvps({ upcomingOnly, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: isAuthenticated,
    retry: shouldRetryQuery,
  });

  const rsvps = useMemo(() => {
    const pages = query.data?.pages ?? [];

    return joinRsvpsToEvents({
      items: pages.flatMap((page) => page.items ?? []),
      events: pages.flatMap((page) => page.events ?? []),
      hasMore: false,
    });
  }, [query.data]);

  return {
    rsvps,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch: query.refetch,
  };
}

export function useSetRsvp() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({
      eventId,
      rsvpStatus,
    }: {
      eventId: string;
      rsvpStatus: 'Going' | 'Interested' | null;
    }) =>
      rsvpStatus === null
        ? b12.withdrawEventRsvp(eventId)
        : b12.setEventRsvp(eventId, rsvpStatus),
    onSuccess: (rsvp) => {
      // The event's own `viewerRsvpStatus` is now stale, and so is any list that
      // renders it. Invalidating rather than patching keeps the server's answer
      // authoritative — including a `Waitlisted` the client did not ask for.
      void queryClient.invalidateQueries({ queryKey: communityLifeKeys.event(rsvp.eventId) });
      void queryClient.invalidateQueries({ queryKey: communityLifeKeys.eventsAll() });

      // And the member's own list of what they are going to, which is the
      // whole point of answering an RSVP. Without this the "Going to" screen
      // shows yesterday's commitments after somebody makes a new one.
      void queryClient.invalidateQueries({ queryKey: communityLifeKeys.myRsvpsAll() });
    },
  });
}

// ── Registration ─────────────────────────────────────────────────────────────

export function useMyRegistrations() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // Real RSVPs since 20 Oct 2026, so not gated on the simulation flag.
  const query = useQuery({
    queryKey: communityGapKeys.myRegistrations(),
    queryFn: gapApi.fetchMyRegistrations,
    enabled: isAuthenticated,
    ...readOptions,
    staleTime: LIVE_STALE_MS,
  });

  return backendRead(query, []);
}

/**
 * Registers for an event or an occurrence.
 *
 * No optimistic update. §47 permits optimistic UI "only for safe operations",
 * and registration is not one: the server may answer `Waitlisted` rather than
 * `Registered`, or refuse because the event filled between the list rendering
 * and the tap. Showing "Registered" and then withdrawing it is worse than a
 * spinner for 400ms.
 */
export function useRegisterForEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (request: Omit<gapApi.RegisterRequest, 'idempotencyKey'>) => {
      const scope: OperationScope = {
        operation: 'event-registration',
        subject: request.occurrenceId ?? request.eventId ?? 'unknown',
      };
      const idempotencyKey = await acquireIdempotencyKey(scope);
      const registration = await gapApi.registerForEvent({ ...request, idempotencyKey });
      await releaseIdempotencyKey(scope);
      return registration;
    },
    onSuccess: (registration) => {
      void queryClient.invalidateQueries({ queryKey: communityGapKeys.myRegistrations() });
      if (registration.occurrenceId) {
        void queryClient.invalidateQueries({
          queryKey: communityGapKeys.occurrence(registration.occurrenceId),
        });
      }
      if (registration.seriesId) {
        void queryClient.invalidateQueries({
          queryKey: communityGapKeys.seriesOccurrences(registration.seriesId),
        });
      }
    },
  });
}

export function useCancelRegistration() {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (registrationId: string) => gapApi.cancelRegistration(registrationId),
    onSuccess: (registration) => {
      void queryClient.invalidateQueries({ queryKey: communityGapKeys.myRegistrations() });
      if (registration.occurrenceId) {
        void queryClient.invalidateQueries({
          queryKey: communityGapKeys.occurrence(registration.occurrenceId),
        });
      }
    },
  });
}

/**
 * Who is coming to an event, from the route the platform actually serves.
 *
 * There used to be a `useAttendees` beside this one, calling
 * `/community-life/registrations/attendees` — a route that does not exist. It
 * was written against an imagined contract, gated behind the gap-preview flag,
 * and never called by anything. Deleted 12 Sep 2026; a warning comment is a
 * weaker guard than the absence of the thing being warned about.
 */
export function useEventAttendees(eventId: string | undefined) {
  const query = useInfiniteQuery({
    queryKey: communityLifeKeys.attendees(eventId ?? ''),
    queryFn: ({ pageParam }) =>
      attendeesApi.fetchEventAttendees({
        eventId: eventId as string,
        cursor: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor ?? undefined : undefined),
    enabled: Boolean(eventId),
    ...readOptions,
  });

  const pages = query.data?.pages ?? [];

  return {
    attendees: pages.flatMap((page) => page.items),
    goingCount: pages[0]?.goingCount ?? 0,
    remainingPlaces: pages[0]?.remainingPlaces ?? null,
    acceptsCheckIn: pages[0]?.acceptsCheckIn ?? false,
    checkInOpensAt: pages[0]?.checkInOpensAt ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}

/**
 * Records somebody arriving.
 *
 * Invalidates the attendee list and the event: a check-in moves the event's
 * own checked-in count, which the event screen shows.
 */
export function useCheckIn(eventId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: ({ rsvpId }: { rsvpId: string }) =>
      attendeesApi.checkInAttendee({ eventId: eventId as string, rsvpId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: communityLifeKeys.attendees(eventId ?? '') });
      void queryClient.invalidateQueries({ queryKey: communityLifeKeys.event(eventId ?? '') });
    },
  });
}

export function useCheckInAttendee(occurrenceId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn: (registrationId: string) => gapApi.checkInAttendee(registrationId),
    onSuccess: () => {
      if (occurrenceId) {
        void queryClient.invalidateQueries({ queryKey: communityGapKeys.attendees(occurrenceId) });
      }
    },
  });
}
