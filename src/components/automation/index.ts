// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation components (Frontend Phase 18)
//
// The single import point, matching the convention every other component
// directory in this codebase follows.
// ─────────────────────────────────────────────────────────────────────────────

export {
  AutomationGapNotice,
  SimulationMarker,
  AutomationStatusBadge,
  RunStatusBadge,
  SupportBadge,
  AutomationErrorNotice,
  DependencyList,
} from './AutomationNotices';
export type {
  AutomationGapNoticeProps,
  SimulationMarkerProps,
  AutomationStatusBadgeProps,
  RunStatusBadgeProps,
  SupportBadgeProps,
  AutomationErrorNoticeProps,
  DependencyListProps,
} from './AutomationNotices';

export { AutomationRow, SavedSearchRow } from './AutomationRow';
export type { AutomationRowProps, SavedSearchRowProps } from './AutomationRow';

export {
  TriggerPicker,
  ConditionEditor,
  ActionPicker,
  ScheduleEditor,
} from './BuilderControls';
export type {
  TriggerPickerProps,
  ConditionEditorProps,
  ActionPickerProps,
  ScheduleEditorProps,
} from './BuilderControls';

export {
  AutomationPreviewCard,
  AudienceCard,
  BackendGapBanner,
  SimulationResult,
} from './AutomationPreview';
export type {
  AutomationPreviewCardProps,
  AudienceCardProps,
  BackendGapBannerProps,
  SimulationResultProps,
} from './AutomationPreview';

export { RunRow, RunDetail, DeduplicationNotice } from './ExecutionViews';
export type { RunRowProps, RunDetailProps } from './ExecutionViews';

export { ScopePicker, SCOPE_PRESENTATION } from './ScopePicker';
export type { ScopePickerProps } from './ScopePicker';

export { EventReminderButton, SaveSearchButton } from './ContextualAutomation';
export type {
  EventReminderButtonProps,
  SaveSearchButtonProps,
} from './ContextualAutomation';

export { TestSubjectPicker, subjectKindForTrigger } from './TestSubjectPicker';
export type { TestSubjectPickerProps } from './TestSubjectPicker';
