// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Report builder (Frontend Phase 15, §44)
//
// Pick a subject, some figures, a period, a comparison and a visualization;
// preview it against live data; save it.
//
// ── The preview is the point ─────────────────────────────────────────────────
//
// A report builder that only saves a configuration is a form. The member cannot
// tell whether they have asked a sensible question until they run it, and the
// commonest outcome of a form-only builder is a library of saved reports nobody
// opens twice.
//
// So the preview runs the actual query, through the actual hook, with the actual
// provenance markers — which also means a member building a report over a metric
// with no backend behind it sees that before they save it rather than after.
//
// ── Only what fits the product ───────────────────────────────────────────────
//
// §44 says implement only capabilities that fit the existing product scope. The
// metric picker offers the metrics the *catalogue* says are meaningful for the
// chosen subject, not the whole union — a report of "housing enquiries" for a
// creator subject is not a report, it is a category error waiting to render as
// zeros.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from '@/components/layout/KeyboardAwareScrollView';
import { useTheme } from '@/design-system';
import { usePricing } from '@/providers/pricing-provider';
import {
  useAnalyticsAccess,
  useAnalyticsControls,
  useAnalyticsDataset,
  useAnalyticsReport,
  useReportMutations,
} from '@/hooks/analytics';
import { definitionsForSubject } from '@/lib/analytics/definitions';
import { SUBJECT_LABELS } from '@/lib/analytics/access';
import { describeRange } from '@/lib/analytics/time-range';
import { trackAnalyticsEvent } from '@/lib/analytics/events';
import {
  AnalyticsChipRow,
  AnalyticsGapNotice,
  AnalyticsHeader,
  AnalyticsSection,
  ChartCard,
  ComparisonPicker,
  MetricGrid,
  RangePicker,
} from '@/components/analytics';
import type {
  AnalyticsMetricKey,
  AnalyticsSubject,
  AnalyticsSubjectType,
  AnalyticsVisualization,
} from '@/types/analytics';

/** The subjects a member can build a report about. */
const SUBJECT_OPTIONS: AnalyticsSubjectType[] = [
  'creator',
  'seller',
  'landlord',
  'provider',
  'employer',
  'organization',
  'community',
  'country',
  'platform',
];

const VISUALIZATIONS: { value: AnalyticsVisualization; label: string }[] = [
  { value: 'metricCards', label: 'Figures' },
  { value: 'line', label: 'Line' },
  { value: 'bar', label: 'Bars' },
  { value: 'table', label: 'Table' },
];

