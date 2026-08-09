// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics controls (Frontend Phase 15, §6 · §7 · §8 · §43)
//
// The range picker, the comparison picker, the filter bar and the export sheet.
// One implementation of each, shared by every dashboard — §8's instruction not
// to duplicate filter implementations across dashboards, and §38's not to create
// one-off components per module.
//
// ── The range picker only offers what the backend will answer ────────────────
//
// §6 asks the frontend to support every range "gracefully" even where the
// backend does not. The reading taken here is that a control which produces an
// error is not graceful support — it is a broken button — so the picker offers
// `access.supportedRanges` and nothing else. All eleven ranges are *modelled*, so
// a deployment that gains 90-day retention needs no client release; only the
// offered set is narrowed.
//
// ── The custom range is validated before it is sent, and refused by the server ─
//
// Both, deliberately. `validateCustomRange` stops a request the client already
// knows is meaningless — §51's instruction not to be gratuitously expensive. It
// does **not** silently correct anything: an inverted range renders a refusal
// with the reason, exactly as Phase 7's creator analytics does, because §6 says
// the server validates and the client does not swap the dates.
//
// ── The date picker is reused, not rebuilt ───────────────────────────────────
//
// `<DatePickerInput>` already exists, already speaks `YYYY-MM-DD`, and is already
// used by four flows. A second calendar in an analytics folder would be a second
// set of month-boundary bugs.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { DatePickerInput } from '@/components/DatePickerInput';
import {
  COMPARISON_LABELS,
  GRANULARITY_LABELS,
  RANGE_LABELS,
  describeRange,
  describeRangeProblem,
  describeTimezone,
  validateCustomRange,
  type CustomRangeProblem,
} from '@/lib/analytics/time-range';
import { dimensionLabel } from '@/mocks/analytics-data';
import type {
  AnalyticsAccess,
  AnalyticsComparisonBasis,
  AnalyticsExportFormat,
  AnalyticsFilter,
  AnalyticsFilterDefinition,
  AnalyticsGranularity,
  AnalyticsRangePreset,
  AnalyticsTimeRange,
} from '@/types/analytics';
import { supportedComparisons, supportedRanges } from '@/lib/analytics/access';
import { AnalyticsChipRow } from './AnalyticsPrimitives';

// ═════════════════════════════════════════════════════════════════════════════
// RANGE — §6
// ═════════════════════════════════════════════════════════════════════════════

