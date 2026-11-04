// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator verification (Frontend Phase 7, §8)
//
// The whole application lifecycle on one screen, because it is one thing that
// changes state rather than eleven screens: not eligible → eligible → draft →
// submitted → under review → more information → approved / rejected → appeal.
//
// **The frontend decides nothing here.** §8: "Do not implement identity
// verification logic inside the frontend. Trust/Identity remain authoritative."
// Three consequences, all visible in the code:
//
//   * Every requirement's `isMet` is served. There is no comparison anywhere in
//     this file between what the member has done and what the programme asks
//     for.
//   * The identity requirement routes to `/verification/identity` — the real
//     Trust flow — and this screen collects nothing about it.
//   * Submitting is refused server-side when requirements are unmet, and that
//     refusal renders. The disabled button is a courtesy, not the control.
//
// The acknowledgement step exists because a programme application is a
// declaration, and a member should have to say "yes, I have done these" rather
// than have the app assert it for them.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import { useAuthStore } from '@/store/auth';
import {
  CreatorCard,
  CreatorScreen,
  CreatorSection,
  CreatorStatusChip,
  RequirementList,
} from '@/components/creator-economy';
import { FinancialErrorInline } from '@/components/financial';
import {
  useCreatorAccess,
  useCreatorVerification,
  useCreatorVerificationActions,
} from '@/hooks/creator-economy';
import { checkCreatorAccess, CreatorCapabilities } from '@/lib/creator-access';
import { presentVerificationState } from '@/lib/creator-economy';
import { trackCreatorEvent } from '@/lib/creator-analytics';
import { formatRelativeTime } from '@/utils/format';
import type { FinancialError } from '@/lib/financial-errors';
import type { CreatorRequirement } from '@/types/creator-economy';
import { appRouteFor } from '@/lib/server-route';

const APPEAL_MINIMUM = 20;

