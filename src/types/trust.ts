// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Trust, Identity & Governance Types
//
// Two halves, and the divider between them matters.
//
//   * **The wire mirror** (bottom half, from `── WIRE ──` down) is a typed
//     mirror of `Diaspora.Modules.Trust/Contracts/V1`, named as the wire names
//     it. Nothing is renamed at the boundary. This is what `lib/trust-api.ts`
//     speaks and what the server is authoritative for.
//   * **The view models** (this half) are the shapes the screens have been
//     rendering since before there was a client. They are kept because screens
//     import them, and several are *not* Trust's to serve — privacy settings,
//     trusted devices and the audit log have no route under `/api/v1/trust` and
//     never did. See the note over each.
//
// ── The four things this file got wrong, now corrected ───────────────────────
//
// **1. `VerificationType` was missing five members.** The server's enum has
// thirteen (`TrustEnums.cs:19`) and `GET /trust/profile` returns a status for
// *every* one of them, keyed by name. A `Record<VerificationType, …>` over the
// old eight-member union could not hold the response, and the five it dropped
// — `Diaspora`, `Residence`, `Employment`, `CommunityGuide`, `Contributor` —
// include the one the whole product rests on.
//
// **2. `CountryReputationScore.level` ended in `'Ambassador'`.** The server
// emits `CommunityAmbassador` (`TrustMappers.cs:212`, `standing.Level
// .ToString()`). The short spelling has never been on the wire, so a client
// comparing against it never matched.
//
// **3. `AccountHealth` spelled a member `'Under Review'`, with a space.** No C#
// enum can carry a space; the server emits `UnderReview`
// (`TrustEnums.cs:212`). Both spellings are in the union now — the space form
// only so the pre-existing seeded state still type-checks — and
// `ACCOUNT_HEALTH_LABELS` is the map the server's own contract note asks the
// client to add.
//
// **4. `AppealRequest.status` was three values.** The server has six
// (`AppealStatus`), and the appeals screen already draws a tracker over states
// it had no data for.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every verification type the platform supports.
 *
 * Thirteen, matching `VerificationType` in `TrustEnums.cs:19` member for
 * member. `GET /trust/profile` returns a `Record` keyed by these names with a
 * status for each — including types the member has never attempted, which read
 * `Pending`.
 */
export type VerificationType =
  | 'Phone'
  | 'Email'
  | 'Identity'
  | 'Country'
  | 'Professional'
  | 'Business'
  | 'Organization'
  | 'Embassy'
  /** The core eligibility check: nationality differs from country of residence. */
  | 'Diaspora'
  | 'Residence'
  | 'Employment'
  | 'CommunityGuide'
  | 'Contributor';

/** Every value in {@link VerificationType}, for iterating a checklist. */
export const VERIFICATION_TYPES: readonly VerificationType[] = [
  'Phone',
  'Email',
  'Identity',
  'Country',
  'Professional',
  'Business',
  'Organization',
  'Embassy',
  'Diaspora',
  'Residence',
  'Employment',
  'CommunityGuide',
  'Contributor',
] as const;

/**
 * Where a verification request sits.
 *
 * Twelve states, matching `VerificationStatus` in `TrustEnums.cs:70`. The old
 * five-member union omitted seven the server routinely returns — most
 * consequentially `UnderReview`, `Submitted` and `Appealed`, which are the
 * three a member sees most often between submitting and hearing back.
 */
export type VerificationStatus =
  | 'Submitted'
  | 'Pending'
  | 'UnderReview'
  | 'NeedMoreInfo'
  | 'UnderInvestigation'
  | 'Approved'
  | 'PartiallyApproved'
  | 'Rejected'
  | 'Expired'
  | 'Revoked'
  | 'Appealed'
  | 'ReverificationRequired'
  /** Never attempted (`GET /trust/profile` only, since 20 Oct 2026; was reported as Pending). */
  | 'NotStarted';

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

/**
 * A member's overall account health.
 *
 * `UnderReview` is what the server emits (`TrustEnums.cs:212`). `'Under
 * Review'` — with a space — is the spelling this file has always used and is
 * kept only so the pre-existing seeded store still type-checks; nothing on the
 * wire produces it. Render through {@link ACCOUNT_HEALTH_LABELS}.
 */
