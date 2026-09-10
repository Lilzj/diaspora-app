// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics instrumentation (Frontend Phase 15, §49 · §50)
//
// §49's event list, as a closed union.
//
// **No buffer, no sanitiser and no transport in this file.** All three live in
// `creator-analytics.ts`, which registered the absent ingestion endpoint as
// CREATOR-GAP-016 — restated at platform scope here as
// FRONTEND-PHASE15-GAP-029 — and which Phases 8, 12 and 13 already extend the
// same way. This is the fourth extension and the fifth vocabulary, and it is
// still one buffer.
//
// §49 says "do not create duplicate tracking systems" and this is what that
// looks like in practice: a phase whose entire subject is analytics adds a
// vocabulary and an allow-list extension, and touches nothing else.
//
// ── §50, and the convention this file follows ────────────────────────────────
//
// §50 asks for one naming convention with no unexplained mixing. The platform
// already has one, established in Phase 7 and unchanged since:
//
//     domain.subject.verb        lower-case, dotted, past-tense verb
//
// `creator.dashboard.viewed`, `community.membership.activated`,
// `maps.route.planned`. Phase 15 uses `analytics.*` and nothing else, so every
// event from this phase sorts together in a dashboard and no reviewer has to
// ask which phase emitted a given name.
//
// The verb is past tense because an event is a record of something that has
// already happened. `analytics.export.requested` and `analytics.export.ready`
// are two events rather than one with a status property, for the same reason
// Phase 12 split membership activation from membership payment failure: the
// interesting number is how often the second follows the first, and a status
// property makes that a group-by instead of a funnel.
//
// ── The rule specific to this phase ──────────────────────────────────────────
//
// **An analytics event must not carry an analytics value.**
//
// This is the one mistake a telemetry vocabulary for an analytics feature is
// uniquely exposed to, and it would be easy to make: `analytics.metric.viewed`
// with a `value` property looks harmless and is a channel that exports the
// platform's own figures — including suppressed ones, including financial ones —
// into a stream governed by a different retention policy and read by a wider
// set of services than the dashboard was.
//
// So the allow-list below registers `metricKey`, `subjectType`, `rangePreset`,
// `comparisonBasis` and counts of things — and no `value`, no `amount`, no
// `changePercent`, no `total`. What was looked at, never what it said. The
// existing sanitiser drops anything else before it reaches the buffer, so this
// is enforcement rather than intention.
//
// **`subjectId` is deliberately absent too.** A stream of
// `analytics.dashboard.viewed · subjectType=community · subjectId=dev-ng`
// events is a record of which communities a member inspects, which is a
// membership signal by another route — the exact thing Phase 13's allow-list
// was shaped to prevent. The subject *type* answers every product question
// worth asking ("does anybody use the housing dashboard?") and identifies
// nothing.
// ─────────────────────────────────────────────────────────────────────────────

import {
  registerAllowedProperties,
  trackPlatformEvent,
  type EventProperties,
} from '@/lib/creator-analytics';
import type {
  AnalyticsComparisonBasis,
  AnalyticsDataStatus,
  AnalyticsDimensionKey,
  AnalyticsExportFormat,
  AnalyticsMetricKey,
  AnalyticsRangePreset,
  AnalyticsSubjectType,
  AnalyticsVisualization,
} from '@/types/analytics';

/**
 * Every analytics event this phase emits.
 *
 * §49's list, extended only where a screen genuinely needed a distinct name.
 * The per-audience `*AnalyticsViewed` events §49 names are collapsed into one
 * `analytics.dashboard.viewed` carrying a `subjectType`, because eleven event
 * names that differ only by a low-cardinality label is a taxonomy that has to be
 * edited every time a dashboard is added — and §49's own instruction not to
 * duplicate tracking applies to names as much as to systems.
 */
