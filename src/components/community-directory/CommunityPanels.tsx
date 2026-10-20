// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community statistics and governance surfaces (Frontend
// Phase 13, §29, §30, §34, §35, §36, §59)
//
// The reusable panels the community profile, the comparison screen and the
// governance screens compose. They are here rather than in the screens because
// three different screens render community statistics and a fourth renders them in
// a comparison — and a metric that is marked as an estimate on one screen and not
// on another is worse than one that is never marked.
//
// ── §59 is the constraint that shaped this file ───────────────────────────────
//
// "Accessible statistics. Accessible charts. Accessible map alternatives. Do not
// use flags as the only identifier."
//
// So there is no chart in this phase that exists only as a picture. Every
// visualisation here is a *table with a bar drawn over it*: the numbers are real
// text in the tree, the bar is decorative (`accessibilityElementsHidden`), and the
// row's accessible label reads the label, the value, the provenance and the period.
// A screen reader user gets the same information as a sighted one, in the same
// order, without a separate "accessible version" that drifts.
//
// The comparison table is the harder case and gets the same treatment: rows are
// announced as "Events: Nigerian 12, Ghanaian 4, Indian 9", which is the sentence
// a sighted user assembles by eye.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import type {
  CommunityComparison,
  CommunityInitiative,
  CommunityMetric,
  CommunityNotice,
  CommunityReport,
  CommunityRoleHolder,
  CommunityRule,
  CommunityStatistics,
  StatisticsPeriod,
} from '@/types/community-directory';
import {
  CommunityFreshnessNote,
  CommunityMetricFigure,
} from './MultiCommunityGapNotice';
import { CommunityAvatar, CommunityRoleBadge } from './CommunityIdentity';

// ═════════════════════════════════════════════════════════════════════════════
// STATISTICS — §29
// ═════════════════════════════════════════════════════════════════════════════

export const STATISTICS_PERIODS: { value: StatisticsPeriod; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '12m', label: '12 months' },
  { value: 'all', label: 'All time' },
];

/**
 * The period selector.
 *
 * §29 requires the period to be stated. Making it a control rather than a caption
 * means a member can check whether a figure holds over a longer window, which is
 * the question a suspicious number invites.
 */
