// Automation hooks: reminders. ./index.ts is the overview of the whole module.

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as automationApi from '@/lib/automation/certified-client';
import { useConnectivityStore } from '@/lib/platform/connectivity';
import { acquireIdempotencyKey, releaseIdempotencyKey } from '@/lib/domain/idempotency';
import { automationKeys } from '@/lib/automation/query-keys';
import {
  AutomationError,
  offlineError,
  shouldRetryAutomation,
  toAutomationError,
} from '@/lib/automation/errors';
import { trackAutomationEvent } from '@/lib/automation/events';
import { type SavedSearch, type SavedSearchSubject } from '@/types/automation';
import { useMemberId } from './shared';

// ═════════════════════════════════════════════════════════════════════════════
// SAVED SEARCHES — §30
// ═════════════════════════════════════════════════════════════════════════════

export function useSavedSearches(subject: SavedSearchSubject | null = null): {
  searches: SavedSearch[];
  isLoading: boolean;
  error: AutomationError | null;
} {
  const userId = useMemberId();

  const query = useQuery({
    queryKey: automationKeys.savedSearches(userId, subject),
    queryFn: () => automationApi.listSavedSearches(subject),
    retry: shouldRetryAutomation,
    staleTime: 60 * 1000,
  });

  return {
    searches: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error instanceof AutomationError ? query.error : null,
  };
}

export function useSavedSearchMutations() {
  const queryClient = useQueryClient();
  const userId = useMemberId();
  const isOffline = useConnectivityStore((state) => !state.isOnline);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: automationKeys.all(userId) });
  }, [queryClient, userId]);

  const create = useMutation({
    mutationFn: async (input: {
      subject: SavedSearchSubject;
      name: string;
      criteria: Record<string, string | number | boolean | string[]>;
      querySummary: string;
      alertsEnabled: boolean;
      alertFrequency: string;
      watchFor: string[];
    }) => {
      if (isOffline) throw offlineError('Saving a search');
      const created = await automationApi.createSavedSearch(input);

      trackAutomationEvent('automation.savedSearch.created', {
        savedSearchSubject: input.subject,
        // §52: how many filters, never which and never their values. A housing
        // search's criteria state a budget and a neighbourhood.
        criteriaCount: Object.keys(input.criteria).length,
        alertFrequency: input.alertFrequency,
      });

      return created;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async (input: {
      id: string;
      changes: Partial<Pick<SavedSearch, 'name' | 'alertsEnabled' | 'alertFrequency' | 'watchFor'>>;
    }) => {
      if (isOffline) throw offlineError('Changing a saved search');
      const updated = await automationApi.updateSavedSearch(input.id, input.changes);

      if (input.changes.alertsEnabled !== undefined) {
        trackAutomationEvent('automation.savedSearch.alertsToggled', {
          savedSearchSubject: updated.subject,
          alertFrequency: updated.alertFrequency,
        });
      }

      return updated;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (isOffline) throw offlineError('Deleting a saved search');
      const result = await automationApi.deleteSavedSearch(id);
      trackAutomationEvent('automation.savedSearch.deleted');
      return result;
    },
    onSuccess: invalidate,
  });

  return { create, update, remove, isOffline };
}

// ═════════════════════════════════════════════════════════════════════════════
// REMINDERS — §12
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The reminders configured on one subject.
 *
 * §12 requires `configured`, `scheduled`, `sent`, `failed` and `cancelled` to be
 * distinguishable. The development adapter returned `configured` and never
 * `scheduled`, because nothing scheduled; the real module calls
 * `MarkScheduled(dueAt)` on creation, so a reminder now genuinely reaches
 * `scheduled` and the screen's tick finally means what it says.
 *
 * `subjectMoment` is the instant the offset counts back from, and it is
 * **required** — see `createReminder` in the certified client. The caller passes
 * the subject's own start, because only the caller knows when its subject is;
 * this hook holds no notion of an event's calendar.
 */
export function useReminders(
  subjectKind: string,
  subjectId: string | null,
  subjectMoment: string | null = null
) {
  const userId = useMemberId();
  const queryClient = useQueryClient();
  const isOffline = useConnectivityStore((state) => !state.isOnline);

  const query = useQuery({
    queryKey: automationKeys.reminders(userId, subjectKind, subjectId ?? 'none'),
    enabled: !!subjectId,
    queryFn: () => automationApi.listReminders(subjectKind, subjectId!),
    retry: shouldRetryAutomation,
    staleTime: 60 * 1000,
  });

  const create = useMutation({
    mutationFn: async (input: {
      offsetMinutes: number;
      anchor: 'start' | 'end';
      timeZoneId: string;
      subjectTitle?: string;
    }) => {
      if (isOffline) throw offlineError('Setting a reminder');
      if (!subjectId) throw offlineError('Setting a reminder');

      // The offset counts back from this. Without it the request is refused —
      // `ReminderSubjectUnknown` — so refusing here, before the network, says
      // the same thing sooner and names the caller's omission rather than the
      // member's action.
      if (!subjectMoment) {
        throw toAutomationError(new Error('no subject moment'), { mutating: true });
      }

      // §12 · GAP-008: idempotent on (member, subject, offset, anchor). Tapping
      // "remind me" twice must produce one reminder — a duplicate here is two
      // identical notifications a minute apart, which is the fastest way an
      // automation feature loses somebody's trust.
      //
      // The server keys on exactly the same four values
      // (`AutomationReminder.BuildKey`), so the client key and the server key
      // agree by construction rather than by coincidence.
      const operation = {
        operation: 'automation-reminder',
        subject: `${subjectKind}:${subjectId}`,
        discriminator: `${input.offsetMinutes}:${input.anchor}`,
      };
      const idempotencyKey = await acquireIdempotencyKey(operation);

      try {
        const created = await automationApi.createReminder({
          subjectKind,
          subjectId,
          subjectMoment,
          offsetMinutes: input.offsetMinutes,
          anchor: input.anchor,
          timeZoneId: input.timeZoneId,
          subjectTitle: input.subjectTitle,
          idempotencyKey,
        });
        await releaseIdempotencyKey(operation);
        return created;
      } catch (cause) {
        const error = toAutomationError(cause, { mutating: true });
        if (error.isTerminal && !error.isIndeterminate) {
          await releaseIdempotencyKey(operation);
        }
        throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: automationKeys.reminders(userId, subjectKind, subjectId ?? 'none'),
      });
    },
  });

  const cancel = useMutation({
    mutationFn: async (reminderId: string) => {
      if (isOffline) throw offlineError('Cancelling a reminder');
      return automationApi.cancelReminder(reminderId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: automationKeys.reminders(userId, subjectKind, subjectId ?? 'none'),
      });
    },
  });

  return {
    reminders: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error instanceof AutomationError ? query.error : null,
    create,
    cancel,
    isOffline,
  };
}
