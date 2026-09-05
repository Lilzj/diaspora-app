// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Monetization components (Frontend Phase 6)
//
// One import point for every reusable monetization surface, so a vertical adding
// a promote button imports from here rather than reaching into a file and
// eventually forking a copy. The same rule `components/financial/index.ts`
// established for payments, applied to the layer above it.
// ─────────────────────────────────────────────────────────────────────────────

export { MonetizationGapNotice, SimulatedFigureBadge } from './MonetizationGapNotice';
export type { MonetizationGapNoticeProps } from './MonetizationGapNotice';

export { PriceTag, LabelledPrice } from './PriceTag';
export type { PriceTagProps, PriceTagSize } from './PriceTag';

export {
  PromotionPackageSelector,
  PromotionDurationSelector,
} from './PromotionPackageSelector';
export type { PackageSelectorProps, DurationSelectorProps } from './PromotionPackageSelector';

export { PromotionPreview, promotionReviewDetails } from './PromotionPreview';
export type { PromotionPreviewProps } from './PromotionPreview';

export { PromotionRow, ExpiringPromotionCard, describeTiming } from './PromotionCard';
export type { PromotionRowProps } from './PromotionCard';

export { PlanCard, AudiencePicker } from './PlanCard';
export type { PlanCardProps } from './PlanCard';

export { PlanComparisonTable } from './PlanComparison';
export type { PlanComparisonTableProps } from './PlanComparison';

export { LockedFeature, UpgradeNudge } from './LockedFeature';
export type { LockedFeatureProps } from './LockedFeature';

export { UsageMeter, EntitlementList } from './UsageMeter';
export type { UsageMeterProps } from './UsageMeter';

export {
  PerformancePanel,
  LockedPerformancePreview,
  renderMetric,
} from './PerformancePanel';
export type { PerformancePanelProps } from './PerformancePanel';

export {
  ObjectiveSelector,
  PlacementSelector,
  CreativeForm,
  AudienceBuilder,
  BudgetForm,
  CampaignCreativePreview,
  describePlacements,
  describeObjective,
  CAMPAIGN_OBJECTIVE_OPTIONS,
  CAMPAIGN_PLACEMENT_OPTIONS,
  CampaignTierSelector,
} from './CampaignBuilder';

export { CampaignRow, CampaignBudgetPanel } from './CampaignCard';

export { MonetizationSection, MonetizationRow, MonetizationEmpty } from './MonetizationLayout';

export { PromoteEntry } from './PromoteEntry';
export type { PromoteEntryProps } from './PromoteEntry';
