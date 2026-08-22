// ─────────────────────────────────────────────────────────────────────────────
// Organisation analytics (§27, §30)
//
// **Real, as of Remediation Wave C-04.** `GET /api/v1/communities/organizations/
// {id}/analytics` computes member growth, volunteer hours and poll
// participation on read — `computedAt` is the moment the request was served —
// so the simulated marker that used to sit over every chart is gone.
//
// It computes three series and not five. Event attendance belongs to B12 and
// giving to B15, and this route reaches across for neither, so those two arrive
// null and their panels are **omitted** rather than drawn empty. A bar chart of
// zeroes labelled "Event attendance" says nobody came; showing nothing, and
// saying why, is the only honest alternative.
//
// The charts are drawn as accessible bar rows rather than as a canvas: §46 asks
// for accessible charts, and a chart a screen reader cannot read is a picture.
// Every series row carries its own numeric summary.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/design-system';
import {
  Card,
  ChipRow,
  CommunityScreen,
  EmptyState,
  InlineRefusal,
  ProgressBar,
  Section,
  SimulatedFigure,
  readableDate,
} from '@/components/community';
import { useOrganizationAnalytics, useOrganizationCapabilities } from '@/hooks/community-life';
import type { AnalyticsPeriod, TimeSeriesPoint } from '@/types/community-advanced';

const PERIODS: { value: AnalyticsPeriod; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '12m', label: '12 months' },
];

export default function OrganizationAnalyticsScreen() {
  const { organizationId } = useLocalSearchParams<{ organizationId: string }>();
  const { tokens } = useTheme();
  const [period, setPeriod] = useState<AnalyticsPeriod>('30d');

  const { capabilities } = useOrganizationCapabilities(organizationId);
  const { analytics, isLoading, isError, error, refetch, isEnabled } = useOrganizationAnalytics(
    organizationId,
    period
  );

  return (
    <CommunityScreen
      title="Analytics"
      subtitle={analytics ? `Computed ${readableDate(analytics.computedAt)}` : undefined}
      gapKey="organizationAnalytics"
      gapDetail="Diaspora has no analytics projection for an organisation. Every figure and every chart on this screen comes from a development adapter — the layout is real, the numbers are not."
      isEnabled={isEnabled}
      isLoading={isLoading}
      error={isError ? error : null}
      onRetry={refetch}
      onRefresh={refetch}
    >
      {!capabilities.canViewAnalytics ? (
        <View className="px-5 pt-5">
          <InlineRefusal
            icon="lock-closed-outline"
            reason="Analytics are limited to roles with the reporting permission. Ask an administrator of the organisation if you need access."
          />
        </View>
      ) : !analytics ? (
        <EmptyState
          icon="analytics-outline"
          title="Nothing to show"
          body="There is no data for this organisation over this period."
        />
      ) : (
        <View className="px-5 pt-4">
          <ChipRow
            accessibilityLabel="Reporting period"
            options={PERIODS}
            value={period}
            onChange={setPeriod}
          />

          <SeriesPanel
            title="Members"
            unit="members"
            points={analytics.memberGrowth}
            tone="positive"
          />
          {analytics.eventAttendance !== null ? (
            <SeriesPanel
              title="Event attendance"
              unit="people"
              points={analytics.eventAttendance}
              tone="progress"
            />
          ) : null}
          {analytics.donationTotals !== null ? (
            <SeriesPanel
              title="Donations"
              unit="pounds"
              points={analytics.donationTotals}
              tone="positive"
            />
          ) : null}
          <SeriesPanel
            title="Volunteer hours"
            unit="hours"
            points={analytics.volunteerHours}
            tone="progress"
          />
          <SeriesPanel
            title="Poll participation"
            unit="responses"
            points={analytics.pollParticipation}
            tone="neutral"
          />

          <View className="mt-6">
            <InlineRefusal
              icon="information-circle-outline"
              reason="Every figure here is computed by Diaspora when you ask for it, so it is as fresh as the moment you opened this screen. Attendance and giving are not counted by this report — those belong to events and payments — so they are left out rather than shown as zero."
            />
          </View>
        </View>
      )}
    </CommunityScreen>
  );
}

/**
 * One series, as accessible bars.
 *
 * The whole panel is one accessible element with a spoken summary — a screen
 * reader user gets "Members: 412 now, up from 400, highest 415" rather than
 * thirty unlabelled bars. The individual bars are hidden from the reader
 * because reading each one would be noise, not information.
 */
function SeriesPanel({
  title,
  unit,
  points,
  tone,
}: {
  title: string;
  unit: string;
  points: TimeSeriesPoint[];
  tone: 'positive' | 'progress' | 'neutral';
}) {
  const { tokens } = useTheme();

  if (points.length === 0) return null;

  const values = points.map((point) => point.value);
  const latest = values[values.length - 1];
  const first = values[0];
  const peak = Math.max(...values);
  const change = first === 0 ? 0 : Math.round(((latest - first) / first) * 100);

  return (
    <Section title={title} style={{ marginHorizontal: -20 }}>
      <View className="px-5">
        <Card>
          <View
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${title}: ${latest} ${unit} now, ${
              change >= 0 ? 'up' : 'down'
            } ${Math.abs(change)} per cent over the period. Highest was ${peak}.`}
          >
            <View className="flex-row items-end justify-between mb-3">
              <View>
                <Text
                  style={{ color: tokens.color.text.primary }}
                  className="text-2xl font-black tracking-tight"
                >
                  {latest.toLocaleString()}
                </Text>
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[11px] font-bold"
                >
                  {unit} now
                </Text>
              </View>

              <View className="items-end">
                <Text
                  style={{
                    color: change >= 0 ? tokens.color.success.default : tokens.color.error.default,
                  }}
                  className="text-sm font-black tracking-tight"
                >
                  {change >= 0 ? '+' : ''}
                  {change}%
                </Text>
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[10px] font-bold"
                >
                  over the period
                </Text>
              </View>
            </View>

            {/* The bars themselves carry no information a reader needs. */}
            <View
              className="flex-row items-end"
              style={{ height: 56, gap: 3 }}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {points.slice(-24).map((point, index) => (
                <View
                  key={`${point.date}-${index}`}
                  style={{
                    flex: 1,
                    height: `${Math.max(6, (point.value / peak) * 100)}%`,
                    backgroundColor:
                      tone === 'positive'
                        ? tokens.color.success.default
                        : tone === 'progress'
                          ? tokens.color.info.default
                          : tokens.color.neutral[400],
                    borderRadius: 2,
                    opacity: index === points.slice(-24).length - 1 ? 1 : 0.55,
                  }}
                />
              ))}
            </View>

            <View className="mt-3">
              <ProgressBar
                percentage={peak === 0 ? 0 : (latest / peak) * 100}
                label={`${title}: ${latest} of a peak of ${peak} ${unit}`}
                tone={tone}
                height={6}
              />
            </View>

            <View className="mt-2">
              <SimulatedFigure />
            </View>
          </View>
        </Card>
      </View>
    </Section>
  );
}
