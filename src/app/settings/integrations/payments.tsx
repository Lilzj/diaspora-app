// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Payment integration settings (Frontend Phase 16, §26 · §28 · §61)
//
// What this deployment can actually do with money, read from B15's **real**
// `/financial/capabilities` rather than assumed.
//
// ── The three things this screen states that a member cannot get elsewhere ───
//
//   **Which payment methods this deployment accepts.** `supportedMethods` is a
//   real field on a real contract and it varies by deployment. A wallet screen
//   that offered a card in a deployment with no card gateway would fail at the
//   last step, after the member had decided to pay.
//
//   **That no card details are held here.** §28's rule, said to the member
//   rather than only observed in the code: the instrument is collected by the
//   payment provider's own sheet and never passes through Diaspora, which is
//   why Diaspora cannot store or log one. The saved-methods list is read from
//   the served `GET /financial/payment-methods/me` in every build, and its
//   empty answer is shown as that statement — not as a gap, and not as "you
//   have not added one", because nothing can be added.
//
//   **That a payment is confirmed by the provider, not by this app.** §26 in
//   plain language. It is the sentence that explains why a payment can say
//   "confirming" after the member has finished, and it prevents the most
//   expensive misunderstanding this application can produce.
//
// The wallet itself is Phase 5's and is not duplicated here — §27 forbids a
// second payment implementation and this screen links to it.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useNotification } from '@/providers/notification-provider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { useTheme } from '@/design-system';
import { usePaymentMethods } from '@/hooks/integrations';
import { canInitiatePayment } from '@/lib/integrations-api';
import { fetchCapabilities, financialKeys } from '@/lib/financial-api';
import { useBottomInset } from '@/components/layout/bottom-inset';
import {
  IntegrationGapNotice,
  IntegrationStatusBadge,
  IntegrationErrorNotice,
} from '@/components/integrations';

