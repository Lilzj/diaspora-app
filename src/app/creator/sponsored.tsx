// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Sponsored content management (Phase 7, §20 · §21)
//
// §20: "Reuse Phase 6: PricingProvider, PromotionPackage, Checkout, Payment,
// Entitlement, PromotionStatus, Analytics. Do NOT duplicate monetization logic."
//
// So this screen buys nothing. Sponsoring a guide sends the member to
// `/monetization/promote`, which is Phase 6's real flow against B15's real
// catalogue, real payment intent and real placement. What this screen adds is
// the **creator's view** of the result: their own content, its promotion state,
// and how each placement performed.
//
// It is a hybrid surface and says so. The placements are real B15 records. The
// approval state (MON-GAP-006) and the delivery figures (MON-GAP-002) are not,
// and `<PartiallyRealNotice>` names both halves rather than marking the whole
// screen one way or the other.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import { useAuthStore } from '@/store/auth';
import {
  CreatorCard,
  CreatorCardSkeleton,
  CreatorEmptyState,
  CreatorScreen,
  CreatorSection,
  CreatorStatusChip,
  PartiallyRealNotice,
  SimulatedFigure,
} from '@/components/creator-economy';
import { AmountDisplay } from '@/components/financial';
import { useCreatorAccess, useCreatorSponsoredContent } from '@/hooks/creator-economy';
import { checkCreatorAccess, CreatorCapabilities } from '@/lib/creator-access';
import { formatCount, presentSponsoredState } from '@/lib/creator-economy';
import { trackCreatorEvent } from '@/lib/creator-analytics';
import { formatRelativeTime } from '@/utils/format';
import type { SponsoredContentItem } from '@/types/creator-economy';

type Group = 'live' | 'pending' | 'finished';

const GROUPS: { key: Group; label: string; empty: string }[] = [
  { key: 'live', label: 'Running', empty: 'Nothing is being promoted right now.' },
  { key: 'pending', label: 'Waiting', empty: 'Nothing is waiting for payment or approval.' },
  { key: 'finished', label: 'Finished', empty: 'Promotions that have ended will be listed here.' },
];

