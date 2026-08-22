// The community social graph's shared surfaces (Remediation Wave D-2b).
//
// Everything here reads `hooks/community-social.ts`, which reads
// `lib/community-social-api.ts`. Nothing here reads a fixture, and nothing here
// is a second API layer: D-2 built the client and D-2b adopts it.

export { CommunityPostCard } from './CommunityPostCard';
export { CommentThread } from './CommentThread';
export { PollBlock } from './PollBlock';
export { ReactionBar } from './ReactionBar';
export { ReportContentSheet } from './ReportContentSheet';
export {
  categoryGlyph,
  categoryLabel,
  humanise,
  isUrgencyWorthBadging,
  reactionGlyph,
  relativeTime,
  urgencyStyle,
  visibilityLabel,
} from './labels';
