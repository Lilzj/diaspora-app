// ─────────────────────────────────────────────────────────────────────────────
// Membership application (§6, §8)
//
// The flow the brief describes, in order:
//
//   Membership → Select Tier → Review Benefits → Checkout → Payment →
//   Confirmation → Membership Active
//
// Tier selection happened on the previous screen; this screen is the review,
// the questions, and the submit. What happens after submit depends on the
// programme, and all three outcomes are reachable:
//
//   * approval required   → `Pending`, and the member is told who is reviewing
//   * free, no approval   → `Active` immediately
//   * paid, no approval   → `Approved`, and the member goes to checkout
//
// §52: the submit button is disabled while the mutation is in flight *and* the
// idempotency key underneath is persisted, so a double tap and an app restart
// both resume the same application rather than creating a second one.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  Card,
  CommunityScreen,
  DetailRow,
  EmptyState,
  InlineRefusal,
  PrimaryButton,
  Section,
} from '@/components/community';
import { AmountDisplay, FinancialErrorInline } from '@/components/financial';
import { useMembershipProgramme, useSubmitMembershipApplication } from '@/hooks/community-life';
import { checkCommunityAccess, CommunityCapabilities } from '@/lib/community-access';
import { moneyProps, trackCommunityEvent } from '@/lib/community-analytics';
import { useAuthStore } from '@/store/auth';
import type { FinancialError } from '@/lib/financial-errors';
import { backOr } from '@/lib/navigation';

/**
 * The application questions.
 *
 * Hard-coded here rather than fetched, and flagged as such: the proposed
 * contract serves a form definition per programme (the same shape Phase 7's
 * grant application uses), and until it exists these three are a stand-in. They
 * are deliberately generic so nothing on this screen implies a question a real
 * organization asked.
 */
const QUESTIONS = [
  {
    id: 'why',
    label: 'Why would you like to join?',
    hint: 'A sentence or two is plenty.',
    required: true,
    multiline: true,
  },
  {
    id: 'connection',
    label: 'How are you connected to this community?',
    hint: 'For example, where you are from, or who introduced you.',
    required: false,
    multiline: true,
  },
  {
    id: 'contact',
    label: 'Best way to reach you',
    hint: 'Phone, WhatsApp or email — whichever you check.',
    required: false,
    multiline: false,
  },
];

