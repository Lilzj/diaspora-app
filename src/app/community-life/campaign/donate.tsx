// ─────────────────────────────────────────────────────────────────────────────
// Donate to a campaign (§12, §13)
//
// **This screen moves real money.** The flow is B15's, unchanged:
//
//   Campaign → Donate → Amount → Options → Payment → Confirmation → Receipt
//
// `useDonateToCampaign` posts to `POST /financial/donations` with the campaign's
// real `causeCode` and B15's idempotency key. The status shown afterwards is
// B15's `GivingStatus` — §13 forbids marking a donation successful from
// frontend state, and there is no branch on this screen that does.
//
// A campaign with no `causeCode` cannot be donated to at all, and this screen
// refuses rather than simulating a gift. A receipt for money that never moved
// would be worse than no donate button.
//
// §12: anonymity, the public name and the message are all the donor's choice,
// and the consequences of each are stated before they choose — an anonymous
// donation cannot appear in their own history afterwards, because B15 stores no
// donor identifier on one.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { Switch, Text, TextInput, View } from 'react-native';
import { Linking } from 'react-native';
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
} from '@/components/community';
import { AmountDisplay, FinancialErrorInline } from '@/components/financial';
import {
  useCampaign,
  useCommunityAccess,
  useDonateToCampaign,
  useMyRecurringDonations,
} from '@/hooks/community-life';
import { describeGiving } from '@/lib/community-state';
import { checkCommunityAccess, CommunityCapabilities } from '@/lib/community-access';
import { trackCommunityEvent } from '@/lib/community-analytics';
import { useAuthStore } from '@/store/auth';
import type { FinancialError } from '@/lib/financial-errors';
import { parseNextAction } from '@/lib/integrations/payments';
import type { Donation } from '@/types/financial';
import { backOr } from '@/lib/navigation';

/** Preset amounts in major units. §12 asks for presets plus a custom amount. */
const PRESETS = [5, 10, 25, 50, 100];

