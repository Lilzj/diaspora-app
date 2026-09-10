// ─────────────────────────────────────────────────────────────────────────────
// One occurrence (§11)
//
// The counterpart to the series screen: a single date, with the things that are
// properties of a date rather than of a pattern — availability, registration,
// attendance, a reminder, a cancellation.
//
// Every capacity decision is the server's. `occurrence.isFull` arrives decided,
// registering may legitimately answer `Waitlisted` rather than `Registered`, and
// this screen renders whichever came back rather than predicting it. §51's
// "Event full" and "Already registered" are both real states here.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  Card,
  CommunityScreen,
  CommunityStatusPanel,
  DetailRow,
  EmptyState,
  InlineRefusal,
  PrimaryButton,
  SecondaryButton,
  Section,
  readableDate,
} from '@/components/community';
import { FinancialErrorInline } from '@/components/financial';
import {
  useCancelRegistration,
  useCommunityAccess,
  useMyRegistrations,
  useOccurrence,
  useRegisterForEvent,
  useSeries,
  useUpdateOccurrence,
} from '@/hooks/community-life';
import {
  canCancelRegistration,
  canRegister,
  describeOccurrence,
  describeRegistration,
} from '@/lib/community-state';
import { checkCommunityAccess, CommunityCapabilities } from '@/lib/community-access';
import { trackCommunityEvent } from '@/lib/community-analytics';
import { useAuthStore } from '@/store/auth';
import type { FinancialError } from '@/lib/financial-errors';

