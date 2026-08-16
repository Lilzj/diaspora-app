// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Billing (Frontend Phase 6)
//
// §17. The screen is deliberately split down the middle by what is real:
//
//   **Real.** Everything that has actually been charged. `GET
//   /wallets/me/transactions` filtered to the monetization types, each row
//   linking to the real transaction and its real receipt. Payment methods come
//   from `GET /financial/capabilities` — what this deployment actually accepts.
//   Refunds and failed payments are read off the real payment history.
//
//   **Not real, and marked.** Invoices and the next-charge forecast
//   (MON-GAP-009). There is no invoice aggregate and no tax field anywhere in
//   the contract, and the next charge is not simply the current plan price — a
//   promotion, a trial or a repricing policy all change it — so forecasting it
//   here would put a number in front of somebody that the platform never
//   promised.
//
// No payment credential is stored, displayed or logged anywhere on this screen.
// The method list is a list of *kinds* the deployment supports, not instruments
// the member holds — the platform never receives an instrument at all.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import { FinancialErrorView, StatusBadge } from '@/components/financial';
import {
  MonetizationEmpty,
  MonetizationGapNotice,
  MonetizationRow,
  MonetizationSection,
  SimulatedFigureBadge,
} from '@/components/monetization';
import { useBillingHistory } from '@/hooks/monetization';
import { useInvoices, useUpcomingCharges } from '@/hooks/monetization-gaps';
import {
  useFinancialCapabilities,
  useMySubscription,
  usePaymentHistory,
} from '@/hooks/financial';
import { usePricing } from '@/providers/pricing-provider';
import { useRefreshControl } from '@/hooks/usePullToRefresh';
import {
  describePaymentMethod,
  presentPaymentStatus,
  presentTransactionStatus,
} from '@/lib/financial-status';

