// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Advanced Community Life domain model (Frontend Phase 12)
//
// §4 of the phase brief: the frontend's own abstractions, sitting above whatever
// answers. Where a certified contract exists the type here is an adaptation of
// that DTO; where one does not, the type is a clean frontend interface that a
// future backend phase is expected to satisfy. **No component imports a mock
// DTO.** The repository layer in `hooks/community-life.ts` is the only thing
// that knows which arm answered.
//
// Three rules this file holds to, all from the brief:
//
//   **§53 — states, not booleans.** Every lifecycle is a named union. There is
//   no `isActive` on a membership, no `isApproved` on a volunteer application
//   and no `isComplete` on a campaign, because each of those domains has more
//   than two states and a boolean would force the UI to guess which one it is
//   looking at. Legal transitions live in `lib/community-state.ts`.
//
//   **§45 — the backend is authoritative.** Nothing here is a type the client
//   may compute. `PollResult` has no field a device could fill in;
//   `MembershipStatus` arrives from the server; `FundraisingProgress.raised` is
//   `Money` from B15 and is never accumulated locally. Where a figure is
//   simulated, the *envelope* carrying it says so — see `Sourced<T>`.
//
//   **§17/§34 — a figure with no provenance is not printed.** `Sourced<T>` is
//   how a hybrid surface (a real B15 total beside a simulated donor trend)
//   stays honest at the field level rather than the screen level.
//
// Money is B15's `Money` — imported, never redefined. There is no second money
// type on this platform.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  BeneficiaryType,
  ContributionKind,
  ContributionUrgency,
  Donation,
  GivingStatus,
  Money,
  PaymentIntent,
  PaymentStatus,
} from './financial';
import type { Event, EventCategory, EventLocation, OrgCategory } from './community-life';

// ═════════════════════════════════════════════════════════════════════════════
// PROVENANCE
// ═════════════════════════════════════════════════════════════════════════════

/** Where a value came from, so a screen can mark it without guessing. */
export type DataSource =
  /** A certified backend contract answered. Printable as fact. */
  | 'backend'
  /** The development adapter answered. Must be visibly marked. */
  | 'simulated';

/**
 * A value with its provenance attached.
 *
 * The reason this exists at the *field* level rather than the screen level: a
 * campaign page shows B15's real `raised` total next to a simulated donor
 * trend, and marking the whole page as simulated would be as misleading as
 * marking none of it. §17 forbids inventing financial figures; this is how the
 * UI proves which ones it did not invent.
 */
export interface Sourced<T> {
  value: T;
  source: DataSource;
  /** The gap key when simulated, so the notice can name the missing contract. */
  gapKey?: string;
}

export function backed<T>(value: T): Sourced<T> {
  return { value, source: 'backend' };
}

export function simulated<T>(value: T, gapKey: string): Sourced<T> {
  return { value, source: 'simulated', gapKey };
}