export default function CreatorVerificationScreen() {
  const { showAlert } = useNotification();
  const { tokens } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const query = useCreatorVerification();
  const actions = useCreatorVerificationActions();
  const access = useCreatorAccess();

  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [appealReason, setAppealReason] = useState('');
  const [isAppealing, setAppealing] = useState(false);

  useEffect(() => {
    trackCreatorEvent('creator.verification.viewed', {
      state: String(query.verification?.state ?? 'unknown'),
    });
  }, [query.verification?.state]);

  const refusal = checkCreatorAccess(CreatorCapabilities.ApplyVerification, {
    accountState,
    isAuthenticated,
    creatorStatus: access.creatorStatus,
  });

  const verification = query.verification;
  const presentation = verification ? presentVerificationState(verification.state) : null;

  const unmet = useMemo(
    () => (verification?.requirements ?? []).filter((requirement) => !requirement.isMet),
    [verification]
  );

  const allAcknowledged =
    verification !== null &&
    verification !== undefined &&
    verification.requirements.every((requirement) => acknowledged.has(requirement.key));

  const canSubmit = unmet.length === 0 && allAcknowledged && !actions.submit.isPending;

  const openRequirement = useCallback((requirement: CreatorRequirement) => {
    if (requirement.actionRoute) router.push(appRouteFor(requirement.actionRoute) as never);
  }, []);

  const submit = useCallback(() => {
    if (!verification) return;

    actions.submit.mutate(
      {
        acknowledgedRequirements: Array.from(acknowledged),
        evidenceIds: verification.evidence.map((item) => item.evidenceId),
      },
      {
        onSuccess: () => {
          trackCreatorEvent(
            verification.state === 'Rejected' || verification.state === 'MoreInformationRequired'
              ? 'creator.verification.resubmitted'
              : 'creator.verification.submitted'
          );
        },
      }
    );
  }, [acknowledged, actions.submit, verification]);

  const appeal = useCallback(() => {
    actions.appeal.mutate(appealReason.trim(), {
      onSuccess: () => {
        setAppealing(false);
        setAppealReason('');
        trackCreatorEvent('creator.verification.appealed');
      },
    });
  }, [actions.appeal, appealReason]);

  const start = useCallback(() => {
    actions.start.mutate(undefined, {
      onSuccess: () => trackCreatorEvent('creator.verification.started'),
    });
  }, [actions.start]);

  const isTerminalGood = verification?.state === 'Approved';
  const isInReview =
    verification?.state === 'Submitted' ||
    verification?.state === 'UnderReview' ||
    verification?.state === 'AppealPending';
  const canApply =
    verification?.state === 'Eligible' ||
    verification?.state === 'Draft' ||
    verification?.state === 'MoreInformationRequired' ||
    verification?.state === 'Rejected' ||
    verification?.state === 'Expired';

  return (
    <CreatorScreen
      title="Creator verification"
      subtitle="Diaspora reviews this — the app only shows you where it is"
      gapKey="verification"
      gapDetail="The creator programme's application, review and decision are simulated. Identity and country verification underneath are real, and this screen sends you to them rather than collecting anything itself."
      isEnabled={query.isEnabled}
      refusal={refusal}
      isLoading={query.isLoading}
      error={query.error}
      onRetry={query.refetch}
      footer={
        canApply && access.canApplyVerification ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                canSubmit
                  ? 'Submit your creator verification application'
                  : unmet.length > 0
                    ? `${unmet.length} requirement${unmet.length === 1 ? '' : 's'} still to complete before you can apply`
                    : 'Acknowledge every requirement before submitting'
              }
              accessibilityState={{ disabled: !canSubmit, busy: actions.submit.isPending }}
              disabled={!canSubmit}
              onPress={submit}
              style={{
                backgroundColor: canSubmit ? tokens.color.primary[500] : tokens.color.neutral[200],
              }}
              className="rounded-full py-4 items-center"
            >
              <Text
                style={{ color: canSubmit ? '#FFFFFF' : tokens.color.text.disabled }}
                className="text-xs font-black uppercase tracking-wider"
              >
                {actions.submit.isPending
                  ? 'Submitting…'
                  : verification?.state === 'MoreInformationRequired' || verification?.state === 'Rejected'
                    ? 'Resubmit'
                    : 'Submit application'}
              </Text>
            </Pressable>

            {actions.submit.isError ? (
              <View className="mt-2.5">
                <FinancialErrorInline error={actions.submit.error as FinancialError} />
              </View>
            ) : null}
          </>
        ) : undefined
      }
    >
      {verification && presentation ? (
        <View className="px-5 pt-5">
          {/* ── Where it is ──────────────────────────────────────────────── */}
          <CreatorCard style={{ marginBottom: 20 }}>
            <View className="flex-row items-start">
              <View className="flex-1 mr-3">
                <CreatorStatusChip presentation={presentation} />
                <Text
                  style={{ color: tokens.color.text.primary }}
                  className="text-[13px] font-semibold mt-2.5 leading-relaxed"
                >
                  {presentation.description}
                </Text>
              </View>
            </View>

            <View
              style={{ borderTopColor: tokens.color.border.default }}
              className="border-t mt-4 pt-3.5"
            >
              {verification.submittedAt ? (
                <TimelineLine label="Submitted" at={verification.submittedAt} />
              ) : null}
              {verification.reviewStartedAt ? (
                <TimelineLine label="Review started" at={verification.reviewStartedAt} />
              ) : null}
              {verification.decidedAt ? (
                <TimelineLine label="Decided" at={verification.decidedAt} />
              ) : null}
              {verification.expiresAt && isTerminalGood ? (
                <TimelineLine label="Renews" at={verification.expiresAt} />
              ) : null}
              {verification.respondByAt ? (
                <TimelineLine label="Respond by" at={verification.respondByAt} isUrgent />
              ) : null}
            </View>
          </CreatorCard>

          {/* ── The reviewer said something ──────────────────────────────── */}
          {verification.decisionReason ? (
            <View
              style={{
                backgroundColor:
                  verification.state === 'Approved'
                    ? tokens.color.success.surface
                    : tokens.color.error.surface,
              }}
              className="rounded-2xl p-4 mb-5"
              accessible
              accessibilityLabel={`Decision: ${verification.decisionReason}`}
            >
              <Text
                style={{
                  color:
                    verification.state === 'Approved'
                      ? tokens.color.success.default
                      : tokens.color.error.default,
                }}
                className="text-[10px] font-black uppercase tracking-widest mb-1.5"
              >
                What the reviewer said
              </Text>
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-[13px] font-semibold leading-relaxed"
              >
                {verification.decisionReason}
              </Text>
            </View>
          ) : null}

          {verification.informationRequested && verification.informationRequested.length > 0 ? (
            <View
              style={{ backgroundColor: tokens.color.warning.surface }}
              className="rounded-2xl p-4 mb-5"
              accessible
              accessibilityLabel={`The reviewer needs: ${verification.informationRequested.join('. ')}`}
            >
              <Text
                style={{ color: tokens.color.warning.default }}
                className="text-[10px] font-black uppercase tracking-widest mb-2"
              >
                What the reviewer needs
              </Text>
              {verification.informationRequested.map((item, index) => (
                <Text
                  key={index}
                  style={{ color: tokens.color.text.primary }}
                  className="text-[13px] font-semibold leading-relaxed mb-1"
                >
                  • {item}
                </Text>
              ))}
            </View>
          ) : null}

          {/* ── Requirements ─────────────────────────────────────────────── */}
          <CreatorSection
            title="Requirements"
            subtitle="Diaspora decides whether each is met. The app just shows you."
          >
            <CreatorCard>
              <RequirementList
                requirements={verification.requirements}
                onAction={openRequirement}
              />
            </CreatorCard>
          </CreatorSection>

          {/* ── Acknowledgement ──────────────────────────────────────────── */}
          {canApply && access.canApplyVerification ? (
            <CreatorSection
              title="Before you apply"
              subtitle="Confirm each of these is true. Diaspora checks them again."
            >
              <CreatorCard padded={false}>
                {verification.requirements.map((requirement, index) => {
                  const isTicked = acknowledged.has(requirement.key);
                  const isLast = index === verification.requirements.length - 1;

                  return (
                    <Pressable
                      key={requirement.key}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isTicked }}
                      accessibilityLabel={`Confirm: ${requirement.label}`}
                      onPress={() =>
                        setAcknowledged((current) => {
                          const next = new Set(current);
                          if (next.has(requirement.key)) next.delete(requirement.key);
                          else next.add(requirement.key);
                          return next;
                        })
                      }
                      style={{
                        borderBottomColor: tokens.color.border.default,
                        borderBottomWidth: isLast ? 0 : 1,
                      }}
                      className="flex-row items-center px-4 py-3.5"
                    >
                      <View
                        style={{
                          borderColor: isTicked ? tokens.color.primary[500] : tokens.color.border.default,
                          backgroundColor: isTicked ? tokens.color.primary[500] : 'transparent',
                        }}
                        className="w-5 h-5 rounded-md border-2 items-center justify-center mr-3"
                      >
                        {isTicked ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : null}
                      </View>

                      <Text
                        style={{ color: tokens.color.text.primary }}
                        className="text-[13px] font-semibold flex-1 leading-snug"
                      >
                        {requirement.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </CreatorCard>
            </CreatorSection>
          ) : null}

          {/* ── Evidence ─────────────────────────────────────────────────── */}
          {verification.evidence.length > 0 ? (
            <CreatorSection
              title="Supporting material"
              subtitle="Held by Diaspora. The app never stores a copy."
            >
              <CreatorCard padded={false}>
                {verification.evidence.map((item, index) => (
                  <View
                    key={item.evidenceId}
                    accessible
                    accessibilityLabel={`${item.label}. ${item.status}.${
                      item.rejectionReason ? ` ${item.rejectionReason}` : ''
                    }`}
                    style={{
                      borderBottomColor: tokens.color.border.default,
                      borderBottomWidth: index === verification.evidence.length - 1 ? 0 : 1,
                    }}
                    className="flex-row items-center px-4 py-3.5"
                  >
                    <Ionicons
                      name={
                        item.status === 'Accepted'
                          ? 'checkmark-circle'
                          : item.status === 'Rejected'
                            ? 'close-circle'
                            : 'hourglass-outline'
                      }
                      size={17}
                      color={
                        item.status === 'Accepted'
                          ? tokens.color.success.default
                          : item.status === 'Rejected'
                            ? tokens.color.error.default
                            : tokens.color.warning.default
                      }
                    />
                    <View className="flex-1 ml-3">
                      <Text
                        style={{ color: tokens.color.text.primary }}
                        className="text-[13px] font-bold"
                      >
                        {item.label}
                      </Text>
                      <Text
                        style={{ color: tokens.color.text.placeholder }}
                        className="text-[11px] font-semibold mt-0.5"
                      >
                        {item.rejectionReason ?? `${item.status} · ${formatRelativeTime(item.uploadedAt)}`}
                      </Text>
                    </View>
                  </View>
                ))}
              </CreatorCard>
            </CreatorSection>
          ) : null}

          {/* ── Under review ─────────────────────────────────────────────── */}
          {isInReview ? (
            <View
              style={{ backgroundColor: tokens.color.info.surface }}
              className="rounded-2xl p-4 mb-5 flex-row items-start"
            >
              <Ionicons
                name="time-outline"
                size={16}
                color={tokens.color.info.default}
                style={{ marginTop: 1 }}
              />
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-[12px] font-semibold ml-2 flex-1 leading-relaxed"
              >
                There is nothing else to do. Diaspora will tell you when a reviewer has decided,
                and it will appear in your notifications.
              </Text>
            </View>
          ) : null}

          {/* ── Appeal ───────────────────────────────────────────────────── */}
          {verification.canAppeal ? (
            <CreatorSection title="Appeal">
              <CreatorCard>
                {isAppealing ? (
                  <>
                    <TextInput
                      accessibilityLabel="Why are you appealing?"
                      accessibilityHint={`At least ${APPEAL_MINIMUM} characters`}
                      value={appealReason}
                      onChangeText={setAppealReason}
                      multiline
                      placeholder="Tell the review team what they should reconsider, and why."
                      placeholderTextColor={tokens.color.text.disabled}
                      style={{ color: tokens.color.text.primary, minHeight: 100 }}
                      className="text-sm font-medium leading-6"
                      textAlignVertical="top"
                    />

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Send your appeal"
                      accessibilityState={{
                        disabled: appealReason.trim().length < APPEAL_MINIMUM,
                        busy: actions.appeal.isPending,
                      }}
                      disabled={
                        appealReason.trim().length < APPEAL_MINIMUM || actions.appeal.isPending
                      }
                      onPress={appeal}
                      style={{
                        backgroundColor:
                          appealReason.trim().length >= APPEAL_MINIMUM
                            ? tokens.color.primary[500]
                            : tokens.color.neutral[200],
                      }}
                      className="rounded-full py-3.5 items-center mt-3"
                    >
                      <Text
                        style={{
                          color:
                            appealReason.trim().length >= APPEAL_MINIMUM
                              ? '#FFFFFF'
                              : tokens.color.text.disabled,
                        }}
                        className="text-[11px] font-black uppercase tracking-wider"
                      >
                        {actions.appeal.isPending ? 'Sending…' : 'Send appeal'}
                      </Text>
                    </Pressable>

                    {actions.appeal.isError ? (
                      <View className="mt-2.5">
                        <FinancialErrorInline error={actions.appeal.error as FinancialError} />
                      </View>
                    ) : null}
                  </>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Appeal this decision"
                    onPress={() => setAppealing(true)}
                  >
                    <Text
                      style={{ color: tokens.color.primary[500] }}
                      className="text-[13px] font-black"
                    >
                      Appeal this decision
                    </Text>
                    <Text
                      style={{ color: tokens.color.text.placeholder }}
                      className="text-[11px] font-medium mt-1 leading-relaxed"
                    >
                      A different reviewer will look at it.
                    </Text>
                  </Pressable>
                )}
              </CreatorCard>
            </CreatorSection>
          ) : null}

          {/* ── Not eligible ─────────────────────────────────────────────── */}
          {verification.state === 'NotEligible' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Check whether you can apply now"
              onPress={() => {
                if (unmet.length > 0) {
                  showAlert({ type: 'success', title: 'Not yet', message: `You still have ${unmet.length} requirement${unmet.length === 1 ? '' : 's'} to complete.` });
                  return;
                }
                start();
              }}
              style={{ backgroundColor: tokens.color.surface.elevated }}
              className="rounded-2xl p-4 mb-6 flex-row items-center"
            >
              <Ionicons name="refresh-outline" size={17} color={tokens.color.text.secondary} />
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-[13px] font-bold ml-2.5 flex-1"
              >
                Check again
              </Text>
              <Ionicons name="chevron-forward" size={15} color={tokens.color.text.placeholder} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </CreatorScreen>
  );
}

function TimelineLine({
  label,
  at,
  isUrgent = false,
}: {
  label: string;
  at: string;
  isUrgent?: boolean;
}) {
  const { tokens } = useTheme();

  return (
    <View className="flex-row items-center justify-between py-1">
      <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-bold">
        {label}
      </Text>
      <Text
        style={{ color: isUrgent ? tokens.color.warning.default : tokens.color.text.secondary }}
        className="text-[11px] font-black"
      >
        {formatRelativeTime(at)}
      </Text>
    </View>
  );
}
