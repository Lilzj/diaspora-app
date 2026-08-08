// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Trust, Identity & Governance Types
// ─────────────────────────────────────────────────────────────────────────────

export type VerificationType =
  | 'Phone'
  | 'Email'
  | 'Identity'
  | 'Country'
  | 'Professional'
  | 'Business'
  | 'Organization'
  | 'Embassy';

export type VerificationStatus = 'Pending' | 'Approved' | 'Rejected' | 'NeedMoreInfo' | 'Expired';

export type AccountState =
  | 'RegistrationStarted'
  | 'PhoneVerified'
  | 'LimitedAccess'
  | 'DiasporaVerificationPending'
  | 'VerificationUnderReview'
  | 'DiasporaVerified'
  | 'FullCommunityAccess'
  | 'VerificationRejected'
  | 'RequiresMoreInformation'
  | 'Suspended'
  | 'Restricted'
  | 'AppealPending';

export type DiasporaVerificationStatus =
  | 'NotStarted'
  | 'Pending'
  | 'UnderReview'
  | 'Approved'
  | 'Rejected'
  | 'RequiresAdditionalDocuments'
  | 'Expired'
  | 'Appealed';

export type AccountHealth = 'Excellent' | 'Good' | 'Restricted' | 'Suspended' | 'Under Review';

export interface AccountHealthStatus {
  health: AccountHealth;
  violationsCount: number;
  warningsCount: number;
  activeAppealsCount: number;
  spamReportsCount: number;
  reasons: string[];
}

export type ContentTrustLevel = 'Standard' | 'Verified' | 'CommunityVerified' | 'NeedsVerification';

export interface CountryReputationScore {
  countryCode: string;
  countryName: string;
  flag: string;
  points: number;
  level: 'Member' | 'VerifiedResident' | 'TrustedContributor' | 'CommunityExpert' | 'Ambassador';
  stars: number; // 1 to 5 stars
}

export interface CountryExperienceInterval {
  countryCode: string;
  countryName: string;
  flag: string;
  startYear: number;
  endYear: number | null; // null means "Present"
  isVerified: boolean;
  role: string;
}

export type RiskLevel = 'Low' | 'Medium' | 'High';

export type RiskFactor =
  | 'VPN_Detected'
  | 'Device_Change'
  | 'Rapid_Posting'
  | 'Duplicate_Content'
  | 'Failed_Verification'
  | 'Reports_Spike';

export interface RiskFactors {
  level: RiskLevel;
  factors: RiskFactor[];
  scoreValue: number; // 0-100 score
}

export type ModerationQueueStatus =
  | 'PendingReview'
  | 'Approved'
  | 'Rejected'
  | 'Escalated'
  | 'Appealed'
  | 'Resolved';

export interface TrustTimelineEvent {
  eventId: string;
  type: string;
  label: string;
  timestamp: string;
  icon: string;
  description: string;
}

export interface FeatureRequirementItem {
  description: string;
  isMet: boolean;
  currentProgress: string;
}

export interface FeatureUnlockRequirement {
  featureId: string;
  name: string;
  isUnlocked: boolean;
  requirements: FeatureRequirementItem[];
}

export interface TrustedDevice {
  deviceId: string;
  deviceName: string;
  location: string;
  lastActive: string;
  isCurrent: boolean;
}

export interface CountryMembership {
  currentCountryCode: string;
  primaryCommunity: string;
  previousCommunities: string[];
}

export interface UserPrivacySettings {
  profileVisibility: 'Public' | 'Members' | 'Private';
  phoneVisibility: 'Public' | 'Members' | 'Private';
  locationPrecision: 'Exact' | 'Approximate';
  activityVisibility: boolean;
  followersAllowed: boolean;
  verificationVisibility: boolean;
}

export interface AuditLogEvent {
  eventId: string;
  timestamp: string;
  action: string;
  details: string;
  ipAddress: string;
  deviceFingerprint: string;
}

export interface AppealRequest {
  appealId: string;
  type: 'Verification' | 'Content' | 'Suspension' | 'Publishing';
  targetId: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  explanation: string;
  createdAt: string;
}

export interface TrustNotification {
  id: string;
  title: string;
  description: string;
  type: 'Verification' | 'Alert' | 'LevelUp' | 'Unlock' | 'Appeal';
  timestamp: string;
  read: boolean;
}