/** The cursor-paged envelope every list in this phase uses. */
export interface CommunityPage<T> {
  items: T[];
  nextCursor?: string | null;
  hasMore: boolean;
  /** Absent where the backend cannot count without scanning. Never guessed. */
  totalCount?: number | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// MEMBERSHIP — §6, §7, §8
// ═════════════════════════════════════════════════════════════════════════════

/**
 * §6's states, in full.
 *
 * Fourteen members rather than a boolean because the UI genuinely renders
 * fourteen different things: `PaymentPending` shows a spinner and a "we are
 * confirming with your bank" line, `PaymentFailed` shows a retry, `Pending`
 * shows the organization's review time, and `RenewalDue` shows a price. Any
 * collapse of these loses a screen.
 */
export type MembershipStatus =
  | 'NotAMember'
  | 'Eligible'
  | 'Ineligible'
  | 'Draft'
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | 'PaymentPending'
  | 'PaymentFailed'
  | 'Active'
  | 'RenewalDue'
  | 'Expired'
  | 'Suspended'
  | 'Cancelled';

/** How often a tier is charged. `OneOff` and `Lifetime` are charged once. */
export type BillingPeriod = 'OneOff' | 'Monthly' | 'Quarterly' | 'Yearly' | 'Lifetime';

/** Who may see a programme at all. Enforced server-side; §7 forbids leaking private groups. */
export type MembershipVisibility = 'Public' | 'Unlisted' | 'Private' | 'InviteOnly';

export interface MembershipBenefit {
  id: string;
  title: string;
  description?: string | null;
  /** An Ionicons name chosen by the server, so the catalogue owns its own iconography. */
  icon?: string | null;
  /** False where a benefit is advertised but not yet live. */
  isActive: boolean;
}

/**
 * A requirement a member must satisfy before applying.
 *
 * `isMet` is the *server's* evaluation. The client renders it; it never
 * evaluates one, because eligibility is an authorization decision (§19).
 */
export interface MembershipRequirement {
  id: string;
  label: string;
  description?: string | null;
  kind: 'Verification' | 'Residency' | 'Age' | 'Invitation' | 'Referral' | 'Document' | 'Other';
  isMet: boolean;
  /** Where to send someone who does not meet it yet. */
  actionRoute?: string | null;
}

export interface MembershipTier {
  tierId: string;
  organizationId: string;
  name: string;
  description: string;
  /** Null for a free tier. Never zero-as-free — the absence is the meaning. */
  price?: Money | null;
  billingPeriod: BillingPeriod;
  benefits: MembershipBenefit[];
  requirements: MembershipRequirement[];
  /** Null where the tier is uncapped. */
  capacity?: number | null;
  filledCount: number;
  /** Server-decided. The client does not compare `filledCount` to `capacity`. */
  isFull: boolean;
  isRecommended: boolean;
  sortOrder: number;
}

/** The membership programme attached to an organization. */
export interface MembershipProgramme {
  organizationId: string;
  organizationName: string;
  organizationLogo?: string | null;
  category: OrgCategory;
  isVerified: boolean;
  visibility: MembershipVisibility;
  /** False when the organization has closed intake entirely. */
  isOpen: boolean;
  /** Whether an application is reviewed by a human before activation. */
  requiresApproval: boolean;
  summary: string;
  tiers: MembershipTier[];
  memberCount: number;
  location?: EventLocation | null;
  countryCode?: string | null;
  /** The caller's own state against this programme. */
  myStatus: MembershipStatus;
  myMembershipId?: string | null;
}

/** One entry in a membership's audit trail. */
export interface MembershipHistoryEntry {
  id: string;
  status: MembershipStatus;
  occurredAt: string;
  /** Who moved it. Never a member identifier for a staff action. */
  actor: 'Member' | 'Organization' | 'System';
  reason?: string | null;
}

export interface CommunityMembership {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  organizationLogo?: string | null;
  tierId: string;
  tierName: string;
  status: MembershipStatus;
  price?: Money | null;
  billingPeriod: BillingPeriod;
  benefits: MembershipBenefit[];
  joinedAt?: string | null;
  /** Null on a lifetime or one-off membership. */
  expiresAt?: string | null;
  renewalDueAt?: string | null;
  /** Server-decided; the client does not compare dates to decide this. */
  isRenewable: boolean;
  /** Present while a payment is in flight or has failed. */
  payment?: MembershipPayment | null;
  history: MembershipHistoryEntry[];
  /** Set when the organization rejected, suspended or cancelled. */
  decisionReason?: string | null;
}

/**
 * The link between a membership and the money that paid for it.
 *
 * `paymentIntentId` is a **real B15 identifier**. `paymentStatus` is read back
 * from B15 and is the only thing a screen may use to say a payment succeeded
 * (§8: do not trust client-side payment success). `bindingSource` says whether
 * the *activation* that followed is real or simulated — that is
 * COMMUNITY-LIFE-GAP-003, and it is the one field on this object that is not
 * about money.
 */
export interface MembershipPayment {
  paymentIntentId: string;
  paymentStatus: PaymentStatus;
  amount: Money;
  /** B15's receipt handle, when the payment reached a terminal captured state. */
  receiptReference?: string | null;
  attemptedAt: string;
  completedAt?: string | null;
  /** Whether a real backend bound this payment to the membership. */
  bindingSource: DataSource;
}

export interface MembershipApplication {
  applicationId: string;
  organizationId: string;
  tierId: string;
  status: MembershipStatus;
  /** Free-form answers to the programme's questions. */
  answers: Record<string, string>;
  submittedAt?: string | null;
  decidedAt?: string | null;
  decisionReason?: string | null;
}

export interface SubmitMembershipApplicationRequest {
  organizationId: string;
  tierId: string;
  answers: Record<string, string>;
  /** §52. Persisted across retries by `lib/idempotency.ts`. */
  idempotencyKey?: string;
}

/** §7's discovery filters. */
export interface MembershipDiscoveryParams {
  query?: string;
  category?: OrgCategory | 'All';
  countryCode?: string;
  cityName?: string;
  neighborhood?: string;
  /** `free` and `paid` are the two bands §7 requires; `any` is the default. */
  priceBand?: 'any' | 'free' | 'paid';
  /** Only programmes the caller currently satisfies the requirements for. */
  eligibleOnly?: boolean;
  maxDistanceKm?: number;
  cursor?: string;
  take?: number;
}

// ═════════════════════════════════════════════════════════════════════════════
// RECURRING EVENTS — §9, §10, §11
// ═════════════════════════════════════════════════════════════════════════════

/** §10's frequencies. `Custom` carries its meaning in the rest of the rule. */
export type RecurrenceFrequency = 'Daily' | 'Weekly' | 'Monthly' | 'Yearly' | 'Custom';

/** ISO-8601 weekday numbering: 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** How a series stops. Three ways, and the UI renders all three. */
export type RecurrenceEndKind = 'Never' | 'OnDate' | 'AfterCount';

/**
 * A recurrence rule as **data**.
 *
 * §10: "Do not hardcode recurrence semantics into UI. Use a data-driven
 * recurrence model." Shaped after RFC 5545 so the eventual backend contract is
 * a standard rather than an invention, and so expansion can move server-side
 * without the editor changing.
 */
export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  /** Every N periods. 1 = every week, 2 = every other week. */
  interval: number;
  /** For Weekly and Custom. Empty means "the weekday the series starts on". */
  byWeekday: Weekday[];
  /** For Monthly. 1–31, or negative from the end of the month (-1 = last day). */
  byMonthDay?: number[] | null;
  endKind: RecurrenceEndKind;
  /** Set when `endKind` is `OnDate`. YYYY-MM-DD. */
  until?: string | null;
  /** Set when `endKind` is `AfterCount`. */
  count?: number | null;
  /** Dates the rule would generate and that were removed. YYYY-MM-DD. */
  exceptions: string[];
  /**
   * The server's own rendering of the rule in words. The client shows this in
   * preference to composing its own sentence, because the backend owns the
   * semantics and a client-composed sentence drifts from them.
   */
  description?: string | null;
}

