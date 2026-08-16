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
  const [isRefreshing, setRefreshing] = useState(false);

  const refusal = useMemo(
    () => checkAccess(FinancialPermissions.GivingRead, accountState, isAuthenticated),
    [accountState, isAuthenticated]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await query.refetch();
    setRefreshing(false);
  }, [query]);

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
  const isEmpty = donations.length === 0 && contributions.length === 0;

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
