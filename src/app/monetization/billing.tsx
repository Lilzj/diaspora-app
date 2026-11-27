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
//   **The next charge is real too**, and it is served rather than forecast:
//   `GET /financial/subscriptions/me/upcoming` prices it on each request,
//   because the current plan price is not the answer — a promotion, a trial or
//   a repricing policy all change it, and a client multiplying a plan price
//   would be right most months and wrong on exactly the ones somebody notices.
//   It answers a **list**, and a row with `willRenew: false` is not a charge at
//   all: the amount is zero and the date is when access ends.
//
//   **Invoices are real too** since backend 9d0caaf closed MON-GAP-009:
//   `GET /financial/invoices/me`, numbered by the server, one per payment the
//   platform kept, read in every build. Each opens the invoice screen, which
//   can print the server's own document.
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
import { ScrollEndFlashList } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ListState } from '@/components/ListState';
import { useTheme } from '@/design-system';
import { FinancialErrorInline, StatusBadge } from '@/components/financial';
import { MonetizationSection } from '@/components/monetization';
import {
  InvoicesInPlaceOfRows,
  ListSectionHeading,
  ShowOlderInvoices,
  invoiceRowKey,
  renderInvoiceRow,
  useInvoiceRows,
  type InvoiceRow,
} from '@/components/monetization/BillingInvoices';
import {
  useBillingHistory,
  useInvoices,
  useUpcomingCharges,
} from '@/hooks/monetization';
import {
  useFinancialCapabilities,
  useMySubscription,
  usePaymentHistory,
} from '@/hooks/financial';
import { usePricing } from '@/providers/pricing-provider';
import { useRefreshControl } from '@/hooks/usePullToRefresh';
import type { FinancialError } from '@/lib/transport/financial-errors';
import {
  describePaymentMethod,
  presentPaymentStatus,
  presentTransactionStatus,
} from '@/lib/domain/financial-status';