export type AnalyticsEvent =
  // ── The three the platform accepts from a client ──────────────────────────
  //
  // Registered in `AnalyticsSchemaSeeder` with `AllowsClientSubmission: true`,
  // allow-listed in `telemetry-api.ts`, and until now absent from this union
  // — so no call site could have emitted one even by accident. Every other
  // name below is refused before the network as `event-unknown`, by design:
  // they are server-produced facts and §41 forbids a client incrementing one.
  //
  // Emitted through `analytics/content-events.ts`, which owns the GUID check
  // and the route-segment vocabulary the server parses.
  | 'content.viewed'
  | 'profile.viewed'
  | 'content.impression'
  // Surfaces — §49's DashboardViewed, and the per-audience variants collapsed
  | 'analytics.hub.viewed'
  | 'analytics.dashboard.viewed'
  | 'analytics.metric.viewed'
  | 'analytics.metric.definition_opened'
  | 'analytics.chart.interacted'
  | 'analytics.breakdown.expanded'
  | 'analytics.drilldown.opened'
  | 'analytics.leaderboard.viewed'
  | 'analytics.funnel.viewed'
  | 'analytics.retention.viewed'
  | 'analytics.insight.viewed'
  | 'analytics.insight.action_taken'
  // Controls — §49's AnalyticsFilterApplied and AnalyticsDateRangeChanged
  | 'analytics.filter.applied'
  | 'analytics.filter.cleared'
  | 'analytics.range.changed'
  | 'analytics.comparison.changed'
  | 'analytics.granularity.changed'
  // Reports — §49's ReportCreated / ReportViewed / ReportExported / ReportShared
  | 'analytics.report.builder_opened'
  | 'analytics.report.created'
  | 'analytics.report.viewed'
  | 'analytics.report.run'
  | 'analytics.report.updated'
  | 'analytics.report.deleted'
  | 'analytics.report.favorited'
  | 'analytics.report.shared'
  // Export — §43
  | 'analytics.export.requested'
  | 'analytics.export.ready'
  | 'analytics.export.failed'
  | 'analytics.export.downloaded'
  // States — so unavailability and refusal are measurable rather than invisible
  | 'analytics.unavailable.shown'
  | 'analytics.refusal.shown'
  | 'analytics.stale_data.shown'
  // The register screen, so it is known whether anybody reads it
  | 'analytics.gap_register.viewed'
  | 'analytics.definitions.viewed';

/**
 * The property keys Phase 15 adds.
 *
 * Registered at module load, so the extension happens before any screen emits.
 * Every key names a *shape of interaction* rather than a measurement. See the
 * header for what is deliberately absent and why it must stay absent —
 * particularly `value`, `amount`, `changePercent` and `subjectId`.
 */
registerAllowedProperties([
  // Which dashboard, in the coarsest terms that still answer a product question.
  'subjectType',
  // Which metric was looked at. A key from the catalogue — never its value.
  'metricKey',
  // Which controls were used.
  'rangePreset',
  'comparisonBasis',
  'granularity',
  'dimension',
  'visualization',
  // Shape of the interaction, not its content.
  'metricCount',
  'seriesCount',
  'bucketCount',
  'stepCount',
  'cohortCount',
  'rangeDays',
  'isCustomRange',
  'isDeviceTimezone',
  // What the surface actually rendered, so §37's states are measurable.
  'dataStatus',
  'isPartialDataset',
  'unavailableMetricCount',
  // Export and reports.
  'exportFormat',
  'reportSharing',
  'isOwnedByCaller',
  // Refusals, so a permission wall that nobody can get past is visible.
  'refusalReason',
]);

/**
 * Emits an analytics-surface event.
 *
 * The typed wrapper is the point: `trackPlatformEvent` takes a string, and every
 * call site in this phase goes through here, so the vocabulary stays closed even
 * though the shared emit is not.
 */
export function trackAnalyticsEvent(event: AnalyticsEvent, properties?: EventProperties): void {
  trackPlatformEvent(event, properties);
}

// ═════════════════════════════════════════════════════════════════════════════
// TYPED EMITTERS
//
// Wrappers for the events with non-obvious property requirements, so a call site
// cannot forget a dimension or reach for a value. Every one of these takes
// structured input and emits only the safe projection of it — which is the
// difference between a rule that is documented and a rule that holds.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A dashboard was opened.
 *
 * Takes the **whole dataset shape** and emits only its dimensions. A call site
 * holding an `AnalyticsDataset` and wanting to instrument it has one obvious
 * thing to call, and that thing cannot leak a figure — which is a better
 * guarantee than asking forty screens to pick the right five properties.
 */