export default function BillingScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const pricing = usePricing();

  const billing = useBillingHistory();
  const capabilities = useFinancialCapabilities();
  const subscriptionQuery = useMySubscription();
  const paymentsQuery = usePaymentHistory();
  const invoices = useInvoices();
  const upcoming = useUpcomingCharges();

  /**
   * Payments that need the member to do something.
   *
   * Read from the real payment history rather than inferred: a `Failed` payment
   * intent is the platform saying so, and a screen that decided a payment had
   * failed because a subscription looked odd would eventually be wrong.
   */
  const failedPayments = useMemo(
    () => (paymentsQuery.data ?? []).filter((payment) => payment.status === 'Failed'),
    [paymentsQuery.data]
  );

  /** Refunds, from the real payments that carry them. */
  const refunds = useMemo(
    () =>
      (paymentsQuery.data ?? [])
        .flatMap((payment) =>
          payment.refunds.map((refund) => ({ refund, paymentIntentId: payment.paymentIntentId }))
        )
        .sort((left, right) => Date.parse(right.refund.issuedAt) - Date.parse(left.refund.issuedAt)),
    [paymentsQuery.data]
  );

  if (billing.isError && billing.error) {
    return (
      <Shell>
        <FinancialErrorView error={billing.error} onRetry={billing.refetch} />
      </Shell>
    );
  }

  const subscription = subscriptionQuery.data;

  // The spinner used to be given a literal `false`, so the refetch ran but
  // the control snapped straight back and the pull read as inert.
  const refreshControl = useRefreshControl(billing.refetch);

  return (
    <Shell>
      <ScrollEndScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
        refreshControl={refreshControl}
      >
        {/* 1 — Anything that needs paying. Real. */}
        {failedPayments.length > 0 ? (
          <View className="mb-6" style={{ gap: 8 }}>
            {failedPayments.slice(0, 3).map((payment) => {
              const status = presentPaymentStatus(payment.status);
              return (
                <TouchableOpacity
                  key={payment.paymentIntentId}
                  onPress={() => router.push(`/wallet/payments/${payment.paymentIntentId}`)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`A payment of ${pricing.describe(payment.amount)} did not go through. ${
                    payment.failureMessage ?? status.description
                  }`}
                  style={{
                    backgroundColor: tokens.color.error.surface,
                    borderColor: `${tokens.color.error.default}44`,
                  }}
                  className="rounded-2xl border p-4"
                >
                  <StatusBadge status={status} size="sm" />
                  <Text
                    style={{ color: tokens.color.text.primary }}
                    className="text-sm font-bold leading-relaxed mt-2"
                  >
                    A payment of {pricing.format(payment.amount)} did not go through.
                  </Text>
                  {payment.failureMessage ? (
                    <Text
                      style={{ color: tokens.color.text.secondary }}
                      className="text-xs font-medium leading-relaxed mt-1"
                    >
                      {payment.failureMessage}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        {/* 2 — What is coming. Simulated. */}
        <MonetizationSection title="Coming up">
          {upcoming.isEnabled && upcoming.charges.length > 0 ? (
            <View
              style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
              className="rounded-2xl border overflow-hidden"
            >
              {upcoming.charges.map((charge, index) => (
                <View
                  key={`${charge.kind}-${charge.dueAt}`}
                  accessible
                  accessibilityRole="text"
                  accessibilityLabel={`${charge.description}. ${pricing.describe(charge.amount)} on ${new Date(
                    charge.dueAt
                  ).toLocaleDateString()}. ${
                    charge.isAutomatic ? 'Taken automatically.' : 'You will need to pay this.'
                  } This forecast is simulated.`}
                  style={{
                    borderTopColor: tokens.color.border.default,
                    borderTopWidth: index === 0 ? 0 : 1,
                  }}
                  className="px-4 py-3.5"
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 mr-3">
                      <Text style={{ color: tokens.color.text.primary }} className="text-sm font-semibold">
                        {charge.description}
                      </Text>
                      <Text
                        style={{ color: tokens.color.text.placeholder }}
                        className="text-[11px] font-medium mt-0.5"
                      >
                        {new Date(charge.dueAt).toLocaleDateString()} ·{' '}
                        {charge.isAutomatic ? 'taken automatically' : 'needs paying'}
                      </Text>
                    </View>
                    <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black">
                      {pricing.format(charge.amount)}
                    </Text>
                  </View>

                  <View className="mt-2">
                    <SimulatedFigureBadge label="Forecast simulated" />
                  </View>
                </View>
              ))}
            </View>
          ) : subscription?.currentPeriodEnd ? (
            // The real fallback: the *date* is served, the amount is not.
            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel={`Your plan ${
                subscription.cancelAtPeriodEnd ? 'ends' : 'renews'
              } on ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}. Diaspora cannot show the amount in advance yet.`}
              style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
              className="rounded-2xl border p-4"
            >
              <Text style={{ color: tokens.color.text.primary }} className="text-sm font-semibold leading-relaxed">
                Your plan {subscription.cancelAtPeriodEnd ? 'ends' : 'renews'} on{' '}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}.
              </Text>
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[11px] font-medium leading-relaxed mt-1.5"
              >
                Diaspora cannot show the exact amount in advance yet — a discount or a price change can
                affect it.
              </Text>
            </View>
          ) : (
            <View
              style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
              className="rounded-2xl border p-4"
            >
              <Text style={{ color: tokens.color.text.secondary }} className="text-sm font-semibold leading-relaxed">
                Nothing is due. You are on the free plan and have no promotions renewing.
              </Text>
            </View>
          )}
        </MonetizationSection>

        {/* 3 — What you have been charged. Real. */}
        <MonetizationSection
          title="What you have paid"
          subtitle="Every charge Diaspora has taken for a plan or a promotion."
        >
          {billing.isLoading ? (
            <View accessible accessibilityLabel="Loading your charges." style={{ gap: 8 }}>
              {[0, 1, 2].map((index) => (
                <View
                  key={index}
                  style={{ backgroundColor: tokens.color.neutral[100], opacity: 1 - index * 0.25 }}
                  className="rounded-2xl h-16"
                />
              ))}
            </View>
          ) : billing.charges.length === 0 ? (
            <MonetizationEmpty
              icon="receipt-outline"
              title="Nothing charged yet"
              message="When you subscribe to a plan or promote something, the charge appears here."
            />
          ) : (
            <View
              style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
              className="rounded-2xl border overflow-hidden"
            >
              {billing.charges.map((charge, index) => {
                const status = presentTransactionStatus(charge.status);

                return (
                  <TouchableOpacity
                    key={charge.transactionId}
                    onPress={() => router.push(`/wallet/transactions/${charge.transactionId}`)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${charge.description}. ${pricing.describe(charge.amount)}. ${
                      status.description
                    } ${new Date(charge.occurredAt).toLocaleDateString()}.`}
                    style={{
                      borderTopColor: tokens.color.border.default,
                      borderTopWidth: index === 0 ? 0 : 1,
                    }}
                    className="flex-row items-center px-4 py-3.5"
                  >
                    <View
                      style={{ backgroundColor: tokens.color.neutral[100] }}
                      className="w-9 h-9 rounded-xl items-center justify-center mr-3"
                    >
                      <Ionicons
                        name={
                          (charge.kind === 'subscription'
                            ? 'ribbon-outline'
                            : charge.kind === 'campaign'
                              ? 'albums-outline'
                              : 'megaphone-outline') as never
                        }
                        size={17}
                        color={tokens.color.text.secondary}
                      />
                    </View>

                    <View className="flex-1 mr-3">
                      <Text
                        style={{ color: tokens.color.text.primary }}
                        className="text-sm font-semibold"
                        numberOfLines={1}
                      >
                        {charge.description}
                      </Text>
                      <Text
                        style={{ color: tokens.color.text.placeholder }}
                        className="text-[11px] font-medium mt-0.5"
                      >
                        {new Date(charge.occurredAt).toLocaleDateString()}
                      </Text>
                    </View>

                    <View className="items-end">
                      <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black">
                        {pricing.format(charge.amount)}
                      </Text>
                      {charge.status !== 'Completed' ? (
                        <View className="mt-1">
                          <StatusBadge status={status} size="sm" iconless />
                        </View>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </MonetizationSection>

        {/* 4 — Refunds. Real, read-only: issuing one is staff-only on the wire. */}
        {refunds.length > 0 ? (
          <MonetizationSection title="Refunds">
            <View
              style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
              className="rounded-2xl border overflow-hidden"
            >
              {refunds.slice(0, 5).map((entry, index) => (
                <TouchableOpacity
                  key={entry.refund.refundId}
                  onPress={() => router.push(`/wallet/payments/${entry.paymentIntentId}`)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Refund of ${pricing.describe(entry.refund.amount)} on ${new Date(
                    entry.refund.issuedAt
                  ).toLocaleDateString()}.`}
                  style={{
                    borderTopColor: tokens.color.border.default,
                    borderTopWidth: index === 0 ? 0 : 1,
                  }}
                  className="flex-row items-center px-4 py-3.5"
                >
                  <Ionicons
                    name="return-down-back-outline"
                    size={18}
                    color={tokens.color.success.default}
                    style={{ marginRight: 12 }}
                  />
                  <View className="flex-1">
                    <Text style={{ color: tokens.color.text.primary }} className="text-sm font-semibold">
                      Refunded
                    </Text>
                    <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-medium mt-0.5">
                      {new Date(entry.refund.issuedAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={{ color: tokens.color.success.default }} className="text-sm font-black">
                    {pricing.format(entry.refund.amount)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </MonetizationSection>
        ) : null}

        {/* 5 — Invoices. Simulated. */}
        <MonetizationSection title="Invoices">
          {invoices.isEnabled && invoices.invoices.length > 0 ? (
            <>
              <MonetizationGapNotice gapKey="invoices" compact />
              <View
                style={{
                  backgroundColor: tokens.color.surface.card,
                  borderColor: tokens.color.border.default,
                }}
                className="rounded-2xl border overflow-hidden mt-3"
              >
                {invoices.invoices.map((invoice, index) => (
                  <MonetizationRow
                    key={invoice.invoiceId}
                    icon="document-text-outline"
                    label={`Invoice ${invoice.number}`}
                    hint={`${new Date(invoice.periodStart).toLocaleDateString()} to ${new Date(
                      invoice.periodEnd
                    ).toLocaleDateString()} · ${pricing.format(invoice.total)}`}
                    onPress={() => router.push(`/monetization/invoices/${invoice.invoiceId}`)}
                    isLast={index === invoices.invoices.length - 1}
                  />
                ))}
              </View>
            </>
          ) : (
            <MonetizationGapNotice
              gapKey="invoices"
              detail="Diaspora cannot produce a formal invoice yet. Every charge above is a real record of money that moved, and each one links to a receipt you can keep."
            />
          )}
        </MonetizationSection>

        {/* 6 — How you can pay. Real, from the deployment's own capabilities. */}
        <MonetizationSection
          title="How you can pay"
          subtitle="What Diaspora accepts where you are."
        >
          {capabilities.isLoading ? (
            <View style={{ backgroundColor: tokens.color.neutral[100] }} className="rounded-2xl h-20" />
          ) : (capabilities.data?.supportedMethods.length ?? 0) === 0 ? (
            <View
              style={{ backgroundColor: tokens.color.warning.surface }}
              className="rounded-2xl p-4"
            >
              <Text style={{ color: tokens.color.text.primary }} className="text-sm font-semibold leading-relaxed">
                No payment provider is set up here at the moment, so nothing can be bought right now.
              </Text>
            </View>
          ) : (
            <View
              style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
              className="rounded-2xl border overflow-hidden"
            >
              {capabilities.data!.supportedMethods.map((method, index) => {
                const described = describePaymentMethod(method);
                return (
                  <View
                    key={method}
                    accessible
                    accessibilityRole="text"
                    accessibilityLabel={`${described.label}. ${described.hint ?? ''}`}
                    style={{
                      borderTopColor: tokens.color.border.default,
                      borderTopWidth: index === 0 ? 0 : 1,
                    }}
                    className="flex-row items-center px-4 py-3.5"
                  >
                    <Ionicons
                      name={described.icon as never}
                      size={18}
                      color={tokens.color.text.secondary}
                      style={{ marginRight: 12 }}
                    />
                    <View className="flex-1">
                      <Text style={{ color: tokens.color.text.primary }} className="text-sm font-semibold">
                        {described.label}
                      </Text>
                      {described.hint ? (
                        <Text
                          style={{ color: tokens.color.text.placeholder }}
                          className="text-[11px] font-medium mt-0.5"
                        >
                          {described.hint}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[11px] font-medium leading-relaxed mt-3"
          >
            Diaspora never stores your card or bank details. They go straight to the payment provider and
            never reach us.
          </Text>
        </MonetizationSection>
      </ScrollEndScrollView>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { tokens } = useTheme();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="Billing" showBack />
      {children}
    </SafeAreaView>
  );
}
