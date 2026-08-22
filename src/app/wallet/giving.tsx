// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Your giving (Frontend Phase 5)
//
// `GET /giving/me`. Donations and contributions in one response, and the
// non-monetary count kept separate — B15 counts pledges of goods, hours and
// skills rather than valuing them, because "totalling them with money would be
// inventing one".
//
// **Anonymous gifts are absent, and the screen says so.** They are not filtered
// out for display: an anonymous donation stores no donor identifier at all, so
// the server cannot find them either. Somebody who gave anonymously and comes
// looking needs to be told that their receipt reference is the only handle they
// will ever have on it, not left thinking the gift was lost.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import {
  AccessGate,
  AmountDisplay,
  FinancialErrorView,
  StatusBadge,
  TransactionListSkeleton,
} from '@/components/financial';
import { useGivingHistory } from '@/hooks/financial';
// Remediation Wave C-04, COMMUNITY-LIFE-GAP-008. Standing donations are B15.1's
// (`GET /financial/donations/recurring/me`) and are served through the community
// repository, which is where the campaign surface reads them from as well.
import { useCancelRecurringDonation, useMyRecurringDonations } from '@/hooks/community-life';
import { checkAccess, FinancialPermissions } from '@/lib/financial-access';
import { presentGivingStatus } from '@/lib/financial-status';
import { useAuthStore } from '@/store/auth';
import { formatRelativeTime } from '@/utils/format';
import type { FinancialError } from '@/lib/financial-errors';
import type { Contribution, Donation } from '@/types/financial';

/** The four non-monetary kinds, in the words the donation screen already uses. */
function describeContributionKind(kind: string): string {
  switch (kind) {
    case 'Monetary': return 'Money';
    case 'Goods': return 'Goods and items';
    case 'VolunteerService': return 'Volunteer time';
    case 'ProfessionalSkills': return 'Professional skills';
    case 'Supplies': return 'Food and supplies';
    default: return kind.replace(/([A-Z])/g, ' $1').trim();
  }
}

