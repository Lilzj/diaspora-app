// ─────────────────────────────────────────────────────────────────────────────
// The candidate's application tracker (Remediation Wave K)
//
// `GET /api/v1/jobs/applications` has existed on the backend since the Jobs
// module landed, and until this screen **nothing in the application read it**. A
// member could apply — the job detail screen posted to `/apply` — and then had
// no way whatsoever to see what they had applied to, whether anybody had opened
// it, or how long it had been sitting there.
//
// Two fields carry the whole point of the screen and both come from the server:
// `hasBeenViewed` and `daysWaiting`. An application unopened for three weeks is
// exactly what the platform should be saying out loud, and it is the thing a
// candidate applying across a border cannot find out any other way.
//
// **Withdrawal is here and only here.** It is the candidate's own decision under
// its own policy — the server requires ownership rather than a permission, so it
// is not an action anybody can take on somebody's behalf, staff included.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useNotification } from '@/providers/notification-provider';
import { useMyApplications, useWithdrawApplication } from '@/hooks/jobs-hiring';
import { isAwaitingFirstView } from '@/lib/jobs-hiring-api';
import type { ApplicationCardResponse, ApplicationStatus } from '@/types/jobs-hiring';

/**
 * What each wire status is called on screen.
 *
 * The wire values are PascalCase and are **not** display text —
 * `InterviewScheduled` rendered raw is a word nobody uses. Keyed by the exact
 * wire spelling so a status the server adds shows up as a missing key here
 * rather than as a silently wrong label.
 */
const STATUS_LABELS: Record<ApplicationStatus, string> = {
  Submitted: 'Sent',
  UnderReview: 'Being reviewed',
  Shortlisted: 'Shortlisted',
  InterviewScheduled: 'Interview scheduled',
  InterviewCompleted: 'Interview done',
  OfferExtended: 'Offer made',
  Accepted: 'Accepted',
  Rejected: 'Not successful',
  Withdrawn: 'Withdrawn',
};

/** Whether to show only the applications still under consideration. */
type Filter = 'all' | 'active';

