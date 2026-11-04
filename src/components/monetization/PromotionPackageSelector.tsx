// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Promotion package selection (Frontend Phase 6)
//
// §8: one promotion architecture, not eight. This component is the "select
// package" and "select duration" steps for every promotable entity — provider,
// job, housing, marketplace, guide, update, event and organisation — with the
// entity injected as a `PromotionTarget` rather than baked in.
//
// The two-step shape comes from what somebody is actually deciding: first what
// kind of visibility, then for how long. B15 serves a flat product list, so the
// grouping happens in `lib/monetization-catalog.ts` and a package with one
// option renders as a single card with no duration step at all — which is the
// common case for guides and events today.
//
// An unavailable option keeps its explanation rather than disappearing. B15
// sends `unavailableReason` precisely so a member sees a greyed-out option with
// a reason, and hiding it would leave somebody wondering why the thing a friend
// bought is not on their screen.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { usePricing } from '@/providers/pricing-provider';
import { describePlacementKind } from '@/lib/monetization-catalog';
import { PriceTag } from './PriceTag';
import type { PromotionOption, PromotionPackage } from '@/types/monetization';

// ─────────────────────────────────────────────────────────────────────────────
// Packages
// ─────────────────────────────────────────────────────────────────────────────

export interface PackageSelectorProps {
  packages: PromotionPackage[];
  selectedId: string | null;
  onSelect: (pkg: PromotionPackage) => void;
  isLoading?: boolean;
}

export function PromotionPackageSelector({
  packages,
  selectedId,
  onSelect,
  isLoading = false,
}: PackageSelectorProps) {
  const { tokens } = useTheme();

  if (isLoading) {
    return (
      <View accessible accessibilityLabel="Loading the promotion options." style={{ gap: 10 }}>
        {[0, 1, 2].map((index) => (
          <View
            key={index}
            style={{ backgroundColor: tokens.color.neutral[100], opacity: 1 - index * 0.25 }}
            className="rounded-2xl h-24"
          />
        ))}
      </View>
    );
  }

  return (
    <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
      {packages.map((pkg) => (
        <PackageCard
          key={pkg.id}
          pkg={pkg}
          isSelected={selectedId === pkg.id}
          onSelect={() => onSelect(pkg)}
        />
      ))}
    </View>
  );
}

function PackageCard({
  pkg,
  isSelected,
  onSelect,
}: {
  pkg: PromotionPackage;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { tokens } = useTheme();
  const pricing = usePricing();
  const kind = describePlacementKind(pkg.placementKind);

  const price = pricing.resolve({
    price: pkg.cheapest?.price,
    isAvailable: pkg.hasAvailableOption,
    unavailableReason: pkg.options.find((option) => !option.isAvailable)?.unavailableReason,
    // Only "from" when there is genuinely more than one price to choose between.
    suffix: pkg.options.length > 1 ? null : pkg.cheapest?.durationDays ? `for ${pkg.cheapest.durationDays} days` : null,
  });

  const spoken = [
    pkg.name,
    pkg.placementDescription,
    pkg.options.length > 1 ? `${pkg.options.length} durations available, from ${price.spoken}` : price.spoken,
    `Up to ${pkg.bestPriorityWeight} times normal visibility`,
    pkg.hasAvailableOption ? null : 'Not available to you at the moment',
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <TouchableOpacity
      onPress={() => pkg.hasAvailableOption && onSelect()}
      disabled={!pkg.hasAvailableOption}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected, disabled: !pkg.hasAvailableOption }}
      accessibilityLabel={spoken}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: isSelected ? tokens.color.primary[500] : tokens.color.border.default,
        borderWidth: isSelected ? 2 : 1,
        opacity: pkg.hasAvailableOption ? 1 : 0.6,
      }}
      className="rounded-2xl p-4"
    >
      <View className="flex-row items-start">
        <View
          style={{ backgroundColor: isSelected ? tokens.color.neutral[100] : tokens.color.neutral[100] }}
          className="w-10 h-10 rounded-xl items-center justify-center mr-3"
        >
          <Ionicons
            name={kind.icon as never}
            size={20}
            color={isSelected ? tokens.color.primary[600] : tokens.color.text.secondary}
          />
        </View>

        <View className="flex-1 mr-3">
          <Text style={{ color: tokens.color.text.primary }} className="text-sm font-black tracking-tight">
            {pkg.name}
          </Text>
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-xs font-medium leading-relaxed mt-1"
          >
            {pkg.placementDescription}
          </Text>
        </View>

        <View className="items-end">
          {pkg.options.length > 1 ? (
            <Text style={{ color: tokens.color.text.placeholder }} className="text-[10px] font-black uppercase tracking-wider mb-0.5">
              From
            </Text>
          ) : null}
          <PriceTag price={price} size="small" align="right" hideNote />
        </View>
      </View>

      <View className="flex-row items-center mt-3 flex-wrap" style={{ gap: 12 }}>
        <Metric icon="trending-up-outline" label={`${pkg.bestPriorityWeight}× visibility`} />
        {pkg.options.length > 1 ? (
          <Metric icon="calendar-outline" label={`${pkg.options.length} durations`} />
        ) : pkg.cheapest?.durationDays ? (
          <Metric icon="calendar-outline" label={`${pkg.cheapest.durationDays} days`} />
        ) : null}
        {pkg.options.some((option) => option.isRenewable) ? (
          <Metric icon="refresh-outline" label="Renewable" />
        ) : null}
      </View>

      {!pkg.hasAvailableOption ? (
        <UnavailableNote
          reason={
            pkg.options.find((option) => option.unavailableReason)?.unavailableReason ??
            'This is not available to you at the moment.'
          }
        />
      ) : null}
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Durations
// ─────────────────────────────────────────────────────────────────────────────

