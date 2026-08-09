// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics components (Frontend Phase 15)
//
// The one import point for every reusable analytics surface, so a screen adding
// a metric grid imports from here rather than reaching into a file and
// eventually forking a copy. Same discipline as `components/financial/index.ts`,
// `components/creator-economy/index.ts` and `components/community-directory/index.ts`,
// and for the same reason.
//
// §38 asks for reusable dashboard primitives and forbids one-off chart
// components per module. This barrel is what makes that enforceable in review: a
// pull request that adds a chart anywhere other than here is visible as such.
// ─────────────────────────────────────────────────────────────────────────────

export {
  AnalyticsGapNotice,
  AnalyticsGapUnavailable,
  AnalyticsProvenanceHeader,
  DataStatusBadge,
  FreshnessIndicator,
  MetricProvenance,
  SuppressedValue,
  SuppressionNote,
  describeDataStatus,
  hasSuppressedMetrics,
} from './AnalyticsNotices';
export type { AnalyticsGapNoticeProps } from './AnalyticsNotices';

export {
  AnalyticsCard,
  AnalyticsChipRow,
  AnalyticsEmptyState,
  AnalyticsRefusal,
  AnalyticsSection,
  AnalyticsSkeleton,
  WithheldMetricsNote,
} from './AnalyticsPrimitives';
export type { AnalyticsEmptyReason } from './AnalyticsPrimitives';

export {
  ComparisonCard,
  ComparisonPill,
  MetricCard,
  MetricDefinitionSheet,
  MetricGrid,
  useMetricDefinitionSheet,
} from './MetricCards';
export type { MetricCardProps } from './MetricCards';

export {
  AreaChart,
  BarChart,
  ChartCard,
  LineChart,
  SERIES_COLOURS,
  SeriesTable,
  Sparkline,
} from './AnalyticsCharts';
export type { ChartCardProps, ChartKind, ChartProps } from './AnalyticsCharts';

export {
  BreakdownPanel,
  FunnelPanel,
  LeaderboardPanel,
  RetentionGrid,
} from './AnalyticsPanels';

export {
  AnalyticsFilterBar,
  ComparisonPicker,
  ExportSheet,
  GranularityPicker,
  RangePicker,
} from './AnalyticsControls';
export type { ExportSheetProps } from './AnalyticsControls';

export {
  AnalyticsFetchingIndicator,
  AnalyticsHeader,
  AnalyticsScreen,
  ExportHeaderButton,
} from './AnalyticsScreen';
export type { AnalyticsScreenProps } from './AnalyticsScreen';

// The dashboard every analytics route renders. Exported last because it depends
// on everything above it — see its header for why there is one rather than
// twenty.
export { SubjectDashboard } from './SubjectDashboard';
export type { SubjectDashboardProps } from './SubjectDashboard';
