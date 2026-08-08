// ─────────────────────────────────────────────────────────────────────────────
// Volunteer organizer — the applicant queue (§21, §31)
//
// Review, approve, reject, waitlist, assign a shift, confirm hours.
//
// Every action here is refused server-side when the caller's organization
// capabilities do not permit it. The buttons are drawn from the same capability
// set — but §19 is explicit that a hidden button is a convenience and not a
// control, and the adapter answers 403 regardless of what this screen drew.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  Card,
  ChipRow,
  CommunityScreen,
  CommunityStatusBadge,
  EmptyState,
  InlineRefusal,
  PrimaryButton,
  SecondaryButton,
  readableDate,
} from '@/components/community';
import { FinancialErrorInline } from '@/components/financial';
import {
  useApplicants,
  useAssignVolunteer,
  useDecideVolunteerApplication,
  useOpportunity,
} from '@/hooks/community-life';
import { describeVolunteerApplication } from '@/lib/community-state';
import { trackCommunityEvent } from '@/lib/community-analytics';
import type { FinancialError } from '@/lib/financial-errors';

type Filter = '' | 'Pending' | 'Approved' | 'Waitlisted' | 'Rejected';

export default function ApplicantsScreen() {
  const { opportunityId } = useLocalSearchParams<{ opportunityId: string }>();
  const { tokens } = useTheme();

  const { opportunity, isLoading: isLoadingOpportunity } = useOpportunity(opportunityId);
  const [filter, setFilter] = useState<Filter>('Pending');

  const {
    applicants,
    totalCount,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isEnabled,
  } = useApplicants(opportunityId, filter || undefined);

  const decide = useDecideVolunteerApplication(opportunityId);
  const assign = useAssignVolunteer(opportunityId);

  const canManage = opportunity?.canManage ?? false;

  return (
    <CommunityScreen
      title="Applicants"
      subtitle={opportunity?.title}
      gapKey="volunteerApplication"
      isEnabled={isEnabled}
      isLoading={isLoading || isLoadingOpportunity}
      error={isError ? error : null}
      onRetry={refetch}
      onRefresh={refetch}
    >
      {!canManage ? (
        <View className="px-5 pt-5">
          <InlineRefusal
            icon="lock-closed-outline"
            reason="You do not have permission to review applicants for this opportunity. If you think that is wrong, ask an administrator of the organisation."
          />
        </View>
      ) : (
        <>
          <View className="px-5 pt-4">
            <ChipRow
              accessibilityLabel="Filter applicants"
              options={[
                { value: 'Pending' as const, label: 'To review' },
                { value: 'Approved' as const, label: 'Approved' },
                { value: 'Waitlisted' as const, label: 'Waitlist' },
                { value: 'Rejected' as const, label: 'Declined' },
                { value: '' as const, label: 'Everyone' },
              ]}
              value={filter}
              onChange={setFilter}
            />
            {totalCount !== null ? (
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[11px] font-bold mt-1"
              >
                {totalCount} {totalCount === 1 ? 'applicant' : 'applicants'}
              </Text>
            ) : null}
          </View>

          <View className="px-5 mt-3">
            {decide.isError ? (
              <View className="mb-3">
                <FinancialErrorInline error={decide.error as FinancialError} />
              </View>
            ) : null}

            {applicants.length === 0 && !isLoading ? (
              <EmptyState
                icon="people-outline"
                title={filter === 'Pending' ? 'Nothing to review' : 'Nobody here'}
                body={
                  filter === 'Pending'
                    ? 'Every application has been decided.'
                    : 'No applicant is in this state.'
                }
              />
            ) : (
              applicants.map((applicant) => (
                <View key={applicant.applicationId} className="mb-3">
                  <Card
                    accessibilityLabel={`${applicant.displayName}, applied ${readableDate(applicant.submittedAt)}. ${describeVolunteerApplication(applicant.status).label}.`}
                  >
                    <View className="flex-row items-start">
                      <View
                        style={{ backgroundColor: tokens.color.surface.elevated }}
                        className="w-10 h-10 rounded-full items-center justify-center"
                      >
                        <Ionicons name="person-outline" size={17} color={tokens.color.text.placeholder} />
                      </View>

                      <View className="flex-1 ml-3">
                        <View className="flex-row items-center">
                          <Text
                            style={{ color: tokens.color.text.primary }}
                            className="text-sm font-black tracking-tight flex-1"
                            numberOfLines={1}
                          >
                            {applicant.displayName}
                          </Text>
                          {applicant.isVerified ? (
                            <Ionicons
                              name="checkmark-circle"
                              size={14}
                              color={tokens.color.info.default}
                              accessibilityLabel="Verified member"
                            />
                          ) : null}
                        </View>

                        <Text
                          style={{ color: tokens.color.text.placeholder }}
                          className="text-[11px] font-bold mt-0.5"
                        >
                          Applied {readableDate(applicant.submittedAt)}
                        </Text>

                        {applicant.skills.length > 0 ? (
                          <View className="flex-row flex-wrap mt-1.5">
                            {applicant.skills.map((skill) => (
                              <View
                                key={skill}
                                style={{ backgroundColor: tokens.color.secondary[50] }}
                                className="rounded-full px-2 py-0.5 mr-1.5 mb-1"
                              >
                                <Text
                                  style={{ color: tokens.color.secondary[600] }}
                                  className="text-[10px] font-bold"
                                >
                                  {skill}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ) : null}

                        {Object.entries(applicant.answers).map(([key, value]) =>
                          value ? (
                            <Text
                              key={key}
                              style={{ color: tokens.color.text.secondary }}
                              className="text-[11px] font-semibold mt-1.5 leading-relaxed"
                            >
                              {value}
                            </Text>
                          ) : null
                        )}

                        <View className="mt-2">
                          <CommunityStatusBadge
                            state={describeVolunteerApplication(applicant.status)}
                            size="small"
                          />
                        </View>
                      </View>
                    </View>

                    {/* Decisions */}
                    {applicant.status === 'Pending' || applicant.status === 'Waitlisted' ? (
                      <View className="flex-row mt-3" style={{ gap: 8 }}>
                        <View className="flex-1">
                          <PrimaryButton
                            label="Approve"
                            icon="checkmark"
                            busy={decide.isPending}
                            onPress={() => {
                              trackCommunityEvent('community.volunteer_application.decided', {
                                opportunityId: opportunityId as string,
                                result: 'approve',
                              });
                              decide.mutate({
                                applicationId: applicant.applicationId,
                                decision: 'approve',
                              });
                            }}
                          />
                        </View>
                        {applicant.status === 'Pending' ? (
                          <View className="flex-1">
                            <SecondaryButton
                              label="Waitlist"
                              disabled={decide.isPending}
                              onPress={() => {
                                trackCommunityEvent('community.volunteer_application.decided', {
                                  opportunityId: opportunityId as string,
                                  result: 'waitlist',
                                });
                                decide.mutate({
                                  applicationId: applicant.applicationId,
                                  decision: 'waitlist',
                                });
                              }}
                            />
                          </View>
                        ) : null}
                        <View className="flex-1">
                          <SecondaryButton
                            label="Decline"
                            disabled={decide.isPending}
                            onPress={() =>
                              Alert.alert(
                                `Decline ${applicant.displayName}?`,
                                'They will be told this application was not successful.',
                                [
                                  { text: 'Cancel', style: 'cancel' },
                                  {
                                    text: 'Decline',
                                    style: 'destructive',
                                    onPress: () => {
                                      trackCommunityEvent('community.volunteer_application.decided', {
                                        opportunityId: opportunityId as string,
                                        result: 'reject',
                                      });
                                      decide.mutate({
                                        applicationId: applicant.applicationId,
                                        decision: 'reject',
                                      });
                                    },
                                  },
                                ]
                              )
                            }
                          />
                        </View>
                      </View>
                    ) : null}

                    {/* Assignment, once approved */}
                    {applicant.status === 'Approved' ? (
                      <View className="mt-3">
                        <SecondaryButton
                          label="Put them on a shift"
                          icon="clipboard-outline"
                          disabled={assign.isPending}
                          onPress={() => {
                            const shift = opportunity?.shifts.find((candidate) => !candidate.isFull);
                            if (!shift) {
                              Alert.alert(
                                'Every shift is full',
                                'Add a shift or free up a place before assigning anyone else.'
                              );
                              return;
                            }
                            assign.mutate({
                              applicationId: applicant.applicationId,
                              shiftId: shift.shiftId,
                            });
                          }}
                        />
                      </View>
                    ) : null}
                  </Card>
                </View>
              ))
            )}

            {hasNextPage ? (
              <View className="mb-4">
                {isFetchingNextPage ? (
                  <View className="py-4 items-center" accessibilityLabel="Loading more">
                    <ActivityIndicator size="small" color={tokens.color.primary[500]} />
                  </View>
                ) : (
                  <SecondaryButton label="Show more" onPress={() => void fetchNextPage()} />
                )}
              </View>
            ) : null}
          </View>
        </>
      )}
    </CommunityScreen>
  );
}
