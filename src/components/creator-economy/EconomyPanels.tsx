// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Points, revenue, referral and discovery panels (Phase 7)
//
// The money-adjacent surfaces. Three rules run through all of them and each one
// is a rule the brief states:
//
//   §10  points are a count and never a `Money`. `PointsBalanceCard` renders a
//        number with a unit; `RevenueBreakdown` renders `Money` through
//        `AmountDisplay`. There is no component here that can render either.
//
//   §17  pending is not available. `RevenueHeadline` puts them in separate
//        cells with separate tones and separate labels, and there is no
//        addition anywhere — the totals are the server's.
//
//   §18  a signup is not a qualified referral. `ReferralStats` shows four
//        distinct figures rather than one, because collapsing them is exactly
//        how a dashboard comes to promise money the platform never owed.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { AmountDisplay } from '@/components/financial';
import { formatCount, formatPoints, presentEarningState } from '@/lib/creator-economy';
import { formatRelativeTime } from '@/utils/format';
import { CreatorCard, CreatorStatusChip, useToneColours } from './CreatorPrimitives';
import { SimulatedFigure } from './CreatorGapNotice';
import type {
  CreatorEarning,
  CreatorLeaderboard,
  CreatorLeaderboardEntry,
  CreatorPoints,
  CreatorRecommendation,
  CreatorReferral,
  CreatorReferralProgramme,
  CreatorRevenueSummary,
  CreatorReward,
  PublicCreator,
} from '@/types/creator-economy';
import type { Money } from '@/types/financial';

// ═════════════════════════════════════════════════════════════════════════════
// POINTS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The points balance.
 *
 * Rendered on the secondary brand colour rather than the primary, deliberately:
 * the wallet balance card uses the same treatment, and having points look like
 * *a* balance while never looking like *the* balance is the visual half of the
 * points-are-not-money rule.
 */
export function PointsBalanceCard({
  points,
  onConvert,
  canConvert,
  convertBlockedReason,
  onViewHistory,
}: {
  points: CreatorPoints;
  onConvert?: () => void;
  canConvert?: boolean;
  convertBlockedReason?: string;
  onViewHistory?: () => void;
}) {
  const { tokens } = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={[
        `${points.available.toLocaleString()} points available.`,
        points.pending > 0 ? `${points.pending.toLocaleString()} still being confirmed.` : null,
        `${points.lifetimeEarned.toLocaleString()} earned in total.`,
        points.nextThreshold && points.nextThresholdLabel
          ? `${Math.max(0, points.nextThreshold - points.available).toLocaleString()} until ${points.nextThresholdLabel}.`
          : null,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ backgroundColor: tokens.color.secondary[500] }}
      className="rounded-3xl p-5"
    >
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-white/75 text-[10px] font-black uppercase tracking-widest">
          Contribution points
        </Text>
        <SimulatedFigure />
      </View>

      <Text
        className="text-white text-5xl font-black tracking-tight"
        style={{ fontVariant: ['tabular-nums'] }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {points.available.toLocaleString()}
      </Text>

      {points.pending > 0 ? (
        <Text className="text-white/70 text-[11px] font-bold mt-2">
          {points.pending.toLocaleString()} more still being confirmed
        </Text>
      ) : null}

      {points.nextThreshold && points.nextThresholdLabel ? (
        <View className="mt-4">
          <Text className="text-white/70 text-[11px] font-bold mb-1.5">
            {Math.max(0, points.nextThreshold - points.available).toLocaleString()} until{' '}
            {points.nextThresholdLabel}
          </Text>
          <View className="h-1.5 rounded-full overflow-hidden bg-white/20">
            <View
              className="h-full rounded-full bg-white"
              style={{
                width: `${Math.min(100, (points.available / points.nextThreshold) * 100)}%`,
              }}
            />
          </View>
        </View>
      ) : null}

      <View className="flex-row mt-5 pt-4 border-t border-white/20">
        <PointsFigure label="Earned in total" value={points.lifetimeEarned} />
        <PointsFigure label="Converted" value={points.lifetimeConverted} />
        {points.lifetimeSpent > 0 ? (
          <PointsFigure label="Spent" value={points.lifetimeSpent} />
        ) : null}
      </View>

      {points.nextExpiryAt && points.nextExpiryPoints ? (
        <Text className="text-white/70 text-[11px] font-bold mt-3">
          {points.nextExpiryPoints.toLocaleString()} expire {formatRelativeTime(points.nextExpiryAt)}
        </Text>
      ) : null}

      <View className="flex-row mt-5">
        {onConvert ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              canConvert
                ? 'Convert points into wallet credit'
                : (convertBlockedReason ?? 'Conversion is not available')
            }
            accessibilityState={{ disabled: !canConvert }}
            disabled={!canConvert}
            onPress={onConvert}
            className="flex-1 rounded-full py-3 items-center bg-white mr-2"
            style={{ opacity: canConvert ? 1 : 0.5 }}
          >
            <Text
              style={{ color: tokens.color.secondary[500] }}
              className="text-[11px] font-black uppercase tracking-wider"
            >
              Convert to credit
            </Text>
          </Pressable>
        ) : null}

        {onViewHistory ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="See how you earned your points"
            onPress={onViewHistory}
            className="flex-1 rounded-full py-3 items-center border border-white/40"
          >
            <Text className="text-white text-[11px] font-black uppercase tracking-wider">
              History
            </Text>
          </Pressable>
        ) : null}
      </View>

      {!canConvert && convertBlockedReason ? (
        <Text className="text-white/70 text-[11px] font-semibold mt-3 leading-relaxed">
          {convertBlockedReason}
        </Text>
      ) : null}
    </View>
  );
}