export default function OccurrenceScreen() {
  const { showAlert } = useNotification();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tokens } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);
  const access = useCommunityAccess();

  const { occurrence, isLoading, isError, error, refetch } = useOccurrence(id);
  const { series } = useSeries(occurrence?.seriesId);
  const { data: registrations } = useMyRegistrations();
  const register = useRegisterForEvent();
  const cancelRegistration = useCancelRegistration();
  const updateOccurrence = useUpdateOccurrence();

  useEffect(() => {
    if (occurrence) {
      trackCommunityEvent('community.occurrence.viewed', {
        occurrenceId: occurrence.occurrenceId,
        seriesId: occurrence.seriesId,
        status: occurrence.status,
      });
    }
  }, [occurrence?.occurrenceId]);

  /**
   * The caller's registration for this date.
   *
   * Read from the registrations list rather than from `occurrence.myRegistration`
   * where both exist, because the list is the record that survives a
   * cancellation — the occurrence's copy is a projection.
   */
  const registration = useMemo(
    () => registrations.find((r) => r.occurrenceId === id && r.status !== 'Cancelled') ?? null,
    [registrations, id]
  );

  const registrationStatus = registration?.status ?? occurrence?.myRegistration ?? 'NotRegistered';
  const occurrenceState = describeOccurrence(occurrence?.status ?? 'Scheduled');
  const registrationState = describeRegistration(registrationStatus);

  const refusal = checkCommunityAccess(
    CommunityCapabilities.RegisterEvent,
    accountState,
    isAuthenticated
  );

  const isCancelled = occurrence?.status === 'Cancelled';
  const isPast = occurrence?.status === 'Completed';
  const showRegister = !isCancelled && !isPast && canRegister(registrationStatus);
  const showCancelRegistration = !isCancelled && canCancelRegistration(registrationStatus);
  const canOrganize = Boolean(series && series.organizerType === 'Organization');

  return (
    <CommunityScreen
      title={occurrence ? readableDate(occurrence.date) : 'Event date'}
      subtitle={occurrence?.title}
      isLoading={isLoading}
      error={isError ? error : null}
      onRetry={refetch}
      onRefresh={refetch}
      footer={
        occurrence && !isPast ? (
          <View>
            {register.isError ? (
              <View className="mb-3">
                <FinancialErrorInline error={register.error as FinancialError} />
              </View>
            ) : null}

            {isCancelled ? (
              <InlineRefusal
                icon="close-circle-outline"
                reason={occurrence.cancellationReason ?? 'This date has been cancelled.'}
              />
            ) : showRegister ? (
              <PrimaryButton
                label={occurrence.isFull ? 'Join the waiting list' : 'Register for this date'}
                icon={occurrence.isFull ? 'list-outline' : 'checkmark-circle-outline'}
                busy={register.isPending}
                disabled={register.isPending || !refusal.allowed}
                accessibilityHint={
                  refusal.allowed
                    ? occurrence.isFull
                      ? 'This date is full — you will be told if a place opens up'
                      : 'Holds you a place'
                    : refusal.message
                }
                onPress={() => {
                  trackCommunityEvent('community.event.registered', {
                    occurrenceId: occurrence.occurrenceId,
                    seriesId: occurrence.seriesId,
                  });
                  register.mutate({ occurrenceId: occurrence.occurrenceId });
                }}
              />
            ) : showCancelRegistration && registration ? (
              <SecondaryButton
                label={
                  registrationStatus === 'Waitlisted'
                    ? 'Leave the waiting list'
                    : 'Cancel my registration'
                }
                icon="close-outline"
                disabled={cancelRegistration.isPending}
                onPress={() => {
                  trackCommunityEvent('community.event.registration.cancelled', {
                    occurrenceId: occurrence.occurrenceId,
                    seriesId: occurrence.seriesId,
                  });
                  cancelRegistration.mutate(registration.registrationId);
                }}
              />
            ) : null}
          </View>
        ) : null
      }
    >
      {!occurrence ? (
        <EmptyState
          icon="calendar-outline"
          title="Date not found"
          body="This occurrence may have been removed from the series."
        />
      ) : (
        <View className="px-5 pt-4">
          {/* Occurrence marker — the counterpart to the series badge */}
          <View className="flex-row items-center mb-3">
            <View
              style={{ backgroundColor: tokens.color.info.surface }}
              className="flex-row items-center rounded-full px-2.5 py-1"
            >
              <Ionicons name="calendar" size={12} color={tokens.color.info.default} />
              <Text
                style={{ color: tokens.color.info.default }}
                className="text-[10px] font-black uppercase tracking-widest ml-1"
              >
                One date
              </Text>
            </View>
          </View>

          <CommunityStatusPanel
            state={occurrenceState}
            extra={
              occurrence.originalDate
                ? `This was originally ${readableDate(occurrence.originalDate)}.`
                : (occurrence.cancellationReason ?? undefined)
            }
          />

          {/* The member's own registration */}
          {registrationStatus !== 'NotRegistered' ? (
            <View className="mt-3">
              <CommunityStatusPanel
                state={registrationState}
                extra={
                  registration?.waitlistPosition
                    ? `You are number ${registration.waitlistPosition} on the list.`
                    : undefined
                }
              />
            </View>
          ) : null}

          <Section title="Details" style={{ marginHorizontal: -20 }}>
            <View className="px-5">
              <Card>
                <DetailRow label="Date" icon="calendar-outline" value={readableDate(occurrence.date)} />
                <DetailRow
                  label="Time"
                  icon="time-outline"
                  value={`${occurrence.time} – ${occurrence.endTime} (${occurrence.timezone})`}
                />
                <DetailRow
                  label="Where"
                  icon="location-outline"
                  value={`${occurrence.location.addressLine}, ${occurrence.location.areaName}, ${occurrence.location.cityName}`}
                />
                <DetailRow
                  label="Places"
                  icon="people-outline"
                  value={
                    occurrence.capacity
                      ? occurrence.isFull
                        ? `Full — ${occurrence.registeredCount} of ${occurrence.capacity}`
                        : `${occurrence.registeredCount} of ${occurrence.capacity} taken`
                      : `${occurrence.registeredCount} registered`
                  }
                />
              </Card>
            </View>
          </Section>

          {occurrence.isFull && showRegister ? (
            <View className="mt-3">
              <InlineRefusal
                icon="list-outline"
                reason="Every place for this date is taken. You can join the waiting list and Diaspora will tell you if one opens up."
              />
            </View>
          ) : null}

          {/* Back to the pattern this date belongs to */}
          {series ? (
            <Section title="Part of a series" style={{ marginHorizontal: -20 }}>
              <View className="px-5">
                <Card
                  onPress={() => router.push(`/community-life/series/${series.seriesId}` as never)}
                  accessibilityLabel={`${series.title}. ${series.recurrence.description ?? 'Repeating event'}. ${series.occurrenceCount} dates.`}
                  accessibilityHint="Opens the whole series"
                >
                  <View className="flex-row items-center">
                    <View
                      style={{ backgroundColor: tokens.color.secondary[50] }}
                      className="w-10 h-10 rounded-xl items-center justify-center"
                    >
                      <Ionicons name="repeat" size={18} color={tokens.color.secondary[500]} />
                    </View>
                    <View className="flex-1 ml-3">
                      <Text
                        style={{ color: tokens.color.text.primary }}
                        className="text-xs font-black tracking-tight"
                        numberOfLines={1}
                      >
                        {series.title}
                      </Text>
                      <Text
                        style={{ color: tokens.color.text.placeholder }}
                        className="text-[11px] font-bold mt-0.5"
                      >
                        {series.recurrence.description ?? 'Repeats'} · {series.occurrenceCount} dates
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
                  </View>
                </Card>
              </View>
            </Section>
          ) : null}

          {/* Attendees and organizer controls */}
          {canOrganize ? (
            <View className="mt-6">
              <SecondaryButton
                label="Manage attendees"
                icon="people-outline"
                onPress={() =>
                  router.push(
                    `/community-life/attendees?occurrenceId=${occurrence.occurrenceId}` as never
                  )
                }
              />
              {!isCancelled && !isPast ? (
                <View className="mt-3">
                  <SecondaryButton
                    label="Cancel just this date"
                    icon="close-circle-outline"
                    disabled={updateOccurrence.isPending}
                    onPress={() =>
                      showAlert({ type: 'warning', title: 'Cancel this date?', message: 'Only this occurrence is cancelled. The rest of the series carries on, and everyone registered for this date is told.', buttons: [
                          { text: 'Keep it', style: 'cancel' },
                          {
                            text: 'Cancel this date',
                            style: 'destructive',
                            onPress: () =>
                              updateOccurrence.mutate({
                                occurrenceId: occurrence.occurrenceId,
                                request: {
                                  status: 'Cancelled',
                                  reason: 'The organiser cancelled this date.',
                                },
                              }),
                          },
                        ] })
                    }
                  />
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Reminders come from B13. This phase adds no delivery. */}
          {!isCancelled && !isPast && registrationStatus === 'Registered' ? (
            <View className="mt-4">
              <InlineRefusal
                icon="notifications-outline"
                reason="Diaspora will remind you before this starts, through your usual notifications. You can change how you are reminded in Settings."
              />
            </View>
          ) : null}
        </View>
      )}
    </CommunityScreen>
  );
}
