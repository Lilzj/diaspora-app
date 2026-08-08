// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Maps & Navigation components (Frontend Phase 8)
//
// Single import point, matching the convention `components/community`,
// `components/financial`, `components/monetization` and
// `components/creator-economy` already use.
// ─────────────────────────────────────────────────────────────────────────────

// The map itself
export { DiasporaMap } from './DiasporaMap';
export type { DiasporaMapProps } from './DiasporaMap';

// Chrome and state
export {
  CATEGORY_LABELS,
  CategoryFilterBar,
  LocationPermissionCard,
  MapAttributionBar,
  MapControls,
  MapErrorState,
  MapLoadingState,
  MapModeSwitcher,
  PrimaryButton,
  SearchThisAreaButton,
  SecondaryButton,
} from './MapPrimitives';
export type { LocationPermissionCardProps } from './MapPrimitives';

// The accessible alternative — §50
export { MapEmptyState, MapResultList, MarkerCallout } from './MapResultList';
export type { MapResultListProps } from './MapResultList';

// Provenance and gap markers
export {
  EstimateQualifier,
  FreshnessNote,
  MapProviderNotice,
  MapsGapNotice,
  SourceBadge,
  SourcedFigure,
} from './MapsGapNotice';
export type { MapsGapNoticeProps } from './MapsGapNotice';

// Routing and navigation
export {
  NavigationBanner,
  RouteInstructionList,
  RouteSummaryCard,
  TransitItinerary,
  TravelEstimateRow,
  TravelModeSwitcher,
  formatClock,
  formatDuration,
  formatMetres,
} from './RoutePanels';

// Geographic intelligence
export {
  CostOfLivingPanel,
  HeatMapLegend,
  LAYER_LABELS,
  LayerPicker,
  NeighborhoodComparison,
  NeighborhoodScorePanel,
  SafetyScorePanel,
  ScoreDimensionRow,
} from './IntelligencePanels';

// Community alerts
export {
  AlertAreaNote,
  AlertCard,
  AlertDetailPanel,
  AlertFreshnessBanner,
  AlertSeverityBadge,
  AlertStatusBadge,
} from './AlertPanels';