export interface DurationSelectorProps {
  options: PromotionOption[];
  selectedCode: string | null;
  onSelect: (option: PromotionOption) => void;
}

/**
 * The duration step.
 *
 * Each row shows the total and, where both are known, the per-day figure — the
 * comparison somebody is actually making between a 7-day and a 30-day option.
 * That figure is truncated integer division on minor units and is labelled
 * "about", because it is a comparison aid and nobody is ever charged it.
 */
export function PromotionDurationSelector({
  options,
  selectedCode,
  onSelect,
}: DurationSelectorProps) {
  const { tokens } = useTheme();
  const pricing = usePricing();

  return (
    <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
      {options.map((option) => {
        const price = pricing.resolve({
          price: option.price,
          isAvailable: option.isAvailable,
          unavailableReason: option.unavailableReason,
        });

        const isSelected = selectedCode === option.code;
        const perDay = option.pricePerDay ? pricing.format(option.pricePerDay) : null;

        const spoken = [
          option.durationDays ? `${option.durationDays} days` : option.name,
          price.spoken,
          perDay ? `about ${perDay} a day` : null,
          option.isAvailable ? null : option.unavailableReason,
        ]
          .filter(Boolean)
          .join('. ');

        return (
          <TouchableOpacity
            key={option.code}
            onPress={() => option.isAvailable && onSelect(option)}
            disabled={!option.isAvailable}
            activeOpacity={0.8}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected, disabled: !option.isAvailable }}
            accessibilityLabel={spoken}
            style={{
              backgroundColor: isSelected ? tokens.color.neutral[100] : tokens.color.surface.card,
              borderColor: isSelected ? tokens.color.primary[500] : tokens.color.border.default,
              borderWidth: isSelected ? 2 : 1,
              opacity: option.isAvailable ? 1 : 0.6,
            }}
            className="rounded-2xl px-4 py-3.5"
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center flex-1 mr-3">
                <Ionicons
                  name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={isSelected ? tokens.color.primary[500] : tokens.color.text.placeholder}
                  style={{ marginRight: 10 }}
                />
                <View className="flex-1">
                  <Text
                    style={{ color: tokens.color.text.primary }}
                    className="text-sm font-black tracking-tight"
                  >
                    {option.durationDays ? `${option.durationDays} days` : option.name}
                  </Text>
                  {perDay ? (
                    <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-semibold mt-0.5">
                      about {perDay} a day
                    </Text>
                  ) : null}
                </View>
              </View>

              <PriceTag price={price} size="small" align="right" hideNote />
            </View>

            {!option.isAvailable && option.unavailableReason ? (
              <UnavailableNote reason={option.unavailableReason} />
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared pieces
// ─────────────────────────────────────────────────────────────────────────────

function Metric({ icon, label }: { icon: string; label: string }) {
  const { tokens } = useTheme();
  return (
    <View className="flex-row items-center" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Ionicons name={icon as never} size={13} color={tokens.color.text.placeholder} />
      <Text style={{ color: tokens.color.text.placeholder }} className="text-[11px] font-bold ml-1">
        {label}
      </Text>
    </View>
  );
}

/**
 * The backend's own sentence about why something cannot be bought.
 *
 * Rendered verbatim. B15 writes these to be actionable — "available to sellers
 * with at least three completed sales" — and paraphrasing would lose the
 * threshold that tells somebody what to do next.
 */
function UnavailableNote({ reason }: { reason: string }) {
  const { tokens } = useTheme();
  return (
    <View style={{ backgroundColor: tokens.color.warning.surface }} className="rounded-xl px-3 py-2 mt-3">
      <Text style={{ color: tokens.color.warning.default }} className="text-[11px] font-semibold leading-relaxed">
        {reason}
      </Text>
    </View>
  );
}