export default function ReportBuilderScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const pricing = usePricing();
  const { reportId } = useLocalSearchParams<{ reportId?: string }>();

  const existing = useAnalyticsReport(reportId);

  const [subjectType, setSubjectType] = useState<AnalyticsSubjectType>('creator');
  const [selectedMetrics, setSelectedMetrics] = useState<AnalyticsMetricKey[]>([]);
  const [visualization, setVisualization] = useState<AnalyticsVisualization>('metricCards');
  const [name, setName] = useState('');

  const subject = useMemo<AnalyticsSubject>(() => ({ type: subjectType, id: null }), [subjectType]);
  const access = useAnalyticsAccess(subject);
  const controls = useAnalyticsControls({
    initialPreset: 'last30d',
    reportingTimezone: access.access.reportingTimezone,
  });

  const { create, update } = useReportMutations();

  useEffect(() => {
    trackAnalyticsEvent('analytics.report.builder_opened');
  }, []);

  // Loading an existing report restores its configuration. The *range* is
  // restored as dates rather than as a preset, because "last 30 days" resolved
  // when the report was saved is a different window now — and a report that
  // silently moved its own period would be a report nobody could reproduce.
  useEffect(() => {
    const report = existing.report;
    if (!report) return;
    setSubjectType(report.query.subject.type);
    setSelectedMetrics(report.query.metrics ?? []);
    setVisualization(report.visualization);
    setName(report.name);
    controls.setCustomRange(report.query.range.from, report.query.range.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.report?.reportId]);

  // §44: only the metrics the catalogue says are meaningful for this subject.
  const available = useMemo(() => definitionsForSubject(subjectType), [subjectType]);

  // A metric selected for one subject may be meaningless for the next, so the
  // selection is narrowed rather than carried over silently.
  useEffect(() => {
    setSelectedMetrics((current) =>
      current.filter((key) => available.some((definition) => definition.key === key))
    );
  }, [available]);

  const query = useMemo(
    () => ({
      subject,
      metrics: selectedMetrics.length > 0 ? selectedMetrics : undefined,
      range: controls.range,
      granularity: controls.granularity,
      comparison: controls.comparison,
      includeSeries: visualization !== 'metricCards',
    }),
    [subject, selectedMetrics, controls.range, controls.granularity, controls.comparison, visualization]
  );

  const preview = useAnalyticsDataset(query, {
    enabled: access.access.canView,
    access: access.access,
  });

  const canSave = name.trim().length > 0 && selectedMetrics.length > 0;

  const handleSave = () => {
    if (!canSave) return;

    if (reportId && existing.report) {
      update.mutate(
        { reportId, input: { name: name.trim(), query, visualization } },
        { onSuccess: () => router.back() }
      );
    } else {
      create.mutate(
        { name: name.trim(), query, visualization, sharing: 'private' },
        {
          onSuccess: () => {
            trackAnalyticsEvent('analytics.report.created', {
              subjectType,
              visualization,
              metricCount: selectedMetrics.length,
            });
            router.back();
          },
        }
      );
    }
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <AnalyticsHeader
        title={reportId ? 'Edit report' : 'Build a report'}
        subtitle="Pick what you want to see"
      />

      {/* The report name is typed near the top and the save control sits well
          below it. A plain ScrollView cannot help on Android 15+, where the
          window never resizes for the keyboard. */}
      <KeyboardAwareScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20 }}
        extraBottomInset={96}
      >
        <View className="mb-5">
          <AnalyticsGapNotice
            gapKey="savedReports"
            compact
            detail="Reports are held for this session only — Diaspora has nowhere to store them yet."
          />
        </View>

        <AnalyticsSection title="Name">
          <TextInput
            accessibilityLabel="Report name"
            placeholder="What is this report for?"
            placeholderTextColor={tokens.color.text.placeholder}
            value={name}
            onChangeText={setName}
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.border.default,
              color: tokens.color.text.primary,
            }}
            className="rounded-2xl border px-4 py-3.5 text-[14px] font-semibold"
          />
        </AnalyticsSection>

        <AnalyticsSection title="About" subtitle="What the report is about">
          <AnalyticsChipRow
            accessibilityLabel="Report subject"
            options={SUBJECT_OPTIONS.map((value) => ({ value, label: SUBJECT_LABELS[value] }))}
            value={subjectType}
            onChange={setSubjectType}
          />
        </AnalyticsSection>

        <AnalyticsSection
          title="Figures"
          subtitle={`${selectedMetrics.length} of ${available.length} selected`}
        >
          <View
            style={{
              backgroundColor: tokens.color.surface.card,
              borderColor: tokens.color.border.default,
            }}
            className="rounded-2xl border overflow-hidden"
          >
            {available.slice(0, 24).map((definition, index) => {
              const isSelected = selectedMetrics.includes(definition.key);

              return (
                <Pressable
                  key={definition.key}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={`${definition.label}. ${definition.definition}`}
                  onPress={() =>
                    setSelectedMetrics((current) =>
                      isSelected
                        ? current.filter((key) => key !== definition.key)
                        : [...current, definition.key]
                    )
                  }
                  style={{
                    borderTopColor: tokens.color.border.default,
                    borderTopWidth: index === 0 ? 0 : 1,
                  }}
                  className="flex-row items-center px-4 py-3"
                >
                  <Ionicons
                    name={isSelected ? 'checkbox' : 'square-outline'}
                    size={18}
                    color={isSelected ? tokens.color.primary[500] : tokens.color.text.placeholder}
                  />
                  <View className="flex-1 ml-3">
                    <Text
                      style={{ color: tokens.color.text.primary }}
                      className="text-[13px] font-semibold"
                    >
                      {definition.label}
                    </Text>
                    <Text
                      style={{ color: tokens.color.text.placeholder }}
                      className="text-[10px] font-semibold mt-0.5"
                      numberOfLines={2}
                    >
                      {definition.definition}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </AnalyticsSection>

        <AnalyticsSection title="Period">
          <RangePicker
            range={controls.range}
            preset={controls.preset}
            access={access.access}
            onChangePreset={controls.setPreset}
            onChangeCustom={controls.setCustomRange}
            locale={pricing.locale}
          />
        </AnalyticsSection>

        <AnalyticsSection title="Compare against">
          <ComparisonPicker
            comparison={controls.comparison}
            access={access.access}
            onChange={controls.setComparison}
          />
        </AnalyticsSection>

        <AnalyticsSection title="Show as">
          <AnalyticsChipRow
            accessibilityLabel="Visualization"
            options={VISUALIZATIONS}
            value={visualization}
            onChange={setVisualization}
          />
        </AnalyticsSection>

        {/* The preview. Runs the real query — see the header. */}
        {selectedMetrics.length > 0 && preview.dataset ? (
          <AnalyticsSection
            title="Preview"
            subtitle={`${describeRange(controls.range, pricing.locale)} · live figures`}
          >
            {visualization === 'metricCards' || preview.dataset.series.length === 0 ? (
              <MetricGrid metrics={preview.dataset.metrics} locale={pricing.locale} compact />
            ) : (
              <ChartCard
                title={name || 'Preview'}
                series={preview.dataset.series}
                kind={visualization === 'bar' ? 'bar' : 'line'}
                locale={pricing.locale}
              />
            )}
          </AnalyticsSection>
        ) : null}
      </KeyboardAwareScrollView>

      <View
        style={{
          backgroundColor: tokens.color.surface.card,
          borderTopColor: tokens.color.border.default,
          paddingBottom: insets.bottom + 12,
        }}
        className="border-t px-5 pt-3"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={reportId ? 'Save changes' : 'Save this report'}
          accessibilityState={{ disabled: !canSave, busy: create.isPending || update.isPending }}
          disabled={!canSave || create.isPending || update.isPending}
          onPress={handleSave}
          style={{
            backgroundColor: tokens.color.primary[500],
            opacity: canSave ? 1 : tokens.opacity.disabled,
          }}
          className="rounded-full py-3.5 items-center"
        >
          <Text className="text-white text-xs font-black uppercase tracking-wider">
            {create.isPending || update.isPending ? 'Saving…' : reportId ? 'Save changes' : 'Save report'}
          </Text>
        </Pressable>

        {!canSave ? (
          <Text
            accessible
            accessibilityRole="text"
            style={{ color: tokens.color.text.placeholder }}
            className="text-[10px] font-semibold text-center mt-2"
          >
            {name.trim().length === 0
              ? 'Give the report a name to save it.'
              : 'Pick at least one figure to save it.'}
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