export function StatisticsPeriodSelector({
  value,
  onChange,
}: {
  value: StatisticsPeriod;
  onChange: (period: StatisticsPeriod) => void;
}) {
  const { tokens } = useTheme();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Time period for these figures"
      className="flex-row flex-wrap"
      testID="statistics-period-selector"
    >
      {STATISTICS_PERIODS.map((period) => {
        const isActive = period.value === value;

        return (
          <TouchableOpacity
            key={period.value}
            accessible
            accessibilityRole="radio"
            accessibilityState={{ selected: isActive, checked: isActive }}
            accessibilityLabel={`Show figures for the last ${period.label}`}
            onPress={() => onChange(period.value)}
            activeOpacity={0.7}
            style={{
              backgroundColor: isActive ? tokens.color.primary[500] : tokens.color.neutral[100],
            }}
            className="rounded-full px-3 py-1.5 mr-2 mb-2"
          >
            <Text
              style={{
                color: isActive ? tokens.color.text.inverse : tokens.color.text.secondary,
              }}
              className="text-[11px] font-bold"
            >
              {period.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/**
 * The statistics grid.
 *
 * Metrics are grouped by provenance — real figures first, estimates after —
 * because that is the order in which they should be trusted, and putting an
 * invented member count above a real event count would imply the opposite.
 */
export function CommunityStatisticsPanel({ statistics }: { statistics: CommunityStatistics }) {
  const { tokens } = useTheme();

  const backend = statistics.metrics.filter((m) => m.value.source === 'backend');
  const estimated = statistics.metrics.filter((m) => m.value.source !== 'backend');

  return (
    <View testID="community-statistics-panel">
      {backend.length > 0 ? (
        <MetricGroup
          title="From Diaspora’s own records"
          subtitle="Counted from what is published on the platform right now."
          metrics={backend}
        />
      ) : null}

      {estimated.length > 0 ? (
        <MetricGroup
          title="Estimates"
          subtitle="No backend records these yet, so these are development figures rather than measurements."
          metrics={estimated}
        />
      ) : null}

      {/* What the platform says it cannot count, with its reason. Never a zero:
          an uncounted figure and a figure of nothing are different statements. */}
      {(statistics.unavailableMetrics ?? []).length > 0 ? (
        <View
          testID="community-statistics-unavailable"
          style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
          className="rounded-2xl border p-3 mb-3"
        >
          <Text
            accessibilityRole="header"
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-black uppercase tracking-widest mb-1"
          >
            Not counted
          </Text>
          {(statistics.unavailableMetrics ?? []).map((metric) => (
            <View
              key={metric.key}
              accessible
              accessibilityLabel={`${metric.label}: not counted. ${metric.reason}`}
              className="py-1.5"
            >
              <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold">
                {metric.label}
              </Text>
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-[10px] font-semibold leading-relaxed"
              >
                {metric.reason}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View
        style={{ backgroundColor: tokens.color.surface.card, borderColor: tokens.color.border.default }}
        className="rounded-2xl border p-3 mt-1"
      >
        <CommunityFreshnessNote freshness={statistics.freshness} />
      </View>
    </View>
  );
}

function MetricGroup({
  title,
  subtitle,
  metrics,
}: {
  title: string;
  subtitle: string;
  metrics: CommunityMetric[];
}) {
  const { tokens } = useTheme();

  return (
    <View className="mb-4">
      <Text
        accessibilityRole="header"
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-black uppercase tracking-widest"
      >
        {title}
      </Text>
      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-semibold leading-relaxed mt-0.5 mb-2"
      >
        {subtitle}
      </Text>

      <View className="flex-row flex-wrap -mx-1">
        {metrics.map((metric) => (
          <View key={metric.key} className="w-1/2 px-1 mb-2">
            <View
              style={{
                backgroundColor: tokens.color.surface.card,
                borderColor: tokens.color.border.default,
              }}
              className="rounded-2xl border p-3"
            >
              <CommunityMetricFigure metric={metric} />
              {metric.isRestricted ? (
                <View className="flex-row items-center mt-1.5">
                  <Ionicons
                    name="lock-closed-outline"
                    size={9}
                    color={tokens.color.text.placeholder}
                  />
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[9px] font-bold ml-1"
                  >
                    Moderators only
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPARISON — §30
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Side-by-side comparison, as an accessible table.
 *
 * **No winner is computed.** No highlighting of the largest value, no ordering by
 * "best", no composite score. §29 and §30 both forbid the frontend inventing an
 * authoritative judgement, and a bold number in the biggest column is exactly such
 * a judgement rendered as typography.
 *
 * The bar is decorative and hidden from the accessibility tree; the numbers beside
 * it are the real content. Each row announces every community's value in one
 * utterance, which is what a sighted reader gets from one glance across the row.
 */
export function CommunityComparisonTable({ comparison }: { comparison: CommunityComparison }) {
  const { tokens } = useTheme();

  return (
    <View testID="community-comparison-table">
      {/* Column headers */}
      <View className="flex-row items-end mb-3">
        <View className="w-[86px]" />
        {comparison.communities.map((community) => (
          <View key={community.id} className="flex-1 items-center px-1">
            <CommunityAvatar community={community} size={28} />
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="text-[9px] font-bold text-center mt-1"
              numberOfLines={2}
            >
              {community.name}
            </Text>
          </View>
        ))}
      </View>

      {comparison.rows.map((row) => {
        const values = row.values.map((v) => v?.value ?? null);
        const max = Math.max(1, ...values.map((v) => v ?? 0));

        const spoken = comparison.communities
          .map((community, index) => {
            const value = row.values[index];
            if (!value) return `${community.name} not available`;
            return `${community.name} ${value.value}${row.unit ?? ''}${
              value.source === 'simulated' ? ' estimated' : ''
            }`;
          })
          .join(', ');

        return (
          <View
            key={row.key}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${row.label}: ${spoken}`}
            style={{ borderColor: tokens.color.border.default }}
            className="flex-row items-center border-b py-2.5"
            testID={`comparison-row-${row.key}`}
          >
            <Text
              style={{ color: tokens.color.text.secondary }}
              className="w-[86px] text-[10px] font-bold pr-2"
              numberOfLines={2}
            >
              {row.label}
            </Text>

            {row.values.map((value, index) => (
              <View key={comparison.communities[index]?.id ?? index} className="flex-1 px-1">
                {value ? (
                  <>
                    <Text
                      style={{ color: tokens.color.text.primary }}
                      className="text-xs font-black text-center"
                    >
                      {formatMetric(value.value)}
                      {row.unit ?? ''}
                    </Text>

                    {/* Decorative. The number above is the content. */}
                    <View
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      style={{ backgroundColor: tokens.color.neutral[200] }}
                      className="h-1 rounded-full mt-1 overflow-hidden"
                    >
                      <View
                        style={{
                          width: `${Math.round(((value.value ?? 0) / max) * 100)}%`,
                          backgroundColor:
                            value.source === 'simulated'
                              ? tokens.color.warning.default
                              : tokens.color.secondary[500],
                        }}
                        className="h-1 rounded-full"
                      />
                    </View>

                    {value.source === 'simulated' ? (
                      <Text
                        style={{ color: tokens.color.warning.default }}
                        className="text-[8px] font-black uppercase text-center mt-0.5"
                      >
                        est.
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[10px] font-bold text-center"
                  >
                    —
                  </Text>
                )}
              </View>
            ))}
          </View>
        );
      })}

      <View className="mt-3">
        <CommunityFreshnessNote freshness={comparison.freshness} />
      </View>
    </View>
  );
}

function formatMetric(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

// ═════════════════════════════════════════════════════════════════════════════
// GOVERNANCE — §36
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A community rule.
 *
 * The consequence is rendered **verbatim and always**, never behind a disclosure.
 * A member reading a rule is entitled to know in the same glance what happens if
 * they break it, and folding that away is how a community ends up enforcing rules
 * nobody read.
 */
export function CommunityRuleCard({ rule }: { rule: CommunityRule }) {
  const { tokens } = useTheme();

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={[
        `Rule ${rule.position}: ${rule.title}`,
        rule.body,
        rule.consequence ? `If this is broken: ${rule.consequence}` : null,
      ]
        .filter(Boolean)
        .join('. ')}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="rounded-2xl border p-3 mb-2"
      testID={`community-rule-${rule.id}`}
    >
      <View className="flex-row items-start">
        <View
          style={{ backgroundColor: tokens.color.neutral[100] }}
          className="w-6 h-6 rounded-lg items-center justify-center mr-2.5"
        >
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[10px] font-black"
          >
            {rule.position}
          </Text>
        </View>

        <View className="flex-1">
          <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold">
            {rule.title}
          </Text>
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[11px] font-semibold leading-relaxed mt-1"
          >
            {rule.body}
          </Text>

          {rule.consequence ? (
            <View
              style={{ backgroundColor: tokens.color.warning.surface }}
              className="rounded-xl px-2.5 py-1.5 mt-2"
            >
              <Text
                style={{ color: tokens.color.warning.default }}
                className="text-[9px] font-black uppercase tracking-wider"
              >
                If this is broken
              </Text>
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-[10px] font-semibold leading-relaxed mt-0.5"
              >
                {rule.consequence}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/**
 * A community notice.
 *
 * Attribution is by **role** where the community publishes no name, and by name
 * plus role where it does. GAP-016's privacy note: a notice may name a moderator,
 * and whether it does is the community's decision rather than the client's.
 */
export function CommunityNoticeCard({ notice }: { notice: CommunityNotice }) {
  const { tokens } = useTheme();

  const attribution = notice.publishedByName
    ? `${notice.publishedByName} · ${notice.publishedByRole}`
    : notice.publishedByRole;

  const expires = notice.expiresAt ? new Date(notice.expiresAt) : null;
  const expired = expires ? expires.getTime() < Date.now() : false;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={[
        notice.isPinned ? 'Pinned notice' : 'Notice',
        notice.title,
        notice.body,
        `Posted by ${attribution}`,
        expired ? 'This notice has expired' : null,
      ]
        .filter(Boolean)
        .join('. ')}
      style={{
        backgroundColor: notice.isPinned ? tokens.color.info.surface : tokens.color.surface.card,
        borderColor: notice.isPinned
          ? `${tokens.color.info.default}44`
          : tokens.color.border.default,
      }}
      className="rounded-2xl border p-3 mb-2"
      testID={`community-notice-${notice.id}`}
    >
      <View className="flex-row items-center mb-1.5">
        {notice.isPinned ? (
          <>
            <Ionicons name="pin" size={11} color={tokens.color.info.default} />
            <Text
              style={{ color: tokens.color.info.default }}
              className="text-[9px] font-black uppercase tracking-widest ml-1 mr-2"
            >
              Pinned
            </Text>
          </>
        ) : null}
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[9px] font-bold flex-1"
          numberOfLines={1}
        >
          {attribution}
        </Text>
        {expired ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[9px] font-black uppercase"
          >
            Expired
          </Text>
        ) : null}
      </View>

      <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold">
        {notice.title}
      </Text>
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-[11px] font-semibold leading-relaxed mt-1"
      >
        {notice.body}
      </Text>
    </View>
  );
}

/**
 * A moderator or ambassador.
 *
 * `areaLabel` is rendered as-is and is city-precision by contract (GAP-018). This
 * component has no path that could render a finer location, because the type does
 * not carry one.
 */
export function CommunityRoleHolderCard({
  holder,
  onPress,
}: {
  holder: CommunityRoleHolder;
  onPress?: () => void;
}) {
  const { tokens } = useTheme();

  const label = [
    holder.displayName,
    holder.role,
    holder.areaLabel,
    holder.since ? `since ${new Date(holder.since).getFullYear()}` : null,
    holder.languages?.length ? `speaks ${holder.languages.join(', ')}` : null,
    holder.bio,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <TouchableOpacity
      accessible
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={label}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="flex-row items-start rounded-2xl border p-3 mb-2"
      testID={`community-role-holder-${holder.userId}`}
    >
      <View
        style={{ backgroundColor: tokens.color.neutral[100] }}
        className="w-10 h-10 rounded-xl items-center justify-center"
      >
        <Text style={{ color: tokens.color.text.secondary }} className="text-sm font-black">
          {holder.displayName.slice(0, 1).toUpperCase()}
        </Text>
      </View>

      <View className="flex-1 ml-3">
        <View className="flex-row items-center flex-wrap">
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-xs font-bold mr-1.5"
            numberOfLines={1}
          >
            {holder.displayName}
          </Text>
          <CommunityRoleBadge role={holder.role} size="xs" />
        </View>

        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-bold mt-0.5"
        >
          {[holder.areaLabel, holder.languages?.join(' · ')].filter(Boolean).join(' · ')}
        </Text>

        {holder.bio ? (
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[10px] font-semibold leading-relaxed mt-1"
            numberOfLines={3}
          >
            {holder.bio}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

/** "31 December 2026" from a calendar date, without a time zone moving the day. */
export function formatInitiativeDate(date: string): string {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return date;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** The status pill's colours, shared by the card and the detail screen. */
export function useInitiativeStatusTone(status: CommunityInitiative['status']) {
  const { tokens } = useTheme();
  return status === 'Active'
    ? { color: tokens.color.success.default, surface: tokens.color.success.surface }
    : status === 'Planned'
      ? { color: tokens.color.info.default, surface: tokens.color.info.surface }
      : status === 'Cancelled'
        ? { color: tokens.color.error.default, surface: tokens.color.error.surface }
        : { color: tokens.color.text.placeholder, surface: tokens.color.neutral[100] };
}

/** "3 taking part · 2 updates" — counts the server made, never a percentage. */
export function initiativeCounts(initiative: CommunityInitiative): string {
  const taking = `${initiative.participantCount} taking part`;
  const updates =
    initiative.updateCount === 1 ? '1 update' : `${initiative.updateCount} updates`;
  return `${taking} · ${updates}`;
}

/**
 * A community initiative — §35, as the server serves it (20 Oct 2026).
 *
 * No progress bar: nothing measures progress, so the server sends no figure and
 * this draws none. The organisers' updates are the account of progress, and the
 * card says how many there are.
 */
export function CommunityInitiativeCard({
  initiative,
  onPress,
}: {
  initiative: CommunityInitiative;
  onPress?: () => void;
}) {
  const { tokens } = useTheme();
  const statusTone = useInitiativeStatusTone(initiative.status);
  const organisers = initiative.organisers.map((organiser) => organiser.displayName).join(', ');

  return (
    <TouchableOpacity
      accessible
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={[
        initiative.title,
        initiative.status,
        initiative.description,
        initiative.targetDate ? `Aiming for ${formatInitiativeDate(initiative.targetDate)}` : null,
        initiativeCounts(initiative),
        organisers ? `Organised by ${organisers}` : null,
        initiative.isParticipant ? 'You are taking part' : null,
      ]
        .filter(Boolean)
        .join('. ')}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="rounded-2xl border p-3 mb-2"
      testID={`community-initiative-${initiative.id}`}
    >
      <View className="flex-row items-center justify-between mb-1.5">
        <View
          style={{ backgroundColor: statusTone.surface }}
          className="px-2 py-0.5 rounded-full"
        >
          <Text
            style={{ color: statusTone.color }}
            className="text-[8px] font-black uppercase tracking-wider"
          >
            {initiative.status}
          </Text>
        </View>

        {initiative.targetDate ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[9px] font-bold"
          >
            aiming for {formatInitiativeDate(initiative.targetDate)}
          </Text>
        ) : null}
      </View>

      <Text style={{ color: tokens.color.text.primary }} className="text-xs font-bold">
        {initiative.title}
      </Text>
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-[11px] font-semibold leading-relaxed mt-1"
        numberOfLines={4}
      >
        {initiative.description}
      </Text>

      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-[10px] font-bold mt-2"
      >
        {initiativeCounts(initiative)}
        {initiative.isParticipant ? ' · you are taking part' : ''}
      </Text>

      {organisers ? (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[9px] font-bold mt-1"
        >
          Organised by {organisers}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MODERATION — §34
// ═════════════════════════════════════════════════════════════════════════════

/**
 * One report in the moderation queue.
 *
 * Renders `reporterCount` and **never a reporter**. `CommunityReport` carries no
 * reporter identity, so this component could not leak one even if a future change
 * tried to — which is the point of putting that constraint in the type rather than
 * in a comment on the screen.
 *
 * The decision buttons are passed in rather than built here, because whether they
 * may be shown depends on a server-reported capability the *screen* holds — and
 * building them here would invite a future caller to render them without checking.
 */
export function CommunityReportCard({
  report,
  actions,
}: {
  report: CommunityReport;
  actions?: React.ReactNode;
}) {
  const { tokens } = useTheme();

  const statusTone =
    report.status === 'Open'
      ? { color: tokens.color.warning.default, surface: tokens.color.warning.surface }
      : report.status === 'Escalated'
        ? { color: tokens.color.error.default, surface: tokens.color.error.surface }
        : { color: tokens.color.text.placeholder, surface: tokens.color.neutral[100] };

  const age = formatAge(report.createdAt);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={[
        `${report.reason} report about a ${report.contentType}`,
        report.status,
        `${report.reporterCount} ${report.reporterCount === 1 ? 'person' : 'people'} reported it`,
        age ? `reported ${age}` : null,
        report.contentExcerpt ? `Content: ${report.contentExcerpt}` : null,
        report.note ? `Note: ${report.note}` : null,
      ]
        .filter(Boolean)
        .join('. ')}
      style={{
        backgroundColor: tokens.color.surface.card,
        borderColor: tokens.color.border.default,
      }}
      className="rounded-2xl border p-3 mb-2"
      testID={`community-report-${report.id}`}
    >
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center">
          <View
            style={{ backgroundColor: statusTone.surface }}
            className="px-2 py-0.5 rounded-full"
          >
            <Text
              style={{ color: statusTone.color }}
              className="text-[8px] font-black uppercase tracking-wider"
            >
              {report.status}
            </Text>
          </View>
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[10px] font-black uppercase tracking-wider ml-2"
          >
            {report.reason}
          </Text>
        </View>

        <Text style={{ color: tokens.color.text.placeholder }} className="text-[9px] font-bold">
          {age}
        </Text>
      </View>

      <View className="flex-row items-center mb-1.5">
        <Ionicons name="flag-outline" size={11} color={tokens.color.text.placeholder} />
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-bold ml-1"
        >
          {report.reporterCount} {report.reporterCount === 1 ? 'report' : 'reports'} · about a{' '}
          {report.contentType}
        </Text>
      </View>

      {report.contentExcerpt ? (
        <View
          style={{ backgroundColor: tokens.color.neutral[50] }}
          className="rounded-xl px-2.5 py-2"
        >
          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-[11px] font-semibold leading-relaxed italic"
            numberOfLines={4}
          >
            “{report.contentExcerpt}”
          </Text>
        </View>
      ) : (
        <Text
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-semibold italic"
        >
          No excerpt was shared with this report.
        </Text>
      )}

      {report.note ? (
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[10px] font-semibold leading-relaxed mt-2"
        >
          {report.note}
        </Text>
      ) : null}

      {actions ? <View className="mt-2.5">{actions}</View> : null}
    </View>
  );
}

function formatAge(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const hours = Math.floor((Date.now() - date.getTime()) / (60 * 60 * 1000));
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}
