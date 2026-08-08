// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community Life components (Frontend Phase 12)
//
// One import point for every reusable Advanced Community Life surface, so a
// screen imports from here rather than reaching into a file and eventually
// forking a copy.
//
// Note what is *not* exported here and never will be: a payment sheet, a
// wallet balance, a notification row or a conversation view. Those live in
// `components/financial` and the conversation module, and Phase 12 imports
// them. §58.13–17: no second wallet, no second payment system, no second
// notification system, no second messaging system.
// ─────────────────────────────────────────────────────────────────────────────

export {
  CommunityGapNotice,
  PartlyRealNotice,
  SimulatedFigure,
  VerifiedFigure,
  SourcedValue,
  CommunityGapUnavailable,
  PeriodicUpdateNote,
} from './CommunityGapNotice';
export type { CommunityGapNoticeProps } from './CommunityGapNotice';

export { CommunityScreen, CommunityHeader } from './CommunityScreen';
export type { CommunityScreenProps } from './CommunityScreen';

export {
  useToneColours,
  CommunityStatusBadge,
  CommunityStatusPanel,
  ProgressBar,
  Stat,
  Section,
  Card,
  PrimaryButton,
  SecondaryButton,
  InlineRefusal,
  EmptyState,
  DetailRow,
  ChipRow,
} from './CommunityPrimitives';

export {
  readableDate,
  MembershipProgrammeCard,
  MembershipCard,
  MembershipTierCard,
  SeriesCard,
  OccurrenceRow,
  CampaignCard,
  OpportunityCard,
  PollCard,
  AnnouncementCard,
  RecommendationCard,
} from './CommunityCards';

export { PollBallot, PollOptionControl, PollResults } from './PollControls';

export { RecurrenceEditor, describeDraft, EMPTY_RECURRENCE } from './RecurrenceEditor';