export type EventSeriesStatus = 'Draft' | 'Published' | 'Paused' | 'Completed' | 'Cancelled';

/** §11's occurrence states. */
export type OccurrenceStatus = 'Scheduled' | 'Rescheduled' | 'Cancelled' | 'Completed';

/** What an edit applies to. Sent to the server; never resolved on the client. */
export type SeriesEditScope = 'ThisOccurrence' | 'ThisAndFuture' | 'EntireSeries';

/**
 * One dated instance of a series.
 *
 * Deliberately close to B12's `Event` — an occurrence renders through the same
 * card and the same detail layout — with the four fields a single event cannot
 * have: which series it belongs to, its own status, its original date when it
 * was moved, and its registration state.
 */
export interface EventOccurrence {
  occurrenceId: string;
  seriesId: string;
  title: string;
  date: string;
  time: string;
  endTime: string;
  timezone: string;
  location: EventLocation;
  status: OccurrenceStatus;
  /** Set when `status` is `Rescheduled` — what the date used to be. */
  originalDate?: string | null;
  cancellationReason?: string | null;
  /** Null where the series does not cap attendance. */
  capacity?: number | null;
  registeredCount: number;
  /** Server-decided. §51's "Event full". */
  isFull: boolean;
  myRegistration: RegistrationStatus;
  /** True for the next scheduled occurrence, decided by the server. */
  isNext: boolean;
}

export interface EventSeries {
  seriesId: string;
  title: string;
  description: string;
  coverImage: string;
  category: EventCategory;
  status: EventSeriesStatus;
  recurrence: RecurrenceRule;
  location: EventLocation;
  timezone: string;
  price?: Money | null;
  organizerId: string;
  organizerName: string;
  organizerType: 'Organization' | 'User';
  organizerIsVerified: boolean;
  organizationId?: string | null;
  /** The next scheduled occurrence, so a card renders without a second call. */
  nextOccurrence?: EventOccurrence | null;
  occurrenceCount: number;
  completedCount: number;
  /** The caller's attendance across the series. */
  myAttendedCount: number;
  isSaved: boolean;
  createdAt: string;
}

/** §9's registration states. */
export type RegistrationStatus =
  | 'NotRegistered'
  | 'Registered'
  | 'Waitlisted'
  | 'CheckedIn'
  | 'Attended'
  | 'NoShow'
  | 'Cancelled';

export interface EventRegistration {
  registrationId: string;
  /** One of these two is set. An occurrence registration names the occurrence. */
  eventId?: string | null;
  occurrenceId?: string | null;
  seriesId?: string | null;
  status: RegistrationStatus;
  registeredAt: string;
  /** Position in the queue when `Waitlisted`. */
  waitlistPosition?: number | null;
  /** Set when the registration required payment. Real B15 identifier. */
  paymentIntentId?: string | null;
  guestCount: number;
}

export interface EventAttendee {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  status: RegistrationStatus;
  registeredAt: string;
  checkedInAt?: string | null;
  guestCount: number;
}

