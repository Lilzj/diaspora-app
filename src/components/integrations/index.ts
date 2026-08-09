// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Integration components (Frontend Phase 16)
//
// The single import point, matching the convention every other component
// directory in this codebase follows.
// ─────────────────────────────────────────────────────────────────────────────

export {
  IntegrationGapNotice,
  ProviderGapNotice,
  SimulationMarker,
  IntegrationStatusBadge,
  IntegrationErrorNotice,
} from './IntegrationNotices';

export { ConsentSheet, PermissionExplainer, PermissionRecovery } from './IntegrationConsent';
export type { ConsentSheetProps } from './IntegrationConsent';

export { AddToCalendarSheet } from './AddToCalendarSheet';
export type { AddToCalendarSheetProps } from './AddToCalendarSheet';

export { IntegrationRow } from './IntegrationRow';
export { GovernmentNoticeCard, GovernmentSourceLine } from './GovernmentNotice';