export default function SponsoredContentScreen() {
  const { tokens } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const [group, setGroup] = useState<Group>('live');
  const [isRefreshing, setRefreshing] = useState(false);

  const query = useCreatorSponsoredContent(group);
  const access = useCreatorAccess();

  useEffect(() => {
    trackCreatorEvent('creator.sponsored.viewed');
  }, []);

  const refusal = checkCreatorAccess(CreatorCapabilities.ViewDashboard, {
    accountState,
    isAuthenticated,
    creatorStatus: access.creatorStatus,
  });

  const sponsorRefusal = checkCreatorAccess(CreatorCapabilities.SponsorContent, {
    accountState,
    isAuthenticated,
    creatorStatus: access.creatorStatus,
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    query.refetch();
    setRefreshing(false);
  }, [query]);

  const startSponsorship = useCallback(() => {
    trackCreatorEvent('creator.sponsored.started', { surface: 'sponsored' });
    // Phase 6's real flow. This screen does not price, charge or place anything.
    router.push('/monetization/promote');
  }, []);

  const active = GROUPS.find((item) => item.key === group)!;

  return (
    <CreatorScreen
      title="Sponsored content"
      subtitle="Promoting your best work"
      isEnabled={query.isEnabled}
      refusal={refusal}
      error={query.error}
      onRetry={query.refetch}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
      sticky={
        <View
          style={{
            backgroundColor: tokens.color.surface.card,
            borderBottomColor: tokens.color.border.default,
          }}
          className="border-b px-5 py-3"
        >
          <View
            style={{ backgroundColor: tokens.color.surface.background }}
            className="flex-row rounded-2xl p-1"
            accessibilityRole="tablist"
          >
            {GROUPS.map((item) => {
              const isActive = group === item.key;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`${item.label} promotions`}
                  onPress={() => setGroup(item.key)}
                  style={{ backgroundColor: isActive ? tokens.color.primary[500] : 'transparent' }}
                  className="flex-1 rounded-xl py-2.5 items-center"
                >
                  <Text
                    style={{ color: isActive ? '#FFFFFF' : tokens.color.text.secondary }}
                    className="text-[11px] font-black"
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      }
      footer={
        sponsorRefusal.allowed ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Promote a piece of your content"
            onPress={startSponsorship}
            style={{ backgroundColor: tokens.color.primary[500] }}
            className="rounded-full py-4 items-center flex-row justify-center"
          >
            <Ionicons name="megaphone-outline" size={17} color="#FFFFFF" />
            <Text className="text-white text-xs font-black uppercase tracking-wider ml-2">
              Promote something
            </Text>
          </Pressable>
        ) : undefined
      }
    >
      <View className="px-5 pt-5">
        <PartiallyRealNotice
          gapKey="sponsorship"
          realPart="Buying a promotion, what it cost, when it runs and cancelling it. These go through Diaspora's financial platform and produce real placements."
          simulatedPart="The approval state and every delivery figure below. Diaspora records no impression or click yet."
        />

        {!sponsorRefusal.allowed ? (
          <View
            style={{ backgroundColor: tokens.color.warning.surface }}
            className="rounded-2xl p-3.5 mt-4 flex-row items-start"
          >
            <Ionicons
              name="information-circle-outline"
              size={15}
              color={tokens.color.warning.default}
              style={{ marginTop: 1 }}
            />
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-[12px] font-semibold ml-2 flex-1 leading-relaxed"
            >
              {sponsorRefusal.message}
            </Text>
          </View>
        ) : null}

        <View className="mt-5">
          {query.isLoading ? (
            <CreatorCardSkeleton rows={3} />
          ) : query.items.length === 0 ? (
            // ── What this is allowed to claim ──────────────────────────────
            //
            // `query.items` is the **simulated** enrichment — approval state and
            // delivery figures — and its query is gated on
            // `areCreatorGapsEnabled()`, so it is empty in every release build.
            // `query.placements` is **real** B15: what was bought, when it runs,
            // what it cost. Both come out of the same hook and this screen
            // rendered only the first, so a creator with live promotions was
            // told "Nothing is being promoted right now."
            //
            // Absence is only claimable when the real list is empty too.
            query.placements.length > 0 ? (
              <CreatorEmptyState
                icon="megaphone-outline"
                title={
                  query.placements.length === 1
                    ? 'You have one promotion running'
                    : `You have ${query.placements.length} promotions`
                }
                body="Diaspora records what you bought, when it runs and what it cost. How each one is performing is not something it can show yet."
                actionLabel="See your promotions"
                onAction={() => router.push('/monetization/promotions')}
              />
            ) : (
              <CreatorEmptyState
                icon="megaphone-outline"
                title="Nothing here"
                body={active.empty}
                actionLabel={sponsorRefusal.allowed ? 'Promote something' : undefined}
                onAction={sponsorRefusal.allowed ? startSponsorship : undefined}
              />
            )
          ) : (
            query.items.map((item) => <SponsoredCard key={item.contentId} item={item} />)
          )}
        </View>

        {/* ── Where the real machinery lives ───────────────────────────── */}
        <CreatorSection title="Managed in monetization">
          <CreatorCard padded={false}>
            <ManageRow
              icon="pricetags-outline"
              label="Promotion packages"
              hint="What Diaspora sells and what each costs"
              onPress={() => router.push('/monetization/promote')}
            />
            <ManageRow
              icon="albums-outline"
              label="All promotions"
              hint="Every placement, including ones outside your creator work"
              onPress={() => router.push('/monetization/promotions')}
            />
            <ManageRow
              icon="receipt-outline"
              label="Billing"
              hint="What you have paid"
              onPress={() => router.push('/monetization/billing')}
              isLast
            />
          </CreatorCard>
        </CreatorSection>
      </View>
    </CreatorScreen>
  );
}

function SponsoredCard({ item }: { item: SponsoredContentItem }) {
  const { tokens } = useTheme();
  const presentation = presentSponsoredState(item.state);

  return (
    <CreatorCard
      accessibilityLabel={[
        item.contentTitle,
        presentation.description,
        item.packageLabel,
        item.amountPaid ? `${item.amountPaid.currency} ${item.amountPaid.amount.toFixed(2)} paid.` : null,
        item.endsAt ? `Ends ${formatRelativeTime(item.endsAt)}.` : null,
        item.rejectionReason,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ marginBottom: 12 }}
    >
      <View className="flex-row items-start justify-between mb-2">
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-[13px] font-black tracking-tight flex-1 mr-2"
          numberOfLines={2}
        >
          {item.contentTitle}
        </Text>
        <CreatorStatusChip presentation={presentation} size="small" />
      </View>

      <View className="flex-row items-center">
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-bold"
        >
          {String(item.contentType)}
          {item.packageLabel ? ` · ${item.packageLabel}` : ''}
        </Text>
      </View>

      {item.amountPaid || item.endsAt ? (
        <View
          style={{ borderTopColor: tokens.color.border.default }}
          className="flex-row items-center justify-between border-t mt-3 pt-3"
        >
          {item.amountPaid ? (
            <View>
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[9px] font-black uppercase tracking-widest mb-0.5"
              >
                Paid
              </Text>
              <AmountDisplay value={item.amountPaid} size="small" />
            </View>
          ) : (
            <View />
          )}

          {item.endsAt ? (
            <View className="items-end">
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[9px] font-black uppercase tracking-widest mb-0.5"
              >
                {new Date(item.endsAt).getTime() > Date.now() ? 'Ends' : 'Ended'}
              </Text>
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-[12px] font-black"
              >
                {formatRelativeTime(item.endsAt)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Performance is the simulated half, and is marked as such per card. */}
      {item.performance && item.performance.length > 0 ? (
        <View
          style={{ backgroundColor: tokens.color.surface.background }}
          className="rounded-xl p-3 mt-3"
        >
          <View className="flex-row items-center justify-between mb-2">
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[9px] font-black uppercase tracking-widest"
            >
              How it did
            </Text>
            <SimulatedFigure />
          </View>

          <View className="flex-row flex-wrap">
            {item.performance.map((metric) => (
              <View key={metric.key} className="mr-5 mb-1">
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[9px] font-bold"
                >
                  {metric.label}
                </Text>
                <Text
                  style={{ color: tokens.color.text.primary, fontVariant: ['tabular-nums'] }}
                  className="text-[14px] font-black"
                >
                  {metric.format === 'percentage'
                    ? `${metric.value.toFixed(1)}%`
                    : formatCount(metric.value)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {item.rejectionReason ? (
        <View
          style={{ backgroundColor: tokens.color.error.surface }}
          className="rounded-xl p-3 mt-3"
        >
          <Text
            style={{ color: tokens.color.error.default }}
            className="text-[10px] font-black uppercase tracking-widest mb-1"
          >
            Why it was refused
          </Text>
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-[12px] font-semibold leading-relaxed"
          >
            {item.rejectionReason}
          </Text>
        </View>
      ) : null}

      {item.isRenewable && item.placementId ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Promote ${item.contentTitle} again`}
          onPress={() => router.push('/monetization/promote')}
          style={{ borderColor: tokens.color.border.default }}
          className="rounded-full border py-2.5 items-center mt-3"
        >
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[11px] font-black uppercase tracking-wider"
          >
            Promote again
          </Text>
        </Pressable>
      ) : null}
    </CreatorCard>
  );
}

function ManageRow({
  icon,
  label,
  hint,
  onPress,
  isLast = false,
}: {
  icon: string;
  label: string;
  hint: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  const { tokens } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${hint}.`}
      onPress={onPress}
      style={{
        borderBottomColor: tokens.color.border.default,
        borderBottomWidth: isLast ? 0 : 1,
      }}
      className="flex-row items-center px-4 py-3.5"
    >
      <Ionicons name={icon as never} size={17} color={tokens.color.text.secondary} />
      <View className="flex-1 mx-3">
        <Text style={{ color: tokens.color.text.primary }} className="text-[13px] font-bold">
          {label}
        </Text>
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-semibold mt-0.5"
        >
          {hint}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
    </Pressable>
  );
}