export default function PaymentIntegrationScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { tokens } = useTheme();
  const { showAlert } = useNotification();
  const {
    methods,
    isLoading: methodsLoading,
    isError: methodsError,
    isAnswered: methodsAnswered,
    refetch: refetchMethods,
    forget: forgetMethod,
    isForgetting,
  } = usePaymentMethods();

  const capabilities = useQuery({
    queryKey: financialKeys.capabilities(),
    queryFn: () => fetchCapabilities(),
    staleTime: 5 * 60_000,
  });

  const canPay = canInitiatePayment(capabilities.data ?? null);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: tokens.color.surface.background }}>
      <ScreenHeader title="Payments" showBack />

      <ScrollEndScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: bottomInset }}>
        <Heading title="Status" />

        {capabilities.isLoading ? (
          <ActivityIndicator color={tokens.color.primary[500]} />
        ) : capabilities.error ? (
          <IntegrationErrorNotice
            message="Diaspora could not check what payment methods are available."
            hint="Check your connection and try again."
          />
        ) : (
          <View
            style={{ borderColor: tokens.color.border.default }}
            className="border rounded-2xl p-4 mb-3"
          >
            <IntegrationStatusBadge
              status={canPay ? 'PARTIALLY_CONNECTED' : 'UNAVAILABLE'}
              mode={canPay ? 'BACKEND_CONNECTED' : 'NOT_CONFIGURED'}
              showDescription
            />

            {canPay ? (
              <>
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[10px] font-black uppercase tracking-widest mt-4 mb-1.5"
                >
                  Accepted here
                </Text>
                {/* `?.` guards the response, not the array inside it. */}
                {(capabilities.data?.supportedMethods ?? []).map((method) => (
                  <Text
                    key={method}
                    style={{ color: tokens.color.text.primary }}
                    className="text-xs font-semibold leading-relaxed"
                  >
                    • {describeMethod(method)}
                  </Text>
                ))}
              </>
            ) : (
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-xs font-semibold leading-relaxed mt-3"
              >
                No payment provider is set up for this deployment, so payments cannot be started.
                This is a configuration state, not something you have done.
              </Text>
            )}
          </View>
        )}

        {/* ── Saved methods — §26 ────────────────────────────────────────── */}
        <Heading title="Saved payment methods" />

        {/* Read from `GET /financial/payment-methods/me` in every build. The
            platform keeps no reusable instrument, so the answer is normally an
            empty list — and that list is a statement from the server, said
            plainly, not a gap and not "you have not added one yet": there is
            no way to add one. A failed read is a failure, never "none". */}
        {methodsLoading ? (
          <ActivityIndicator color={tokens.color.primary[500]} />
        ) : methodsError ? (
          <View className="mb-3">
            <IntegrationErrorNotice
              message="Diaspora could not check for saved payment methods."
              hint="Check your connection and try again."
            />
            <Button label="Try again" variant="outline" onPress={() => void refetchMethods()} />
          </View>
        ) : !methodsAnswered ? null : methods.length === 0 ? (
          <View
            style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
            className="rounded-2xl border p-4 mb-3"
            accessible
            accessibilityRole="text"
          >
            <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold leading-relaxed">
              Diaspora does not keep saved cards or accounts.
            </Text>
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-xs font-semibold leading-relaxed mt-1.5"
            >
              You enter your card details on the payment provider’s own page each time you pay, and
              nothing reusable is stored — by Diaspora or on its behalf. So there is nothing to add,
              choose or remove here.
            </Text>
          </View>
        ) : (
          methods.map((method) => (
            <View
              key={method.id}
              style={{ borderColor: tokens.color.border.default }}
              className="border rounded-2xl p-4 mb-2.5 flex-row items-center"
            >
              <View
                className="flex-1"
                accessible
                accessibilityRole="text"
                accessibilityLabel={`${method.brand ?? method.kind}${
                  method.last4 ? ` ending ${method.last4}` : ''
                }${method.isDefault ? ', default' : ''}`}
              >
                <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold">
                  {method.brand ?? describeMethod(method.kind)}
                  {method.last4 ? ` •••• ${method.last4}` : ''}
                </Text>
                {method.expiryMonth && method.expiryYear ? (
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[11px] font-medium mt-0.5"
                  >
                    Expires {String(method.expiryMonth).padStart(2, '0')}/{method.expiryYear}
                  </Text>
                ) : null}
                {method.isDefault ? (
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[9px] font-black uppercase tracking-widest mt-1"
                  >
                    Default
                  </Text>
                ) : null}
              </View>
              <Button
                label="Remove"
                variant="outline"
                disabled={isForgetting}
                onPress={() =>
                  showAlert({
                    type: 'question',
                    title: 'Remove this payment method?',
                    message: 'Diaspora will forget it. You can still pay by entering your details at checkout.',
                    buttons: [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: () => {
                          // An unanswered removal is not a refusal: the list is
                          // re-read either way, and shows what the server holds.
                          forgetMethod(method.id).catch(() => {
                            showAlert({
                              type: 'warning',
                              title: 'Not confirmed',
                              message:
                                'Diaspora could not confirm the removal. The list shows what is stored now.',
                            });
                          });
                        },
                      },
                    ],
                  })
                }
              />
            </View>
          ))
        )}

        {/* ── Security — §26, §28, in plain language ─────────────────────── */}
        <Heading title="How payments work here" />

        <View
          style={{
            backgroundColor: tokens.color.surface.card,
            borderColor: tokens.color.border.default,
          }}
          className="rounded-2xl border p-4 mb-3"
        >
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-xs font-semibold leading-relaxed mb-2"
          >
            Your card details are collected by the payment provider, not by Diaspora. Diaspora never
            sees or stores your full card number, which is why it cannot be leaked from here.
          </Text>
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-xs font-semibold leading-relaxed"
          >
            A payment is complete when the payment provider confirms it — not when this app returns
            from the payment screen. That is why you may briefly see “confirming” after you have
            finished paying.
          </Text>
        </View>

        <View className="mb-4">
          <IntegrationGapNotice
            gapKey="paymentGatewaySession"
            detail="Collecting a card on this device needs a payment provider that is not set up in this build. Paying from your wallet balance works normally."
          />
        </View>

        <Button label="Open wallet" variant="outline" onPress={() => router.push('/wallet')} />
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}

/** B15's method kinds, in the member's words rather than the enum's. */
function describeMethod(kind: string): string {
  switch (kind) {
    case 'Card':
      return 'Debit or credit card';
    case 'BankTransfer':
      return 'Bank transfer';
    case 'MobileMoney':
      return 'Mobile money';
    case 'Wallet':
      return 'Your Diaspora balance';
    case 'ManualTransfer':
      return 'Manual transfer';
    case 'Credit':
      return 'Platform credit';
    default:
      return kind;
  }
}

function Heading({ title }: { title: string }) {
  const { tokens } = useTheme();
  return (
    <Text
      style={{ color: tokens.color.text.primary }}
      className="text-xs font-black uppercase tracking-widest mb-2.5 mt-4"
      accessibilityRole="header"
    >
      {title}
    </Text>
  );
}
