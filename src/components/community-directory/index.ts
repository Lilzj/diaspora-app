// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Multi-community surfaces (Frontend Phase 13)
//
// The one import point for every reusable community surface, so a screen never
// reaches into a file path and no two screens import the same component by two
// different routes.
//
// Deliberately a separate directory from `components/community/`, which belongs to
// Phase 12's Community Life (organizations, events, membership programmes, polls).
// The two are different domains that share a word — see the header of
// `config/multi-community-gaps.ts`.
// ─────────────────────────────────────────────────────────────────────────────

export {
  MultiCommunityGapNotice,
  CommunityScopeNote,
  CommunityMetricFigure,
  CommunityFreshnessNote,
  CommunityAssociationNote,
  CommunitySourceBadge,
} from './MultiCommunityGapNotice';
export type { MultiCommunityGapNoticeProps } from './MultiCommunityGapNotice';

export {
  CommunityAvatar,
  CommunityBadge,
  CommunityRoleBadge,
  CommunityRow,
  MembershipStatePill,
  communityOriginLabel,
  communityStatusLabel,
  communityTypeLabel,
} from './CommunityIdentity';

export {
  CommunityFilterBar,
  CommunityScopeChip,
  CommunitySelectorSheet,
} from './CommunitySelector';

export { CommunityOfflineBanner, CommunityUnavailablePanel } from './CommunityStatePanels';

export { CommunityContentSection, DOMAIN_LABELS } from './CommunityContentSection';
export type { CommunityContentSectionProps } from './CommunityContentSection';

export {
  CommunityComparisonTable,
  CommunityInitiativeCard,
  CommunityNoticeCard,
  CommunityReportCard,
  CommunityRoleHolderCard,
  CommunityRuleCard,
  CommunityStatisticsPanel,
  STATISTICS_PERIODS,
  StatisticsPeriodSelector,
} from './CommunityPanels';
