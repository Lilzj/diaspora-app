export type ContentType =
  | 'Guide'
  | 'Update'
  | 'Provider'
  | 'Marketplace'
  | 'Housing'
  | 'Job'
  | 'Event'
  | 'Organization';

export type MarketplaceStatus = 'Available' | 'Reserved' | 'Sold' | 'Paused' | 'Archived' | 'Deleted';
export type HousingStatus = 'Available' | 'Reserved' | 'Rented' | 'Unavailable' | 'Paused' | 'Archived';
export type JobStatus = 'Open' | 'Interviewing' | 'Filled' | 'Closed' | 'Expired' | 'Archived';
export type ProviderStatus = 'Open' | 'Temporarily Closed' | 'Holiday Mode' | 'Hidden' | 'Archived';
export type EventStatus = 'Upcoming' | 'Live' | 'Completed' | 'Cancelled' | 'Archived';
export type GuideStatus = 'Published' | 'Draft' | 'Archived' | 'Hidden';
export type UpdateStatus = 'Published' | 'Archived' | 'Pinned' | 'Hidden';

export type ContentStatus =
  | MarketplaceStatus
  | HousingStatus
  | JobStatus
  | ProviderStatus
  | EventStatus
  | GuideStatus
  | UpdateStatus;

export type HealthStatusLevel = 'healthy' | 'needs_attention' | 'expiring_soon' | 'action_required';

export interface HealthRecommendation {
  id: string;
  type: 'photo' | 'pricing' | 'content_refresh' | 'renew' | 'status_audit' | 'general';
  title: string;
  description: string;
  actionText: string;
  actionType: 'edit' | 'renew' | 'photos' | 'status' | 'refresh';
}

export type PublishingIdentityType = 'personal' | 'organization' | 'business' | 'community' | 'verified_association';

export interface PublishingIdentity {
  id: string;
  name: string;
  type: PublishingIdentityType;
  avatar: string;
  handle: string;
  verified: boolean;
  followerCount: number;
  badgeText?: string;
}

export interface UnifiedContentItem {
  id: string;
  title: string;
  contentType: ContentType;
  currentStatus: ContentStatus;
  createdDate: string;
  lastUpdated: string;
  views: number;
  bookmarks: number;
  commentsCount: number;
  messagesCount: number;
  unreadMessagesCount: number;
  offersCount?: number;
  applicantsCount?: number;
  applicationsCount?: number;
  readingTime?: string;
  helpfulVotes?: number;
  conversionRate?: string;
  performanceBadge?: 'Top Performer' | 'Trending' | 'High Conversion' | 'Needs Attention' | 'Expiring Soon' | 'Action Required';
  publishingIdentity: PublishingIdentity;
  healthScore: number; // 0 - 100
  healthStatus: HealthStatusLevel;
  healthRecommendations: HealthRecommendation[];
  thumbnail?: string;
  location?: string;
  category?: string;
  organizationName?: string;
  tags?: string[];
  price?: string;
  salaryRange?: string;
  isPinned?: boolean;
}

export type OrganizationRole = 'owner' | 'manager' | 'moderator' | 'contributor';

export interface CreatorOrganization {
  id: string;
  name: string;
  logo: string;
  category: string;
  userRole: OrganizationRole;
  verified: boolean;
  membersCount: number;
  followersCount: number;
  unreadMessagesCount: number;
  postsCount: number;
  eventsCount: number;
  description: string;
  permissions: string[];
  website?: string;
  location?: string;
}

export type TimelineEventType =
  | 'published'
  | 'updated'
  | 'archived'
  | 'deleted'
  | 'status_changed'
  | 'verification_earned'
  | 'milestone_achieved'
  | 'organization_joined'
  | 'followers_milestone';

export interface CreatorTimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  description: string;
  timestamp: string;
  contentId?: string;
  contentType?: ContentType;
  identityName: string;
  badge?: string;
}

export interface CreatorDraft {
  id: string;
  title: string;
  draftType: ContentType;
  lastEdited: string;
  autoSaveStatus: 'saved' | 'saving' | 'failed';
  estimatedCompletion: string;
  excerpt: string;
  progressPercent: number;
  publishingIdentityId: string;
}

export interface ArchivedItem {
  id: string;
  title: string;
  contentType: ContentType;
  archiveDate: string;
  archiveReason: 'User Archived' | 'Expired' | 'Marked Complete' | 'Auto-Archived' | 'Sold' | 'Filled' | 'Rented';
  originalStatus: ContentStatus;
  publishingIdentityName: string;
}

export interface WorkspaceFilters {
  statusFilter: string[];
  dateRange: 'today' | 'week' | 'month' | 'last_month' | 'all';
  sortOption:
    | 'newest'
    | 'oldest'
    | 'most_viewed'
    | 'most_saved'
    | 'most_commented'
    | 'most_messages'
    | 'recently_updated'
    | 'alphabetical';
  searchQuery: string;
  contentTypeCategory: string; // 'all' | 'guides' | 'updates' | 'providers' | 'marketplace' | 'housing' | 'jobs' | 'events' | 'organizations' | 'drafts' | 'archived'
  identityId: string;
}

export type BulkActionType =
  | 'archive'
  | 'delete'
  | 'pause'
  | 'renew'
  | 'mark_sold'
  | 'mark_filled'
  | 'mark_rented'
  | 'export'
  | 'share';

export interface ContentComment {
  id: string;
  contentId: string;
  authorName: string;
  authorAvatar: string;
  text: string;
  timestamp: string;
  isPinned: boolean;
  isReported: boolean;
  repliesCount: number;
}

export interface CreatorAnalyticsData {
  timeFilter: '7d' | '30d' | '90d' | 'all';
  views: number;
  reach: number;
  followers: number;
  messages: number;
  conversion: string;
  helpfulVotes: number;
  reputationPoints: number;
  trustScore: number;
  growthTrend: string;
  viewsTrafficPath: string;
  updatesTrafficPath: string;
  followersTrafficPath: string;
}
