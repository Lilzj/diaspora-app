// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Purchases and placements (Frontend Phase 5)
//
// `GET /purchases` and `GET /placements/me` in one screen, because from a
// member's point of view they are one thing: "what have I paid to promote, and
// is it running".
//
// They are separate on the backend for a reason worth preserving in the copy.
// A **purchase** is the money; a **placement** is what the money bought and how
// long it lasts. A purchase can complete while its placement is still
// `Scheduled`, and a placement can expire long after the purchase settled —
// B15 activates on capture and expires on a sweep.
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
  FinancialErrorInline,
  StatusBadge,
  TransactionListSkeleton,
} from '@/components/financial';
import { useMyPlacements, usePurchases } from '@/hooks/financial';
import { checkAccess, FinancialPermissions } from '@/lib/financial-access';
import {
  describeSubjectType,
  presentPlacementStatus,
  presentPurchaseStatus,
} from '@/lib/financial-status';
import { useAuthStore } from '@/store/auth';
import { formatRelativeTime } from '@/utils/format';
import type { FinancialError } from '@/lib/financial-errors';
import type { MonetizationPurchase, Placement } from '@/types/financial';

export default function PurchasesScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const purchasesQuery = usePurchases();
  const placementsQuery = useMyPlacements();
  const [isRefreshing, setRefreshing] = useState(false);

  const refusal = useMemo(
    () => checkAccess(FinancialPermissions.PurchasesRead, accountState, isAuthenticated),
    [accountState, isAuthenticated]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([purchasesQuery.refetch(), placementsQuery.refetch()]);
    setRefreshing(false);
  }, [purchasesQuery, placementsQuery]);

  if (!refusal.allowed) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface.background }} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Purchases" showBack />
        <AccessGate refusal={refusal} />
      </SafeAreaView>
    );
  }

  const purchases = purchasesQuery.data ?? [];
  const placements = placementsQuery.data ?? [];
  const running = placements.filter((placement) => placement.isActive || placement.status === 'Scheduled');

  const isEmpty = purchases.length === 0 && placements.length === 0;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="Purchases" showBack />

      <ScrollEndScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={tokens.color.primary[500]} />
        }
      >
        {purchasesQuery.isLoading || placementsQuery.isLoading ? (
          <TransactionListSkeleton rows={5} />
        ) : isEmpty ? (
          <View className="items-center py-16 px-4">
            <Ionicons name="bag-handle-outline" size={36} color={tokens.color.text.placeholder} />
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-base font-black text-center tracking-tight mt-4 mb-2"
            >
              You have not bought anything yet
            </Text>
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-sm font-medium text-center leading-relaxed"
            >
              Boosts, featured placements and premium listings you buy will be listed here, along with how
              long each one runs for.
            </Text>
          </View>
        ) : (
          <>
            {placementsQuery.isError && placementsQuery.error ? (
              <View className="mb-4">
                <FinancialErrorInline
                  error={placementsQuery.error as FinancialError}
                  onRetry={placementsQuery.refetch}
                />
              </View>
            ) : null}

            {running.length > 0 ? (
              <>
                <SectionHeading title="Running now" />
                <View style={{ gap: 10 }}>
                  {running.map((placement) => (
                    <PlacementCard key={placement.placementId} placement={placement} />
                  ))}
                </View>
              </>
            ) : null}

            {purchases.length > 0 ? (
              <>
                <SectionHeading title="Everything you have bought" spacedAbove={running.length > 0} />
                <View
                  style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
                  className="rounded-2xl border overflow-hidden"
                >
                  {purchases.map((purchase) => (
                    <PurchaseRow key={purchase.purchaseId} purchase={purchase} />
                  ))}
                </View>
              </>
            ) : null}

            {placements.length > running.length ? (
              <>
                <SectionHeading title="Finished" spacedAbove />
                <View style={{ gap: 10 }}>
                  {placements
                    .filter((placement) => !placement.isActive && placement.status !== 'Scheduled')
                    .map((placement) => (
                      <PlacementCard key={placement.placementId} placement={placement} />
                    ))}
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}

function SectionHeading({ title, spacedAbove }: { title: string; spacedAbove?: boolean }) {
  const { tokens } = useTheme();

  return (
    <Text
      style={{ color: tokens.color.text.primary }}
      className={`text-base font-black tracking-tight mb-3 ${spacedAbove ? 'mt-8' : ''}`}
      accessibilityRole="header"
    >
      {title}
    </Text>
  );
}

function PlacementCard({ placement }: { placement: Placement }) {
  const { tokens } = useTheme();
  const status = presentPlacementStatus(placement.status);

  return (
    <TouchableOpacity
      onPress={() => router.push(`/wallet/placements/${placement.placementId}`)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${placement.kind} on ${describeSubjectType(placement.subjectType)}. ${status.description}${placement.endsAt ? ` Ends ${formatRelativeTime(placement.endsAt)}.` : ''}`}
      style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
      className="flex-row items-center rounded-2xl border p-4"
    >
      <View
        style={{ backgroundColor: tokens.color.primary[50] }}
        className="w-10 h-10 rounded-full items-center justify-center mr-3"
      >
        <Ionicons name="flash-outline" size={19} color={tokens.color.primary[600]} />
      </View>

      <View className="flex-1 mr-3">
        <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold tracking-tight">
          {placement.kind} · {describeSubjectType(placement.subjectType)}
        </Text>
        <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-semibold mt-0.5">
          {placement.endsAt
            ? placement.isActive
              ? `Ends ${formatRelativeTime(placement.endsAt)}`
              : `Ended ${formatRelativeTime(placement.endsAt)}`
            : 'No end date'}
        </Text>
        <View className="mt-1.5">
          <StatusBadge status={status} size="sm" />
        </View>
      </View>

      <Ionicons name="chevron-forward" size={17} color={tokens.color.text.placeholder} />
    </TouchableOpacity>
  );
}

function PurchaseRow({ purchase }: { purchase: MonetizationPurchase }) {
  const { tokens } = useTheme();
  const status = presentPurchaseStatus(purchase.status);

  return (
    <View
      accessible
      accessibilityLabel={`${purchase.productCode}. ${status.description} ${formatRelativeTime(purchase.createdAt)}.`}
      style={{ borderBottomColor: tokens.color.border.default }}
      className="flex-row items-center border-b px-4 py-3.5"
    >
      <View className="flex-1 mr-3">
        <Text style={{ color: tokens.color.text.primary }} className="text-sm font-bold tracking-tight">
          {purchase.productCode}
        </Text>
        <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-semibold mt-0.5">
          {describeSubjectType(purchase.subjectType)} · {formatRelativeTime(purchase.createdAt)}
        </Text>
        <View className="mt-1.5">
          <StatusBadge status={status} size="sm" />
        </View>
      </View>

      <View className="items-end">
        <AmountDisplay value={purchase.paid} size="medium" tone={status.isSettled ? 'default' : 'muted'} />
        {purchase.discount.minorUnits > 0 ? (
          <Text style={{ color: tokens.color.success.default }} className="text-[10px] font-bold mt-0.5">
            {purchase.promotionCode ?? 'Discount'} applied
          </Text>
        ) : null}
      </View>
    </View>
  );
}
