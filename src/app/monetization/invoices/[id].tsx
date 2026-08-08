// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Invoice (Frontend Phase 6)
//
// ⚠ SIMULATED. MON-GAP-009. ⚠
//
// There is no invoice aggregate and no tax field anywhere in the certified
// contract. The screen exists because a business subscriber needs a document
// with a number, a period, line items and a total for their own accounts — and
// building it now means the eventual backend has a rendering to satisfy rather
// than a blank sheet.
//
// The tax line is shown even at zero, deliberately. A deployment that charges no
// VAT and an invoice that omits the concept are different things, and a business
// reading this needs to see that the zero is a statement rather than an
// omission.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import { FinancialErrorView } from '@/components/financial';
import { MonetizationEmpty, MonetizationGapNotice } from '@/components/monetization';
import { useInvoice } from '@/hooks/monetization-gaps';
import { usePricing } from '@/providers/pricing-provider';

export default function InvoiceScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const pricing = usePricing();

  const { id } = useLocalSearchParams<{ id: string }>();
  const { invoice, isLoading, error, isEnabled } = useInvoice(id);

  if (!isEnabled) {
    return (
      <Shell>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <MonetizationGapNotice gapKey="invoices" />
        </ScrollView>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <FinancialErrorView error={error} />
      </Shell>
    );
  }

  if (isLoading) {
    return (
      <Shell>
        <View className="p-5" accessible accessibilityLabel="Loading the invoice.">
          <View style={{ backgroundColor: tokens.color.neutral[100] }} className="rounded-3xl h-64" />
        </View>
      </Shell>
    );
  }

  if (!invoice) {
    return (
      <Shell>
        <View className="p-5">
          <MonetizationEmpty
            icon="document-text-outline"
            title="Invoice not found"
            message="This invoice is not on your account."
            action={{ label: 'Billing', onPress: () => router.replace('/monetization/billing') }}
          />
        </View>
      </Shell>
    );
  }

  return (
    <Shell>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
        <MonetizationGapNotice gapKey="invoices" compact />

        <View
          accessible
          accessibilityRole="summary"
          accessibilityLabel={`Invoice ${invoice.number}. ${invoice.status}. Covering ${new Date(
            invoice.periodStart
          ).toLocaleDateString()} to ${new Date(invoice.periodEnd).toLocaleDateString()}. Total ${pricing.describe(
            invoice.total
          )}.`}
          style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
          className="rounded-3xl border p-5 mt-5"
        >
          <View className="flex-row items-start justify-between mb-4">
            <View>
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[10px] font-black uppercase tracking-widest"
              >
                Invoice
              </Text>
              <Text style={{ color: tokens.color.text.primary }} className="text-xl font-black tracking-tight mt-0.5">
                {invoice.number}
              </Text>
            </View>

            <View
              style={{
                backgroundColor:
                  invoice.status === 'Paid' ? tokens.color.success.surface : tokens.color.warning.surface,
              }}
              className="rounded-full px-2.5 py-1"
            >
              <Text
                style={{
                  color:
                    invoice.status === 'Paid'
                      ? tokens.color.success.default
                      : tokens.color.warning.default,
                }}
                className="text-[10px] font-black uppercase tracking-wider"
              >
                {invoice.status}
              </Text>
            </View>
          </View>

          <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold">
            {new Date(invoice.periodStart).toLocaleDateString()} to{' '}
            {new Date(invoice.periodEnd).toLocaleDateString()}
          </Text>

          <View style={{ borderTopColor: tokens.color.border.default }} className="border-t mt-4 pt-4">
            {invoice.lines.map((line, index) => (
              <View
                key={`${line.description}-${index}`}
                accessible
                accessibilityRole="text"
                accessibilityLabel={`${line.description}. ${line.quantity} at ${pricing.describe(
                  line.unitPrice
                )}. Total ${pricing.describe(line.total)}.`}
                className="flex-row items-start justify-between py-2"
              >
                <View className="flex-1 mr-3">
                  <Text style={{ color: tokens.color.text.primary }} className="text-sm font-semibold">
                    {line.description}
                  </Text>
                  {line.quantity > 1 ? (
                    <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-medium mt-0.5">
                      {line.quantity} × {pricing.format(line.unitPrice)}
                    </Text>
                  ) : null}
                </View>
                <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold">
                  {pricing.format(line.total)}
                </Text>
              </View>
            ))}
          </View>

          <View style={{ borderTopColor: tokens.color.border.default }} className="border-t mt-3 pt-3">
            <Total label="Subtotal" value={pricing.format(invoice.subtotal)} />
            {/* Shown even at zero: an omitted tax line and a zero one say
                different things to somebody doing their books. */}
            <Total
              label={invoice.taxLabel ?? 'Tax'}
              value={pricing.format(invoice.tax)}
            />
            <Total label="Total" value={pricing.format(invoice.total)} emphasise />
          </View>

          {invoice.paidAt ? (
            <View className="flex-row items-center mt-4">
              <Ionicons name="checkmark-circle" size={15} color={tokens.color.success.default} />
              <Text style={{ color: tokens.color.success.default }} className="text-[11px] font-bold ml-1.5">
                Paid on {new Date(invoice.paidAt).toLocaleDateString()}
              </Text>
            </View>
          ) : null}
        </View>

        {invoice.paymentIntentId ? (
          <TouchableOpacity
            onPress={() => router.push(`/wallet/payments/${invoice.paymentIntentId}`)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="See the payment that settled this invoice"
            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
            className="flex-row items-center rounded-2xl border p-4 mt-3"
          >
            <Ionicons name="card-outline" size={18} color={tokens.color.text.secondary} style={{ marginRight: 12 }} />
            <Text style={{ color: tokens.color.text.primary }} className="flex-1 text-sm font-bold">
              See the payment
            </Text>
            <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
          </TouchableOpacity>
        ) : null}
      </ScrollView>
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
      <ScreenHeader title="Invoice" showBack />
      {children}
    </SafeAreaView>
  );
}

function Total({
  label,
  value,
  emphasise = false,
}: {
  label: string;
  value: string;
  emphasise?: boolean;
}) {
  const { tokens } = useTheme();

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}`}
      className="flex-row items-center justify-between py-1.5"
    >
      <Text
        style={{ color: emphasise ? tokens.color.text.primary : tokens.color.text.secondary }}
        className={emphasise ? 'text-sm font-black' : 'text-xs font-semibold'}
      >
        {label}
      </Text>
      <Text
        style={{ color: tokens.color.text.primary }}
        className={emphasise ? 'text-lg font-black tracking-tight' : 'text-xs font-bold'}
      >
        {value}
      </Text>
    </View>
  );
}