export default function DonateScreen() {
  const { campaignId } = useLocalSearchParams<{ campaignId: string }>();
  const { tokens } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);
  const access = useCommunityAccess();

  const { campaign, isLoading, isError, error, refetch, isEnabled } = useCampaign(campaignId);
  const donate = useDonateToCampaign();
  /**
   * The caller's standing donations, read so the confirmation can be a fact.
   *
   * Fetched unconditionally rather than only after a recurring gift, because a
   * query started inside a success branch would render its loading state as
   * "no repeating gift" for the second it takes to answer — and "we could not
   * confirm it" is a claim that must not be made while the answer is still in
   * flight.
   */
  const { data: standingDonations } = useMyRecurringDonations();

  const [preset, setPreset] = useState<number | null>(25);
  const [customAmount, setCustomAmount] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [message, setMessage] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [completed, setCompleted] = useState<Donation | null>(null);

  const currency = campaign?.progress.raised.value.currency ?? 'GBP';
  const symbol = campaign?.progress.raised.value.symbol ?? '£';

  const amount = useMemo(() => {
    if (preset !== null) return preset;
    const parsed = Number(customAmount.replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [preset, customAmount]);

  const refusal = checkCommunityAccess(CommunityCapabilities.Donate, accountState, isAuthenticated);
  const canCollect = Boolean(campaign?.causeCode && campaign.canDonate);

  /**
   * A live standing gift to this campaign's cause, if the server has one.
   *
   * `Cancelled` and `Completed` are excluded: the list carries every state on
   * purpose, and a cancelled schedule listed here would report a repeating gift
   * that has stopped.
   */
  const standingGift = useMemo(
    () =>
      campaign?.causeCode
        ? standingDonations.find(
            (row) =>
              row.causeCode === campaign.causeCode &&
              row.status !== 'Cancelled' &&
              row.status !== 'Completed'
          ) ?? null
        : null,
    [standingDonations, campaign?.causeCode]
  );

  const onDonate = () => {
    if (!campaign?.causeCode || amount <= 0) return;

    trackCommunityEvent('community.donation.started', {
      campaignId: campaign.campaignId,
      campaignCategory: campaign.category,
      isAnonymous,
      isRecurring: isRecurring && !isAnonymous,
      currency,
    });

    donate.mutate(
      {
        campaignId: campaign.campaignId,
        causeCode: campaign.causeCode,
        amountMajor: amount,
        currency,
        isAnonymous,
        message: message.trim() || undefined,
        // Never both. The server refuses an anonymous repeating gift, and
        // sending the interval anyway would turn a donation the member meant
        // to make into a 400 after the switch was disabled in front of them.
        recurringIntervalMonths: isRecurring && !isAnonymous ? 1 : null,
      },
      {
        onSuccess: (donation) => {
          setCompleted(donation);

          // **Send them to the gateway.** Authorising returns a hosted payment
          // page on `nextAction`, and this screen used to drop it: the intent
          // was authorised, Stripe was holding a checkout session, and the
          // member sat on "We are confirming this with the payment provider"
          // with no way to pay and nothing coming. Its sibling in
          // `wallet/donate.tsx` renders `PaymentSheet`, which has opened the
          // page since Phase 2 — which is why one donate route worked and this
          // one did not, from the same campaign.
          //
          // `parseNextAction` returns a URL only when it is plain HTTPS.
          // A payment flow is the highest-value phishing surface in the app: the
          // member has already decided to pay and expects to be sent somewhere,
          // so anything else is left unopened rather than followed.
          const action = parseNextAction(donation.payment?.nextAction);

          if (action?.url) {
            void Linking.openURL(action.url.trim());
          }
          // The event carries B15's status, not an assumption about it.
          trackCommunityEvent(
            donation.status === 'Completed'
              ? 'community.donation.completed'
              : donation.status === 'Failed'
                ? 'community.donation.failed'
                : 'community.donation.started',
            {
              campaignId: campaign.campaignId,
              status: String(donation.status),
              isAnonymous,
              currency,
            }
          );
        },
      }
    );
  };

  // ── Confirmation and receipt ──────────────────────────────────────────────
  if (completed) {
    const state = describeGiving(completed.status);

    return (
      <CommunityScreen title="Your donation" subtitle={campaign?.title} showBack={false}>
        <View className="px-5 pt-5">
          <CommunityStatusPanel state={state} />

          <Card style={{ marginTop: 16 }}>
            <DetailRow
              label="Amount"
              icon="cash-outline"
              value={<AmountDisplay value={completed.amount} size="small" accessibilityPrefix="You gave" />}
            />
            <DetailRow label="To" icon="heart-outline" value={campaign?.title ?? 'Campaign'} />
            <DetailRow
              label="Receipt"
              icon="receipt-outline"
              value={completed.receiptReference}
            />
            <DetailRow
              label="Shown as"
              icon="person-outline"
              value={completed.isAnonymous ? 'Anonymous' : 'Your name'}
            />
          </Card>

          {completed.isAnonymous ? (
            <View className="mt-3">
              <InlineRefusal
                icon="eye-off-outline"
                reason="Because you gave anonymously, Diaspora has not recorded who you are — so this donation will not appear in your giving history. Keep the receipt reference above: it is the only handle you have on it."
              />
            </View>
          ) : null}

          {/*
            ── Remediation Wave C-04. COMMUNITY-LIFE-GAP-008 ────────────────────

            This used to say the interval had been "recorded as a preference"
            and that nothing further would be charged. B15.1 shipped a real
            scheduler behind it, so that sentence is no longer true.

            **But the donation response does not say whether a schedule was
            created**, and a deployment can have recurring donations switched
            off — in which case the interval is accepted, no schedule is made,
            and the call still answers 200. So this does not claim a standing
            gift from the fact that the donation worked. It reads the caller's
            own standing donations and reports what is actually there, and says
            plainly when it cannot find one. A confirmation is the server's to
            give.
          */}
          {isRecurring ? (
            <View className="mt-3">
              {standingGift ? (
                <DetailRow
                  icon="repeat-outline"
                  label="Repeating monthly"
                  value={
                    standingGift.nextChargeAt
                      ? `Next on ${new Date(standingGift.nextChargeAt).toLocaleDateString()}`
                      : 'Scheduled'
                  }
                />
              ) : (
                <InlineRefusal
                  icon="repeat-outline"
                  reason="You asked to give this every month. Today's donation went through, and Diaspora has not been able to confirm a repeating gift — check your standing donations in your wallet, and set one up there if it is not listed."
                />
              )}
            </View>
          ) : null}

          <View className="mt-6">
            <PrimaryButton
              label="Back to the campaign"
              onPress={() => router.replace(`/community-life/campaign/${campaignId}` as never)}
            />
            <View className="mt-3">
              <SecondaryButton
                label="See it in your wallet"
                icon="wallet-outline"
                onPress={() => router.push('/wallet/giving')}
              />
            </View>
          </View>
        </View>
      </CommunityScreen>
    );
  }

  return (
    <CommunityScreen
      title="Donate"
      subtitle={campaign?.title}
      isEnabled={isEnabled}
      refusal={refusal}
      isLoading={isLoading}
      error={isError ? error : null}
      onRetry={refetch}
      footer={
        canCollect ? (
          <View>
            {donate.isError ? (
              <View className="mb-3">
                <FinancialErrorInline error={donate.error as FinancialError} />
              </View>
            ) : null}
            <PrimaryButton
              label={amount > 0 ? `Give ${symbol}${amount}` : 'Choose an amount'}
              icon="heart-outline"
              busy={donate.isPending}
              disabled={donate.isPending || amount <= 0 || !access.canDonate}
              accessibilityHint="Takes payment through your Diaspora wallet"
              onPress={onDonate}
            />
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-semibold text-center mt-2.5 leading-relaxed"
            >
              Handled by Diaspora's payment platform. Your card details never reach the organiser.
            </Text>
          </View>
        ) : null
      }
    >
      {!campaign ? (
        <EmptyState icon="heart-outline" title="Campaign not found" body="It may have been closed." />
      ) : !canCollect ? (
        <View className="px-5 pt-5">
          <EmptyState
            icon="lock-closed-outline"
            title="This campaign is not taking donations"
            body={
              !campaign.causeCode
                ? 'It is not connected to a Diaspora giving cause yet. Diaspora never collects money outside its own payment platform, so there is nowhere for a donation to go.'
                : 'The organiser has paused or closed donations for now.'
            }
            action="Back to the campaign"
            onAction={() => backOr()}
          />
        </View>
      ) : (
        <View className="px-5 pt-5">
          {/* Amount */}
          <Text
            accessibilityRole="header"
            style={{ color: tokens.color.text.primary }}
            className="text-sm font-black tracking-tight mb-3"
          >
            How much would you like to give?
          </Text>

          <View
            className="flex-row flex-wrap"
            accessibilityRole="radiogroup"
            accessibilityLabel="Donation amount"
          >
            {PRESETS.map((value) => {
              const isSelected = preset === value;
              return (
                <Text
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={`${symbol}${value}`}
                  onPress={() => {
                    setPreset(value);
                    setCustomAmount('');
                  }}
                  style={{
                    backgroundColor: isSelected ? tokens.color.primary[500] : tokens.color.surface.card,
                    borderColor: isSelected ? tokens.color.primary[500] : tokens.color.border.default,
                    color: isSelected ? '#FFFFFF' : tokens.color.text.primary,
                    minWidth: 76,
                    lineHeight: 46,
                  }}
                  className="rounded-2xl border text-center text-sm font-black mr-2.5 mb-2.5 px-3 overflow-hidden"
                >
                  {symbol}
                  {value}
                </Text>
              );
            })}
          </View>

          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-xs font-bold mb-1 mt-2"
            nativeID="custom-amount-label"
          >
            Or another amount
          </Text>
          <View
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor:
                preset === null && customAmount ? tokens.color.primary[500] : tokens.color.border.default,
            }}
            className="flex-row items-center rounded-xl border px-4"
          >
            <Text style={{ color: tokens.color.text.primary }} className="text-base font-black">
              {symbol}
            </Text>
            <TextInput
              accessibilityLabel="Custom donation amount"
              accessibilityHint={`In ${currency}`}
              keyboardType="decimal-pad"
              value={customAmount}
              onChangeText={(text) => {
                setCustomAmount(text);
                setPreset(null);
              }}
              placeholder="0.00"
              placeholderTextColor={tokens.color.text.placeholder}
              style={{ color: tokens.color.text.primary, minHeight: 48 }}
              className="flex-1 ml-1.5 text-base font-black"
            />
          </View>

          {/* Options */}
          <Section title="Options" style={{ marginHorizontal: -20 }}>
            <View className="px-5">
              <Card>
                <View className="flex-row items-center justify-between py-1">
                  <View className="flex-1 pr-3">
                    <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold">
                      Give anonymously
                    </Text>
                    <Text
                      style={{ color: tokens.color.text.placeholder }}
                      className="text-[11px] font-semibold mt-0.5 leading-relaxed"
                    >
                      Your name will not appear on the supporter list. Diaspora will not record who
                      you are, so this donation will not show in your giving history either.
                    </Text>
                  </View>
                  <Switch
                    accessibilityLabel="Give anonymously"
                    accessibilityHint="Your name is hidden and Diaspora keeps no record of who gave"
                    value={isAnonymous}
                    onValueChange={setIsAnonymous}
                    trackColor={{
                      false: tokens.color.surface.elevated,
                      true: tokens.color.primary[500],
                    }}
                  />
                </View>

                <View
                  className="flex-row items-center justify-between py-1 mt-3 pt-3"
                  style={{ borderTopWidth: 1, borderTopColor: tokens.color.border.default }}
                >
                  {/*
                    Monthly giving is real from B15.1 onwards — there is a sweep
                    that charges through the ordinary payment path.

                    **An anonymous gift cannot repeat, and the server refuses
                    rather than quietly making it one-off.** B15 stores no donor
                    identifier on an anonymous donation, so there would be nobody
                    to charge next month and nobody to tell when it failed. The
                    switch is therefore disabled while "give anonymously" is on,
                    and says why — a refusal a member meets at submit time, after
                    their card has been charged for the first gift, is a worse
                    version of the same rule.
                  */}
                  <View className="flex-1 pr-3">
                    <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold">
                      Give this every month
                    </Text>
                    <Text
                      style={{ color: tokens.color.text.placeholder }}
                      className="text-[11px] font-semibold mt-0.5 leading-relaxed"
                    >
                      {isAnonymous
                        ? 'An anonymous gift cannot repeat — Diaspora records nobody to charge again. Give anonymously once, or set up a repeating gift under your name.'
                        : 'Diaspora will take this amount every month until you stop it. You can stop it at any time from your wallet.'}
                    </Text>
                  </View>
                  <Switch
                    accessibilityLabel="Give this every month"
                    accessibilityHint={
                      isAnonymous
                        ? 'Unavailable while you are giving anonymously.'
                        : 'Sets up a monthly gift you can stop at any time.'
                    }
                    disabled={isAnonymous}
                    value={isRecurring && !isAnonymous}
                    onValueChange={setIsRecurring}
                    trackColor={{
                      false: tokens.color.surface.elevated,
                      true: tokens.color.primary[500],
                    }}
                  />
                </View>
              </Card>

              <View className="mt-4">
                <Text
                  style={{ color: tokens.color.text.primary }}
                  className="text-xs font-bold mb-1"
                  nativeID="donation-message-label"
                >
                  A message for the organiser (optional)
                </Text>
                <TextInput
                  accessibilityLabel="A message for the organiser"
                  accessibilityHint={
                    isAnonymous
                      ? 'Shown on the campaign without your name'
                      : 'Shown on the campaign with your name'
                  }
                  value={message}
                  onChangeText={setMessage}
                  multiline
                  numberOfLines={3}
                  maxLength={280}
                  placeholder="Thinking of you all."
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
            </View>
          </Section>

          {/* Review */}
          <Section title="Review" style={{ marginHorizontal: -20 }}>
            <View className="px-5">
              <Card>
                <DetailRow
                  label="You give"
                  icon="cash-outline"
                  value={`${symbol}${amount || 0} ${currency}`}
                />
                <DetailRow label="To" icon="heart-outline" value={campaign.title} />
                <DetailRow label="For" icon="person-outline" value={campaign.beneficiaryName} />
                <DetailRow
                  label="Shown as"
                  icon="eye-outline"
                  value={isAnonymous ? 'Anonymous' : 'Your name'}
                />
              </Card>

              <View className="mt-3">
                <InlineRefusal
                  icon="shield-checkmark-outline"
                  reason="Diaspora will confirm this with the payment provider before it counts. If anything goes wrong you will be told, and you will not be charged twice for tapping again."
                />
              </View>
            </View>
          </Section>
        </View>
      )}
    </CommunityScreen>
  );
}