/** Stable, so a list with no invoices to draw is the same empty list on every render. */
const NO_INVOICES: InvoiceRow[] = [];

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

  const refreshControl = useRefreshControl([billing.refetch, invoices.refetch]);

  // The invoices are the list's rows once they have been read and there are
  // some. Loading, a failed read and none at all are said in their place.
  const invoiceRows = useInvoiceRows(invoices.invoices, invoices.hasMore);
  const invoicesShown = invoices.isEnabled && !invoices.isLoading && invoiceRows.length > 0;

  // No whole-screen error any more: the charges read failing is said in its own
  // section below, and the sections that do not depend on it stay readable.
  const subscription = subscriptionQuery.data;

  return (
    <Shell>
      <ScrollEndFlashList
        // One list holds the screen (FARCH-004, 27 Nov 2026). The invoices page,
        // so they are its rows: the sections above them are its header and the
        // payment methods below are its footer.
        data={invoicesShown ? invoiceRows : NO_INVOICES}
        keyExtractor={invoiceRowKey}
        renderItem={renderInvoiceRow}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
        refreshControl={refreshControl}
        ListHeaderComponent={
          <>
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

            {/* 2 — What is coming. Real since B15.1 closed half of MON-GAP-009.

                `GET /financial/subscriptions/me/upcoming` is a **list**: a member
                may hold more than one subscription and the route does not choose
                between them. It is priced by the server on each request rather than
                forecast here, because a promotion, a trial or a repricing policy all
                change the figure — and a client multiplying a plan price would be
                right most months and wrong on exactly the ones somebody notices.

                It covers subscriptions and nothing else. A promotion due to renew is
                not in this list. Invoices for what was already paid are section 5. */}
            <MonetizationSection title="Coming up">
              <ListState
                loading={upcoming.isLoading}
                loadingLabel="Loading what is coming up"
                // A failed read is not "nothing is due", and used to be drawn as one. The
                // hook offers no refetch, so this says so without a retry it cannot keep.
                error={
                  upcoming.isError && upcoming.charges.length === 0 && upcoming.error ? (
                    <FinancialErrorInline error={upcoming.error} />
                  ) : null
                }
                isEmpty={upcoming.charges.length === 0 && !subscription?.currentPeriodEnd}
                empty={{
                  icon: 'calendar-outline',
                  title: 'Nothing is due. You are on the free plan and have no promotions renewing.',
                }}
              >
                {upcoming.charges.length > 0 ? (
                  <View
                    style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
                    className="rounded-2xl border overflow-hidden"
                  >
                    {upcoming.charges.map((charge, index) => {
                      // `willRenew: false` inverts what every field on the row means:
                      // the amount is zero and the date is when **access ends**, not
                      // when money is taken. Rendering it as a forthcoming payment
                      // would tell a member who has already cancelled that they are
                      // about to be charged again.
                      const when = new Date(charge.chargeAt).toLocaleDateString();
                      const headline = charge.willRenew
                        ? `Renews on ${when}`
                        : `Access ends on ${when}`;

                      return (
                        <View
                          key={charge.subscriptionId}
                          accessible
                          accessibilityRole="text"
                          accessibilityLabel={
                            charge.willRenew
                              ? `Your plan renews on ${when}. ${pricing.describe(charge.amount)} will be taken.`
                              : `Your plan does not renew. Access ends on ${when}. Nothing further will be charged.`
                          }
                          style={{
                            borderTopColor: tokens.color.border.default,
                            borderTopWidth: index === 0 ? 0 : 1,
                          }}
                          className="px-4 py-3.5"
                        >
                          <View className="flex-row items-center justify-between">
                            <View className="flex-1 mr-3">
                              <Text style={{ color: tokens.color.text.primary }} className="text-sm font-semibold">
                                {headline}
                              </Text>
                              <Text
                                style={{ color: tokens.color.text.placeholder }}
                                className="text-[11px] font-medium mt-0.5"
                              >
                                {charge.willRenew
                                  ? 'Taken automatically'
                                  : 'Nothing further will be charged'}
                              </Text>
                            </View>
                            {charge.willRenew ? (
                              <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black">
                                {pricing.format(charge.amount)}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : subscription?.currentPeriodEnd ? (
                  // The fallback, and it is now a narrower case than it was. The
                  // upcoming-charges route answers for a subscription the platform can
                  // price; an empty list next to a live `currentPeriodEnd` means it
                  // could not, so the served date is shown without an amount rather
                  // than a figure this screen invented.
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
                ) : null}
              </ListState>
            </MonetizationSection>

            {/* 3 — What you have been charged. Real. */}
            <MonetizationSection
              title="What you have paid"
              subtitle="Every charge Diaspora has taken for a plan or a promotion."
            >
              <ListState
                loading={billing.isLoading}
                skeleton={
                  <View accessible accessibilityLabel="Loading your charges." style={{ gap: 8 }}>
                    {[0, 1, 2].map((index) => (
                      <View
                        key={index}
                        style={{ backgroundColor: tokens.color.neutral[100], opacity: 1 - index * 0.25 }}
                        className="rounded-2xl h-16"
                      />
                    ))}
                  </View>
                }
                error={
                  billing.isError && billing.charges.length === 0 && billing.error ? (
                    <FinancialErrorInline error={billing.error} onRetry={billing.refetch} />
                  ) : null
                }
                isEmpty={billing.charges.length === 0}
                empty={{
                  icon: 'receipt-outline',
                  title: 'Nothing charged yet',
                  message: 'When you subscribe to a plan or promote something, the charge appears here.',
                }}
              >
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
              </ListState>
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

            {/* 5 — Invoices. Real: `GET /financial/invoices/me`, in every build.
                One per purchase, subscription charge or other payment the platform
                kept; giving has receipts instead. A failed read is said to have
                failed — it is never drawn as "no invoices". */}
            <ListSectionHeading
              title="Invoices"
              subtitle="A numbered invoice for each plan, purchase or promotion you have paid for."
            />
          </>
        }
        ListEmptyComponent={<InvoicesInPlaceOfRows invoices={invoices} />}
        ListFooterComponent={
          <>
            {/* The end of the invoices section: the card's bottom edge while older
                invoices remain, then the section's own margin. */}
            <View className="mb-7">
              {invoicesShown && invoices.hasMore ? (
                <ShowOlderInvoices isLoadingMore={invoices.isLoadingMore} onPress={invoices.loadMore} />
              ) : null}
            </View>

            {/* 6 — How you can pay. Real, from the deployment's own capabilities. */}
            <MonetizationSection
              title="How you can pay"
              subtitle="What Diaspora accepts where you are."
            >
              <ListState
                loading={capabilities.isLoading}
                skeleton={
                  <View
                    accessible
                    accessibilityLabel="Loading how you can pay."
                    style={{ backgroundColor: tokens.color.neutral[100] }}
                    className="rounded-2xl h-20"
                  />
                }
                // A failed read is not "no payment provider", and used to be drawn as one.
                error={
                  capabilities.isError && !capabilities.data ? (
                    <FinancialErrorInline error={capabilities.error as FinancialError} onRetry={capabilities.refetch} />
                  ) : null
                }
                isEmpty={(capabilities.data?.supportedMethods.length ?? 0) === 0}
                empty={{
                  icon: 'card-outline',
                  title: 'No payment provider is set up here at the moment, so nothing can be bought right now.',
                }}
              >
                <View
                  style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
                  className="rounded-2xl border overflow-hidden"
                >
                  {(capabilities.data?.supportedMethods ?? []).map((method, index) => {
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
              </ListState>

              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[11px] font-medium leading-relaxed mt-3"
              >
                Diaspora never stores your card or bank details. They go straight to the payment provider and
                never reach us.
              </Text>
            </MonetizationSection>
          </>
        }
      />
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
