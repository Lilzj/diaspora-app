// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Invoice (Frontend Phase 6, connected 20 Oct 2026)
//
// `GET /financial/invoices/{id}`, owner only, in every build. Everything on this
// screen is the server's: the number, the period, the lines, the totals, the
// status. Nothing is added up here.
//
// ── Tax ──────────────────────────────────────────────────────────────────────
//
// The server reports tax as zero with no label, because nothing an invoice is
// drawn from records a rate or a tax amount. The line is still shown — an
// omitted tax line and a zero one say different things to somebody doing their
// books — but it is labelled with what the server named, and when it named
// nothing it says "No tax was recorded". The simulation this replaced printed
// "VAT", which nobody had charged.
//
// ── The document ─────────────────────────────────────────────────────────────
//
// The printable version is the server's own HTML at `/invoices/{id}/document`.
// It is owner-only and wants the bearer token, so it cannot be opened in a
// browser: the app fetches it through the API client and prints it to a PDF
// for the share sheet, unaltered.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { useTheme } from '@/design-system';
import { FinancialErrorView, StatusBadge } from '@/components/financial';
import { MonetizationEmpty } from '@/components/monetization';
import { useInvoice } from '@/hooks/monetization';
import { usePricing } from '@/providers/pricing-provider';
import { useNotification } from '@/providers/notification-provider';
import { fetchInvoiceDocument } from '@/lib/financial-api';
import { shareHtmlAsPdf } from '@/lib/receipt-document';
import { isZero } from '@/lib/money';
import { describeInvoiceKind, presentInvoiceStatus } from '@/lib/financial-status';

export default function InvoiceScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const pricing = usePricing();
  const { showToast } = useNotification();
  const [isSharing, setSharing] = useState(false);

  const { id } = useLocalSearchParams<{ id: string }>();
  const { invoice, isLoading, error, isEnabled } = useInvoice(id);

  if (!isEnabled) {
    return (
      <Shell>
        <View className="p-5">
          <MonetizationEmpty
            icon="lock-closed-outline"
            title="Invoices are not available on this account"
            message="Your account cannot see payments yet, so its invoices cannot be shown."
            action={{ label: 'Billing', onPress: () => router.replace('/monetization/billing') }}
          />
        </View>
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

  const status = presentInvoiceStatus(invoice.status);
  const taxLabel = invoice.taxLabel?.trim() ? invoice.taxLabel : null;

  const share = async () => {
    setSharing(true);
    let outcome: Awaited<ReturnType<typeof shareHtmlAsPdf>>;
    try {
      const html = await fetchInvoiceDocument(invoice.invoiceId);
      outcome = await shareHtmlAsPdf(html, `Invoice ${invoice.number}`);
    } catch {
      outcome = { ok: false, reason: 'failed' };
    }
    setSharing(false);

    if (!outcome.ok) {
      showToast({
        type: 'error',
        title: 'Invoice not shared',
        message:
          outcome.reason === 'unavailable'
            ? 'This device has nothing to share files with.'
            : 'Diaspora could not fetch the printable invoice. Try again.',
      });
    }
  };

  return (
    <Shell>
      <ScrollEndScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
        <View
          accessible
          accessibilityRole="summary"
          accessibilityLabel={`Invoice ${invoice.number}. ${status.label}. ${describeInvoiceKind(
            invoice.kind
          )}. Covering ${new Date(invoice.periodStart).toLocaleDateString()} to ${new Date(
            invoice.periodEnd
          ).toLocaleDateString()}. Total ${pricing.describe(invoice.total)}.`}
          style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
          className="rounded-3xl border p-5"
        >
          <View className="flex-row items-start justify-between mb-4">
            <View className="flex-1 mr-3">
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[10px] font-black uppercase tracking-widest"
              >
                Invoice · {describeInvoiceKind(invoice.kind)}
              </Text>
              <Text style={{ color: tokens.color.text.primary }} className="text-xl font-black tracking-tight mt-0.5">
                {invoice.number}
              </Text>
            </View>

            <StatusBadge status={status} size="sm" />
          </View>

          <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-semibold">
            {new Date(invoice.periodStart).toLocaleDateString()} to{' '}
            {new Date(invoice.periodEnd).toLocaleDateString()}
          </Text>
          <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-medium mt-0.5">
            Issued {new Date(invoice.issuedAt).toLocaleDateString()}
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
            {invoice.taxLines.length > 0 ? (
              invoice.taxLines.map((tax, index) => (
                <Total key={`${tax.label}-${index}`} label={tax.label} value={pricing.format(tax.amount)} />
              ))
            ) : (
              // Shown even at zero, with the server's label or none at all.
              <Total
                label={taxLabel ?? 'Tax'}
                value={pricing.format(invoice.tax)}
                note={taxLabel || !isZero(invoice.tax) ? undefined : 'No tax was recorded on this payment.'}
              />
            )}
            <Total label="Total" value={pricing.format(invoice.total)} emphasise />
            {!isZero(invoice.refunded) ? (
              <Total label="Refunded since" value={pricing.format(invoice.refunded)} />
            ) : null}
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

        <View className="mt-4">
          <Button
            label={isSharing ? 'Preparing…' : 'Save or share as PDF'}
            variant="outline"
            disabled={isSharing}
            onPress={() => void share()}
          />
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
      <ScreenHeader title="Invoice" showBack />
      {children}
    </SafeAreaView>
  );
}

function Total({
  label,
  value,
  note,
  emphasise = false,
}: {
  label: string;
  value: string;
  note?: string;
  emphasise?: boolean;
}) {
  const { tokens } = useTheme();

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}${note ? `. ${note}` : ''}`}
      className="py-1.5"
    >
      <View className="flex-row items-center justify-between">
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
      {note ? (
        <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-medium mt-0.5">
          {note}
        </Text>
      ) : null}
    </View>
  );
}
