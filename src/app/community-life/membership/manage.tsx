// ─────────────────────────────────────────────────────────────────────────────
// One membership — status, payment, renewal, cancellation, history, receipt
// (§6, §8)
//
// This is where the phase's safety rule is most visible. The payment button
// calls `useMembershipCheckout`, which:
//
//   1. creates a **real** B15 payment intent,
//   2. authorizes and captures it through **real** B15 routes,
//   3. **re-reads** the payment from B15 — the only thing allowed to say the
//      member paid,
//   4. and only then records the community-side activation.
//
// If step 3 comes back anything other than `Captured`/`Settled`, this screen
// shows `PaymentFailed` with a retry and the membership stays exactly where it
// was. Nothing here concludes a payment succeeded because a request returned
// 200. §8, §18, §45.
//
// The receipt is B15's `receiptReference`, not one this screen composed.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { useNotification } from '@/providers/notification-provider';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  Card,
  CommunityScreen,
  CommunityStatusBadge,
  CommunityStatusPanel,
  DetailRow,
  EmptyState,
  InlineRefusal,
  PrimaryButton,
  SecondaryButton,
  Section,
  readableDate,
} from '@/components/community';
import { AmountDisplay, FinancialErrorInline } from '@/components/financial';
import {
  useCancelMembership,
  useMembership,
  useMembershipCheckout,
  useRenewMembership,
} from '@/hooks/community-life';
import {
  canCancelMembership,
  canPayForMembership,
  canRenewMembership,
  describeMembership,
  isPaymentSuccessful,
  membershipGrantsBenefits,
} from '@/lib/community-state';
import { checkCommunityAccess, CommunityCapabilities } from '@/lib/community-access';
import { moneyProps, trackCommunityEvent } from '@/lib/community-analytics';
import { useAuthStore } from '@/store/auth';
import type { FinancialError } from '@/lib/financial-errors';