export default function MyApplicationsScreen() {
  const bottomInset = useBottomInset();
  const { showAlert } = useNotification();
  const [filter, setFilter] = useState<Filter>('all');

  // `activeOnly` is part of the query rather than a local filter on the rows,
  // because the rows are paged: filtering after the fact would hide some of a
  // page and leave the member with a short list and a "load more" button.
  const { applications, totalCount, isLoading, isRefreshing, isEmpty, hasMore, isFetchingMore, error, loadMore, refresh } =
    useMyApplications({ activeOnly: filter === 'active' });

  const { withdraw, isWithdrawing } = useWithdrawApplication();

  const waitingCount = useMemo(
    () => applications.filter(isAwaitingFirstView).length,
    [applications]
  );

  const confirmWithdraw = useCallback(
    (application: ApplicationCardResponse) => {
      showAlert({
        type: 'question',
        title: 'Withdraw this application?',
        message: `${application.jobTitle} at ${application.employerName}. You cannot undo this, and you will not be able to apply to this role again.`,
        buttons: [
          { text: 'Keep it', style: 'cancel' },
          {
            text: 'Withdraw',
            style: 'destructive',
            onPress: async () => {
              try {
                await withdraw(application.applicationId);
              } catch {
                // The server refuses a withdrawal on an application that has
                // already reached an ending. Reporting success there would tell
                // a member they had left a process they are still in.
                showAlert({
                  type: 'error',
                  title: 'Not withdrawn',
                  message:
                    'We could not withdraw this application. It may already have been decided.',
                });
                return;
              }

              showAlert({
                type: 'success',
                title: 'Withdrawn',
                message: 'The employer has been told you are no longer applying.',
              });
            },
          },
        ],
      });
    },
    [showAlert, withdraw]
  );

  if (isLoading) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
        <ScreenHeader title="My applications" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F59300" />
          <Text className="text-sm font-semibold text-content-muted mt-3">
            Loading your applications…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="My applications" />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: bottomInset }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* The error state is its own block rather than a replacement for the
            list: a failed refresh must not blank rows the member was reading. */}
        {error ? (
          <View className="mx-4 mt-4 p-4 rounded-xl bg-error-surface border border-error-default">
            <Text className="text-sm font-bold text-error-default">{error}</Text>
            <Button label="Try again" variant="outline" size="sm" className="mt-3" onPress={refresh} />
          </View>
        ) : null}

        <View className="flex-row gap-2 px-4 pt-4">
          {(['all', 'active'] as const).map((value) => (
            <TouchableOpacity
              key={value}
              onPress={() => setFilter(value)}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === value }}
              className={`px-4 py-2 rounded-full border ${
                filter === value ? 'bg-primary-500 border-primary-500' : 'border-line'
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  filter === value ? 'text-white' : 'text-content-tertiary'
                }`}
              >
                {value === 'all' ? 'All' : 'Still open'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* `totalCount` is what the SERVER said the population is. It is null
            when the route declined to count, and null is not zero — so the line
            is omitted rather than rendered as "0 applications". */}
        {typeof totalCount === 'number' ? (
          <Text className="px-4 pt-3 text-xs font-semibold text-content-faint">
            {totalCount} {totalCount === 1 ? 'application' : 'applications'}
            {waitingCount > 0 ? ` · ${waitingCount} not opened yet` : ''}
          </Text>
        ) : null}

        {isEmpty ? (
          <EmptyState
            icon="📄"
            title={filter === 'active' ? 'Nothing open right now' : 'No applications yet'}
            description={
              filter === 'active'
                ? 'Applications you have withdrawn or that were decided are still under "All".'
                : 'When you apply to a role it appears here, along with whether the employer has opened it.'
            }
            action={<Button label="Browse jobs" onPress={() => router.push('/(tabs)/explore')} />}
          />
        ) : null}

        <View className="px-4 pt-3">
          {applications.map((application) => (
            <ApplicationRow
              key={application.applicationId}
              application={application}
              isWithdrawing={isWithdrawing}
              onWithdraw={() => confirmWithdraw(application)}
            />
          ))}
        </View>

        {hasMore ? (
          <View className="px-4 py-4">
            <Button
              label={isFetchingMore ? 'Loading…' : 'Show more'}
              variant="outline"
              isLoading={isFetchingMore}
              onPress={loadMore}
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function ApplicationRow({
  application,
  isWithdrawing,
  onWithdraw,
}: {
  application: ApplicationCardResponse;
  isWithdrawing: boolean;
  onWithdraw: () => void;
}) {
  const waiting = isAwaitingFirstView(application);

  return (
    <View className="bg-surface-card rounded-2xl border border-subtle p-4 mb-3">
      <TouchableOpacity
        accessibilityRole="button"
        onPress={() => router.push(`/job/${application.jobId}`)}
      >
        <Text className="text-base font-extrabold text-content-primary" numberOfLines={2}>
          {application.jobTitle}
        </Text>
        <Text className="text-sm font-semibold text-content-muted mt-0.5">
          {application.employerName}
        </Text>
      </TouchableOpacity>

      <View className="flex-row items-center flex-wrap gap-2 mt-3">
        <View className="px-2.5 py-1 rounded-full bg-surface-background border border-faint">
          <Text className="text-[10px] font-black uppercase text-content-tertiary">
            {STATUS_LABELS[application.status]}
          </Text>
        </View>

        {/* The honest line, and the reason this screen exists. `hasBeenViewed`
            is the server's fact about whether a human at the employer has
            opened it — not an inference from the status. */}
        {waiting ? (
          <View className="px-2.5 py-1 rounded-full bg-warning-surface">
            <Text className="text-[10px] font-black uppercase text-warning-default">
              Not opened · {application.daysWaiting}d
            </Text>
          </View>
        ) : null}

        {application.attachmentCount > 0 ? (
          <Text className="text-[10px] font-bold text-content-faint">
            {application.attachmentCount} attached
          </Text>
        ) : null}
      </View>

      {/* Gated on the row's own `isActive`, which is the server's answer.
          `canWithdraw` lives on the full application record and the list does
          not carry one — so a refusal is still possible and is handled. */}
      {application.isActive ? (
        <Button
          label="Withdraw"
          variant="ghost"
          size="sm"
          // `self-start` asks it to hug its label, and `Button` is full width by
          // default, so without this it spanned the card and the two disagreed.
          fullWidth={false}
          className="self-start mt-2"
          disabled={isWithdrawing}
          onPress={onWithdraw}
        />
      ) : null}
    </View>
  );
}