export type AccountHealth =
  | 'Excellent'
  | 'Good'
  | 'Restricted'
  | 'Suspended'
  | 'UnderReview'
  /** @deprecated Never on the wire. The server cannot emit a space. */
  | 'Under Review';

/**
 * Display text for {@link AccountHealth}.
 *
 * The server's contract note asks for exactly this: *"the client already
 * renders these through a label map, so the cost is one map entry."*
 */
export const ACCOUNT_HEALTH_LABELS: Record<AccountHealth, string> = {
  Excellent: 'Excellent',
  Good: 'Good',
  Restricted: 'Restricted',
  Suspended: 'Suspended',
  UnderReview: 'Under Review',
  'Under Review': 'Under Review',
};

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
  /**
   * `CommunityAmbassador`, not `Ambassador`.
   *
   * The old spelling contradicted `types/reputation.ts`'s `ReputationLevel` in
   * the same repository and was never what `TrustMappers.cs:212` emitted, so a
   * screen comparing against it matched nothing at the top of the ladder.
   */
  level: 'Member' | 'VerifiedResident' | 'TrustedContributor' | 'CommunityExpert' | 'CommunityAmbassador';
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

/** What a member is appealing. `AppealType` in `TrustEnums.cs:299`. */
export type AppealType = 'Verification' | 'Content' | 'Suspension' | 'Publishing';

/**
 * Where an appeal sits. `AppealStatus` in `TrustEnums.cs:317`.
 *
 * Six states. This file previously declared three, while `profile/appeals.tsx`
 * drew a six-stage tracker over states the type said could not occur.
 */
export type AppealStatus =
  | 'Pending'
  | 'UnderReview'
  | 'Escalated'
  | 'Approved'
  | 'Rejected'
  | 'Withdrawn';