export default function MembershipManageScreen() {
  const { showAlert } = useNotification();
  const { membershipId, justApplied } = useLocalSearchParams<{
    membershipId: string;
    justApplied?: string;
  }>();
  const { tokens } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const { membership, isLoading, isError, error, refetch } = useMembership(membershipId);
  const checkout = useMembershipCheckout();
  const renew = useRenewMembership();
  const cancel = useCancelMembership();

  const [paymentOutcome, setPaymentOutcome] = useState<'none' | 'failed'>('none');

  useEffect(() => {
    if (membership) {
      trackCommunityEvent('community.membership.viewed', {
        organizationId: membership.organizationId,
        tierId: membership.tierId,
        status: membership.status,
      });
    }
  }, [membership?.membershipId]);

  const payRefusal = checkCommunityAccess(
    CommunityCapabilities.PayMembership,
    accountState,
    isAuthenticated
  );

  const state = describeMembership(membership?.status ?? 'NotAMember');
  const showPay = membership ? canPayForMembership(membership.status) && Boolean(membership.price) : false;
  const showRenew = membership ? canRenewMembership(membership.status) : false;
  const showCancel = membership ? canCancelMembership(membership.status) : false;

  const onPay = () => {
    if (!membership?.price) return;

    trackCommunityEvent('community.membership.payment.started', {
      organizationId: membership.organizationId,
      tierId: membership.tierId,
      billingPeriod: membership.billingPeriod,
      ...moneyProps(membership.price),
    });

    checkout.mutate(
      {
        membershipId: membership.membershipId,
        tierId: membership.tierId,
        amount: membership.price.amount,
        currency: membership.price.currency,
        methodKind: 'Card',
      },
      {
        onSuccess: ({ payment, membership: updated }) => {
          // §8: the authoritative status decides, not the call succeeding.
          if (!isPaymentSuccessful(payment.status)) {
            setPaymentOutcome('failed');
            trackCommunityEvent('community.membership.payment.failed', {
              organizationId: membership.organizationId,
              tierId: membership.tierId,
              status: String(payment.status),
            });
            return;
          }

          setPaymentOutcome('none');
          if (updated) {
            trackCommunityEvent('community.membership.activated', {
              organizationId: updated.organizationId,
              tierId: updated.tierId,
              isFree: false,
              ...moneyProps(updated.price),
            });
          }
        },
      }
    );
  };

  const onCancel = () => {
    if (!membership) return;

    showAlert({ type: 'warning', title: 'Cancel this membership?', message: membershipGrantsBenefits(membership.status)
        ? 'You will lose access to the member benefits. You can apply again later.'
        : 'This withdraws your application.', buttons: [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel membership',
          style: 'destructive',
          onPress: () => {
            trackCommunityEvent('community.membership.cancelled', {
              organizationId: membership.organizationId,
              tierId: membership.tierId,
              status: membership.status,
            });
            cancel.mutate({ membershipId: membership.membershipId });
          },
        },
      ] });
  };

  return (
    <CommunityScreen
      title="Your membership"
      subtitle={membership?.organizationName}
      isLoading={isLoading}
      error={isError ? error : null}
      onRetry={refetch}
      footer={
        membership ? (
          <View>
            {checkout.isError ? (
              <View className="mb-3">
                <FinancialErrorInline error={checkout.error as FinancialError} />
              </View>
            ) : null}

            {showPay ? (
              <PrimaryButton
                label={membership.status === 'PaymentFailed' ? 'Try the payment again' : 'Pay and activate'}
                icon="card-outline"
                busy={checkout.isPending}
                disabled={checkout.isPending || !payRefusal.allowed}
                accessibilityHint={
                  payRefusal.allowed
                    ? 'Takes payment through your Diaspora wallet'
                    : payRefusal.message
                }
                onPress={onPay}
              />
            ) : showRenew ? (
              <PrimaryButton
                label="Renew membership"
                icon="refresh-outline"
                busy={renew.isPending}
                disabled={renew.isPending}
                onPress={() => {
                  trackCommunityEvent('community.membership.renewal.started', {
                    organizationId: membership.organizationId,
                    tierId: membership.tierId,
                  });
                  renew.mutate(membership.membershipId);
                }}
              />
            ) : null}
          </View>
        ) : null
      }
    >
      {!membership ? (
        <EmptyState
          icon="card-outline"
          title="Membership not found"
          body="It may have been cancelled or removed."
          action="Find a community"
          onAction={() => router.replace('/community-life/membership')}
        />
      ) : (
        <View className="px-5 pt-4">
          {justApplied === '1' ? (
            <View className="mb-4">
              <InlineRefusal
                icon="checkmark-circle-outline"
                reason={
                  membership.status === 'Pending'
                    ? 'Your application has been sent. The organisation will let you know — you will get a notification either way.'
                    : membership.status === 'Active'
                      ? 'You are in. Welcome to the community.'
                      : 'Your application is in. There is one more step below.'
                }
              />
            </View>
          ) : null}

          <CommunityStatusPanel
            state={state}
            extra={membership.decisionReason ?? undefined}
          />

          {/* A failed payment is an outcome, rendered as one. */}
          {paymentOutcome === 'failed' ? (
            <View className="mt-3">
              <InlineRefusal
                icon="card-outline"
                reason="That payment did not go through, and you have not been charged. You can try again — nothing about your application has changed."
              />
            </View>
          ) : null}

          {/* Membership facts */}
          <Section title="Details" style={{ marginHorizontal: -20 }}>
            <View className="px-5">
              <Card>
                <DetailRow label="Community" icon="business-outline" value={membership.organizationName} />
                <DetailRow label="Tier" icon="pricetag-outline" value={membership.tierName} />
                <DetailRow
                  label="Price"
                  icon="cash-outline"
                  value={
                    membership.price ? (
                      <View className="flex-row items-center">
                        <AmountDisplay
                          value={membership.price}
                          size="small"
                          accessibilityPrefix="Membership price"
                        />
                        <Text
                          style={{ color: tokens.color.text.placeholder }}
                          className="text-[11px] font-bold ml-1.5"
                        >
                          {membership.billingPeriod === 'Yearly'
                            ? 'per year'
                            : membership.billingPeriod === 'Monthly'
                              ? 'per month'
                              : membership.billingPeriod === 'Quarterly'
                                ? 'per quarter'
                                : membership.billingPeriod === 'Lifetime'
                                  ? 'once, for life'
                                  : 'one off'}
                        </Text>
                      </View>
                    ) : (
                      'Free'
                    )
                  }
                />
                {membership.joinedAt ? (
                  <DetailRow
                    label="Joined"
                    icon="calendar-outline"
                    value={readableDate(membership.joinedAt)}
                  />
                ) : null}
                {membership.expiresAt ? (
                  <DetailRow
                    label="Runs until"
                    icon="time-outline"
                    value={readableDate(membership.expiresAt)}
                  />
                ) : null}
                {membership.renewalDueAt ? (
                  <DetailRow
                    label="Renewal due"
                    icon="refresh-outline"
                    value={readableDate(membership.renewalDueAt)}
                  />
                ) : null}
              </Card>
            </View>
          </Section>

          {/* Receipt — B15's reference, not one composed here */}
          {membership.payment ? (
            <Section title="Payment" style={{ marginHorizontal: -20 }}>
              <View className="px-5">
                <Card>
                  <DetailRow
                    label="Status"
                    icon="card-outline"
                    value={String(membership.payment.paymentStatus)}
                  />
                  <DetailRow
                    label="Amount"
                    icon="cash-outline"
                    value={
                      <AmountDisplay
                        value={membership.payment.amount}
                        size="small"
                        accessibilityPrefix="Amount paid"
                      />
                    }
                  />
                  {membership.payment.receiptReference ? (
                    <DetailRow
                      label="Receipt"
                      icon="receipt-outline"
                      value={membership.payment.receiptReference}
                    />
                  ) : null}
                  {membership.payment.completedAt ? (
                    <DetailRow
                      label="Paid on"
                      icon="calendar-outline"
                      value={readableDate(membership.payment.completedAt)}
                    />
                  ) : null}
                </Card>

                <View className="mt-3">
                  <SecondaryButton
                    label="See it in your wallet"
                    icon="wallet-outline"
                    onPress={() =>
                      router.push(
                        `/wallet/payments/${membership.payment?.paymentIntentId}` as never
                      )
                    }
                  />
                </View>

                {membership.payment.bindingSource === 'simulated' ? (
                  <View className="mt-3">
                    <InlineRefusal
                      icon="flask-outline"
                      reason="The payment above is real and is in your wallet. What is simulated is the record connecting it to this membership — Diaspora's backend cannot yet say that a payment bought a community membership."
                    />
                  </View>
                ) : null}
              </View>
            </Section>
          ) : null}

          {/* Benefits, only where the membership actually grants them */}
          {membership.benefits.length > 0 ? (
            <Section
              title="Your benefits"
              subtitle={
                membershipGrantsBenefits(membership.status)
                  ? undefined
                  : 'Paused until your membership is active'
              }
              style={{ marginHorizontal: -20 }}
            >
              <View className="px-5">
                <Card style={{ opacity: membershipGrantsBenefits(membership.status) ? 1 : 0.55 }}>
                  {membership.benefits.map((benefit) => (
                    <View key={benefit.id} className="flex-row items-start py-2">
                      <Ionicons
                        name={
                          membershipGrantsBenefits(membership.status) && benefit.isActive
                            ? 'checkmark-circle'
                            : 'ellipse-outline'
                        }
                        size={15}
                        color={
                          membershipGrantsBenefits(membership.status) && benefit.isActive
                            ? tokens.color.success.default
                            : tokens.color.text.placeholder
                        }
                        style={{ marginTop: 1.5 }}
                      />
                      <Text
                        style={{ color: tokens.color.text.secondary }}
                        className="text-xs font-semibold ml-2 flex-1"
                      >
                        {benefit.title}
                      </Text>
                    </View>
                  ))}
                </Card>
              </View>
            </Section>
          ) : null}

          {/* History — the audit trail */}
          {membership.history.length > 0 ? (
            <Section title="History" style={{ marginHorizontal: -20 }}>
              <View className="px-5">
                <Card>
                  {membership.history
                    .slice()
                    .reverse()
                    .map((entry) => (
                      <View
                        key={entry.id}
                        className="flex-row items-center py-2.5"
                        accessible
                        accessibilityRole="text"
                        accessibilityLabel={`${describeMembership(entry.status).label} on ${readableDate(entry.occurredAt)}, by ${entry.actor}`}
                      >
                        <CommunityStatusBadge state={describeMembership(entry.status)} size="small" />
                        <View className="flex-1 ml-3">
                          <Text
                            style={{ color: tokens.color.text.placeholder }}
                            className="text-[11px] font-bold"
                          >
                            {readableDate(entry.occurredAt)} ·{' '}
                            {entry.actor === 'Member'
                              ? 'you'
                              : entry.actor === 'Organization'
                                ? 'the organisation'
                                : 'Diaspora'}
                          </Text>
                          {entry.reason ? (
                            <Text
                              style={{ color: tokens.color.text.secondary }}
                              className="text-[11px] font-semibold mt-0.5"
                            >
                              {entry.reason}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    ))}
                </Card>
              </View>
            </Section>
          ) : null}

          {showCancel ? (
            <View className="mt-6">
              <SecondaryButton
                label={
                  membership.status === 'Pending' || membership.status === 'Draft'
                    ? 'Withdraw application'
                    : 'Cancel membership'
                }
                icon="close-circle-outline"
                disabled={cancel.isPending}
                onPress={onCancel}
              />
            </View>
          ) : null}

          <View className="mt-3">
            <SecondaryButton
              label="View the community"
              icon="business-outline"
              onPress={() => router.push(`/community-life/org/${membership.organizationId}` as never)}
            />
          </View>
        </View>
      )}
    </CommunityScreen>
  );
}
