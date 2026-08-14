// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — What your plan includes (Frontend Phase 6)
//
// §11 and §19: the member's own view of their entitlements and limits, and the
// screen that answers "why can I not do this?"
//
// Three sections, in the order somebody asks the questions:
//
//   What you have — real, from `Subscription.entitlements`.
//   Your limits — the ceiling real, the consumption simulated (MON-GAP-008).
//   What you do not have — real: every gated feature this build knows about,
//   with the plan that would grant it and what it costs.
//
// The third section is the one that makes this more than a list. A member
// looking at their plan wants to know what they are missing at least as much as
// what they have, and answering it here is cheaper than making them read a
// comparison table.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import {
  EntitlementList,
  MonetizationGapNotice,
  MonetizationSection,
  UpgradeNudge,
  UsageMeter,
} from '@/components/monetization';
import { useEntitlements } from '@/hooks/monetization';
import { useMySubscription } from '@/hooks/financial';
import { useMonetizationGapsEnabled } from '@/hooks/monetization-gaps';
import { GATED_FEATURES } from '@/types/monetization';
import { useRefreshControl } from '@/hooks/usePullToRefresh';

export default function EntitlementsScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const entitlements = useEntitlements();
  const subscriptionQuery = useMySubscription();
  const gapsEnabled = useMonetizationGapsEnabled();

  /**
   * Every gated feature the member does not have.
   *
   * Only the ones an upgrade would actually fix are listed as upgrades — a
   * feature no plan grants, or one blocked by verification rather than by
   * subscription, is a different conversation and `decideEntitlement` tells them
   * apart.
   */
  const missing = useMemo(
    () =>
      Object.values(GATED_FEATURES)
        .map((feature) => entitlements.decide(feature.entitlementKey))
        .filter((decision) => !decision.isAvailable),
    [entitlements]
  );

  const hasLimits = entitlements.limits.length > 0;

  // The spinner used to be given a literal `false`, so the refetch ran but
  // the control snapped straight back and the pull read as inert.
  const refreshControl = useRefreshControl(subscriptionQuery.refetch);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader title="What you get" showBack />

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
        refreshControl={refreshControl}
      >
        {entitlements.isLoading ? (
          <View accessible accessibilityLabel="Loading what your plan includes." style={{ gap: 10 }}>
            {[0, 1].map((index) => (
              <View
                key={index}
                style={{ backgroundColor: tokens.color.neutral[100], opacity: 1 - index * 0.3 }}
                className="rounded-2xl h-32"
              />
            ))}
          </View>
        ) : (
          <>
            <MonetizationSection
              title="What you have"
              subtitle={
                subscriptionQuery.data
                  ? `On your ${subscriptionQuery.data.planCode} plan.`
                  : 'On the free plan.'
              }
              action={{ label: 'Your plan', onPress: () => router.push('/monetization/subscription') }}
            >
              <EntitlementList
                entitlements={entitlements.entitlements}
                emptyMessage="The free plan covers the basics: post listings, publish guides and message people about them."
              />
            </MonetizationSection>

            {hasLimits ? (
              <MonetizationSection
                title="Your limits"
                subtitle="How much of each your plan allows."
              >
                <View style={{ gap: 8 }}>
                  {entitlements.limits.map((limit) => (
                    <UsageMeter
                      key={limit.key}
                      usage={limit}
                      isSimulated={limit.consumed !== null}
                    />
                  ))}
                </View>

                {/* The honest note about the half of every meter that is not
                    real. Shown once here rather than on each meter. */}
                <View className="mt-3">
                  <MonetizationGapNotice
                    gapKey="usage"
                    compact
                    detail={
                      gapsEnabled
                        ? 'The limits above are real — they come from your plan. How much you have used is simulated: Diaspora does not report usage counts yet.'
                        : 'Diaspora cannot show how much of each limit you have used yet. The limits themselves are correct.'
                    }
                  />
                </View>
              </MonetizationSection>
            ) : null}

            {missing.length > 0 ? (
              <MonetizationSection
                title="What you are missing"
                subtitle="Available on a paid plan."
              >
                <View style={{ gap: 8 }}>
                  {missing.map((decision) => (
                    <UpgradeNudge
                      key={decision.key}
                      decision={decision}
                      onUpgrade={() =>
                        router.push({
                          pathname: '/monetization/plans',
                          params: decision.requiredPlan ? { highlight: decision.requiredPlan.code } : {},
                        })
                      }
                    />
                  ))}
                </View>
              </MonetizationSection>
            ) : null}

            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[11px] font-medium leading-relaxed mt-2"
            >
              What you can do is decided by Diaspora when you do it, not by this screen. If something here
              looks out of date, pull down to refresh.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