export function RangePicker({
  range,
  preset,
  access,
  onChangePreset,
  onChangeCustom,
  locale,
}: {
  range: AnalyticsTimeRange;
  preset: AnalyticsRangePreset;
  access: AnalyticsAccess | null | undefined;
  onChangePreset: (preset: AnalyticsRangePreset) => void;
  onChangeCustom: (from: string, to: string) => void;
  locale?: string;
}) {
  const { tokens } = useTheme();
  const [isCustomOpen, setCustomOpen] = useState(false);

  const options = useMemo(
    () =>
      supportedRanges(access).map((value) => ({
        value,
        label: RANGE_LABELS[value],
      })),
    [access]
  );

  return (
    <View>
      <AnalyticsChipRow
        accessibilityLabel="Reporting period"
        options={options}
        value={preset}
        onChange={(next) => {
          if (next === 'custom') setCustomOpen(true);
          else onChangePreset(next);
        }}
      />

      <View className="flex-row items-center flex-wrap mt-2">
        <Text
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Showing ${describeRange(range, locale)}. ${describeTimezone(range)}`}
          style={{ color: tokens.color.text.placeholder }}
          className="text-[10px] font-bold"
        >
          {describeRange(range, locale)}
        </Text>

        {/* §58's marker. Rendered beside the range rather than in settings — a
            member comparing two dashboards needs to know they share a calendar
            before the comparison means anything. */}
        {range.isDeviceTimezone ? (
          <View className="flex-row items-center ml-2">
            <Ionicons name="globe-outline" size={10} color={tokens.color.text.disabled} />
            <Text
              style={{ color: tokens.color.text.disabled }}
              className="text-[10px] font-bold ml-1"
            >
              your timezone
            </Text>
          </View>
        ) : null}
      </View>

      <CustomRangeSheet
        visible={isCustomOpen}
        initialFrom={range.from}
        initialTo={range.to}
        onClose={() => setCustomOpen(false)}
        onApply={(from, to) => {
          onChangeCustom(from, to);
          setCustomOpen(false);
        }}
      />
    </View>
  );
}

function CustomRangeSheet({
  visible,
  initialFrom,
  initialTo,
  onClose,
  onApply,
}: {
  visible: boolean;
  initialFrom: string;
  initialTo: string;
  onClose: () => void;
  onApply: (from: string, to: string) => void;
}) {
  const { tokens } = useTheme();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  const problem: CustomRangeProblem | null = useMemo(
    () => validateCustomRange(from, to),
    [from, to]
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={{ backgroundColor: tokens.color.surface.overlay }}
        className="flex-1 justify-end"
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{ backgroundColor: tokens.color.surface.card }}
          className="rounded-t-3xl p-5 pb-8"
        >
          <View className="flex-row items-center justify-between mb-4">
            <Text
              accessibilityRole="header"
              style={{ color: tokens.color.text.primary }}
              className="text-lg font-black tracking-tight"
            >
              Choose a period
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={12}
              className="w-9 h-9 items-center justify-center"
            >
              <Ionicons name="close" size={20} color={tokens.color.text.secondary} />
            </Pressable>
          </View>

          <DatePickerInput label="From" value={from} onChangeDate={setFrom} />
          <View className="h-3" />
          <DatePickerInput label="To" value={to} onChangeDate={setTo} />

          {problem ? (
            <View
              accessible
              accessibilityRole="alert"
              accessibilityLabel={describeRangeProblem(problem)}
              style={{ backgroundColor: tokens.color.error.surface }}
              className="rounded-xl p-3 mt-3 flex-row items-start"
            >
              <Ionicons name="alert-circle" size={14} color={tokens.color.error.default} />
              <Text
                style={{ color: tokens.color.error.default }}
                className="text-[11px] font-semibold ml-2 flex-1 leading-relaxed"
              >
                {describeRangeProblem(problem)}
              </Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Apply this period"
            accessibilityState={{ disabled: Boolean(problem) }}
            disabled={Boolean(problem)}
            onPress={() => onApply(from, to)}
            style={{
              backgroundColor: tokens.color.primary[500],
              opacity: problem ? tokens.opacity.disabled : 1,
            }}
            className="rounded-full py-3.5 items-center mt-5"
          >
            <Text className="text-white text-xs font-black uppercase tracking-wider">Apply</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPARISON — §7
// ═════════════════════════════════════════════════════════════════════════════

export function ComparisonPicker({
  comparison,
  access,
  onChange,
}: {
  comparison: AnalyticsComparisonBasis;
  access: AnalyticsAccess | null | undefined;
  onChange: (comparison: AnalyticsComparisonBasis) => void;
}) {
  const options = useMemo(
    () =>
      supportedComparisons(access).map((value) => ({
        value,
        label: COMPARISON_LABELS[value],
      })),
    [access]
  );

  return (
    <AnalyticsChipRow
      accessibilityLabel="Compare against"
      options={options}
      value={comparison}
      onChange={onChange}
    />
  );
}

export function GranularityPicker({
  granularity,
  onChange,
  available = ['day', 'week', 'month'],
}: {
  granularity: AnalyticsGranularity;
  onChange: (granularity: AnalyticsGranularity) => void;
  available?: AnalyticsGranularity[];
}) {
  return (
    <AnalyticsChipRow
      accessibilityLabel="Group by"
      options={available.map((value) => ({ value, label: GRANULARITY_LABELS[value] }))}
      value={granularity}
      onChange={onChange}
    />
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FILTERS — §8
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The shared filter bar.
 *
 * Renders one chip per dimension showing the current selection, and opens a
 * sheet for the values. Multi-select is per dimension because the backend decides
 * it — a country filter is genuinely multi-select and a plan filter is genuinely
 * not, and hard-coding either would be wrong half the time.
 *
 * Facet counts are rendered **only when present**. §26's lesson from Phase 13
 * applies here: counting the values present in the current page and labelling the
 * chips with those numbers would tell the member there are two Ghanaian results
 * when there are two hundred.
 */
export function AnalyticsFilterBar({
  definitions,
  filters,
  onChange,
  onClear,
}: {
  definitions: AnalyticsFilterDefinition[];
  filters: AnalyticsFilter[];
  onChange: (dimension: AnalyticsFilter['dimension'], values: string[]) => void;
  onClear: () => void;
}) {
  const { tokens } = useTheme();
  const [open, setOpen] = useState<AnalyticsFilterDefinition | null>(null);

  if (definitions.length === 0) return null;

  const activeCount = filters.filter((filter) => filter.values.length > 0).length;

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 16 }}>
        {definitions.map((definition) => {
          const selected = filters.find((filter) => filter.dimension === definition.dimension);
          const count = selected?.values.length ?? 0;
          const isActive = count > 0;

          const summary =
            count === 0
              ? definition.label
              : count === 1
                ? definition.options.find((option) => option.key === selected!.values[0])?.label ??
                  definition.label
                : `${definition.label} · ${count}`;

          return (
            <Pressable
              key={definition.dimension}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={
                count === 0
                  ? `Filter by ${dimensionLabel(definition.dimension)}. Nothing selected.`
                  : `Filter by ${dimensionLabel(definition.dimension)}. ${count} selected.`
              }
              onPress={() => setOpen(definition)}
              style={{
                backgroundColor: isActive ? tokens.color.primary[50] : tokens.color.surface.card,
                borderColor: isActive ? tokens.color.primary[500] : tokens.color.border.default,
              }}
              className="flex-row items-center rounded-full border px-3 py-1.5 mr-2"
            >
              <Text
                style={{ color: isActive ? tokens.color.primary[600] : tokens.color.text.secondary }}
                className="text-[11px] font-black"
                numberOfLines={1}
              >
                {summary}
              </Text>
              <Ionicons
                name="chevron-down"
                size={11}
                color={isActive ? tokens.color.primary[600] : tokens.color.text.placeholder}
                style={{ marginLeft: 4 }}
              />
            </Pressable>
          );
        })}

        {activeCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear all filters"
            onPress={onClear}
            className="flex-row items-center px-3 py-1.5"
          >
            <Text
              style={{ color: tokens.color.primary[500] }}
              className="text-[11px] font-black uppercase tracking-wider"
            >
              Clear
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <FilterValueSheet
        definition={open}
        selected={filters.find((filter) => filter.dimension === open?.dimension)?.values ?? []}
        onClose={() => setOpen(null)}
        onApply={(values) => {
          if (open) onChange(open.dimension, values);
          setOpen(null);
        }}
      />
    </View>
  );
}

function FilterValueSheet({
  definition,
  selected,
  onClose,
  onApply,
}: {
  definition: AnalyticsFilterDefinition | null;
  selected: string[];
  onClose: () => void;
  onApply: (values: string[]) => void;
}) {
  const { tokens } = useTheme();
  const [draft, setDraft] = useState<string[]>(selected);

  // Reset the draft whenever a different dimension opens. Without this, opening
  // "Country", selecting two, cancelling and opening "Category" would carry the
  // country selection into the category sheet.
  React.useEffect(() => {
    setDraft(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definition?.dimension]);

  if (!definition) return null;

  const toggle = (key: string) => {
    setDraft((current) =>
      definition.isMultiSelect
        ? current.includes(key)
          ? current.filter((value) => value !== key)
          : [...current, key]
        : current.includes(key)
          ? []
          : [key]
    );
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={{ backgroundColor: tokens.color.surface.overlay }}
        className="flex-1 justify-end"
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{ backgroundColor: tokens.color.surface.card, maxHeight: '70%' }}
          className="rounded-t-3xl p-5 pb-8"
        >
          <View className="flex-row items-center justify-between mb-3">
            <Text
              accessibilityRole="header"
              style={{ color: tokens.color.text.primary }}
              className="text-lg font-black tracking-tight"
            >
              {definition.label}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={12}
              className="w-9 h-9 items-center justify-center"
            >
              <Ionicons name="close" size={20} color={tokens.color.text.secondary} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 380 }}>
            {definition.options.map((option) => {
              const isSelected = draft.includes(option.key);

              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={
                    option.count !== null && option.count !== undefined
                      ? `${option.label}, ${option.count}`
                      : option.label
                  }
                  onPress={() => toggle(option.key)}
                  style={{ borderBottomColor: tokens.color.border.default }}
                  className="flex-row items-center border-b py-3"
                >
                  <Ionicons
                    name={isSelected ? 'checkbox' : 'square-outline'}
                    size={18}
                    color={isSelected ? tokens.color.primary[500] : tokens.color.text.placeholder}
                  />
                  <Text
                    style={{ color: tokens.color.text.primary }}
                    className="text-[13px] font-semibold ml-3 flex-1"
                  >
                    {option.label}
                  </Text>
                  {/* Only when the backend published a facet. See the header. */}
                  {option.count !== null && option.count !== undefined ? (
                    <Text
                      style={{ color: tokens.color.text.placeholder, fontVariant: ['tabular-nums'] }}
                      className="text-[11px] font-bold"
                    >
                      {option.count}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>

          <View className="flex-row mt-4" style={{ gap: 10 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear this filter"
              onPress={() => setDraft([])}
              style={{ borderColor: tokens.color.border.default }}
              className="flex-1 rounded-full border py-3 items-center"
            >
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-xs font-black uppercase tracking-wider"
              >
                Clear
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Apply this filter"
              onPress={() => onApply(draft)}
              style={{ backgroundColor: tokens.color.primary[500] }}
              className="flex-1 rounded-full py-3 items-center"
            >
              <Text className="text-white text-xs font-black uppercase tracking-wider">Apply</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// EXPORT — §43
// ═════════════════════════════════════════════════════════════════════════════

export interface ExportSheetProps {
  visible: boolean;
  onClose: () => void;
  onRequest: (format: AnalyticsExportFormat) => void;
  /** The job, once requested. Drives the state machine below. */
  job: {
    status: 'queued' | 'running' | 'ready' | 'failed' | 'expired';
    downloadUrl?: string | null;
    sizeBytes?: number | null;
    failureReason?: string | null;
  } | null;
  isRequesting: boolean;
  hasTimedOut: boolean;
  /** A sentence describing exactly what will be exported. */
  summary: string;
  onDownload?: (url: string) => void;
  onReset: () => void;
}

/**
 * The export experience.
 *
 * Four states, all of which are reachable: choosing, working, ready and failed.
 * §43 asks for a complete export UX, and the part most often skipped is the
 * failure — a PDF over a long range genuinely cannot be produced, and a sheet
 * that only ever succeeds leaves that path untested.
 *
 * The summary sentence is required rather than optional. Somebody about to export
 * a year of platform analytics should be told that is what they are about to do,
 * before it appears in their downloads folder outside every protection the app
 * provides.
 */
export function ExportSheet({
  visible,
  onClose,
  onRequest,
  job,
  isRequesting,
  hasTimedOut,
  summary,
  onDownload,
  onReset,
}: ExportSheetProps) {
  const { tokens } = useTheme();

  const isWorking = isRequesting || job?.status === 'queued' || job?.status === 'running';
  const isFailed = job?.status === 'failed' || hasTimedOut;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={{ backgroundColor: tokens.color.surface.overlay }}
        className="flex-1 justify-end"
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{ backgroundColor: tokens.color.surface.card }}
          className="rounded-t-3xl p-5 pb-8"
        >
          <View className="flex-row items-center justify-between mb-2">
            <Text
              accessibilityRole="header"
              style={{ color: tokens.color.text.primary }}
              className="text-lg font-black tracking-tight"
            >
              Export
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={12}
              className="w-9 h-9 items-center justify-center"
            >
              <Ionicons name="close" size={20} color={tokens.color.text.secondary} />
            </Pressable>
          </View>

          <Text
            accessible
            accessibilityRole="text"
            style={{ color: tokens.color.text.placeholder }}
            className="text-[11px] font-semibold leading-relaxed mb-4"
          >
            {summary}
          </Text>

          {isFailed ? (
            <View
              accessible
              accessibilityRole="alert"
              accessibilityLabel={`Export failed. ${job?.failureReason ?? 'It took too long and was stopped.'}`}
              style={{ backgroundColor: tokens.color.error.surface }}
              className="rounded-xl p-3.5"
            >
              <View className="flex-row items-center mb-1">
                <Ionicons name="alert-circle" size={14} color={tokens.color.error.default} />
                <Text
                  style={{ color: tokens.color.error.default }}
                  className="text-[10px] font-black uppercase tracking-widest ml-1.5"
                >
                  Could not export
                </Text>
              </View>
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-[12px] font-semibold leading-relaxed"
              >
                {job?.failureReason ??
                  'This export took longer than expected and was stopped. Try a shorter period.'}
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Try again"
                onPress={onReset}
                className="mt-3"
              >
                <Text
                  style={{ color: tokens.color.primary[500] }}
                  className="text-[11px] font-black uppercase tracking-wider"
                >
                  Try again
                </Text>
              </Pressable>
            </View>
          ) : job?.status === 'ready' ? (
            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel={`Your export is ready${job.sizeBytes ? `, ${Math.round(job.sizeBytes / 1024)} kilobytes` : ''}.`}
              style={{ backgroundColor: tokens.color.success.surface }}
              className="rounded-xl p-3.5"
            >
              <View className="flex-row items-center mb-1">
                <Ionicons name="checkmark-circle" size={14} color={tokens.color.success.default} />
                <Text
                  style={{ color: tokens.color.success.default }}
                  className="text-[10px] font-black uppercase tracking-widest ml-1.5"
                >
                  Ready
                </Text>
              </View>
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-[12px] font-semibold leading-relaxed"
              >
                Your file is ready to download
                {job.sizeBytes ? ` (about ${Math.round(job.sizeBytes / 1024)} KB)` : ''}. The link
                expires in a few hours.
              </Text>

              {job.downloadUrl && onDownload ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Download the export"
                  onPress={() => onDownload(job.downloadUrl!)}
                  style={{ backgroundColor: tokens.color.primary[500] }}
                  className="rounded-full py-3 items-center mt-3"
                >
                  <Text className="text-white text-xs font-black uppercase tracking-wider">
                    Download
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : isWorking ? (
            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel="Preparing your export. This usually takes a few seconds."
              style={{ backgroundColor: tokens.color.info.surface }}
              className="rounded-xl p-3.5 flex-row items-center"
            >
              <Ionicons name="hourglass-outline" size={16} color={tokens.color.info.default} />
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-[12px] font-semibold ml-2.5 flex-1 leading-relaxed"
              >
                Preparing your export. This usually takes a few seconds.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {(
                [
                  { format: 'csv' as const, label: 'CSV', hint: 'For a spreadsheet' },
                  { format: 'pdf' as const, label: 'PDF', hint: 'For sharing or printing' },
                  { format: 'json' as const, label: 'JSON', hint: 'For another system' },
                ]
              ).map((option) => (
                <Pressable
                  key={option.format}
                  accessibilityRole="button"
                  accessibilityLabel={`Export as ${option.label}. ${option.hint}.`}
                  onPress={() => onRequest(option.format)}
                  style={{ borderColor: tokens.color.border.default }}
                  className="flex-row items-center rounded-2xl border p-3.5"
                >
                  <Ionicons
                    name="download-outline"
                    size={18}
                    color={tokens.color.text.secondary}
                  />
                  <View className="flex-1 ml-3">
                    <Text
                      style={{ color: tokens.color.text.primary }}
                      className="text-[13px] font-bold"
                    >
                      {option.label}
                    </Text>
                    <Text
                      style={{ color: tokens.color.text.placeholder }}
                      className="text-[11px] font-semibold"
                    >
                      {option.hint}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={14}
                    color={tokens.color.text.placeholder}
                  />
                </Pressable>
              ))}
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