function PointsFigure({ label, value }: { label: string; value: number }) {
  return (
    <View className="flex-1">
      <Text className="text-white/65 text-[9px] font-black uppercase tracking-widest mb-1">
        {label}
      </Text>
      <Text className="text-white text-sm font-bold" style={{ fontVariant: ['tabular-nums'] }}>
        {value.toLocaleString()}
      </Text>
    </View>
  );
}

/** One redeemable reward. Points cost, state, and whether it can be redeemed. */
export function RewardCard({
  reward,
  availablePoints,
  onRedeem,
  isRedeeming,
  canRedeem = true,
  redeemBlockedReason,
}: {
  reward: CreatorReward;
  availablePoints: number;
  onRedeem?: (reward: CreatorReward) => void;
  isRedeeming?: boolean;
  canRedeem?: boolean;
  redeemBlockedReason?: string;
}) {
  const { tokens } = useTheme();

  const isAvailable = reward.state === 'Available';
  const affordable = availablePoints >= reward.pointsCost;
  // The button is enabled only when everything lines up — but the *decision* is
  // still the server's. An enabled button that gets refused renders the
  // server's reason; a disabled one explains itself before the tap.
  const enabled = isAvailable && affordable && canRedeem && !isRedeeming;

  const blockedReason = !isAvailable
    ? (reward.lockedReason ?? `This reward is ${String(reward.state).toLowerCase()}.`)
    : !affordable
      ? `You need ${(reward.pointsCost - availablePoints).toLocaleString()} more points.`
      : (redeemBlockedReason ?? null);

  return (
    <CreatorCard
      accessibilityLabel={[
        reward.title,
        reward.description,
        `Costs ${formatPoints(reward.pointsCost)}.`,
        blockedReason ?? 'You can redeem this.',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ marginBottom: 12, opacity: isAvailable ? 1 : 0.6 }}
    >
      <View className="flex-row items-start">
        <View
          style={{ backgroundColor: tokens.color.surface.elevated }}
          className="w-11 h-11 rounded-2xl items-center justify-center mr-3"
        >
          <Text className="text-xl">{reward.icon ?? '🎁'}</Text>
        </View>

        <View className="flex-1">
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-sm font-black tracking-tight"
            numberOfLines={2}
          >
            {reward.title}
          </Text>
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[11px] font-medium mt-1 leading-relaxed"
          >
            {reward.description}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center justify-between mt-3.5">
        <Text
          style={{ color: tokens.color.primary[500], fontVariant: ['tabular-nums'] }}
          className="text-[13px] font-black"
        >
          {formatPoints(reward.pointsCost)}
        </Text>

        {onRedeem ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              enabled
                ? `Redeem ${reward.title}`
                : `Cannot redeem ${reward.title}. ${blockedReason ?? 'It is not available.'}`
            }
            accessibilityState={{ disabled: !enabled, busy: Boolean(isRedeeming) }}
            disabled={!enabled}
            onPress={() => onRedeem(reward)}
            style={{
              backgroundColor: enabled ? tokens.color.primary[500] : tokens.color.neutral[200],
            }}
            className="rounded-full px-4 py-2"
          >
            <Text
              style={{ color: enabled ? '#FFFFFF' : tokens.color.text.disabled }}
              className="text-[10px] font-black uppercase tracking-wider"
            >
              {isRedeeming ? 'Redeeming…' : reward.state === 'Redeemed' ? 'Redeemed' : 'Redeem'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {blockedReason && isAvailable ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-semibold mt-2 leading-relaxed"
        >
          {blockedReason}
        </Text>
      ) : null}
    </CreatorCard>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// REVENUE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The revenue headline.
 *
 * `available` comes from the **real** B15 wallet and `pending` from the
 * simulated attribution, which is why they carry separate marks. §17: the two
 * are never summed, never adjacent without labels, and never the same tone.
 */
export function RevenueHeadline({
  available,
  pending,
  isAvailableReal,
  onOpenWallet,
}: {
  available: Money;
  pending: Money | null;
  isAvailableReal: boolean;
  onOpenWallet?: () => void;
}) {
  const { tokens } = useTheme();

  return (
    <View
      style={{ backgroundColor: tokens.color.primary[500] }}
      className="rounded-3xl p-5"
      accessible
      accessibilityLabel={[
        `Available to withdraw: ${available.currency} ${available.amount.toFixed(2)}.`,
        pending ? `Pending, not yet available: ${pending.currency} ${pending.amount.toFixed(2)}.` : null,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-white/75 text-[10px] font-black uppercase tracking-widest">
          Available to withdraw
        </Text>
        {isAvailableReal ? (
          <View className="flex-row items-center bg-white/20 rounded-full px-2 py-0.5">
            <Ionicons name="shield-checkmark" size={10} color="#FFFFFF" />
            <Text className="text-white text-[9px] font-black uppercase tracking-widest ml-1">
              Your wallet
            </Text>
          </View>
        ) : null}
      </View>

      <Text
        className="text-white text-4xl font-black tracking-tight"
        style={{ fontVariant: ['tabular-nums'] }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {available.symbol ?? ''}
        {available.amount.toLocaleString(undefined, {
          minimumFractionDigits: available.exponent,
          maximumFractionDigits: available.exponent,
        })}
      </Text>

      {pending ? (
        <View className="flex-row items-center mt-3 bg-white/15 rounded-2xl px-3 py-2.5">
          <Ionicons name="hourglass-outline" size={14} color="#FFFFFF" />
          <View className="ml-2 flex-1">
            <Text className="text-white/75 text-[9px] font-black uppercase tracking-widest">
              Pending — not yet yours to withdraw
            </Text>
            <Text
              className="text-white text-sm font-bold mt-0.5"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {pending.symbol ?? ''}
              {pending.amount.toLocaleString(undefined, {
                minimumFractionDigits: pending.exponent,
                maximumFractionDigits: pending.exponent,
              })}
            </Text>
          </View>
        </View>
      ) : null}

      {onOpenWallet ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open your wallet"
          onPress={onOpenWallet}
          className="rounded-full py-3 items-center bg-white mt-4"
        >
          <Text
            style={{ color: tokens.color.primary[600] }}
            className="text-[11px] font-black uppercase tracking-wider"
          >
            Open wallet
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Where the money came from.
 *
 * `sharePercentage` is served rather than computed from the amounts, for the
 * same reason every other percentage in this phase is: the server may exclude
 * reversed and refunded earnings from the denominator, and a client that
 * divided would produce a set of bars that do not add to what the server says.
 */
export function RevenueBreakdown({
  summary,
  onSelectSource,
}: {
  summary: CreatorRevenueSummary;
  onSelectSource?: (source: string) => void;
}) {
  const { tokens } = useTheme();

  if (summary.breakdown.length === 0) {
    return (
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-xs font-semibold py-4 text-center"
      >
        No revenue recorded in this period.
      </Text>
    );
  }

  return (
    <View>
      {summary.breakdown.map((row) => {
        const Container = onSelectSource ? Pressable : View;

        return (
          <Container
            key={String(row.source)}
            accessible
            accessibilityRole={onSelectSource ? 'button' : 'text'}
            accessibilityLabel={`${row.label}: ${row.amount.currency} ${row.amount.amount.toFixed(2)}, ${row.sharePercentage.toFixed(0)} percent of the total, across ${row.transactionCount} ${row.transactionCount === 1 ? 'payment' : 'payments'}.`}
            onPress={onSelectSource ? () => onSelectSource(String(row.source)) : undefined}
            style={{ borderBottomColor: tokens.color.border.default }}
            className="border-b py-3.5"
          >
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-1 mr-3">
                <Text
                  style={{ color: tokens.color.text.primary }}
                  className="text-[13px] font-bold"
                  numberOfLines={1}
                >
                  {row.label}
                </Text>
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[10px] font-bold mt-0.5"
                >
                  {row.transactionCount} {row.transactionCount === 1 ? 'payment' : 'payments'} ·{' '}
                  {row.sharePercentage.toFixed(0)}%
                </Text>
              </View>
              <AmountDisplay value={row.amount} size="small" />
            </View>

            <View
              style={{ backgroundColor: tokens.color.neutral[200] }}
              className="h-1.5 rounded-full overflow-hidden"
            >
              <View
                style={{
                  backgroundColor: tokens.color.primary[500],
                  width: `${Math.max(2, Math.min(100, row.sharePercentage))}%`,
                }}
                className="h-full rounded-full"
              />
            </View>
          </Container>
        );
      })}
    </View>
  );
}

export function EarningRow({
  earning,
  onPress,
}: {
  earning: CreatorEarning;
  onPress?: (earning: CreatorEarning) => void;
}) {
  const { tokens } = useTheme();
  const presentation = presentEarningState(earning.state);
  const colours = useToneColours(presentation.tone);
  const Container = onPress ? Pressable : View;

  const isNegative = earning.state === 'Reversed' || earning.state === 'Refunded';

  return (
    <Container
      accessible
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={[
        earning.description,
        `${earning.netAmount.currency} ${earning.netAmount.amount.toFixed(2)}.`,
        presentation.description,
        earning.availableAt && earning.state === 'Pending'
          ? `Available ${formatRelativeTime(earning.availableAt)}.`
          : null,
        formatRelativeTime(earning.occurredAt),
      ]
        .filter(Boolean)
        .join(' ')}
      onPress={onPress ? () => onPress(earning) : undefined}
      style={{ borderBottomColor: tokens.color.border.default }}
      className="flex-row items-center border-b py-3.5"
    >
      <View
        style={{ backgroundColor: colours.bg }}
        className="w-10 h-10 rounded-full items-center justify-center mr-3"
      >
        <Ionicons name={presentation.icon as never} size={17} color={colours.fg} />
      </View>

      <View className="flex-1 mr-3">
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-[13px] font-bold leading-snug"
          numberOfLines={2}
        >
          {earning.description}
        </Text>
        <View className="flex-row items-center mt-1">
          <Text
            style={{ color: colours.fg }}
            className="text-[10px] font-black uppercase tracking-wider"
          >
            {presentation.label}
          </Text>
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-bold ml-2"
          >
            {formatRelativeTime(earning.occurredAt)}
          </Text>
        </View>

        {earning.state === 'Pending' && earning.availableAt ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-semibold mt-0.5"
          >
            Clears {formatRelativeTime(earning.availableAt)}
          </Text>
        ) : null}
      </View>

      <View className="items-end">
        <AmountDisplay
          value={earning.netAmount}
          size="small"
          tone={isNegative ? 'debit' : earning.state === 'Pending' ? 'muted' : 'credit'}
        />
        {earning.fee && earning.fee.minorUnits > 0 ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[9px] font-bold mt-0.5"
          >
            after {earning.fee.symbol ?? ''}
            {earning.fee.amount.toFixed(2)} fee
          </Text>
        ) : null}
      </View>
    </Container>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// REFERRALS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The four referral figures, kept apart.
 *
 * §18. Invited, signed up, qualified, rewarded — four numbers, because they are
 * four different things and a member who confuses them will believe they are
 * owed money they are not.
 */
export function ReferralStats({ programme }: { programme: CreatorReferralProgramme }) {
  const { tokens } = useTheme();

  const figures = [
    { key: 'invited', label: 'Invited', value: programme.invited, hint: 'People you sent a link to' },
    { key: 'signedUp', label: 'Joined', value: programme.signedUp, hint: 'Of those, who signed up' },
    { key: 'qualified', label: 'Qualified', value: programme.qualified, hint: 'Who met the terms' },
    { key: 'rewarded', label: 'Rewarded', value: programme.confirmedRewards, hint: 'Rewards confirmed' },
  ];

  return (
    <View className="flex-row flex-wrap -mx-1">
      {figures.map((figure) => (
        <View key={figure.key} className="w-1/2 px-1 mb-2">
          <View
            accessible
            accessibilityLabel={`${figure.label}: ${figure.value}. ${figure.hint}.`}
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.border.default,
            }}
            className="rounded-2xl border p-3.5"
          >
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-black uppercase tracking-widest"
            >
              {figure.label}
            </Text>
            <Text
              style={{ color: tokens.color.text.primary, fontVariant: ['tabular-nums'] }}
              className="text-2xl font-black tracking-tight mt-1"
            >
              {figure.value.toLocaleString()}
            </Text>
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-semibold mt-0.5 leading-tight"
            >
              {figure.hint}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function ReferralRow({ referral }: { referral: CreatorReferral }) {
  const { tokens } = useTheme();

  const tone =
    referral.state === 'Rewarded' || referral.state === 'Qualified'
      ? 'success'
      : referral.state === 'Rejected' || referral.state === 'Expired'
        ? 'neutral'
        : 'info';
  const colours = useToneColours(tone);

  return (
    <View
      accessible
      accessibilityLabel={[
        referral.inviteeLabel,
        String(referral.state),
        referral.stateReason,
        referral.rewardPoints ? `${formatPoints(referral.rewardPoints)} earned.` : null,
        `Invited ${formatRelativeTime(referral.invitedAt)}.`,
      ]
        .filter(Boolean)
        .join('. ')}
      style={{ borderBottomColor: tokens.color.border.default }}
      className="flex-row items-start border-b py-3.5"
    >
      <View
        style={{ backgroundColor: colours.bg }}
        className="w-9 h-9 rounded-full items-center justify-center mr-3"
      >
        <Text style={{ color: colours.fg }} className="text-[12px] font-black">
          {referral.inviteeLabel.charAt(0).toUpperCase()}
        </Text>
      </View>

      <View className="flex-1 mr-3">
        <Text
          style={{ color: tokens.color.text.primary }}
          className="text-[13px] font-bold"
          numberOfLines={1}
        >
          {referral.inviteeLabel}
        </Text>
        <Text
          style={{ color: colours.fg }}
          className="text-[10px] font-black uppercase tracking-wider mt-0.5"
        >
          {String(referral.state)}
        </Text>
        {referral.stateReason ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-semibold mt-0.5 leading-relaxed"
          >
            {referral.stateReason}
          </Text>
        ) : null}
      </View>

      <View className="items-end">
        {referral.rewardPoints ? (
          <Text
            style={{ color: tokens.color.success.default, fontVariant: ['tabular-nums'] }}
            className="text-[13px] font-black"
          >
            +{referral.rewardPoints.toLocaleString()}
          </Text>
        ) : null}
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[9px] font-bold mt-0.5"
        >
          {formatRelativeTime(referral.invitedAt)}
        </Text>
      </View>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// RECOMMENDATIONS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The "what to do next" rail.
 *
 * Renders the list in the order it arrived — §28 forbids reordering on the
 * device, and `confidence` decides emphasis only. `reason` is always shown:
 * a suggestion that cannot say why it is being made is a suggestion nobody
 * should act on.
 */
export function RecommendationCard({
  recommendation,
  onPress,
  onDismiss,
  layout = 'rail',
}: {
  recommendation: CreatorRecommendation;
  onPress: (recommendation: CreatorRecommendation) => void;
  onDismiss?: (recommendation: CreatorRecommendation) => void;
  layout?: 'rail' | 'list';
}) {
  const { tokens } = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor: tokens.color.surface.card,
          borderColor: tokens.color.border.default,
        },
        layout === 'rail' ? { width: 260, marginRight: 12 } : { marginBottom: 10 },
      ]}
      className="rounded-2xl border p-4"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${recommendation.title}. ${recommendation.body} Why: ${recommendation.reason}. ${recommendation.actionLabel}.`}
        onPress={() => onPress(recommendation)}
      >
        <View className="flex-row items-start">
          <Text className="text-lg mr-2.5">{recommendation.icon ?? '💡'}</Text>
          <View className="flex-1">
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-[13px] font-black tracking-tight leading-snug"
              numberOfLines={2}
            >
              {recommendation.title}
            </Text>
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[11px] font-medium mt-1 leading-relaxed"
              numberOfLines={layout === 'rail' ? 3 : undefined}
            >
              {recommendation.body}
            </Text>
          </View>
        </View>

        <View
          style={{ backgroundColor: tokens.color.surface.elevated }}
          className="rounded-xl px-2.5 py-1.5 mt-3"
        >
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[10px] font-semibold leading-relaxed"
            numberOfLines={2}
          >
            {recommendation.reason}
          </Text>
        </View>

        <View className="flex-row items-center mt-3">
          <Text
            style={{ color: tokens.color.primary[500] }}
            className="text-[11px] font-black uppercase tracking-wider"
          >
            {recommendation.actionLabel}
          </Text>
          <Ionicons name="arrow-forward" size={13} color={tokens.color.primary[500]} style={{ marginLeft: 4 }} />
        </View>
      </Pressable>

      {onDismiss ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Dismiss: ${recommendation.title}`}
          onPress={() => onDismiss(recommendation)}
          hitSlop={10}
          className="absolute top-3 right-3"
        >
          <Ionicons name="close" size={15} color={tokens.color.text.placeholder} />
        </Pressable>
      ) : null}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DISCOVERY
// ═════════════════════════════════════════════════════════════════════════════

export function CreatorDirectoryCard({
  creator,
  onPress,
}: {
  creator: PublicCreator;
  onPress: (creator: PublicCreator) => void;
}) {
  const { tokens } = useTheme();

  return (
    <CreatorCard
      onPress={() => onPress(creator)}
      accessibilityLabel={[
        creator.displayName,
        creator.isVerifiedCreator ? 'Verified creator.' : null,
        creator.bio,
        `${formatCount(creator.followers)} followers, ${creator.contentPublished} published.`,
        creator.expertise.length > 0 ? `Writes about ${creator.expertise.join(', ')}.` : null,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ marginBottom: 12 }}
    >
      <View className="flex-row items-start">
        <View
          style={{ backgroundColor: tokens.color.primary[500] }}
          className="w-11 h-11 rounded-full items-center justify-center mr-3"
        >
          <Text className="text-white text-base font-black">
            {creator.displayName.charAt(0).toUpperCase()}
          </Text>
        </View>

        <View className="flex-1">
          <View className="flex-row items-center">
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-sm font-black tracking-tight mr-1.5"
              numberOfLines={1}
            >
              {creator.displayName}
            </Text>
            {creator.isVerifiedCreator ? (
              <Ionicons name="checkmark-circle" size={14} color={tokens.color.primary[500]} />
            ) : null}
          </View>

          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-bold mt-0.5"
          >
            {formatCount(creator.followers)} followers · {creator.contentPublished} published
            {creator.countryCode ? ` · ${creator.countryCode}` : ''}
          </Text>
        </View>
      </View>

      {creator.bio ? (
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[11px] font-medium mt-2.5 leading-relaxed"
          numberOfLines={2}
        >
          {creator.bio}
        </Text>
      ) : null}

      {creator.expertise.length > 0 ? (
        <View className="flex-row flex-wrap mt-2.5">
          {creator.expertise.slice(0, 3).map((item) => (
            <View
              key={item}
              style={{ backgroundColor: tokens.color.surface.elevated }}
              className="rounded-full px-2.5 py-1 mr-1.5 mb-1.5"
            >
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-[10px] font-bold"
              >
                {item}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </CreatorCard>
  );
}

export function LeaderboardRow({
  entry,
  scoreLabel,
  isViewer,
}: {
  entry: CreatorLeaderboardEntry;
  scoreLabel: string;
  isViewer: boolean;
}) {
  const { tokens } = useTheme();

  const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : null;
  const deltaTone =
    !entry.rankDelta ? 'neutral' : entry.rankDelta > 0 ? 'success' : 'warning';
  const deltaColours = useToneColours(deltaTone);

  return (
    <View
      accessible
      accessibilityLabel={[
        `Rank ${entry.rank}.`,
        entry.displayName,
        isViewer ? 'This is you.' : null,
        entry.isVerifiedCreator ? 'Verified creator.' : null,
        `${scoreLabel}: ${entry.score.toLocaleString()}.`,
        entry.rankDelta
          ? `${entry.rankDelta > 0 ? 'Up' : 'Down'} ${Math.abs(entry.rankDelta)} since last time.`
          : null,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        borderBottomColor: tokens.color.border.default,
        backgroundColor: isViewer ? tokens.color.primary[50] : 'transparent',
      }}
      className="flex-row items-center border-b py-3 px-3 rounded-xl"
    >
      <View className="w-8 items-center mr-2">
        {medal ? (
          <Text className="text-base">{medal}</Text>
        ) : (
          <Text
            style={{ color: tokens.color.text.secondary, fontVariant: ['tabular-nums'] }}
            className="text-[13px] font-black"
          >
            {entry.rank}
          </Text>
        )}
      </View>

      <View
        style={{ backgroundColor: tokens.color.surface.elevated }}
        className="w-8 h-8 rounded-full items-center justify-center mr-3"
      >
        <Text style={{ color: tokens.color.text.secondary }} className="text-[12px] font-black">
          {entry.displayName.charAt(0).toUpperCase()}
        </Text>
      </View>

      <View className="flex-1 mr-2">
        <View className="flex-row items-center">
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-[13px] font-bold mr-1.5"
            numberOfLines={1}
          >
            {entry.displayName}
          </Text>
          {entry.isVerifiedCreator ? (
            <Ionicons name="checkmark-circle" size={12} color={tokens.color.primary[500]} />
          ) : null}
          {isViewer ? (
            <View
              style={{ backgroundColor: tokens.color.primary[500] }}
              className="rounded-full px-1.5 py-0.5 ml-1.5"
            >
              <Text className="text-white text-[8px] font-black uppercase tracking-widest">You</Text>
            </View>
          ) : null}
        </View>

        {entry.rankDelta ? (
          <View className="flex-row items-center mt-0.5">
            <Ionicons
              name={entry.rankDelta > 0 ? 'arrow-up' : 'arrow-down'}
              size={9}
              color={deltaColours.fg}
            />
            <Text style={{ color: deltaColours.fg }} className="text-[9px] font-black ml-0.5">
              {Math.abs(entry.rankDelta)}
            </Text>
          </View>
        ) : null}
      </View>

      <Text
        style={{ color: tokens.color.text.primary, fontVariant: ['tabular-nums'] }}
        className="text-[13px] font-black"
      >
        {formatCount(entry.score)}
      </Text>
    </View>
  );
}

/** The header above a leaderboard: what the score means and when it was made. */
export function LeaderboardHeader({ leaderboard }: { leaderboard: CreatorLeaderboard }) {
  const { tokens } = useTheme();

  return (
    <View className="mb-3">
      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-base font-black tracking-tight"
        accessibilityRole="header"
      >
        {leaderboard.title}
      </Text>
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[11px] font-semibold mt-0.5"
      >
        {leaderboard.periodLabel} · ranked by {leaderboard.scoreLabel.toLowerCase()} · updated{' '}
        {formatRelativeTime(leaderboard.updatedAt)}
      </Text>
    </View>
  );
}
