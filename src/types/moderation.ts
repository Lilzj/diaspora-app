// ─────────────────────────────────────────────────────────────────────────────
// Community Knowledge — Moderation & AI Review Types
// ─────────────────────────────────────────────────────────────────────────────

export type ModerationContentType = 'Guide' | 'CommunityUpdate' | 'Comment';

export type ModerationActionType =
  | 'Approve'
  | 'Reject'
  | 'Hide'
  | 'Archive'
  | 'Pin'
  | 'Unpin'
  | 'Suspend'
  | 'Restore';

export type ReportReasonCode =
  | 'Misinformation'
  | 'Spam'
  | 'Harassment'
  | 'Inappropriate'
  | 'Outdated'
  | 'Copyright'
  | 'PersonalData'
  | 'Other';

export type ReportStatus = 'Open' | 'Reviewed' | 'Resolved' | 'Dismissed';

export type AIReviewFlag =
  | 'spam'
  | 'hate_speech'
  | 'offensive_language'
  | 'duplicate'
  | 'personal_data'
  | 'copyright'
  | 'low_quality';

export interface AIReview {
  reviewId: string;
  contentType: ModerationContentType;
  contentId: string;
  status: 'Clean' | 'Flagged' | 'Rejected';
  flags: AIReviewFlag[];
  confidence: number;
  details: Record<string, unknown> | null;
  processedAt: string;
}

export interface ContentReport {
  reportId: string;
  reporterId: string;
  reporterName: string;
  contentType: ModerationContentType;
  contentId: string;
  reasonCode: ReportReasonCode;
  description: string | null;
  status: ReportStatus;
  resolvedBy: string | null;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ModerationAction {
  actionId: string;
  moderatorId: string;
  moderatorName: string;
  contentType: ModerationContentType;
  contentId: string;
  actionType: ModerationActionType;
  reason: string | null;
  previousStatus: string;
  newStatus: string;
  createdAt: string;
}

/** Item in the moderator queue */
export interface ModerationQueueItem {
  contentType: ModerationContentType;
  contentId: string;
  title: string;
  authorId: string;
  authorName: string;
  authorLevel: string;
  authorViolationCount: number;
  aiReview: AIReview | null;
  reportCount: number;
  reports: ContentReport[];
  status: string;
  createdAt: string;
}

export const REPORT_REASON_LABELS: Record<ReportReasonCode, string> = {
  Misinformation: 'Misinformation',
  Spam: 'Spam',
  Harassment: 'Harassment',
  Inappropriate: 'Inappropriate Content',
  Outdated: 'Outdated Information',
  Copyright: 'Copyright Violation',
  PersonalData: 'Exposes Personal Data',
  Other: 'Other',
};
