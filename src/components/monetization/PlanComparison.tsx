// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Plan comparison table (Frontend Phase 6)
//
// A comparison somebody can actually read on a phone. Horizontal scrolling with
// a pinned first column, because the alternative — shrinking three plan columns
// into 375 points — produces a table where every value is truncated and nothing
// is comparable.
//
// The rows the plans *agree* on are collapsed behind "what every plan includes".
// A comparison table's job is to show a difference, and eleven identical
// checkmarks push the two rows that matter below the fold.
//
// Values are rendered from `Entitlement.value` — "15", "unlimited", "10%" — and
// a plan lacking a key renders an explicit dash with an accessibility label
// saying "not included", never an empty cell. An empty cell in a table is
// ambiguous between "no" and "we did not check".
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { usePricing } from '@/providers/pricing-provider';
import { describeEntitlementValue } from '@/lib/entitlements';
import type { PlanComparisonRow, SubscriptionPlan } from '@/types/monetization';

const FIRST_COLUMN = 148;
const PLAN_COLUMN = 116;

export interface PlanComparisonTableProps {
  plans: SubscriptionPlan[];
  rows: PlanComparisonRow[];
  currentPlanCode?: string | null;
  onSelectPlan?: (plan: SubscriptionPlan) => void;
}

export function PlanComparisonTable({
  plans,
  rows,
  currentPlanCode,
  onSelectPlan,
}: PlanComparisonTableProps) {
  const { tokens } = useTheme();
  const pricing = usePricing();
  const [showShared, setShowShared] = useState(false);

  const differentiators = useMemo(() => rows.filter((row) => row.isDifferentiator), [rows]);
  const shared = useMemo(() => rows.filter((row) => !row.isDifferentiator), [rows]);

  if (plans.length === 0) return null;

  const visible = showShared ? [...differentiators, ...shared] : differentiators;

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // The table is wide by design; the *page* must never scroll sideways, so
        // the overflow is owned here.
        contentContainerStyle={{ paddingRight: 16 }}
      >
        <View>
          {/* Header: plan names and prices. */}
          <View className="flex-row items-end mb-2">
            <View style={{ width: FIRST_COLUMN }} />
            {plans.map((plan) => {
              const cycle = pricing.cycle(plan.interval);
              const isCurrent = plan.code === currentPlanCode;

              return (
                <TouchableOpacity
                  key={plan.code}
                  onPress={() => onSelectPlan?.(plan)}
                  disabled={!onSelectPlan}
                  activeOpacity={0.8}
                  accessibilityRole={onSelectPlan ? 'button' : 'text'}
                  accessibilityLabel={[
                    plan.name,
                    isCurrent ? 'your current plan' : null,
                    plan.isFree
                      ? 'free of charge'
                      : `${pricing.describe(plan.price)} ${cycle.phrase}`,
                  ]
                    .filter(Boolean)
                    .join('. ')}
                  style={{
                    width: PLAN_COLUMN,
                    backgroundColor: isCurrent ? tokens.color.primary[50] : 'transparent',
                    borderColor: isCurrent ? tokens.color.primary[500] : 'transparent',
                  }}
                  className="rounded-t-2xl border border-b-0 px-2 py-3 items-center"
                >
                  <Text
                    style={{ color: tokens.color.text.primary }}
                    className="text-xs font-black tracking-tight text-center"
                    numberOfLines={2}
                  >
                    {plan.name}
                  </Text>
                  <Text
                    style={{ color: tokens.color.text.secondary }}
                    className="text-[11px] font-bold mt-1 text-center"
                  >
                    {plan.isFree ? 'Free' : `${pricing.format(plan.price)}/${cycle.unit}`}
                  </Text>
                  {isCurrent ? (
                    <Text
                      style={{ color: tokens.color.primary[600] }}
                      className="text-[9px] font-black uppercase tracking-widest mt-1"
                    >
                      Current
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>

          {visible.map((row, index) => (
            <View
              key={row.key}
              accessible
              accessibilityRole="text"
              accessibilityLabel={describeRow(row, plans)}
              style={{
                backgroundColor: index % 2 === 0 ? tokens.color.surface.card : 'transparent',
                borderColor: tokens.color.border.default,
              }}
              className="flex-row items-center border-b"
            >
              <View style={{ width: FIRST_COLUMN }} className="px-3 py-3">
                <Text
                  style={{ color: tokens.color.text.primary }}
                  className="text-xs font-bold"
                  numberOfLines={2}
                >
                  {row.label}
                </Text>
              </View>

              {plans.map((plan) => {
                const included = hasKey(row, plan.code);
                const value = row.values[plan.code];

                return (
                  <View
                    key={plan.code}
                    style={{ width: PLAN_COLUMN }}
                    className="items-center justify-center py-3 px-2"
                  >
                    {!included ? (
                      <Ionicons name="remove" size={16} color={tokens.color.text.disabled} />
                    ) : value ? (
                      <Text
                        style={{ color: tokens.color.text.primary }}
                        className="text-[11px] font-black text-center"
                        numberOfLines={1}
                      >
                        {describeEntitlementValue(value)}
                      </Text>
                    ) : (
                      <Ionicons name="checkmark" size={17} color={tokens.color.success.default} />
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>

      {shared.length > 0 ? (
        <TouchableOpacity
          onPress={() => setShowShared((previous) => !previous)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ expanded: showShared }}
          accessibilityLabel={
            showShared
              ? 'Hide the features every plan includes'
              : `Show the ${shared.length} features every plan includes`
          }
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="flex-row items-center justify-center py-3 mt-1"
        >
          <Text style={{ color: tokens.color.primary[600] }} className="text-xs font-black">
            {showShared ? 'Hide' : `Show ${shared.length} more`} every plan includes
          </Text>
          <Ionicons
            name={showShared ? 'chevron-up' : 'chevron-down'}
            size={15}
            color={tokens.color.primary[600]}
            style={{ marginLeft: 4 }}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/**
 * Whether a plan grants a row's key.
 *
 * Presence of the plan code in `values`, not the truthiness of what is there:
 * null means "granted, with no value attached", and testing the value would put
 * a dash against every plan whose entitlement is a plain capability.
 */
function hasKey(row: PlanComparisonRow, planCode: string): boolean {
  return Object.prototype.hasOwnProperty.call(row.values, planCode);
}

/** The whole row as one sentence, so a screen reader does not read a grid of dashes. */
function describeRow(row: PlanComparisonRow, plans: SubscriptionPlan[]): string {
  const parts = plans.map((plan) => {
    if (!hasKey(row, plan.code)) return `${plan.name}: not included`;
    const value = row.values[plan.code];
    return `${plan.name}: ${value ? describeEntitlementValue(value) : 'included'}`;
  });
  return `${row.label}. ${parts.join('. ')}.`;
}