export function trackDashboardViewed(input: {
  subjectType: AnalyticsSubjectType;
  rangePreset: AnalyticsRangePreset;
  rangeDays: number;
  isDeviceTimezone: boolean;
  comparison: AnalyticsComparisonBasis;
  dataStatus: AnalyticsDataStatus;
  metricCount: number;
  unavailableMetricCount: number;
}): void {
  trackAnalyticsEvent('analytics.dashboard.viewed', {
    subjectType: input.subjectType,
    rangePreset: input.rangePreset,
    rangeDays: input.rangeDays,
    isCustomRange: input.rangePreset === 'custom',
    isDeviceTimezone: input.isDeviceTimezone,
    comparisonBasis: input.comparison,
    dataStatus: input.dataStatus,
    metricCount: input.metricCount,
    unavailableMetricCount: input.unavailableMetricCount,
    isPartialDataset: input.unavailableMetricCount > 0,
  });
}

/** A metric card was opened for its definition. Records the key, never the figure. */
export function trackMetricDefinitionOpened(
  metricKey: AnalyticsMetricKey,
  subjectType: AnalyticsSubjectType
): void {
  trackAnalyticsEvent('analytics.metric.definition_opened', { metricKey, subjectType });
}

/** The date range changed. */
export function trackRangeChanged(input: {
  subjectType: AnalyticsSubjectType;
  rangePreset: AnalyticsRangePreset;
  rangeDays: number;
  isDeviceTimezone: boolean;
}): void {
  trackAnalyticsEvent('analytics.range.changed', {
    subjectType: input.subjectType,
    rangePreset: input.rangePreset,
    rangeDays: input.rangeDays,
    isCustomRange: input.rangePreset === 'custom',
    isDeviceTimezone: input.isDeviceTimezone,
  });
}

/**
 * A filter was applied.
 *
 * Takes the dimension and **how many values were selected**, never the values.
 * `dimension=community, bucketCount=3` answers "do people filter by community?"
 * and does not record which three — which would be the membership disclosure
 * Phase 13's allow-list exists to prevent.
 */
export function trackFilterApplied(input: {
  subjectType: AnalyticsSubjectType;
  dimension: AnalyticsDimensionKey;
  valueCount: number;
}): void {
  trackAnalyticsEvent('analytics.filter.applied', {
    subjectType: input.subjectType,
    dimension: input.dimension,
    bucketCount: input.valueCount,
  });
}

/** A chart was touched — a legend toggled, a series isolated, a point selected. */
export function trackChartInteracted(input: {
  subjectType: AnalyticsSubjectType;
  visualization: AnalyticsVisualization;
  metricKey?: AnalyticsMetricKey;
  seriesCount?: number;
}): void {
  trackAnalyticsEvent('analytics.chart.interacted', {
    subjectType: input.subjectType,
    visualization: input.visualization,
    metricKey: input.metricKey,
    seriesCount: input.seriesCount,
  });
}

/** An export was requested. */
export function trackExportRequested(input: {
  subjectType: AnalyticsSubjectType;
  format: AnalyticsExportFormat;
  rangeDays: number;
  metricCount: number;
}): void {
  trackAnalyticsEvent('analytics.export.requested', {
    subjectType: input.subjectType,
    exportFormat: input.format,
    rangeDays: input.rangeDays,
    metricCount: input.metricCount,
  });
}

/**
 * A surface rendered an unavailable state.
 *
 * Worth emitting precisely because it is invisible otherwise: a dashboard that
 * has shown "not available" to every member for three months is a fact the
 * platform should know, and without this event the only evidence is an absence
 * of other events.
 */
export function trackUnavailableShown(input: {
  subjectType: AnalyticsSubjectType;
  dataStatus: AnalyticsDataStatus;
  gapKey?: string;
}): void {
  trackAnalyticsEvent('analytics.unavailable.shown', {
    subjectType: input.subjectType,
    dataStatus: input.dataStatus,
    gapKey: input.gapKey,
  });
}

/**
 * A surface refused a caller.
 *
 * `refusalReason` is a low-cardinality reason code from `lib/analytics/access.ts`
 * and never a message containing a subject name. A permission wall nobody can
 * pass is a product bug, and this is how it becomes visible.
 */
export function trackRefusalShown(input: {
  subjectType: AnalyticsSubjectType;
  refusalReason: string;
}): void {
  trackAnalyticsEvent('analytics.refusal.shown', {
    subjectType: input.subjectType,
    refusalReason: input.refusalReason,
  });
}

/** Cached data was rendered past its validity. §54. */
export function trackStaleDataShown(input: {
  subjectType: AnalyticsSubjectType;
  dataStatus: AnalyticsDataStatus;
}): void {
  trackAnalyticsEvent('analytics.stale_data.shown', {
    subjectType: input.subjectType,
    dataStatus: input.dataStatus,
  });
}
