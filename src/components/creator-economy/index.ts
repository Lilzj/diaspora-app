// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Creator economy components (Frontend Phase 7)
//
// One import point for every reusable creator surface, so a screen adding a
// milestone list imports from here rather than reaching into a file and
// eventually forking a copy. Same discipline as `components/financial/index.ts`
// and for the same reason.
// ─────────────────────────────────────────────────────────────────────────────

export {
  CreatorGapNotice,
  PartiallyRealNotice,
  SimulatedFigure,
  CreatorGapUnavailable,
} from './CreatorGapNotice';
export type { CreatorGapNoticeProps } from './CreatorGapNotice';

export {
  useToneColours,
  CreatorStatusChip,
  StatTile,
  CreatorProgressBar,
  RequirementList,
  CreatorSection,
  CreatorCard,
  QuickAction,
  CreatorEmptyState,
  CreatorCardSkeleton,
} from './CreatorPrimitives';

export { CreatorScreen, CreatorHeader } from './CreatorScreen';
export type { CreatorScreenProps } from './CreatorScreen';

export { PeriodSelector } from './PeriodSelector';

export {
  RewardPill,
  MilestoneCard,
  ChallengeCard,
  ChallengeTaskRow,
  GrantCard,
  GrantApplicationCard,
} from './ProgrammeCards';

export {
  CourseCard,
  CourseProgressBar,
  LessonCard,
  LessonViewer,
  QuizView,
  CertificateCard,
  EducationBadge,
} from './AcademyComponents';

export {
  PointsBalanceCard,
  RewardCard,
  RevenueHeadline,
  RevenueBreakdown,
  EarningRow,
  PayoutRow,
  ReferralStats,
  ReferralRow,
  RecommendationCard,
  CreatorDirectoryCard,
  LeaderboardRow,
  LeaderboardHeader,
} from './EconomyPanels';