export default function GivingScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const query = useGivingHistory();
  const standing = useMyRecurringDonations();
  const cancelStanding = useCancelRecurringDonation();
  const [isRefreshing, setRefreshing] = useState(false);

  const refusal = useMemo(
    () => checkAccess(FinancialPermissions.GivingRead, accountState, isAuthenticated),
    [accountState, isAuthenticated]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([query.refetch(), standing.refetch()]);
    setRefreshing(false);
  }, [query, standing]);

  if (!refusal.allowed) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Your giving" showBack />
        <AccessGate refusal={refusal} />
      </SafeAreaView>
    );
  }

  if (query.isError && query.error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Your giving" showBack />
        <FinancialErrorView error={query.error as FinancialError} onRetry={query.refetch} />
      </SafeAreaView>
    );
  }

  const history = query.data;
  const donations = history?.donations ?? [];
  const contributions = history?.contributions ?? [];
  const standingDonations = standing.data;
  const isEmpty =
    donations.length === 0 && contributions.length === 0 && standingDonations.length === 0;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader
        title="Your giving"
        showBack
        rightAction={
          <TouchableOpacity
            onPress={() => router.push('/wallet/donate')}
            className="w-12 h-12 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Give to a cause"
          >
            <Ionicons name="add" size={22} color={tokens.color.text.primary} />
          </TouchableOpacity>
        }
      />

      <ScrollEndScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={tokens.color.primary[500]} />
        }
      >
        {query.isLoading ? (
          <TransactionListSkeleton rows={5} />
        ) : isEmpty ? (
          <View className="items-center py-16 px-4">
            <Ionicons name="heart-outline" size={36} color={tokens.color.text.placeholder} />
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-base font-black text-center tracking-tight mt-4 mb-2"
            >
              Nothing here yet
            </Text>
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-sm font-medium text-center leading-relaxed mb-6"
            >
              Money, goods, time and skills you give to Diaspora causes and funds will be listed here.
            </Text>

            <TouchableOpacity
              onPress={() => router.push('/wallet/donate')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Find a cause to support"
              style={{ backgroundColor: tokens.color.primary[500] }}
              className="h-11 px-6 rounded-full items-center justify-center"
            >
              <Text className="text-white text-[11px] font-black uppercase tracking-wider">
                Find a cause
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* The non-monetary count, stated because the backend keeps it
                separate and because a "you have given £45" summary would
                silently erase six Saturdays at a food bank. */}
            {history && history.nonMonetaryContributionCount > 0 ? (
              <View
                style={{ backgroundColor: tokens.color.secondary[50], borderColor: `${tokens.color.secondary[500]}33` }}
                className="rounded-2xl border p-4 mb-5"
                accessible
                accessibilityLabel={`You have made ${history.nonMonetaryContributionCount} contributions of goods, time or skills.`}
              >
                <Text style={{ color: tokens.color.secondary[700] }} className="text-xs font-bold leading-relaxed">
                  You have given goods, time or skills {history.nonMonetaryContributionCount}{' '}
                  {history.nonMonetaryContributionCount === 1 ? 'time' : 'times'}. These are counted, never
                  valued in money.
                </Text>
              </View>
            ) : null}

            {/*
              ── Standing donations. COMMUNITY-LIFE-GAP-008 ────────────────────

              Every state, cancelled ones included. A donor who stopped a monthly
              gift is entitled to see that it stopped, and a list that hid it
              would look as though the cancellation had lost the record.

              **`nextChargeAt` is printed only where the server sent one.** It is
              null once a schedule is terminal, and inventing a date for a
              cancelled or suspended gift would be promising a charge nothing
              intends to make — which is precisely what this surface could not
              say honestly before B15.1 put a sweep behind the field.

              A failure is named rather than softened: `Retrying` means another
              attempt is scheduled, `Suspended` means the retry budget is spent
              and nothing further will happen until the donor acts. Folding the
              two into "there was a problem" loses the only part that tells them
              whether they need to do something.
            */}
            {standingDonations.length > 0 ? (
              <>
                <Text
                  style={{ color: tokens.color.text.primary }}
                  className="text-base font-black tracking-tight mb-3"
                  accessibilityRole="header"
                >
                  Repeating gifts
                </Text>

                {standingDonations.map((schedule) => {
                  const isLive =
                    schedule.status === 'Active' || schedule.status === 'Retrying';

                  return (
                    <View
                      key={schedule.recurringDonationId}
                      style={{
                        backgroundColor: tokens.color.surface.elevated,
                        borderColor: tokens.color.border.default,
                      }}
                      className="rounded-2xl border p-4 mb-3"
                    >
                      <View className="flex-row items-start justify-between">
                        <View className="flex-1 pr-3">
                          <Text
                            style={{ color: tokens.color.text.primary }}
                            className="text-sm font-black tracking-tight"
                            numberOfLines={2}
                          >
                            {schedule.causeTitle ?? schedule.causeCode}
                          </Text>
                          <Text
                            style={{ color: tokens.color.text.secondary }}
                            className="text-[11px] font-semibold mt-1"
                          >
                            {schedule.intervalMonths === 1
                              ? 'Every month'
                              : `Every ${schedule.intervalMonths} months`}
                            {schedule.chargeCount > 0
                              ? ` · given ${schedule.chargeCount} ${
                                  schedule.chargeCount === 1 ? 'time' : 'times'
                                }`
                              : ''}
                          </Text>
                        </View>
                        <AmountDisplay
                          value={schedule.amount}
                          size="small"
                          accessibilityPrefix="Each time"
                        />
                      </View>

                      {/* Only ever the server's date, and only where it sent one. */}
                      {schedule.nextChargeAt ? (
                        <Text
                          style={{ color: tokens.color.text.placeholder }}
                          className="text-[11px] font-bold mt-2"
                        >
                          Next on {new Date(schedule.nextChargeAt).toLocaleDateString()}
                        </Text>
                      ) : null}

                      {schedule.status === 'Cancelled' ? (
                        <Text
                          style={{ color: tokens.color.text.placeholder }}
                          className="text-[11px] font-bold mt-2"
                        >
                          You stopped this
                          {schedule.cancelledAt
                            ? ` on ${new Date(schedule.cancelledAt).toLocaleDateString()}`
                            : ''}
                          . Nothing further will be taken.
                        </Text>
                      ) : null}

                      {schedule.status === 'Completed' ? (
                        <Text
                          style={{ color: tokens.color.text.placeholder }}
                          className="text-[11px] font-bold mt-2"
                        >
                          The cause this gave to has closed, so there is nothing left to give to.
                        </Text>
                      ) : null}

                      {schedule.status === 'Retrying' ? (
                        <Text
                          style={{ color: tokens.color.warning.default }}
                          className="text-[11px] font-bold mt-2 leading-relaxed"
                        >
                          The last attempt did not go through
                          {schedule.lastFailureReason ? ` — ${schedule.lastFailureReason}` : ''}{' '}
                          Diaspora will try again.
                        </Text>
                      ) : null}

                      {schedule.status === 'Suspended' ? (
                        <Text
                          style={{ color: tokens.color.error.default }}
                          className="text-[11px] font-bold mt-2 leading-relaxed"
                        >
                          This has stopped after {schedule.consecutiveFailures}{' '}
                          {schedule.consecutiveFailures === 1 ? 'failed attempt' : 'failed attempts'}
                          {schedule.lastFailureReason ? ` — ${schedule.lastFailureReason}` : '.'}{' '}
                          Nothing further will be tried until you set it up again.
                        </Text>
                      ) : null}

                      {isLive ? (
                        <TouchableOpacity
                          onPress={() =>
                            cancelStanding.mutate(schedule.recurringDonationId)
                          }
                          disabled={cancelStanding.isPending}
                          activeOpacity={0.85}
                          accessibilityRole="button"
                          accessibilityLabel={`Stop the repeating gift to ${
                            schedule.causeTitle ?? schedule.causeCode
                          }`}
                          accessibilityHint="Nothing further will be taken. Donations already made are unaffected."
                          style={{ borderColor: tokens.color.border.default }}
                          className="h-10 mt-3 rounded-full border items-center justify-center"
                        >
                          <Text
                            style={{ color: tokens.color.text.primary }}
                            className="text-[11px] font-black uppercase tracking-wider"
                          >
                            {cancelStanding.isPending ? 'Stopping…' : 'Stop this gift'}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  );
                })}

                {/*
                  The refusal is the server's own and is shown verbatim. A cancel
                  that failed must never leave the row looking stopped — the row
                  above is re-rendered from what the server answered, never from
                  the tap.
                */}
                {cancelStanding.isError ? (
                  <FinancialErrorView
                    error={cancelStanding.error as FinancialError}
                    onRetry={() => cancelStanding.reset()}
                  />
                ) : null}
              </>
            ) : null}

            {donations.length > 0 ? (
              <>
                <Text
                  style={{ color: tokens.color.text.primary }}
                  className="text-base font-black tracking-tight mb-3"
                  accessibilityRole="header"
                >
                  Donations
                </Text>
                <View
                  style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
                  className="rounded-2xl border overflow-hidden"
                >
                  {donations.map((donation) => (
                    <DonationRow key={donation.donationId} donation={donation} />
                  ))}
                </View>
              </>
            ) : null}

            {contributions.length > 0 ? (
              <>
                <Text
                  style={{ color: tokens.color.text.primary }}
                  className={`text-base font-black tracking-tight mb-3 ${donations.length > 0 ? 'mt-8' : ''}`}
                  accessibilityRole="header"
                >
                  Contributions
                </Text>
                <View
                  style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
                  className="rounded-2xl border overflow-hidden"
                >
                  {contributions.map((contribution) => (
                    <ContributionRow key={contribution.contributionId} contribution={contribution} />
                  ))}
                </View>
              </>
            ) : null}

            <AnonymousNote />
          </>
        )}
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}

function DonationRow({ donation }: { donation: Donation }) {
  const { tokens } = useTheme();
  const status = presentGivingStatus(donation.status);

  return (
    <TouchableOpacity
      onPress={() => router.push(`/wallet/receipts/${donation.receiptReference}`)}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`Donation to ${donation.causeCode ?? 'Diaspora'}. ${status.description} ${formatRelativeTime(donation.createdAt)}.`}
      accessibilityHint="Opens the receipt"
      style={{ borderBottomColor: tokens.color.border.default }}
      className="flex-row items-center border-b px-4 py-3.5"
    >
      <View className="flex-1 mr-3">
        <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold tracking-tight" numberOfLines={1}>
          {donation.causeCode ?? 'Diaspora community'}
        </Text>
        <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-semibold mt-0.5">
          {formatRelativeTime(donation.createdAt)} · {donation.receiptReference}
        </Text>
        <View className="mt-1.5">
          <StatusBadge status={status} size="sm" />
        </View>
      </View>

      <AmountDisplay value={donation.amount} size="medium" tone={status.isSettled ? 'default' : 'muted'} />
    </TouchableOpacity>
  );
}