export interface CreateEventSeriesRequest {
  title: string;
  description: string;
  coverImage: string;
  category: EventCategory;
  startDate: string;
  time: string;
  endTime: string;
  timezone: string;
  recurrence: RecurrenceRule;
  /**
   * Required by B12's create contract and optional here.
   *
   * The series editor collects a city rather than a country, and B12 will
   * refuse a create without one — deliberately, because a country cannot be
   * inferred from a city name and guessing it would file a Lagos event under
   * the United Kingdom.
   */
  countryCode?: string;
  cityName: string;
  areaName: string;
  addressLine: string;
  landmark?: string;
  neighborhood?: string;
  organizationId?: string;
  priceAmount?: number;
  priceCurrency?: string;
  capacity?: number;
  publish: boolean;
  idempotencyKey?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// DONATIONS & FUNDRAISING — §12–§17
// ═════════════════════════════════════════════════════════════════════════════

/** §16's campaign lifecycle. Twelve states, all reachable in the UI. */
export type CampaignStatus =
  | 'Draft'
  | 'PendingReview'
  | 'Rejected'
  | 'Published'
  | 'Active'
  | 'Paused'
  | 'GoalReached'
  | 'DeadlineReached'
  | 'Completed'
  | 'Refunding'
  | 'Cancelled'
  | 'Closed';

export type CampaignCategory =
  | 'Medical'
  | 'Education'
  | 'Emergency'
  | 'Funeral'
  | 'Community Project'
  | 'Religious'
  | 'Sports'
  | 'Legal Support'
  | 'Repatriation'
  | 'Disaster Relief'
  | 'Other';

/**
 * The money side of a campaign.
 *
 * Every field is `Sourced` because a campaign backed by a real B15
 * `DonationCause` prints real numbers and one that is not prints simulated
 * ones, and the difference has to survive into the component. §17.
 */
export interface FundraisingProgress {
  target: Sourced<Money | null>;
  raised: Sourced<Money>;
  /**
   * 0–100, server-computed. Never derived on the device from the two above.
   *
   * **Null where the campaign set no target**, because a percentage of nothing
   * is not zero — it is undefined, and a 0% bar over a campaign that has raised
   * thousands states something false. The server sends null and the screens
   * render the bar's absence rather than a floor. (`CampaignMapper.Percentage`
   * says the same thing from the other side.)
   */
  percentage: Sourced<number | null>;
  supporterCount: Sourced<number>;
  /** Null where the campaign has no deadline. */
  deadline?: string | null;
  /** Server-decided. The client does not subtract dates to decide urgency. */
  daysRemaining?: number | null;
}

export interface CampaignUpdate {
  updateId: string;
  campaignId: string;
  title: string;
  body: string;
  /**
   * Renderable image URLs.
   *
   * **Empty on the B15.1 arm, and that is deliberate.** The real contract
   * (`CampaignUpdateResponse.mediaReferences`) carries B5 media *identifiers*,
   * not URLs, and there is no synchronous id→URL resolver on this client. Put
   * an identifier in here and an `<Image>` renders a broken source — the same
   * reason `toSeries` sets `coverImage: ''` and the B18 adapters null their
   * logo URLs. The identifiers are preserved on `mediaReferences` below, so
   * nothing is lost and nothing is invented.
   */
  mediaUrls: string[];
  /** B5 media identifiers, as the server sent them. Resolve through Media. */
  mediaReferences?: string[];
  publishedAt: string;
  authorName: string;
  /**
   * True only on the organizer's own read.
   *
   * A supporter never receives a withdrawn update at all — the server filters
   * it out rather than flagging it — so a screen showing this is showing the
   * organizer something they took down, never a supporter something hidden.
   */
  isWithdrawn?: boolean;
}

export interface CampaignMilestone {
  milestoneId: string;
  label: string;
  target: Money;
  isReached: boolean;
  reachedAt?: string | null;
}

/** §17's fund-usage transparency. Declared allocation against actual spend. */
export interface FundUsageLine {
  id: string;
  label: string;
  allocated: Money;
  spent?: Money | null;
  note?: string | null;
  /**
   * Whether a settled B15 payout backs the spend, or only the organizer's word.
   *
   * The screen renders the difference. A figure somebody typed and a figure the
   * platform can prove are not the same claim, and presenting them identically
   * would be inventing one. Absent on the simulated arm, which can prove
   * nothing.
   */
  isPlatformVerified?: boolean;
}

/**
 * Where a campaign's money is — §17's transparency panel, whole.
 *
 * **Four figures with four different authorities, and this type keeps them
 * apart.** `raised` is B15's own total from the linked cause. `allocated` is
 * the organizer's declaration of intent. `disbursed` is what the lines report
 * spent, of which only `disbursedVerified` is a figure the platform stands
 * behind. `remaining` is `raised` less `disbursed`, computed by the server.
 *
 * Added by Remediation Wave C-04. The register declared this route as returning
 * lines; `CampaignFundUsageResponse` returns lines **inside an envelope of
 * totals**, and a client that read only the lines would have thrown away the
 * one figure — `disbursedVerified` — that separates a claim from a fact.
 */
export interface CampaignFundUsage {
  campaignId: string;
  /** The B15 cause this campaign collects through. Null before publication. */
  causeCode?: string | null;
  /** B15's figure, from the cause's own donations. Authoritative. */
  raised: Money;
  /** The organizer's declared plan. A statement of intent, not of fact. */
  allocated: Money;
  /** What the lines report spent — verified and merely reported, together. */
  disbursed: Money;
  /** Of `disbursed`, the part a settled B15 payout backs. */
  disbursedVerified: Money;
  /** `raised` less `disbursed`. Never negative; an over-report is clamped. */
  remaining: Money;
  lines: FundUsageLine[];
  /**
   * True when the lines report spending more than the cause ever raised.
   *
   * Surfaced rather than hidden. The figures are the organizer's and the
   * platform will not quietly adjust them, but a supporter reading the page is
   * entitled to know they do not add up.
   */
  isOverReported: boolean;
}

/** One bucket of a cause's giving. A whole UTC day. */
export interface DonationTimeSeriesPoint {
  periodStart: string;
  amount: Money;
  donationCount: number;
}

/**
 * A cause's giving over a window, bucketed and totalled by the server.
 *
 * **Every day in the window is present, including the empty ones.** A series
 * that omitted them would let a chart draw a line straight from Monday to
 * Friday and call the middle of it Wednesday's giving — which is the client
 * inventing a financial figure by interpolation. §17 forbids it however it
 * happens, so the server sends the zeroes and this client does not synthesise
 * them.
 */
export interface DonationTimeSeries {
  causeCode: string;
  currency: string;
  from: string;
  to: string;
  /** Always `UTC`. Stated by the server rather than assumed by the device. */
  timeZone: string;
  /** `Day`. The only granularity the contract serves today. */
  granularity: string;
  points: DonationTimeSeriesPoint[];
  /** Completed giving over the whole window. */
  total: Money;
  /** Refunded over the window. **Never netted off `total`.** */
  refunded: Money;
  donationCount: number;
  refundedCount: number;
  failedCount: number;
  supporterCount: number;
}

/**
 * Where a standing donation instruction is in its life.
 *
 * Five states, and the two failure ones are separate on purpose: `Retrying`
 * means another attempt is scheduled, `Suspended` means the retry budget is
 * spent and nothing further will be tried until the donor acts. A screen that
 * folded them into one "failed" would either tell somebody their giving had
 * stopped when it had not, or tell them it was fine when it had.
 */
export type RecurringDonationStatus =
  | 'Active'
  | 'Retrying'
  | 'Suspended'
  | 'Cancelled'
  | 'Completed';

/** §12's standing donation. `RecurringDonationResponse`, B15.1. */
export interface RecurringDonation {
  recurringDonationId: string;
  causeCode: string;
  /** The cause's title at the time of reading, so a list needs no second call. */
  causeTitle?: string | null;
  amount: Money;
  intervalMonths: number;
  status: RecurringDonationStatus;
  /**
   * Null once the schedule is terminal.
   *
   * **Never a date nothing intends to keep.** This field is the whole reason
   * GAP-008 could not be rendered before: the UI used to say the interval was
   * "recorded as an intention and not yet scheduled" precisely because there
   * was no sweep behind it and no next date to show.
   */
  nextChargeAt?: string | null;
  lastChargeAt?: string | null;
  lastAttemptAt?: string | null;
  /** Why the last attempt failed, when one did. Cleared by a success. */
  lastFailureReason?: string | null;
  consecutiveFailures: number;
  chargeCount: number;
  createdAt: string;
  cancelledAt?: string | null;
}

export interface CampaignSupporter {
  /** Absent for an anonymous supporter — B15 stores no donor id at all. */
  userId?: string | null;
  displayName: string;
  isAnonymous: boolean;
  /** Absent where the supporter chose not to show it. */
  amount?: Money | null;
  message?: string | null;
  givenAt: string;
}

export interface FundraisingCampaign {
  campaignId: string;
  title: string;
  summary: string;
  story: string;
  /**
   * A renderable image URL.
   *
   * **Empty string on the B15.1 arm.** `CampaignResponse.coverImage` is a B5
   * media reference, never a URL, and this client has no synchronous resolver —
   * so the identifier is carried on `coverImageReference` and this field is
   * left empty rather than filled with something an `<Image>` would fail to
   * load. Same decision, same reason, as `toSeries`.
   */
  coverImage: string;
  gallery: string[];
  /** The B5 media reference behind `coverImage`, where the server sent one. */
  coverImageReference?: string | null;
  /** B5 media references behind `gallery`. */
  galleryReferences?: string[];
  category: CampaignCategory;
  status: CampaignStatus;
  progress: FundraisingProgress;
  /**
   * The lifecycle moves the **server** would accept from here, for this caller.
   *
   * Empty for somebody who does not manage the campaign, and absent entirely on
   * the simulated arm. `canTransitionCampaign` in `community-state.ts` decides
   * which buttons to *draw* and stays the client's own table; this is the
   * server saying which of them it would actually honour, and where the two
   * disagree it is the client that has gone stale.
   */
  availableTransitions?: CampaignStatus[];
  /**
   * The B15 cause this campaign collects through. When present, every donation
   * is a real `POST /financial/donations` against this code and the totals in
   * `progress` are B15's. When null, the campaign is not yet collecting.
   */
  causeCode?: string | null;
  beneficiaryType: BeneficiaryType;
  beneficiaryId?: string | null;
  beneficiaryName: string;
  urgency: ContributionUrgency;
  acceptedKinds: ContributionKind[];
  organizerId: string;
  organizerName: string;
  organizationId?: string | null;
  isVerified: boolean;
  countryCode?: string | null;
  locationLabel?: string | null;
  createdAt: string;
  publishedAt?: string | null;
  closedAt?: string | null;
  /** Set when `status` is `Rejected`. */
  reviewNote?: string | null;
  /** What the caller may do, decided by the server. §19. */
  canManage: boolean;
  canDonate: boolean;
}

export interface CreateCampaignRequest {
  title: string;
  summary: string;
  story: string;
  coverImage: string;
  gallery?: string[];
  category: CampaignCategory;
  targetAmount: number;
  currency: string;
  deadline?: string | null;
  beneficiaryType: BeneficiaryType;
  beneficiaryId?: string;
  beneficiaryName: string;
  organizationId?: string;
  countryCode?: string;
  acceptedKinds?: ContributionKind[];
  acceptedTerms: boolean;
  idempotencyKey?: string;
}

/**
 * A donation as this phase's screens see it.
 *
 * Wraps B15's `Donation` rather than replacing it: `donation` is the certified
 * record and is what the receipt renders from. The extra fields are the
 * campaign context B15 does not carry.
 */
export interface CampaignDonation {
  donation: Donation;
  campaignId?: string | null;
  campaignTitle?: string | null;
  /** B15's `GivingStatus`, surfaced so the UI does not reach into `donation`. */
  status: GivingStatus;
  /** The real payment behind it, when one was needed. */
  payment?: PaymentIntent | null;
}

export interface DonationDraft {
  campaignId?: string | null;
  causeCode?: string | null;
  amountMajor: number;
  currency: string;
  isAnonymous: boolean;
  message?: string;
  /** §12. Sent to B15, which records it without scheduling it. GAP-008. */
  recurringIntervalMonths?: number | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// VOLUNTEERING — §18–§21
// ═════════════════════════════════════════════════════════════════════════════

export type VolunteerOpportunityStatus =
  | 'Draft'
  | 'Published'
  | 'Full'
  | 'Closed'
  | 'Completed'
  | 'Cancelled';

/** §19's application states. */
export type VolunteerApplicationStatus =
  | 'NotApplied'
  | 'Draft'
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | 'Waitlisted'
  | 'Withdrawn'
  | 'Cancelled'
  | 'Completed';

/** §21's assignment states. */
export type VolunteerAssignmentStatus =
  | 'Assigned'
  | 'Confirmed'
  | 'CheckedIn'
  | 'Completed'
  | 'NoShow'
  | 'Cancelled';

export interface VolunteerShift {
  shiftId: string;
  opportunityId: string;
  label: string;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
  filledCount: number;
  /** Server-decided. */
  isFull: boolean;
}

export interface VolunteerOpportunity {
  opportunityId: string;
  title: string;
  description: string;
  coverImage?: string | null;
  cause: string;
  status: VolunteerOpportunityStatus;
  organizationId?: string | null;
  organizationName: string;
  organizationLogo?: string | null;
  isVerified: boolean;
  location: EventLocation;
  /** Null for an ongoing opportunity with no fixed date. */
  startDate?: string | null;
  endDate?: string | null;
  shifts: VolunteerShift[];
  requiredSkills: string[];
  requirements: MembershipRequirement[];
  minimumAge?: number | null;
  capacity?: number | null;
  filledCount: number;
  /** Server-decided. §51's "Volunteer opportunity full". */
  isFull: boolean;
  applicationDeadline?: string | null;
  /** The caller's own state. */
  myApplicationStatus: VolunteerApplicationStatus;
  myApplicationId?: string | null;
  /** Whether the server will accept an application from this caller. */
  canApply: boolean;
  /** Why not, when `canApply` is false. Rendered verbatim. */
  cannotApplyReason?: string | null;
  canManage: boolean;
  createdAt: string;
}

export interface VolunteerApplication {
  applicationId: string;
  opportunityId: string;
  opportunityTitle: string;
  organizationName: string;
  status: VolunteerApplicationStatus;
  answers: Record<string, string>;
  submittedAt?: string | null;
  decidedAt?: string | null;
  decisionReason?: string | null;
  waitlistPosition?: number | null;
  /** Set once approved and assigned. */
  assignment?: VolunteerAssignment | null;
}

export interface VolunteerAssignment {
  assignmentId: string;
  applicationId: string;
  opportunityId: string;
  opportunityTitle: string;
  shiftId?: string | null;
  shiftLabel?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  location: EventLocation;
  status: VolunteerAssignmentStatus;
  checkedInAt?: string | null;
  checkedOutAt?: string | null;
  /** Confirmed by the organizer. Null until then — never self-reported. */
  confirmedHours?: number | null;
}

/** An applicant as the organizer's queue sees them. */
export interface VolunteerApplicant {
  applicationId: string;
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  status: VolunteerApplicationStatus;
  skills: string[];
  submittedAt: string;
  answers: Record<string, string>;
  isVerified: boolean;
}

export interface VolunteerHoursSummary {
  /** Organizer-confirmed hours only. §34: a self-reported hour is not an hour. */
  confirmedHours: Sourced<number>;
  completedOpportunities: Sourced<number>;
  organizationsSupported: Sourced<number>;
  skills: string[];
  certificates: VolunteerCertificate[];
}

export interface VolunteerCertificate {
  certificateId: string;
  title: string;
  organizationName: string;
  hours: number;
  issuedAt: string;
  /** Absent until an issuing contract exists. */
  downloadUrl?: string | null;
}

export interface SubmitVolunteerApplicationRequest {
  opportunityId: string;
  shiftId?: string;
  answers: Record<string, string>;
  idempotencyKey?: string;
}

export interface CreateVolunteerOpportunityRequest {
  title: string;
  description: string;
  cause: string;
  organizationId: string;
  cityName: string;
  areaName: string;
  addressLine: string;
  startDate?: string;
  endDate?: string;
  requiredSkills: string[];
  minimumAge?: number;
  capacity?: number;
  applicationDeadline?: string;
  shifts: Omit<VolunteerShift, 'shiftId' | 'opportunityId' | 'filledCount' | 'isFull'>[];
  publish: boolean;
  idempotencyKey?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// POLLS — §22–§24, §32
// ═════════════════════════════════════════════════════════════════════════════

export type PollStatus = 'Draft' | 'Scheduled' | 'Open' | 'Closed' | 'Cancelled' | 'ResultsPublished';

export type PollVotingType = 'SingleChoice' | 'MultipleChoice' | 'OpenResponse';

/** Who may vote. Evaluated server-side; a private poll is never returned. */
export type PollAudience = 'Public' | 'OrganizationMembers' | 'Neighborhood' | 'Country' | 'Invited';

export interface PollOption {
  optionId: string;
  label: string;
  description?: string | null;
  sortOrder: number;
}

/**
 * One option's share of the vote.
 *
 * `count` and `percentage` are **server-computed**. §24 forbids computing an
 * authoritative result from incomplete client data, and there is no client-side
 * arithmetic anywhere in this phase that produces either field.
 */
export interface PollOptionResult {
  optionId: string;
  label: string;
  count: number;
  percentage: number;
  /** True for the option the caller chose. Absent on an anonymous poll. */
  isMyChoice?: boolean;
}

export interface PollResult {
  pollId: string;
  status: PollStatus;
  /** Absent while the poll hides results until close. Not zero — absent. */
  options?: PollOptionResult[] | null;
  totalResponses: number;
  /** Free-text answers on an `OpenResponse` poll, when the audience may see them. */
  openResponses?: string[] | null;
  /** Whether the server is prepared to show results to this caller yet. */
  areResultsVisible: boolean;
  /** Why they are not, when they are not. */
  resultsHiddenReason?: string | null;
  computedAt: string;
}

export interface CommunityPoll {
  pollId: string;
  question: string;
  description?: string | null;
  status: PollStatus;
  votingType: PollVotingType;
  audience: PollAudience;
  options: PollOption[];
  /** Max selections on a `MultipleChoice` poll. */
  maxSelections?: number | null;
  isAnonymous: boolean;
  /** Whether a voter may change their answer. Server rule, not a client one. */
  allowsChange: boolean;
  organizationId?: string | null;
  organizationName?: string | null;
  createdBy: string;
  opensAt?: string | null;
  closesAt?: string | null;
  totalResponses: number;
  /** The caller's own participation. */
  hasVoted: boolean;
  myResponse?: PollResponse | null;
  /** Server-decided. §51's "Poll closed" and "Already voted". */
  canVote: boolean;
  cannotVoteReason?: string | null;
  canManage: boolean;
  createdAt: string;
}

export interface PollResponse {
  responseId: string;
  pollId: string;
  selectedOptionIds: string[];
  openResponse?: string | null;
  respondedAt: string;
}

export interface SubmitPollResponseRequest {
  pollId: string;
  selectedOptionIds: string[];
  openResponse?: string;
  idempotencyKey?: string;
}

export interface CreatePollRequest {
  question: string;
  description?: string;
  votingType: PollVotingType;
  options: { label: string; description?: string }[];
  maxSelections?: number;
  audience: PollAudience;
  organizationId?: string;
  isAnonymous: boolean;
  allowsChange: boolean;
  opensAt?: string;
  closesAt?: string;
  publish: boolean;
  idempotencyKey?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// ORGANIZATIONS — §27–§32
// ═════════════════════════════════════════════════════════════════════════════

export type OrganizationRole =
  | 'Owner'
  | 'Administrator'
  | 'Organizer'
  | 'Treasurer'
  | 'Moderator'
  | 'Member';

/**
 * What the caller may do in an organization.
 *
 * **Fetched, never computed.** §19: the frontend makes no authoritative
 * authorization decision. Every flag here is the server's answer, the UI
 * renders accordingly, and every gated route refuses independently — a hidden
 * button is a convenience, not a control.
 */
export interface OrganizationCapabilities {
  organizationId: string;
  role: OrganizationRole | null;
  canManageMembers: boolean;
  canApproveMembers: boolean;
  canManageTiers: boolean;
  canManageEvents: boolean;
  canManageCampaigns: boolean;
  canManageVolunteers: boolean;
  canManagePolls: boolean;
  canPublishAnnouncements: boolean;
  canViewAnalytics: boolean;
  canViewFinancials: boolean;
}

export interface OrganizationMember {
  membershipId: string;
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  tierName: string;
  status: MembershipStatus;
  role: OrganizationRole;
  joinedAt?: string | null;
  expiresAt?: string | null;
  isVerified: boolean;
}

/** A counter on the dashboard overview, with its provenance. */
export interface DashboardMetric {
  key: string;
  label: string;
  value: Sourced<number>;
  /** Formatted money where the metric is monetary. */
  money?: Sourced<Money> | null;
  /** Period-over-period change, when the server computes one. */
  deltaPercent?: number | null;
  icon?: string | null;
}

export interface OrganizationDashboard {
  organizationId: string;
  organizationName: string;
  organizationLogo?: string | null;
  capabilities: OrganizationCapabilities;
  /** §47: the first paint is this object and nothing else. */
  metrics: DashboardMetric[];
  /**
   * Section counts, so the dashboard can skip a section rather than fetch it.
   *
   * **Six of these are B18's and four are `null` against it** — Remediation
   * Wave C-04. `DashboardCountsResponse` counts pending member applications,
   * active members, open opportunities, pending volunteer applications, open
   * polls and recent announcements, and nothing about events, series or
   * campaigns, because those aggregates belong to B12 and B15 and the dashboard
   * route deliberately does not reach across for them.
   *
   * `null` rather than `0`, and the distinction is the entire reason the type
   * changed: a zero renders as "there are no upcoming events", which is a
   * different and false statement from "this call does not count them". The
   * screen draws an em dash.
   */
  counts: {
    pendingMemberApplications: number;
    activeMembers: number;
    upcomingEvents: number | null;
    activeSeries: number | null;
    activeCampaigns: number | null;
    draftCampaigns: number | null;
    openOpportunities: number;
    pendingVolunteerApplications: number;
    openPolls: number;
    unreadAnnouncements: number;
  };
  /** Whether analytics on this dashboard are real. GAP-014. */
  analyticsSource: DataSource;
}

export type AnalyticsPeriod = '7d' | '30d' | '90d' | '12m' | 'all';

export interface TimeSeriesPoint {
  date: string;
  value: number;
}

export interface OrganizationAnalytics {
  organizationId: string;
  period: AnalyticsPeriod;
  source: DataSource;
  memberGrowth: TimeSeriesPoint[];
  /**
   * **Null against B18** — Remediation Wave C-04.
   *
   * `OrganizationAnalyticsResponse` carries three series: member growth,
   * volunteer hours and poll participation. Attendance is B12's and giving is
   * B15's, and neither is computed by the programme analytics route.
   *
   * Null rather than `[]`, because an empty series draws a flat line at zero —
   * "nobody came", "nobody gave" — which is a claim this platform cannot make.
   * The chart is omitted instead.
   */
  eventAttendance: TimeSeriesPoint[] | null;
  /** Null against B18, for the same reason as `eventAttendance`. */
  donationTotals: TimeSeriesPoint[] | null;
  volunteerHours: TimeSeriesPoint[];
  pollParticipation: TimeSeriesPoint[];
  /** When the projection was last recomputed, so the UI can say how fresh it is. */
  computedAt: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// NEIGHBOURHOOD, ANNOUNCEMENTS, IMPACT — §25, §26, §33, §34
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A B12 event with its neighbourhood binding.
 *
 * `event` is the **real** B12 record, unchanged. `neighborhoodId` and
 * `neighborhoodName` are the simulated binding (GAP-015); `distanceKm` is real
 * and comes from B12's proximity query.
 */
export interface NeighborhoodEvent {
  event: Event;
  neighborhoodId?: string | null;
  neighborhoodName?: string | null;
  distanceKm?: number | null;
  distanceSource: DataSource;
}

export type AnnouncementScope = 'Community' | 'Organization' | 'Neighborhood' | 'Event' | 'Campaign';

export interface CommunityAnnouncement {
  announcementId: string;
  scope: AnnouncementScope;
  scopeId?: string | null;
  scopeName: string;
  title: string;
  body: string;
  mediaUrls: string[];
  authorName: string;
  authorAvatarUrl?: string | null;
  isPinned: boolean;
  publishedAt: string;
  /** The route the platform inbox would deep-link to. */
  actionRoute?: string | null;
}

export interface NeighborhoodActivity {
  neighborhoodId: string;
  neighborhoodName: string;
  source: DataSource;
  upcomingEventCount: number;
  activeCampaignCount: number;
  openOpportunityCount: number;
  openPollCount: number;
  newMemberCount: number;
}

/**
 * §34's impact view.
 *
 * Every figure is `Sourced`. In practice exactly one is `backend` today — the
 * member's own giving from `GET /financial/giving/me` — and the rest are
 * simulated and marked. That asymmetry is the point.
 */
export interface CommunityImpact {
  scope: 'member' | 'organization' | 'neighborhood' | 'country';
  scopeId?: string | null;
  scopeName: string;
  period: AnalyticsPeriod;
  membersHelped: Sourced<number>;
  volunteerHours: Sourced<number>;
  fundsRaised: Sourced<Money>;
  donationsMade: Sourced<number>;
  eventsHosted: Sourced<number>;
  eventsAttended: Sourced<number>;
  pollsParticipated: Sourced<number>;
  initiativesSupported: Sourced<number>;
  computedAt: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// HUB, RECOMMENDATIONS & SEARCH — §5, §35, §40
// ═════════════════════════════════════════════════════════════════════════════

/** The kinds of thing Community Life can surface. Used by the hub and by search. */
export type CommunityEntityType =
  | 'event'
  | 'series'
  | 'organization'
  | 'membership'
  | 'campaign'
  | 'opportunity'
  | 'poll'
  | 'announcement';

export interface CommunityRecommendation {
  recommendationId: string;
  entityType: CommunityEntityType;
  entityId: string;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  /** The server's explanation. The client never composes one. */
  reason: string;
  score?: number | null;
  actionRoute: string;
}

/**
 * The hub's first paint. §47: one call, summaries only.
 *
 * Every list here is *short* by contract — the hub shows a rail and the screen
 * behind it fetches the rest. Nothing on this object requires loading all
 * organizations, all events, all campaigns or all polls.
 */
export interface CommunityLifeSummary {
  /** Real B12 events, already filtered by the platform's proximity query. */
  upcomingEvents: Event[];
  nearbyEvents: Event[];
  myMemberships: CommunityMembership[];
  myOrganizations: { organizationId: string; name: string; logo?: string | null; role: OrganizationRole }[];
  activeCampaigns: FundraisingCampaign[];
  openOpportunities: VolunteerOpportunity[];
  openPolls: CommunityPoll[];
  announcements: CommunityAnnouncement[];
  neighborhoodActivity?: NeighborhoodActivity | null;
  recommendations: CommunityRecommendation[];
  /** Section counts, so a rail can be skipped rather than fetched to discover it is empty. */
  counts: {
    upcomingEvents: number;
    myMemberships: number;
    activeCampaigns: number;
    openOpportunities: number;
    openPolls: number;
    unreadAnnouncements: number;
  };
}

export interface CommunitySearchParams {
  query: string;
  types?: CommunityEntityType[];
  countryCode?: string;
  cityName?: string;
  neighborhood?: string;
  category?: string;
  organizationId?: string;
  cause?: string;
  from?: string;
  to?: string;
  maxDistanceKm?: number;
  priceBand?: 'any' | 'free' | 'paid';
  cursor?: string;
  take?: number;
}

export interface CommunitySearchResult {
  entityType: CommunityEntityType;
  entityId: string;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  locationLabel?: string | null;
  distanceKm?: number | null;
  badge?: string | null;
  actionRoute: string;
  /** Which arm produced this row. §40's merge is labelled, not hidden. */
  source: DataSource;
}