export interface AppealRequest {
  appealId: string;
  type: AppealType;
  targetId: string;
  reason: string;
  status: AppealStatus;
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

// ═════════════════════════════════════════════════════════════════════════════
// ── WIRE ─────────────────────────────────────────────────────────────────────
//
// A typed mirror of `Diaspora.Modules.Trust/Contracts/V1`, named as the wire
// names it. Everything below is what the server actually sends and accepts.
//
// ── The six things worth knowing before calling anything ─────────────────────
//
// **1. Every enum crosses the wire as `Enum.ToString()`, so the casing is
// per-enum and inconsistent by design.** Trust declares no
// `JsonStringEnumConverter`; the response DTOs declare their enum-shaped fields
// as `string` and the mappers call `.ToString()`
// (`TrustMappers.cs:26,199,212,312`). So the spelling on the wire is the
// spelling of the **C# member name**, whatever that happens to be:
//
//   * `VerificationType`, `AppealStatus`, `TrustTier`, `BadgeType` — PascalCase
//     (`"Diaspora"`, `"UnderReview"`, `"CountryVerified"`)
//   * `ReputationDimension` — **lowercase** (`"contribution"`), because the C#
//     members are literally lowercase (`TrustEnums.cs:265`)
//   * `VerificationRejectionReason`, `EligibilityCode` — **SCREAMING_SNAKE**
//     (`"EXPIRED_DOCUMENT"`, `"RATE_LIMITED"`)
//   * `RiskFactor` — **Screaming_Snake** (`"VPN_Detected"`)
//
// Community is camelCase and Recommendations is PascalCase; Trust is none of
// the above, and four of its own enums disagree with each other. Guessing is
// how this goes wrong.
//
// **2. Three routes silently coerce an unparseable value instead of refusing.**
// `TrustEndpointContributor.cs:680-701`:
//
//   * an unrecognised verification `type` becomes **`Diaspora`**
//   * an unrecognised appeal `type` becomes **`Verification`**
//   * an unrecognised `documentType` becomes **`Other`**
//
// and a fourth, worse one that is not even an enum parse: `ReviewAppealRequest
// .Decision` is string-compared to `"Approve"` and `"Escalate"`, and
// **everything else — including a typo — rejects the appeal**
// (`TrustEndpointContributor.cs:463-471`). Every union below that feeds one of
// those fields is therefore **closed**, not `Open<…>`: a typo must be a compile
// error on this side, because it will not be an error on the other.
//
// Filters coerce too, but harmlessly-looking: an unparseable `?status=` becomes
// *no filter*, so a mistyped filter returns the unfiltered list at HTTP 200.
//
// **3. Paged routes return an offset `PagedResult<T>` inside `data`.**
// `{ items, page, pageSize, totalCount, totalPages, hasNextPage,
// hasPreviousPage }` — `SharedKernel/Pagination/PagedResult.cs`. No cursors
// anywhere in this module. `readPage` handles it. Page size is clamped to
// **50** server-side and defaults to 20 (`PaginationRequest.cs:8-10`).
//
// **4. Two routes return a bare array, not a page.** `GET /trust/badges/me` and
// `GET /trust/feature-requirements`. `readPage` copes, but `totalCount` is null
// for both and that is not zero.
//
// **5. `riskScore` and `riskLevel` are omitted unless the caller holds
// `trust:verification:review`.** `ProfileQueries.cs:73` — *"a number the client
// receives is a number the member can read."* Both are optional here for that
// reason, and a screen must render the risk panel only when they are present.
// The old client-side `TrustEngine.calculateRiskScore()` fabricated one for
// every member.
//
// **6. The whole module shares one rate-limit bucket, and it is the sign-in
// one.** `TrustEndpointContributor.cs:45` applies `RequireRateLimiting(
// "diaspora-signin")` to the group: a **10-request sliding window over 60
// seconds, partitioned by IP address**
// (`RateLimitingOptions.cs:20`, `RateLimitingRegistration.cs:118`). Not per
// member — per address, so everyone behind one NAT shares it. Opening the
// Trust Centre costs three of the ten. This is why the hooks in
// `hooks/trust.ts` carry long `staleTime`s and why nothing polls.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * An open vocabulary — the server's set is wider than this client can spell.
 *
 * Used only for fields the server *emits* and never parses back from us. Every
 * union that feeds a coercing parameter (see note 2 above) is closed instead.
 */
type Open<TKnown extends string> = TKnown | (string & Record<never, never>);

// ── Vocabularies ─────────────────────────────────────────────────────────────

/** `TrustTier`. The module's own ladder — not `AccessTier` and not `ReputationLevel`. */
export type TrustTier =
  | 'Untrusted'
  | 'Basic'
  | 'Provisional'
  | 'Verified'
  | 'Trusted'
  | 'Steward';

/** `ReputationLevel`. Ends in `CommunityAmbassador`. */
export type WireReputationLevel =
  | 'Member'
  | 'VerifiedResident'
  | 'TrustedContributor'
  | 'CommunityExpert'
  | 'CommunityAmbassador';

/** `ReputationDimension` — **lowercase on the wire**, because the C# members are. */
export type WireReputationDimension = 'contribution' | 'verification' | 'trust';

/**
 * `VerificationDocumentType`.
 *
 * Closed: this feeds `documentType`, which coerces to `Other` when it does not
 * parse. `Other` is accepted by the Diaspora and Country handlers but **not**
 * by Identity, so the same typo is a silent downgrade on one route and a 400 on
 * another.
 */
export type WireVerificationDocumentType =
  | 'Passport'
  | 'PassportStamp'
  | 'ResidencePermit'
  | 'WorkPermit'
  | 'OccupationPermit'
  | 'StudentPermit'
  | 'StudentVisa'
  | 'Visa'
  | 'GovernmentImmigrationDocuments'
  | 'NationalId'
  | 'DriverLicense'
  | 'UtilityBill'
  | 'BankStatement'
  | 'ProofOfAddress'
  | 'EmploymentLetter'
  | 'BusinessRegistration'
  | 'OrganizationDocument'
  | 'GuideEvidence'
  | 'Other';

/** `VerificationDocumentStatus`. */
export type WireVerificationDocumentStatus =
  | 'Pending'
  | 'Accepted'
  | 'Rejected'
  | 'Superseded'
  | 'Expired';

/** `VerificationRejectionReason` — SCREAMING_SNAKE. */
export type WireRejectionReason = Open<
  | 'INVALID_DOCUMENT'
  | 'EXPIRED_DOCUMENT'
  | 'MISMATCHED_NATIONALITY'
  | 'ADDITIONAL_DOCS_NEEDED'
  | 'ILLEGIBLE_DOCUMENT'
  | 'FACE_MATCH_FAILED'
  | 'RESIDENCE_NOT_ESTABLISHED'
  | 'NOT_DIASPORA_ELIGIBLE'
  | 'SUSPECTED_FRAUD'
  | 'DUPLICATE_SUBMISSION'
>;

/** `VerificationDecisionMode`. */
export type WireDecisionMode =
  | 'ManualReview'
  | 'AutomaticApproval'
  | 'AutomaticRejection'
  | 'RoutedToReview';

/**
 * `ReviewDecision`, as `ReviewVerificationRequest.Decision`.
 *
 * Closed. An unparseable value becomes `NeedMoreInfo`
 * (`TrustEndpointContributor.cs:693`) — the safe fallback, but still a decision
 * the reviewer did not make.
 */
export type WireReviewDecision =
  | 'Approve'
  | 'PartiallyApprove'
  | 'Reject'
  | 'NeedMoreInfo'
  | 'Escalate'
  | 'Revoke';

/**
 * The three values `POST /trust/appeals/{id}/review` recognises.
 *
 * **Not an enum on the server.** The endpoint compares the string to
 * `"Approve"` and `"Escalate"` and treats *everything else* — including an
 * empty string and a typo — as a rejection. There is no safe third state.
 */
export type WireAppealDecision = 'Approve' | 'Reject' | 'Escalate';

/** `BadgeType`. */
export type WireBadgeType = Open<
  | 'CountryVerified'
  | 'PhoneVerified'
  | 'EmailVerified'
  | 'GovernmentIdVerified'
  | 'ProfilePhoto'
  | 'ProviderVerified'
  | 'TopContributor'
  | 'VerifiedMember'
  | 'TrustedContributor'
  | 'CommunityGuide'
  | 'VerifiedBusiness'
  | 'VerifiedOrganization'
  | 'EarlyMember'
  | 'Moderator'
>;

/** `ModerationContentType`. */
export type WireModerationContentType =
  | 'Guide'
  | 'CommunityUpdate'
  | 'Comment'
  | 'Listing'
  | 'Profile'
  | 'Organization';

/** `ModerationQueueStatus`. Note `AIReview`, not `AiReview`. */
export type WireModerationQueueStatus =
  | 'AIReview'
  | 'PendingReview'
  | 'Approved'
  | 'Rejected'
  | 'Escalated'
  | 'Appealed'
  | 'Resolved';

/** `ModerationActionType`. Closed — an unparseable value becomes `Escalate`. */
export type WireModerationActionType =
  | 'Approve'
  | 'Reject'
  | 'Hide'
  | 'Archive'
  | 'Pin'
  | 'Unpin'
  | 'Suspend'
  | 'Restore'
  | 'Escalate';

/** `ModerationPriority`. */
export type WireModerationPriority = 'Low' | 'Normal' | 'High' | 'Urgent';

/**
 * `EligibilityCode` — SCREAMING_SNAKE, and deliberately the exact literals the
 * client's own `TrustEngine` already returns.
 */
export type WireEligibilityCode =
  | 'ALLOW'
  | 'DENIED'
  | 'RATE_LIMITED'
  | 'COOLDOWN'
  | 'HEALTH_RESTRICTED';

/**
 * The capability keys Trust ships with (`TrustCapabilities`,
 * `TrustRequirement.cs:56`).
 *
 * Open, because a capability is *contributed* by the module that owns it — the
 * catalogue is scanned at boot, so a deployment can carry keys this client has
 * never heard of. An **unknown capability is allowed, not refused**
 * (`EligibilityEvaluator.cs:68-73`): Trust does not gate what nobody asked it
 * to gate. So `allowed: true` from this route is not proof a gate exists.
 */
export type TrustCapabilityKey = Open<
  | 'guides'
  | 'jobs'
  | 'housing'
  | 'marketplace'
  | 'comment'
  | 'updates'
  | 'events'
  | 'organizations'
  | 'guide-programme'
  | 'moderation'
>;

// ── Profile ──────────────────────────────────────────────────────────────────

/** `BadgeResponse`. `label` arrives pre-rendered with its emoji. */
export interface WireBadge {
  type: WireBadgeType;
  /** Display text, composed server-side — `"🇬🇧 United Kingdom Verified"`. */
  label: string;
  /** Year first earned. Null-safe: the server sends the award year. */
  since?: number | null;
  countryCode?: string | null;
  awardedAt: string;
}

/** `AccountHealthStatusResponse`. */
export interface WireAccountHealth {
  /** `Excellent | Good | Restricted | Suspended | UnderReview`. No space. */
  health: AccountHealth;
  violationsCount: number;
  warningsCount: number;
  activeAppealsCount: number;
  spamReportsCount: number;
  reasons: string[];
}

/** `CountryStandingResponse`. */
export interface WireCountryStanding {
  countryCode: string;
  countryName: string;
  /** Emoji flag, derived from the code server-side. */
  flag: string;
  points: number;
  level: WireReputationLevel;
  /** 1–5. */
  stars: number;
  isVerified: boolean;
}

/** `CountryExperienceResponse`. */
export interface WireCountryExperience {
  countryCode: string;
  countryName: string;
  flag: string;
  startYear: number;
  /** Null means "Present". */
  endYear: number | null;
  isVerified: boolean;
  role: string;
  yearsOfResidence: number;
}

/**
 * `TrustProfileResponse` — `GET /trust/profile`.
 *
 * One call for the whole Trust Centre, replacing four device-side sources.
 */
export interface WireTrustProfile {
  userId: string;
  trustLevel: TrustTier;
  healthStatus: WireAccountHealth;
  /** Staff only — see note 5. Absent, not zero, for an ordinary member. */
  riskScore?: number | null;
  /** Staff only. */
  riskLevel?: RiskLevel | null;
  /**
   * Status per verification type, keyed by type name.
   *
   * **Every supported type appears**, including ones never attempted, which
   * read `Pending`. Typed as a partial record rather than a total one because
   * the set of supported types is decided at boot by whichever
   * `IVerificationTypeHandler`s were discovered — thirteen today, and a
   * deployment could carry more.
   */
  verifications: Partial<Record<VerificationType, VerificationStatus>> & Record<string, string>;
  badges: WireBadge[];
  countryReputations: WireCountryStanding[];
  experienceTimeline: WireCountryExperience[];
  joinedAt: string;
  trustLevelChangedAt?: string | null;
}

/**
 * `PublicTrustProfileResponse` — `GET /trust/profiles/{userId}`.
 *
 * A structurally different type, not the same one with nulls: risk score,
 * health reasons and violation counts are *absent*, which is the point.
 */
export interface WirePublicTrustProfile {
  userId: string;
  trustLevel: TrustTier;
  reputationLevel: WireReputationLevel;
  badges: WireBadge[];
  countryReputations: WireCountryStanding[];
  isVerifiedMember: boolean;
  memberSince: string;
}

/** `TrustTimelineEventResponse` — one row of `GET /trust/timeline`. */
export interface WireTrustTimelineEvent {
  eventId: string;
  type: string;
  label: string;
  /** ISO instant. The legacy view model called this a date string. */
  timestamp: string;
  /** Emoji, chosen server-side so a new event kind renders without a release. */
  icon: string;
  description?: string | null;
  countryCode?: string | null;
}

// ── Verifications ────────────────────────────────────────────────────────────

/** `VerificationResponse`. */
export interface WireVerification {
  verificationId: string;
  userId: string;
  type: VerificationType;
  status: VerificationStatus;
  submittedAt: string;
  reviewedAt?: string | null;
  /** When the grant lapses. Null means it does not. */
  expiresAt?: string | null;
  rejectionReasonCode?: WireRejectionReason | null;
  rejectionReasonDetails?: string | null;
  nationality?: string | null;
  residenceCountry?: string | null;
  targetCountry?: string | null;
  /** ISO date, `YYYY-MM-DD`. */
  arrivalDate?: string | null;
  expertiseAreas: string[];
  documentCount: number;
  /**
   * Whether this outcome can be appealed **right now**.
   *
   * True only for `Rejected`, `Revoked` and `PartiallyApproved`
   * (`VerificationWorkflow.IsAppealable`). There is also a 90-day window from
   * the decision, enforced separately when the appeal is filed — so `canAppeal`
   * being true is necessary, not sufficient.
   */
  canAppeal: boolean;
}

/**
 * `VerificationDocumentResponse`.
 *
 * `documentUrl` is minted per request and short-lived (10 minutes), and is
 * **null when the caller may not read the file** or when no storage provider is
 * registered. Never store it.
 */
export interface WireVerificationDocument {
  documentId: string;
  documentType: WireVerificationDocumentType;
  status: WireVerificationDocumentStatus;
  documentUrl?: string | null;
  originalFileName?: string | null;
  sizeInBytes: number;
  documentNumber?: string | null;
  issuingCountry?: string | null;
  issuedOn?: string | null;
  expiresOn?: string | null;
  version: number;
  reviewComment?: string | null;
  uploadedAt: string;
}

/** `VerificationReviewResponse`. A member sees `"Compliance team"`, never a name. */
export interface WireVerificationReview {
  reviewId: string;
  decidedBy?: string | null;
  fromStatus: VerificationStatus;
  toStatus: VerificationStatus;
  decisionMode: WireDecisionMode;
  rejectionReason?: WireRejectionReason | null;
  /** Internal notes. Always null in a member-facing projection. */
  notes?: string | null;
  decidedAt: string;
}

/** `VerificationDetailResponse` — `GET /trust/verifications/{id}`. */
export interface WireVerificationDetail {
  verification: WireVerification;
  documents: WireVerificationDocument[];
  reviews: WireVerificationReview[];
}

/** `VerificationQueueItemResponse` — one row of the staff queue. */
export interface WireVerificationQueueItem {
  verificationId: string;
  userId: string;
  type: VerificationType;
  status: VerificationStatus;
  submittedAt: string;
  reviewDueAt?: string | null;
  isOverdue: boolean;
  assignedReviewerId?: string | null;
  documentCount: number;
  targetCountry?: string | null;
  submitterTier?: TrustTier | null;
  submitterViolationCount: number;
}

/**
 * `SubmitDiasporaVerificationRequest` — `POST /trust/verifications/diaspora`.
 *
 * **`selfieReference` is optional on the DTO and required by the handler.**
 * The C# property is `string?`, but `DiasporaVerificationHandler.RequiresSelfie`
 * is true, so omitting it is a 400 from the type handler rather than a model
 * binding error. It is required here so the mistake is a compile error.
 */
export interface SubmitDiasporaVerificationBody {
  /** ISO-3166-1 alpha-2. Must differ from `residenceCountry` or the server auto-rejects. */
  nationality: string;
  residenceCountry: string;
  documentType: WireVerificationDocumentType;
  issueCountry: string;
  /** `YYYY-MM-DD`. */
  issueDate?: string | null;
  expiryDate?: string | null;
  documentNumber?: string | null;
  supportingNotes?: string | null;
  /** Storage key of the uploaded document. See `mediaDocumentReference`. */
  documentReference: string;
  /** Required in practice — see the type note. */
  selfieReference: string;
}

/** `SubmitIdentityVerificationRequest` — `POST /trust/verifications/identity`. */
export interface SubmitIdentityVerificationBody {
  documentType: WireVerificationDocumentType;
  issueCountry: string;
  documentReference: string;
  /** Required by the DTO as well as the handler — this type is a face match. */
  selfieReference: string;
  documentNumber?: string | null;
  expiryDate?: string | null;
}

/**
 * `SubmitCountryVerificationRequest` — `POST /trust/verifications/country`.
 *
 * `arrivalDate` is `DateOnly?` on the DTO and **required by
 * `CountryVerificationHandler.Validate`**. Required here for the same reason as
 * the diaspora selfie.
 */
export interface SubmitCountryVerificationBody {
  countryCode: string;
  documentType: WireVerificationDocumentType;
  documentReference: string;
  arrivalDate: string;
  /** At most ten. */
  expertiseAreas?: string[] | null;
  supportingNotes?: string | null;
}

/** `ReviewVerificationRequest` — staff only. */
export interface ReviewVerificationBody {
  decision: WireReviewDecision;
  /** Required when rejecting. */
  rejectionReason?: WireRejectionReason | null;
  /** Shown to the member. Required when rejecting or asking for more. */
  details?: string | null;
  notes?: string | null;
}

// ── Appeals ──────────────────────────────────────────────────────────────────

/** `AppealResponse`. */
export interface WireAppeal {
  appealId: string;
  type: AppealType;
  targetId: string;
  reason: string;
  status: AppealStatus;
  /** Reviewer comments, shown to the member. */
  explanation?: string | null;
  isCorrectionRequest: boolean;
  evidenceCount: number;
  createdAt: string;
  resolvedAt?: string | null;
}

/** `AppealReviewResponse`. `reviewerId` is null in a member-facing projection. */
export interface WireAppealReview {
  reviewId: string;
  reviewerId?: string | null;
  fromStatus: AppealStatus;
  toStatus: AppealStatus;
  notes?: string | null;
  reviewedAt: string;
}

/** `AppealDetailResponse` — `GET /trust/appeals/{id}`. */
export interface WireAppealDetail {
  appeal: WireAppeal;
  reviews: WireAppealReview[];
}

/**
 * `SubmitAppealRequest` — `POST /trust/appeals`.
 *
 * `reason` must be **at least 20 characters** and at most 2000
 * (`AppealHandlers.cs:50-54`). `additionalDocuments` is capped at ten.
 */
export interface SubmitAppealBody {
  type: AppealType;
  /** For a verification appeal this is the verification id. Max 128 chars. */
  targetId: string;
  reason: string;
  additionalDocuments?: string[] | null;
  correctionRequest?: boolean;
}

/** `ReviewAppealRequest` — staff only. See {@link WireAppealDecision}. */
export interface ReviewAppealBody {
  decision: WireAppealDecision;
  /** Required, and shown to the member. */
  explanation: string;
}

// ── Reputation ───────────────────────────────────────────────────────────────

/** `LevelBenefitsResponse`. */
export interface WireLevelBenefits {
  canPublishImmediately: boolean;
  canModerate: boolean;
  isFeaturedEligible: boolean;
  isRewardsEligible: boolean;
  hasBetaAccess: boolean;
  hasExclusiveBadge: boolean;
  searchBoostFactor: number;
}

/** `NextLevelResponse`. Null at the top of the ladder. */
export interface WireNextLevel {
  name: WireReputationLevel;
  minScore: number;
  pointsNeeded: number;
}

/** `ReputationProfileResponse` — `GET /trust/reputation/me`. */
export interface WireReputationProfile {
  userId: string;
  contributionScore: number;
  verificationScore: number;
  trustScore: number;
  combinedScore: number;
  level: WireReputationLevel;
  nextLevel?: WireNextLevel | null;
  guidesPublished: number;
  guidesApproved: number;
  updatesPublished: number;
  updatesVerified: number;
  commentsWritten: number;
  guidesUpdated: number;
  phoneVerified: boolean;
  emailVerified: boolean;
  governmentIdVerified: boolean;
  profilePhotoAdded: boolean;
  profileCompleted: boolean;
  providerVerified: boolean;
  countryVerificationsCount: number;
  helpfulVotesReceived: number;
  communityConfirmationsReceived: number;
  violationCount: number;
  reportsResolved: number;
  noViolationStreakDays: number;
  badges: WireBadge[];
  levelBenefits: WireLevelBenefits;
  lastCalculatedAt: string;
  levelChangedAt?: string | null;
  /**
   * What each dimension's score is made of — contribution, verification and
   * trust, always all three, totalled by the server from the scoring history.
   *
   * The counters above say how often something happened, never what it was
   * worth. The screen used to multiply them by figures of its own (thirty a
   * phone, forty a country, minus twenty a violation) that the server does not
   * pay. Optional because a server from before 22 Oct 2026 does not send it;
   * with no breakdown the cards show their scores and no rows.
   */
  breakdown?: WireReputationDimensionBreakdown[];
}

/**
 * `ReputationDimensionBreakdownResponse`.
 *
 * `score` is always the lines' points plus `adjustment`. The adjustment is
 * non-zero where a score was held at zero — a penalty larger than the score
 * records its full amount and moves the score by less — so it is shown as its
 * own row rather than letting the rows fail to add up.
 */
export interface WireReputationDimensionBreakdown {
  dimension: WireReputationDimension;
  score: number;
  /** Largest award first, so penalties come last. */
  lines: WireReputationBreakdownLine[];
  adjustment: number;
}

/** `ReputationBreakdownLineResponse` — everything one action paid on one dimension. */
export interface WireReputationBreakdownLine {
  actionType: string;
  /** The server's name for the row: "Guides published", "Policy violations". */
  label: string;
  count: number;
  /** Signed. Penalties are negative. */
  points: number;
}

/** `ReputationEventResponse` — one row of `GET /trust/reputation/me/events`. */
export interface WireReputationEvent {
  eventId: string;
  userId: string;
  eventType: string;
  /** Lowercase. See note 1. */
  dimension: WireReputationDimension;
  /** Signed. Violations are negative. */
  points: number;
  sourceType?: string | null;
  sourceId?: string | null;
  countryCode?: string | null;
  description?: string | null;
  createdAt: string;
}

/**
 * `RecordConfirmationRequest` — `POST /trust/contributions/confirmations`.
 *
 * Replaces the frontend's invented `POST /trust/community-voting`. Nothing is
 * tallied toward a majority: this is one peer confirmation feeding the
 * *author's* trust dimension, which is why `authorUserId` is required and why
 * confirming your own work is a 403.
 */
export interface RecordConfirmationBody {
  /** `"community-update"`, `"guide"`. Free-form server-side. */
  targetType: string;
  targetId: string;
  authorUserId: string;
  countryCode?: string | null;
  note?: string | null;
}

/** `ConfirmationResponse`. */
export interface WireConfirmation {
  confirmationId: string;
  targetType: string;
  targetId: string;
  /** Zero when the scoring rule is capped out — which is not a failure. */
  pointsAwarded: number;
  confirmedAt: string;
}

// ── Eligibility ──────────────────────────────────────────────────────────────

/**
 * `EvaluateEligibilityRequest` — `POST /trust/eligibility`.
 *
 * A POST rather than a GET because a non-dry-run evaluation **consumes a
 * rate-limit permit**. `dryRun` defaults to true on the server and is required
 * here so no caller spends a member's quota by omission.
 */
export interface EvaluateEligibilityBody {
  capability: TrustCapabilityKey;
  /** Two letters, when the action is country-scoped. */
  targetCountry?: string | null;
  dryRun: boolean;
}

/**
 * `EligibilityDecisionResponse`.
 *
 * A dry run **always reports the optimistic answer for the rate-limit check**
 * (`EligibilityEvaluator.cs:141-148`): the limiter cannot be inspected without
 * consuming, so `allowed: true` from a dry run means "nothing else refuses",
 * not "there is budget". The real call is the one that can say
 * `RATE_LIMITED`.
 */
export interface WireEligibilityDecision {
  allowed: boolean;
  code: WireEligibilityCode;
  reason?: string | null;
  /** Seconds. Set for `RATE_LIMITED` and `COOLDOWN`. */
  waitTimeSec?: number | null;
  unmetRequirements: string[];
}

/** `RequirementItemResponse`. */
export interface WireRequirementItem {
  description: string;
  isMet: boolean;
  /** Progress text — `"45 / 150 pts"`, `"Verified"`. */
  currentProgress: string;
}

/** `FeatureRequirementResponse` — one row of `GET /trust/feature-requirements`. */
export interface WireFeatureRequirement {
  featureId: TrustCapabilityKey;
  name: string;
  isUnlocked: boolean;
  requirements: WireRequirementItem[];
}

// ── Moderation ───────────────────────────────────────────────────────────────

/** `AiReviewResponse`. */
export interface WireAiReview {
  /** `Clean` or `Flagged`. */
  status: 'Clean' | 'Flagged';
  /** snake_case labels — `"spam"`, `"hate_speech"`. */
  flags: string[];
  /** 0–1. */
  confidence: number;
  processedAt: string;
}

/** `ModerationQueueItemResponse`. */
export interface WireModerationQueueItem {
  itemId: string;
  contentType: WireModerationContentType;
  contentId: string;
  title?: string | null;
  authorId: string;
  authorLevel?: WireReputationLevel | null;
  authorViolationCount: number;
  aiReview?: WireAiReview | null;
  reportCount: number;
  status: WireModerationQueueStatus;
  priority: WireModerationPriority;
  assignedModeratorId?: string | null;
  dueAt?: string | null;
  isOverdue: boolean;
  createdAt: string;
}

/** `ModerationDecisionResponse`. */
export interface WireModerationDecision {
  actionId: string;
  moderatorId: string;
  contentType: WireModerationContentType;
  contentId: string;
  actionType: WireModerationActionType;
  reason?: string | null;
  previousStatus: WireModerationQueueStatus;
  newStatus: WireModerationQueueStatus;
  createdAt: string;
}

/**
 * `RecordModerationDecisionRequest`.
 *
 * `reason` is **required** for `Reject`, `Hide` and `Suspend`
 * (`ModerationHandlers.cs:210-214`).
 */
export interface RecordModerationDecisionBody {
  action: WireModerationActionType;
  reason?: string | null;
}