export default function MembershipApplyScreen() {
  const { organizationId, tierId } = useLocalSearchParams<{
    organizationId: string;
    tierId: string;
  }>();
  const { tokens } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const { programme, isLoading, isError, error, refetch } =
    useMembershipProgramme(organizationId);
  const submit = useSubmitMembershipApplication();

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showValidation, setShowValidation] = useState(false);

  const tier = useMemo(
    () => programme?.tiers.find((candidate) => candidate.tierId === tierId) ?? null,
    [programme, tierId]
  );

  const refusal = checkCommunityAccess(
    CommunityCapabilities.ApplyMembership,
    accountState,
    isAuthenticated
  );

  const missingRequired = QUESTIONS.filter(
    (question) => question.required && !(answers[question.id] ?? '').trim()
  );

  const onSubmit = () => {
    if (!programme || !tier) return;

    if (missingRequired.length > 0) {
      setShowValidation(true);
      return;
    }

    trackCommunityEvent('community.membership.application.submitted', {
      organizationId: programme.organizationId,
      tierId: tier.tierId,
      billingPeriod: tier.billingPeriod,
      isFree: !tier.price,
      requiresApproval: programme.requiresApproval,
      ...moneyProps(tier.price),
    });

    submit.mutate(
      { organizationId: programme.organizationId, tierId: tier.tierId, answers },
      {
        onSuccess: (membership) => {
          if (membership.status === 'Active') {
            trackCommunityEvent('community.membership.activated', {
              organizationId: membership.organizationId,
              tierId: membership.tierId,
              isFree: true,
            });
          }
          router.replace(
            `/community-life/membership/manage?membershipId=${membership.membershipId}&justApplied=1` as never
          );
        },
      }
    );
  };

  return (
    <CommunityScreen
      title="Join this community"
      subtitle={programme?.organizationName}
      refusal={refusal}
      isLoading={isLoading}
      error={isError ? error : null}
      onRetry={refetch}
      footer={
        tier ? (
          <View>
            {submit.isError ? (
              <View className="mb-3">
                <FinancialErrorInline error={submit.error as FinancialError} />
              </View>
            ) : null}
            <PrimaryButton
              label={
                tier.price
                  ? 'Submit and continue to payment'
                  : programme?.requiresApproval
                    ? 'Send application'
                    : 'Join now'
              }
              busy={submit.isPending}
              disabled={submit.isPending}
              accessibilityHint={
                missingRequired.length > 0
                  ? 'Answer the required questions first'
                  : 'Sends your application to the organisation'
              }
              onPress={onSubmit}
            />
          </View>
        ) : null
      }
    >
      {!programme || !tier ? (
        <EmptyState
          icon="alert-circle-outline"
          title="That membership tier is not available"
          body="It may have been withdrawn while you were looking. Go back and choose again."
          action="Back to membership"
          onAction={() => backOr()}
        />
      ) : (
        <View className="px-5 pt-4">
          {/* What is being applied for */}
          <Card>
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-black uppercase tracking-widest"
            >
              You are applying for
            </Text>
            <View className="flex-row items-end justify-between mt-2">
              <View className="flex-1 pr-3">
                <Text
                  style={{ color: tokens.color.text.primary }}
                  className="text-base font-black tracking-tight"
                >
                  {tier.name}
                </Text>
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[11px] font-semibold mt-0.5"
                >
                  {programme.organizationName}
                </Text>
              </View>
              {tier.price ? (
                <View className="items-end">
                  <AmountDisplay value={tier.price} size="medium" accessibilityPrefix="Membership price" />
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[10px] font-bold"
                  >
                    {tier.billingPeriod === 'Yearly'
                      ? 'per year'
                      : tier.billingPeriod === 'Monthly'
                        ? 'per month'
                        : tier.billingPeriod === 'Quarterly'
                          ? 'per quarter'
                          : tier.billingPeriod === 'Lifetime'
                            ? 'once, for life'
                            : 'one off'}
                  </Text>
                </View>
              ) : (
                <Text
                  style={{ color: tokens.color.success.default }}
                  className="text-base font-black tracking-tight"
                >
                  Free
                </Text>
              )}
            </View>
          </Card>

          {/* Benefits review — §8's "Review Benefits" step */}
          {tier.benefits.length > 0 ? (
            <Section title="What you get" style={{ marginHorizontal: -20 }}>
              <View className="px-5">
                <Card>
                  {tier.benefits.map((benefit) => (
                    <View key={benefit.id} className="flex-row items-start py-2">
                      <Ionicons
                        name={benefit.isActive ? 'checkmark-circle' : 'ellipse-outline'}
                        size={15}
                        color={
                          benefit.isActive
                            ? tokens.color.success.default
                            : tokens.color.text.placeholder
                        }
                        style={{ marginTop: 1.5 }}
                      />
                      <View className="flex-1 ml-2">
                        <Text
                          style={{ color: tokens.color.text.primary }}
                          className="text-xs font-bold"
                        >
                          {benefit.title}
                          {benefit.isActive ? '' : ' (coming soon)'}
                        </Text>
                        {benefit.description ? (
                          <Text
                            style={{ color: tokens.color.text.placeholder }}
                            className="text-[11px] font-semibold mt-0.5 leading-relaxed"
                          >
                            {benefit.description}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </Card>
              </View>
            </Section>
          ) : null}

          {/* Questions */}
          <Section
            title="A few questions"
            subtitle="The organisation reads these before deciding"
            style={{ marginHorizontal: -20 }}
          >
            <View className="px-5">
              {QUESTIONS.map((question) => {
                const value = answers[question.id] ?? '';
                const isMissing = showValidation && question.required && !value.trim();

                return (
                  <View key={question.id} className="mb-4">
                    <Text
                      style={{ color: tokens.color.text.primary }}
                      className="text-xs font-bold mb-1"
                      nativeID={`question-${question.id}`}
                    >
                      {question.label}
                      {question.required ? ' *' : ''}
                    </Text>
                    <TextInput
                      accessibilityLabel={`${question.label}${question.required ? ', required' : ', optional'}`}
                      accessibilityHint={question.hint}
                      value={value}
                      onChangeText={(text) =>
                        setAnswers((current) => ({ ...current, [question.id]: text }))
                      }
                      multiline={question.multiline}
                      numberOfLines={question.multiline ? 4 : 1}
                      placeholder={question.hint}
                      placeholderTextColor={tokens.color.text.placeholder}
                      style={{
                        backgroundColor: tokens.color.surface.card,
                        borderColor: isMissing
                          ? tokens.color.border.error
                          : tokens.color.border.default,
                        color: tokens.color.text.primary,
                        minHeight: question.multiline ? 96 : 48,
                        textAlignVertical: question.multiline ? 'top' : 'center',
                      }}
                      className="rounded-xl border px-4 py-3 text-sm font-semibold"
                    />
                    {isMissing ? (
                      <Text
                        style={{ color: tokens.color.error.default }}
                        className="text-[11px] font-bold mt-1"
                        accessibilityLiveRegion="polite"
                      >
                        Please answer this before sending.
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </Section>

          {/* What happens next — every branch, stated up front */}
          <Section title="What happens next" style={{ marginHorizontal: -20 }}>
            <View className="px-5">
              <Card>
                <DetailRow
                  label="Step 1"
                  icon="paper-plane-outline"
                  value={
                    programme.requiresApproval
                      ? 'Your application goes to the organisation'
                      : 'Your membership is created'
                  }
                />
                {programme.requiresApproval ? (
                  <DetailRow
                    label="Step 2"
                    icon="hourglass-outline"
                    value="They review it and you get a notification either way"
                  />
                ) : null}
                {tier.price ? (
                  <DetailRow
                    label={programme.requiresApproval ? 'Step 3' : 'Step 2'}
                    icon="card-outline"
                    value="You pay through your Diaspora wallet, and your membership activates once the payment settles"
                  />
                ) : (
                  <DetailRow
                    label={programme.requiresApproval ? 'Step 3' : 'Step 2'}
                    icon="checkmark-circle-outline"
                    value="Your membership is active — there is nothing to pay"
                  />
                )}
              </Card>

              {tier.price ? (
                <View className="mt-3">
                  <InlineRefusal
                    icon="shield-checkmark-outline"
                    reason="Payment is handled by Diaspora's payment platform. Your card details never reach the organisation, and your membership only activates once the payment has actually settled."
                  />
                </View>
              ) : null}
            </View>
          </Section>
        </View>
      )}
    </CommunityScreen>
  );
}
