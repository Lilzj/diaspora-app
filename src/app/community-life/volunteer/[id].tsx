// ─────────────────────────────────────────────────────────────────────────────
// A volunteer opportunity, and applying for it (§18, §19)
//
// Flow: Opportunity → Details → Eligibility → Apply → Submit → Pending →
//       Approved / Rejected → Assignment
//
// `opportunity.canApply` and `cannotApplyReason` come from the server and are
// rendered verbatim. This screen never works out whether somebody is eligible —
// §19 — and every refusal §19 lists (already applied, full, deadline passed,
// missing accreditation) arrives as one of those two fields.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
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
  useOpportunity,
  useSubmitVolunteerApplication,
  useWithdrawVolunteerApplication,
} from '@/hooks/community-life';
import {
  canApplyToVolunteer,
  canWithdrawVolunteerApplication,
  describeVolunteerApplication,
} from '@/lib/community-state';
import { checkCommunityAccess, CommunityCapabilities } from '@/lib/community-access';
import { trackCommunityEvent } from '@/lib/community-analytics';
import { useAuthStore } from '@/store/auth';
import type { FinancialError } from '@/lib/financial-errors';

export default function OpportunityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tokens } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const { opportunity, isLoading, isError, error, refetch } = useOpportunity(id);
  const submit = useSubmitVolunteerApplication();
  const withdraw = useWithdrawVolunteerApplication();

  const [isApplying, setIsApplying] = useState(false);
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [why, setWhy] = useState('');
  const [availability, setAvailability] = useState('');

  useEffect(() => {
    if (opportunity) {
      trackCommunityEvent('community.volunteer_opportunity.viewed', {
        opportunityId: opportunity.opportunityId,
        organizationId: opportunity.organizationId ?? undefined,
        cause: opportunity.cause,
        shiftCount: opportunity.shifts.length,
      });
    }
  }, [opportunity?.opportunityId]);

  const refusal = checkCommunityAccess(
    CommunityCapabilities.ApplyVolunteer,
    accountState,
    isAuthenticated
  );

  const applicationState = describeVolunteerApplication(
    opportunity?.myApplicationStatus ?? 'NotApplied'
  );
  const showApplyButton =
    opportunity && canApplyToVolunteer(opportunity.myApplicationStatus) && opportunity.canApply;
  const showWithdraw =
    opportunity && canWithdrawVolunteerApplication(opportunity.myApplicationStatus);

  const onSubmit = () => {
    if (!opportunity) return;

    trackCommunityEvent('community.volunteer_application.submitted', {
      opportunityId: opportunity.opportunityId,
      organizationId: opportunity.organizationId ?? undefined,
      cause: opportunity.cause,
    });

    submit.mutate(
      {
        opportunityId: opportunity.opportunityId,
        shiftId: shiftId ?? undefined,
        answers: { why: why.trim(), availability: availability.trim() },
      },
      { onSuccess: () => setIsApplying(false) }
    );
  };

  return (
    <CommunityScreen
      title={opportunity?.title ?? 'Volunteering'}
      subtitle={opportunity?.organizationName}
      isLoading={isLoading}
      error={isError ? error : null}
      onRetry={refetch}
      onRefresh={refetch}
      footer={
        opportunity ? (
          <View>
            {submit.isError ? (
              <View className="mb-3">
                <FinancialErrorInline error={submit.error as FinancialError} />
              </View>
            ) : null}

            {isApplying ? (
              <PrimaryButton
                label="Send application"
                icon="paper-plane-outline"
                busy={submit.isPending}
                disabled={submit.isPending || !why.trim()}
                accessibilityHint={
                  why.trim() ? 'Sends your application to the organiser' : 'Tell them why first'
                }
                onPress={onSubmit}
              />
            ) : showApplyButton ? (
              <PrimaryButton
                label="Apply to volunteer"
                icon="hand-left-outline"
                disabled={!refusal.allowed}
                accessibilityHint={refusal.allowed ? 'Opens the application' : refusal.message}
                onPress={() => {
                  trackCommunityEvent('community.volunteer_application.started', {
                    opportunityId: opportunity.opportunityId,
                    cause: opportunity.cause,
                  });
                  setShiftId(opportunity.shifts.find((shift) => !shift.isFull)?.shiftId ?? null);
                  setIsApplying(true);
                }}
              />
            ) : showWithdraw && opportunity.myApplicationId ? (
              <SecondaryButton
                label="Withdraw my application"
                icon="return-up-back-outline"
                disabled={withdraw.isPending}
                onPress={() => {
                  trackCommunityEvent('community.volunteer_application.withdrawn', {
                    opportunityId: opportunity.opportunityId,
                  });
                  withdraw.mutate(opportunity.myApplicationId as string);
                }}
              />
            ) : opportunity.cannotApplyReason ? (
              <InlineRefusal icon="information-circle-outline" reason={opportunity.cannotApplyReason} />
            ) : null}
          </View>
        ) : null
      }
    >
      {!opportunity ? (
        <EmptyState
          icon="hand-left-outline"
          title="Opportunity not found"
          body="It may have been closed or filled."
        />
      ) : (
        <View>
          {opportunity.coverImage ? (
            <Image
              source={{ uri: opportunity.coverImage }}
              style={{ width: '100%', height: 170 }}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : null}

          <View className="px-5 pt-4">
            <Text
              accessibilityRole="header"
              style={{ color: tokens.color.text.primary }}
              className="text-xl font-black tracking-tight"
            >
              {opportunity.title}
            </Text>

            <View className="flex-row items-center mt-2">
              <Ionicons name="business-outline" size={13} color={tokens.color.text.placeholder} />
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[11px] font-bold ml-1.5 flex-1"
                numberOfLines={1}
              >
                {opportunity.organizationName} · {opportunity.cause}
              </Text>
              {opportunity.isVerified ? (
                <Ionicons
                  name="checkmark-circle"
                  size={14}
                  color={tokens.color.info.default}
                  accessibilityLabel="Verified organisation"
                />
              ) : null}
            </View>

            {/* The member's own state */}
            {opportunity.myApplicationStatus !== 'NotApplied' ? (
              <View className="mt-4">
                <CommunityStatusPanel state={applicationState} />
              </View>
            ) : null}

            {!isApplying ? (
              <>
                <Text
                  style={{ color: tokens.color.text.secondary }}
                  className="text-sm font-semibold leading-relaxed mt-4"
                >
                  {opportunity.description}
                </Text>

                <Section title="Details" style={{ marginHorizontal: -20 }}>
                  <View className="px-5">
                    <Card>
                      <DetailRow
                        label="Where"
                        icon="location-outline"
                        value={`${opportunity.location.addressLine}, ${opportunity.location.areaName}, ${opportunity.location.cityName}`}
                      />
                      {opportunity.startDate ? (
                        <DetailRow
                          label="When"
                          icon="calendar-outline"
                          value={
                            opportunity.endDate && opportunity.endDate !== opportunity.startDate
                              ? `${readableDate(opportunity.startDate)} – ${readableDate(opportunity.endDate)}`
                              : readableDate(opportunity.startDate)
                          }
                        />
                      ) : (
                        <DetailRow label="When" icon="calendar-outline" value="Ongoing" />
                      )}
                      <DetailRow
                        label="Places"
                        icon="people-outline"
                        value={
                          opportunity.isFull
                            ? 'Full'
                            : opportunity.capacity
                              ? `${Math.max(0, opportunity.capacity - opportunity.filledCount)} of ${opportunity.capacity} left`
                              : 'Places available'
                        }
                      />
                      {opportunity.applicationDeadline ? (
                        <DetailRow
                          label="Apply by"
                          icon="time-outline"
                          value={readableDate(opportunity.applicationDeadline)}
                        />
                      ) : null}
                      {opportunity.minimumAge ? (
                        <DetailRow
                          label="Age"
                          icon="person-outline"
                          value={`${opportunity.minimumAge} and over`}
                        />
                      ) : null}
                    </Card>
                  </View>
                </Section>

                {/* Shifts */}
                {opportunity.shifts.length > 0 ? (
                  <Section title="Shifts" style={{ marginHorizontal: -20 }}>
                    <View className="px-5">
                      {opportunity.shifts.map((shift) => (
                        <Card key={shift.shiftId} style={{ marginBottom: 10 }}>
                          <View
                            className="flex-row items-center"
                            accessible
                            accessibilityRole="text"
                            accessibilityLabel={`${shift.label}, ${readableDate(shift.date)}, ${shift.startTime} to ${shift.endTime}. ${
                              shift.isFull
                                ? 'Full.'
                                : `${shift.capacity - shift.filledCount} of ${shift.capacity} places left.`
                            }`}
                          >
                            <Ionicons
                              name={shift.isFull ? 'lock-closed-outline' : 'time-outline'}
                              size={16}
                              color={
                                shift.isFull ? tokens.color.warning.default : tokens.color.success.default
                              }
                            />
                            <View className="flex-1 ml-2.5">
                              <Text
                                style={{ color: tokens.color.text.primary }}
                                className="text-xs font-bold"
                              >
                                {shift.label}
                              </Text>
                              <Text
                                style={{ color: tokens.color.text.placeholder }}
                                className="text-[11px] font-semibold mt-0.5"
                              >
                                {readableDate(shift.date)} · {shift.startTime} – {shift.endTime}
                              </Text>
                            </View>
                            <Text
                              style={{
                                color: shift.isFull
                                  ? tokens.color.warning.default
                                  : tokens.color.success.default,
                              }}
                              className="text-[10px] font-black uppercase tracking-widest"
                            >
                              {shift.isFull
                                ? 'Full'
                                : `${shift.capacity - shift.filledCount} left`}
                            </Text>
                          </View>
                        </Card>
                      ))}
                    </View>
                  </Section>
                ) : null}

                {/* Skills and eligibility */}
                {opportunity.requiredSkills.length > 0 ? (
                  <Section title="Useful skills" style={{ marginHorizontal: -20 }}>
                    <View className="px-5 flex-row flex-wrap">
                      {opportunity.requiredSkills.map((skill) => (
                        <View
                          key={skill}
                          style={{ backgroundColor: tokens.color.neutral[100] }}
                          className="rounded-full px-3 py-1.5 mr-2 mb-2"
                        >
                          <Text
                            style={{ color: tokens.color.secondary[600] }}
                            className="text-[11px] font-bold"
                          >
                            {skill}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </Section>
                ) : null}

                {opportunity.requirements.length > 0 ? (
                  <Section title="What you need" style={{ marginHorizontal: -20 }}>
                    <View className="px-5">
                      <Card>
                        {opportunity.requirements.map((requirement) => (
                          <View
                            key={requirement.id}
                            className="flex-row items-start py-2"
                            accessible
                            accessibilityRole="text"
                            accessibilityLabel={`${requirement.label}. ${requirement.isMet ? 'You have this.' : 'Outstanding.'}`}
                          >
                            <Ionicons
                              name={requirement.isMet ? 'checkmark-circle' : 'alert-circle-outline'}
                              size={15}
                              color={
                                requirement.isMet
                                  ? tokens.color.success.default
                                  : tokens.color.warning.default
                              }
                              style={{ marginTop: 1.5 }}
                            />
                            <Text
                              style={{ color: tokens.color.text.secondary }}
                              className="text-xs font-semibold ml-2 flex-1"
                            >
                              {requirement.label}
                            </Text>
                          </View>
                        ))}
                      </Card>
                    </View>
                  </Section>
                ) : null}

                {opportunity.canManage ? (
                  <View className="px-5 mt-6">
                    <SecondaryButton
                      label="Review applicants"
                      icon="people-outline"
                      onPress={() =>
                        router.push(
                          `/community-life/volunteer/applicants?opportunityId=${opportunity.opportunityId}` as never
                        )
                      }
                    />
                  </View>
                ) : null}
              </>
            ) : (
              /* ── The application form ─────────────────────────────────── */
              <View className="mt-5">
                <Text
                  accessibilityRole="header"
                  style={{ color: tokens.color.text.primary }}
                  className="text-sm font-black tracking-tight mb-3"
                >
                  Your application
                </Text>

                {opportunity.shifts.length > 0 ? (
                  <View className="mb-4">
                    <Text
                      style={{ color: tokens.color.text.primary }}
                      className="text-xs font-bold mb-2"
                    >
                      Which shift?
                    </Text>
                    <View accessibilityRole="radiogroup" accessibilityLabel="Choose a shift">
                      {opportunity.shifts.map((shift) => {
                        const isSelected = shiftId === shift.shiftId;
                        return (
                          <Text
                            key={shift.shiftId}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: isSelected, disabled: shift.isFull }}
                            accessibilityLabel={`${shift.label}, ${shift.startTime} to ${shift.endTime}${shift.isFull ? ', full' : ''}`}
                            onPress={() => !shift.isFull && setShiftId(shift.shiftId)}
                            style={{
                              backgroundColor: isSelected
                                ? tokens.color.neutral[100]
                                : tokens.color.surface.card,
                              borderColor: isSelected
                                ? tokens.color.primary[500]
                                : tokens.color.border.default,
                              color: tokens.color.text.primary,
                              opacity: shift.isFull ? tokens.opacity.disabled : 1,
                              lineHeight: 44,
                            }}
                            className="rounded-xl border px-4 mb-2 text-xs font-bold overflow-hidden"
                          >
                            {shift.label} · {shift.startTime}–{shift.endTime}
                            {shift.isFull ? ' (full)' : ''}
                          </Text>
                        );
                      })}
                    </View>
                  </View>
                ) : null}

                <View className="mb-4">
                  <Text
                    style={{ color: tokens.color.text.primary }}
                    className="text-xs font-bold mb-1"
                    nativeID="volunteer-why"
                  >
                    Why would you like to help? *
                  </Text>
                  <TextInput
                    accessibilityLabel="Why would you like to help, required"
                    value={why}
                    onChangeText={setWhy}
                    multiline
                    numberOfLines={4}
                    placeholder="A sentence or two is plenty."
                    placeholderTextColor={tokens.color.text.placeholder}
                    style={{
                      backgroundColor: tokens.color.surface.card,
                      borderColor: tokens.color.border.default,
                      color: tokens.color.text.primary,
                      minHeight: 96,
                      textAlignVertical: 'top',
                    }}
                    className="rounded-xl border px-4 py-3 text-sm font-semibold"
                  />
                </View>

                <View className="mb-4">
                  <Text
                    style={{ color: tokens.color.text.primary }}
                    className="text-xs font-bold mb-1"
                    nativeID="volunteer-availability"
                  >
                    When are you free? (optional)
                  </Text>
                  <TextInput
                    accessibilityLabel="When are you free, optional"
                    value={availability}
                    onChangeText={setAvailability}
                    multiline
                    numberOfLines={3}
                    placeholder="Saturdays during term time, for example."
                    placeholderTextColor={tokens.color.text.placeholder}
                    style={{
                      backgroundColor: tokens.color.surface.card,
                      borderColor: tokens.color.border.default,
                      color: tokens.color.text.primary,
                      minHeight: 80,
                      textAlignVertical: 'top',
                    }}
                    className="rounded-xl border px-4 py-3 text-sm font-semibold"
                  />
                </View>

                <InlineRefusal
                  icon="information-circle-outline"
                  reason="The organiser reads this and decides. You will get a notification either way — approved, waitlisted or not this time."
                />

                <View className="mt-4">
                  <SecondaryButton label="Cancel" onPress={() => setIsApplying(false)} />
                </View>
              </View>
            )}
          </View>
        </View>
      )}
    </CommunityScreen>
  );
}