function ContributionRow({ contribution }: { contribution: Contribution }) {
  const { tokens } = useTheme();
  const status = presentGivingStatus(contribution.status);
  const isMonetary = contribution.kind === 'Monetary';

  return (
    <TouchableOpacity
      onPress={() => router.push(`/wallet/receipts/${contribution.receiptReference}`)}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`${describeContributionKind(contribution.kind)} to ${contribution.fundCode}. ${status.description} ${formatRelativeTime(contribution.createdAt)}.`}
      accessibilityHint="Opens the receipt"
      style={{ borderBottomColor: tokens.color.border.default }}
      className="flex-row items-center border-b px-4 py-3.5"
    >
      <View className="flex-1 mr-3">
        <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold tracking-tight" numberOfLines={1}>
          {contribution.fundCode}
        </Text>
        <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-semibold mt-0.5">
          {describeContributionKind(contribution.kind)} · {formatRelativeTime(contribution.createdAt)}
        </Text>
        <View className="mt-1.5">
          <StatusBadge status={status} size="sm" />
        </View>
      </View>

      {/* A pledge has a quantity and no amount, and rendering "£0.00" for six
          volunteer hours would be exactly the mistake B15 built
          `ContributionKind` to avoid. */}
      {isMonetary && contribution.amount ? (
        <AmountDisplay value={contribution.amount} size="medium" tone={status.isSettled ? 'default' : 'muted'} />
      ) : (
        <View className="items-end">
          <Text style={{ color: tokens.color.text.primary }} className="text-base font-black tracking-tight">
            {contribution.pledgeQuantity ?? '—'}
          </Text>
          <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-bold uppercase tracking-wider">
            {contribution.pledgeUnit ?? 'pledged'}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function AnonymousNote() {
  const { tokens } = useTheme();

  return (
    <View
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
      className="rounded-2xl border p-4 mt-8"
      accessible
      accessibilityLabel="Anonymous gifts do not appear here. When you give anonymously, Diaspora stores no record of who you are, so your receipt reference is the only way to identify it."
    >
      <View className="flex-row items-center mb-1.5">
        <Ionicons name="eye-off-outline" size={15} color={tokens.color.text.secondary} />
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[10px] font-black uppercase tracking-widest ml-1.5"
        >
          Anonymous gifts
        </Text>
      </View>
      <Text style={{ color: tokens.color.text.secondary }} className="text-xs font-medium leading-relaxed">
        Anything you gave anonymously is not listed here. Diaspora stores no record of who made it — keep
        your receipt reference, because it is the only way to identify the gift later.
      </Text>
    </View>
  );
}
