// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Trigger catalogue (Frontend Phase 18, §8 · §71)
//
// Every WHEN the builder can offer, as data.
//
// ── The rule this file follows, and the one it refuses to follow ─────────────
//
// §8 lists about fifty candidate triggers and then says the decisive thing:
// **"The actual trigger catalogue must be based on existing product
// capabilities."** So this is not §8's list transcribed. Each entry below
// corresponds to a subject Diaspora genuinely has — an event with a real start
// time, a job with a real closing date, a listing with a real price — and the
// candidates that would have required inventing a product concept were dropped
// rather than stubbed.
//
// What was dropped, and why, because an absence is worth explaining once:
//
//   *Recommendation generated* — recommendations are computed per request and
//   nothing records that one happened. A trigger here would fire on an
//   implementation detail.
//   *Notification received / unread* — a notification is already the *output*
//   of the notification system. A rule that fired on one and produced another
//   is a loop with a friendly name, and §28's "one notification architecture"
//   is easier to keep if the automation layer never consumes its own output.
//   *Community switch* — a UI state change on one device. Not an event, and
//   automating on it would produce different behaviour per device.
//   *Provider profile viewed* — a view is not an event the platform records
//   per viewer, and making it one would be a surveillance feature.
//
// ── The distinction §8 asks to be made, made structurally ────────────────────
//
// "Do not assume an event can be used as an automation trigger simply because
// it exists in code." `delivery` is that distinction as a field, and it changes
// what the UI is allowed to promise:
//
//   `domainEvent`  can fire while the app is shut — **if** the backend
//                  publishes it, which today it does not for any of these.
//   `schedule`     needs the server-side scheduler.
//   `deviceLocal`  can only fire while the app is running, and the builder says
//                  so in those words rather than letting a member assume.
//   `manual`       always works, in every build, today. The honest fallback.
//
// `support` is the second axis and is independent: `manual` triggers are
// `CONNECTED` because running something yourself needs no platform capability,
// while every `domainEvent` here is `BACKEND_GAP` because there is no event
// stream. Collapsing the two into one field would lose exactly the case that
// matters — a trigger that *will* work when the platform ships versus one that
// works now.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AutomationDomainKey,
  AutomationOwnerKind,
  AutomationTriggerDefinition,
} from '@/types/automation';

/** Owner sets, named so a change lands in one place rather than forty. */
const SELF: AutomationOwnerKind[] = ['user'];
const SELF_OR_CREATOR: AutomationOwnerKind[] = ['user', 'creator'];
const COMMUNITY_MANAGERS: AutomationOwnerKind[] = ['community'];

/**
 * An announcement is an organisation's — Phase 5.
 *
 * **`community.announcementPublished` was reachable by nobody**, and the reason
 * is a decision the platform had already taken elsewhere.
 * `PublishAnnouncementCommandHandler` refuses every scope but `Organization`:
 * *"Neighbourhood, event and campaign announcements need an owner that can say
 * who may address them."* A community is one of those — it has members and
 * nobody who may address them.
 *
 * So a community-scoped announcement cannot exist, and the trigger's original
 * community-only owner list could never have matched anything. The owner that
 * can is the one that publishes: an organisation.
 */
const ANNOUNCEMENT_MANAGERS: AutomationOwnerKind[] = ['organization'];
const ORGANIZATION_MANAGERS: AutomationOwnerKind[] = ['organization'];
const SELLER: AutomationOwnerKind[] = ['seller'];
const LANDLORD: AutomationOwnerKind[] = ['landlord'];
const EMPLOYER: AutomationOwnerKind[] = ['employer'];
const PROVIDER: AutomationOwnerKind[] = ['provider'];
const CREATOR: AutomationOwnerKind[] = ['creator'];

/**
 * Condition sets that recur.
 *
 * A trigger names which conditions make sense for it, and the builder offers
 * only those — which is what keeps §33's builder from presenting "wallet
 * balance" as a filter on a guide being published.
 */
const PLACE_CONDITIONS = ['country', 'community', 'neighbourhood', 'distance'];
const TIME_CONDITIONS = ['dayOfWeek', 'timeOfDay'];
const LISTING_CONDITIONS = [...PLACE_CONDITIONS, 'category', 'priceBelow', 'priceAbove'];

/**
 * Action sets that recur.
 *
 * `notify.push` and `notify.email` are in the personal set alongside
 * `notify.self` because they are the *same* notification on a different B13
 * channel, and a member deciding "tell me" should be able to decide "on my
 * phone" in the same step. Leaving them out made two templates reference an
 * action their trigger did not permit — caught by
 * `automation-boundary.test.ts`, which asserts every template's actions against
 * its trigger for exactly this reason.
 */
const NOTIFY_SELF = [
  'notify.self',
  'notify.push',
  'notify.email',
  'reminder.schedule',
  'open.deepLink',
  'item.save',
];
const NOTIFY_SELF_AND_CALENDAR = [...NOTIFY_SELF, 'calendar.addEvent', 'calendar.updateEvent'];
const NOTIFY_COMMUNITY = ['notify.community', 'notify.self'];

const NOTIFY_ORGANIZATION = ['notify.organization', 'notify.self'];

export const TRIGGER_CATALOG: AutomationTriggerDefinition[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // MANUAL — the only family that works today, in every build
  // ═══════════════════════════════════════════════════════════════════════════

  {
    key: 'manual.run',
    domain: 'notifications',
    label: 'I run it myself',
    description:
      'Nothing happens on its own. You open the automation and run it when you want to. Works today, in every build.',
    delivery: 'manual',
    // CONNECTED and not a gap: running something yourself needs no platform
    // capability. This is the one trigger a member can rely on now, and having
    // it means the builder is never a tour of things that do not work.
    support: 'CONNECTED',
    backendEvent: null,
    gapKey: null,
    supportedConditions: [],
    supportedActions: [...NOTIFY_SELF, 'calendar.addEvent'],
    allowedOwners: ['user', 'creator', 'provider', 'employer', 'landlord', 'seller'],
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENTS — §8 · §11 · §12
  // ═══════════════════════════════════════════════════════════════════════════

  {
    key: 'event.startingSoon',
    domain: 'events',
    label: 'An event I am going to is starting soon',
    description:
      'Runs a set time before an event starts — in the event’s own timezone, so it stays right if you travel.',
    delivery: 'schedule',
    support: 'BACKEND_GAP',
    backendEvent: null,
    gapKey: 'eventReminders',
    supportedConditions: ['community', 'country', 'eventType', ...TIME_CONDITIONS],
    supportedActions: NOTIFY_SELF_AND_CALENDAR,
    allowedOwners: SELF,
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'event.created',
    domain: 'events',
    label: 'A new event is posted',
    description: 'Runs when an event is published in a community or by an organization you follow.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'EventCreated',
    gapKey: 'eventTriggers',
    supportedConditions: [...PLACE_CONDITIONS, 'eventType', 'category'],
    supportedActions: NOTIFY_SELF_AND_CALENDAR,
    allowedOwners: SELF,
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'event.updated',
    domain: 'events',
    label: 'An event I saved changes',
    description:
      'Runs when the time, date or place of an event you saved is changed. Small edits like a typo do not count.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'EventUpdated',
    gapKey: 'eventTriggers',
    supportedConditions: [],
    supportedActions: [...NOTIFY_SELF, 'calendar.updateEvent'],
    allowedOwners: SELF,
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'event.cancelled',
    domain: 'events',
    label: 'An event I saved is cancelled',
    description: 'Runs when an event you saved or registered for is called off.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'EventCancelled',
    gapKey: 'eventTriggers',
    supportedConditions: [],
    supportedActions: [...NOTIFY_SELF, 'calendar.removeEvent'],
    allowedOwners: SELF,
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'event.rsvpConfirmed',
    domain: 'events',
    label: 'I register for an event',
    description: 'Runs the moment your registration is confirmed — useful for adding it to a calendar.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'EventRegistrationConfirmed',
    gapKey: 'eventTriggers',
    supportedConditions: ['community', 'country', 'eventType'],
    supportedActions: NOTIFY_SELF_AND_CALENDAR,
    allowedOwners: SELF,
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'event.occurrenceChanged',
    domain: 'events',
    label: 'A date in a repeating event changes',
    description: 'Runs when one date in a series you follow moves, without affecting the rest of the series.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'EventOccurrenceRescheduled',
    gapKey: 'eventTriggers',
    supportedConditions: [],
    supportedActions: [...NOTIFY_SELF, 'calendar.updateEvent'],
    allowedOwners: SELF,
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SAVED SEARCHES — §30. One trigger family, five subjects.
  // ═══════════════════════════════════════════════════════════════════════════

  {
    key: 'savedSearch.newMatch',
    domain: 'search',
    label: 'Something new matches a search I saved',
    description:
      'Runs when a new job, listing, home, provider or event matches one of your saved searches.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'JobPublished · ListingPublished · HousingPublished · ProviderPublished · EventPublished',
    gapKey: 'savedSearches',
    supportedConditions: [...LISTING_CONDITIONS],
    supportedActions: NOTIFY_SELF,
    allowedOwners: SELF,
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'savedSearch.priceChanged',
    domain: 'search',
    label: 'The price changes on something I am watching',
    description: 'Runs when the price of a saved listing or home changes by more than a small amount.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'ListingPriceChanged · HousingPriceChanged',
    gapKey: 'savedSearches',
    supportedConditions: ['priceBelow', 'priceAbove', 'category'],
    supportedActions: NOTIFY_SELF,
    allowedOwners: SELF,
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'savedSearch.availabilityChanged',
    domain: 'search',
    label: 'Something I am watching becomes available',
    description: 'Runs when a home or listing you saved changes its availability.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'HousingAvailabilityChanged · ListingStatusChanged',
    gapKey: 'savedSearches',
    supportedConditions: ['category', 'country', 'neighbourhood'],
    supportedActions: NOTIFY_SELF,
    allowedOwners: SELF,
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // JOBS — §18
  // ═══════════════════════════════════════════════════════════════════════════

  {
    key: 'job.closingSoon',
    domain: 'jobs',
    label: 'A job I saved is about to close',
    description: 'Runs a set time before the closing date of a job you saved.',
    delivery: 'schedule',
    support: 'BACKEND_GAP',
    backendEvent: null,
    gapKey: 'jobTriggers',
    supportedConditions: ['country', 'category'],
    supportedActions: NOTIFY_SELF,
    allowedOwners: SELF,
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'job.applicationStatusChanged',
    domain: 'jobs',
    label: 'My application status changes',
    description: 'Runs when an employer moves one of your applications forward or closes it.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'ApplicationStatusChanged',
    gapKey: 'jobTriggers',
    supportedConditions: ['applicationStatus'],
    supportedActions: NOTIFY_SELF,
    allowedOwners: SELF,
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'job.applicationSubmitted',
    domain: 'jobs',
    label: 'Someone applies to my job posting',
    description: 'Runs when an application arrives on a job you posted.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'ApplicationSubmitted',
    gapKey: 'jobTriggers',
    supportedConditions: ['category'],
    supportedActions: NOTIFY_SELF,
    allowedOwners: EMPLOYER,
    requiredCapability: 'automations.employer',
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'job.applicationThreshold',
    domain: 'jobs',
    label: 'My job posting reaches a number of applications',
    description: 'Runs once when a posting you own passes an application count you choose.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'ApplicationSubmitted',
    gapKey: 'jobTriggers',
    supportedConditions: ['countAbove'],
    supportedActions: NOTIFY_SELF,
    allowedOwners: EMPLOYER,
    requiredCapability: 'automations.employer',
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MARKETPLACE — §19
  // ═══════════════════════════════════════════════════════════════════════════

  {
    key: 'listing.expiring',
    domain: 'marketplace',
    label: 'One of my listings is about to expire',
    description: 'Runs a set time before a listing you posted stops being shown.',
    delivery: 'schedule',
    support: 'BACKEND_GAP',
    backendEvent: null,
    gapKey: 'marketplaceTriggers',
    supportedConditions: ['category'],
    supportedActions: NOTIFY_SELF,
    allowedOwners: SELLER,
    requiredCapability: 'automations.seller',
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'listing.offerReceived',
    domain: 'marketplace',
    label: 'I receive an offer',
    description:
      'Runs when somebody makes an offer on your listing. It tells you an offer arrived — accepting it is always something you do yourself.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'OfferReceived',
    gapKey: 'marketplaceTriggers',
    supportedConditions: ['category'],
    supportedActions: NOTIFY_SELF,
    allowedOwners: SELLER,
    requiredCapability: 'automations.seller',
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'listing.inquiryReceived',
    domain: 'marketplace',
    label: 'Somebody asks about my listing',
    description: 'Runs when a buyer sends an enquiry. The message itself stays in your inbox.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'ListingInquiryReceived',
    gapKey: 'marketplaceTriggers',
    supportedConditions: ['category'],
    supportedActions: NOTIFY_SELF,
    allowedOwners: SELLER,
    requiredCapability: 'automations.seller',
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'listing.reservationEnding',
    domain: 'marketplace',
    label: 'A reservation is ending',
    description: 'Runs before a reservation on one of your listings runs out.',
    delivery: 'schedule',
    support: 'BACKEND_GAP',
    backendEvent: null,
    gapKey: 'marketplaceTriggers',
    supportedConditions: [],
    supportedActions: NOTIFY_SELF,
    allowedOwners: SELLER,
    requiredCapability: 'automations.seller',
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // HOUSING — §20
  // ═══════════════════════════════════════════════════════════════════════════

  {
    key: 'housing.inquiryReceived',
    domain: 'housing',
    label: 'Somebody enquires about my property',
    description:
      'Runs when an enquiry arrives. It tells you one arrived — who it is from stays in your inbox.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'HousingInquiryReceived',
    gapKey: 'housingTriggers',
    supportedConditions: ['neighbourhood'],
    supportedActions: NOTIFY_SELF,
    allowedOwners: LANDLORD,
    requiredCapability: 'automations.landlord',
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'housing.applicationStatusChanged',
    domain: 'housing',
    label: 'My housing application status changes',
    description: 'Runs when a landlord moves your application forward or closes it.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'HousingApplicationStatusChanged',
    gapKey: 'housingTriggers',
    supportedConditions: ['applicationStatus'],
    supportedActions: NOTIFY_SELF,
    allowedOwners: SELF,
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'housing.viewingReminder',
    domain: 'housing',
    label: 'I have a viewing coming up',
    description: 'Runs before a viewing you arranged, in the property’s local time.',
    delivery: 'schedule',
    support: 'BACKEND_GAP',
    backendEvent: null,
    gapKey: 'housingTriggers',
    supportedConditions: [],
    supportedActions: NOTIFY_SELF_AND_CALENDAR,
    allowedOwners: SELF,
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMUNITY — §13 · §14 · §46
  // ═══════════════════════════════════════════════════════════════════════════

  {
    key: 'community.memberJoined',
    domain: 'community',
    label: 'Someone joins the community',
    description: 'Runs when a new member joins a community you help run — useful for a welcome message.',
    delivery: 'domainEvent',
    // CONNECTED since 21 Oct 2026: CommunityProgramme publishes one contract per
    // transition into membership, and the run names nobody who joined.
    support: 'CONNECTED',
    backendEvent: 'CommunityMemberJoined',
    gapKey: null,
    supportedConditions: ['country', 'neighbourhood'],
    supportedActions: NOTIFY_COMMUNITY,
    allowedOwners: COMMUNITY_MANAGERS,
    requiredCapability: 'automations.community',
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'community.announcementPublished',
    domain: 'community',
    label: 'An announcement is published',
    description: 'Runs when your organisation publishes an announcement to its members.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'CommunityAnnouncementPublished',
    gapKey: 'communityTriggers',
    supportedConditions: ['country', 'neighbourhood', 'category'],
    supportedActions: NOTIFY_ORGANIZATION,
    allowedOwners: ANNOUNCEMENT_MANAGERS,
    requiredCapability: 'automations.organization',
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'community.updatePublished',
    domain: 'community',
    label: 'A community update is posted',
    description: 'Runs when somebody posts an update in a community you follow.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'CommunityUpdatePublished',
    gapKey: 'communityTriggers',
    supportedConditions: ['country', 'community', 'neighbourhood', 'category', 'urgency'],
    supportedActions: NOTIFY_SELF,
    allowedOwners: SELF,
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'community.milestoneReached',
    domain: 'community',
    label: 'The community reaches a milestone',
    description: 'Runs when a community you help run passes a size or activity milestone.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'CommunityMilestoneReached',
    gapKey: 'communityTriggers',
    supportedConditions: ['countAbove'],
    supportedActions: NOTIFY_COMMUNITY,
    allowedOwners: COMMUNITY_MANAGERS,
    requiredCapability: 'automations.community',
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'community.eventCreated',
    domain: 'community',
    label: 'An event is created in the community',
    description:
      'Runs when somebody publishes an event they posted in a community you help run (“Post in community” on the event form).',
    delivery: 'domainEvent',
    // CONNECTED since 21 Oct 2026: an event can be posted into a community at
    // creation, and the trigger fires on its first publication, not the draft.
    support: 'CONNECTED',
    backendEvent: 'EventPublished',
    gapKey: null,
    supportedConditions: ['country', 'neighbourhood', 'eventType'],
    supportedActions: NOTIFY_COMMUNITY,
    allowedOwners: COMMUNITY_MANAGERS,
    requiredCapability: 'automations.community',
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ORGANIZATIONS — §22 · §47
  // ═══════════════════════════════════════════════════════════════════════════

  {
    key: 'organization.memberJoined',
    domain: 'organizations',
    label: 'Someone joins the organization',
    description: 'Runs when a new member joins an organization you help run.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'OrganizationMemberJoined',
    gapKey: 'organizationTriggers',
    supportedConditions: [],
    supportedActions: NOTIFY_ORGANIZATION,
    allowedOwners: ORGANIZATION_MANAGERS,
    requiredCapability: 'automations.organization',
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'organization.registrationReceived',
    domain: 'organizations',
    label: 'Someone registers for our event',
    description: 'Runs when a registration arrives for an event your organization is running.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'OrganizationRegistrationReceived',
    gapKey: 'organizationTriggers',
    supportedConditions: ['eventType'],
    supportedActions: NOTIFY_ORGANIZATION,
    allowedOwners: ORGANIZATION_MANAGERS,
    requiredCapability: 'automations.organization',
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'organization.membershipRenewalDue',
    domain: 'organizations',
    label: 'A membership is due for renewal',
    description: 'Runs before a member’s subscription to your organization runs out.',
    delivery: 'schedule',
    support: 'BACKEND_GAP',
    backendEvent: null,
    gapKey: 'organizationTriggers',
    supportedConditions: [],
    supportedActions: NOTIFY_ORGANIZATION,
    allowedOwners: ORGANIZATION_MANAGERS,
    requiredCapability: 'automations.organization',
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GUIDES — §17
  // ═══════════════════════════════════════════════════════════════════════════

  {
    key: 'guide.published',
    domain: 'guides',
    label: 'A new guide is published',
    description: 'Runs when a guide is published for a country or topic you follow.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'GuidePublished',
    gapKey: 'guideTriggers',
    supportedConditions: ['country', 'category'],
    supportedActions: [...NOTIFY_SELF],
    allowedOwners: SELF,
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'guide.savedChanged',
    domain: 'guides',
    label: 'A guide I saved is updated',
    description:
      'Runs when a guide you saved is meaningfully changed. Typo fixes and small edits do not count.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'GuideUpdated',
    gapKey: 'guideTriggers',
    supportedConditions: ['country', 'category'],
    supportedActions: NOTIFY_SELF,
    allowedOwners: SELF,
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'guide.milestoneReached',
    domain: 'guides',
    label: 'My guide reaches a milestone',
    description: 'Runs when a guide you wrote passes a reader or helpfulness milestone.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'GuideMilestoneReached',
    gapKey: 'guideTriggers',
    supportedConditions: ['countAbove'],
    supportedActions: NOTIFY_SELF,
    allowedOwners: SELF_OR_CREATOR,
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATOR — §23 · §26
  // ═══════════════════════════════════════════════════════════════════════════

  {
    key: 'creator.milestoneReached',
    domain: 'creator',
    label: 'I reach a creator milestone',
    description: 'Runs when you pass a milestone in the creator programme.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'CreatorMilestoneReached',
    gapKey: 'creatorTriggers',
    supportedConditions: [],
    supportedActions: NOTIFY_SELF,
    allowedOwners: CREATOR,
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  // Phase 5. The Backend Gap Build Order listed ChallengeCompleted among the four
  // events the creator triggers were waiting on. It was not missing:
  // `CreatorChallengeCompletedIntegrationEvent` is published once, on the
  // transition to complete, and the platform now consumes it. `support` stays at
  // what this build declares; the builder reads the deployment's own answer.
  {
    key: 'creator.challengeCompleted',
    domain: 'creator',
    label: 'I complete a creator challenge',
    description: 'Runs when you finish every task in a creator programme challenge.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'CreatorChallengeCompleted',
    gapKey: 'creatorTriggers',
    supportedConditions: [],
    supportedActions: NOTIFY_SELF,
    allowedOwners: CREATOR,
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'creator.rewardAvailable',
    domain: 'creator',
    label: 'A reward is ready to claim',
    description:
      'Runs when you have a reward waiting. It tells you and takes you to the claim screen — claiming is always something you do yourself.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'CreatorRewardAvailable',
    gapKey: 'creatorTriggers',
    supportedConditions: [],
    supportedActions: NOTIFY_SELF,
    allowedOwners: CREATOR,
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'creator.referralCompleted',
    domain: 'creator',
    label: 'Someone I referred joins',
    description: 'Runs when a referral you made is completed.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'ReferralCompleted',
    gapKey: 'creatorTriggers',
    supportedConditions: [],
    supportedActions: NOTIFY_SELF,
    allowedOwners: CREATOR,
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'creator.performanceThreshold',
    domain: 'analytics',
    label: 'My content passes a number I choose',
    description:
      'Runs when one of your figures crosses a threshold. Checked by the platform on a schedule, not live.',
    delivery: 'schedule',
    support: 'BACKEND_GAP',
    backendEvent: null,
    gapKey: 'analyticsThresholds',
    supportedConditions: ['metricAbove', 'metricBelow'],
    supportedActions: NOTIFY_SELF,
    allowedOwners: CREATOR,
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MONEY — §24 · §25. Notification-only, by construction.
  // ═══════════════════════════════════════════════════════════════════════════

  {
    key: 'payment.completed',
    domain: 'wallet',
    label: 'A payment of mine completes',
    description: 'Runs when one of your payments goes through. Amounts stay behind your passcode.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'PaymentCompleted',
    gapKey: 'financialTriggers',
    supportedConditions: ['amountAbove', 'paymentKind'],
    supportedActions: NOTIFY_SELF,
    allowedOwners: SELF,
    requiredCapability: 'automations.financial',
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'payment.failed',
    domain: 'wallet',
    label: 'A payment of mine fails',
    description: 'Runs when a payment does not go through, so you can deal with it quickly.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'PaymentFailed',
    gapKey: 'financialTriggers',
    supportedConditions: ['paymentKind'],
    supportedActions: NOTIFY_SELF,
    allowedOwners: SELF,
    requiredCapability: 'automations.financial',
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'payment.refunded',
    domain: 'wallet',
    label: 'A refund reaches me',
    description: 'Runs when a refund completes.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'RefundCompleted',
    gapKey: 'financialTriggers',
    supportedConditions: ['amountAbove'],
    supportedActions: NOTIFY_SELF,
    allowedOwners: SELF,
    requiredCapability: 'automations.financial',
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'giving.donationCompleted',
    domain: 'wallet',
    label: 'A donation I made completes',
    description: 'Runs when a donation goes through — useful for keeping your own records.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'DonationCompleted',
    gapKey: 'financialTriggers',
    supportedConditions: ['amountAbove'],
    supportedActions: NOTIFY_SELF,
    allowedOwners: SELF,
    requiredCapability: 'automations.financial',
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'subscription.expiring',
    domain: 'monetization',
    label: 'A subscription of mine is about to end',
    description:
      'Runs before a subscription runs out, with the notice period you choose. It reminds you — it never renews or charges anything.',
    delivery: 'schedule',
    support: 'BACKEND_GAP',
    backendEvent: null,
    gapKey: 'monetizationTriggers',
    supportedConditions: [],
    supportedActions: NOTIFY_SELF,
    allowedOwners: ['user', 'creator', 'provider', 'employer', 'landlord', 'seller'],
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'placement.ending',
    domain: 'monetization',
    label: 'A featured placement or boost is ending',
    description: 'Runs before a placement you paid for stops running, so it does not lapse unnoticed.',
    delivery: 'schedule',
    support: 'BACKEND_GAP',
    backendEvent: null,
    gapKey: 'monetizationTriggers',
    supportedConditions: [],
    supportedActions: NOTIFY_SELF,
    allowedOwners: ['creator', 'provider', 'employer', 'landlord', 'seller'],
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PROVIDERS — §21
  // ═══════════════════════════════════════════════════════════════════════════

  {
    key: 'provider.leadReceived',
    domain: 'providers',
    label: 'I get a new lead',
    description: 'Runs when somebody contacts you through your provider profile.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'ProviderLeadReceived',
    gapKey: 'providerTriggers',
    supportedConditions: ['category'],
    supportedActions: NOTIFY_SELF,
    allowedOwners: PROVIDER,
    requiredCapability: 'automations.provider',
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'provider.reviewReceived',
    domain: 'providers',
    label: 'I get a new review',
    description: 'Runs when somebody reviews you. The review text stays on your profile.',
    delivery: 'domainEvent',
    support: 'BACKEND_GAP',
    backendEvent: 'ProviderReviewReceived',
    gapKey: 'providerTriggers',
    supportedConditions: ['ratingBelow'],
    supportedActions: NOTIFY_SELF,
    allowedOwners: PROVIDER,
    requiredCapability: 'automations.provider',
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'provider.featuredEnding',
    domain: 'providers',
    label: 'My featured placement is ending',
    description: 'Runs before your featured placement finishes.',
    delivery: 'schedule',
    support: 'BACKEND_GAP',
    backendEvent: null,
    gapKey: 'providerTriggers',
    supportedConditions: [],
    supportedActions: NOTIFY_SELF,
    allowedOwners: PROVIDER,
    requiredCapability: 'automations.provider',
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MESSAGING — §29. Read-only about messages, by construction.
  // ═══════════════════════════════════════════════════════════════════════════

  {
    key: 'conversation.inactive',
    domain: 'messaging',
    label: 'A conversation goes quiet',
    description:
      'Runs when a conversation you are part of has had no reply for a while. It reminds you — it never replies for you.',
    delivery: 'schedule',
    support: 'BACKEND_GAP',
    backendEvent: null,
    gapKey: 'messagingTriggers',
    supportedConditions: [],
    supportedActions: NOTIFY_SELF,
    allowedOwners: SELF,
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
  {
    key: 'conversation.unreadReminder',
    domain: 'messaging',
    label: 'I have unread messages',
    description: 'Runs when messages have been sitting unread. Nothing about their contents is read.',
    delivery: 'schedule',
    support: 'BACKEND_GAP',
    backendEvent: null,
    gapKey: 'messagingTriggers',
    supportedConditions: ['countAbove'],
    supportedActions: NOTIFY_SELF,
    allowedOwners: SELF,
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LOCATION — §15. Both observed by the server since 21 Oct 2026.
  // ═══════════════════════════════════════════════════════════════════════════

  {
    key: 'location.enteredArea',
    domain: 'location',
    label: 'I arrive in an area I chose',
    description:
      'Runs when you arrive in a town or neighbourhood you picked. It is noticed only while Diaspora is open on your phone, and only if you switch on “Location while the app is open”.',
    // A domain event since 21 Oct 2026: the app reports a coarse position while
    // it is open (`POST /location/me/presence/ping`), the server places it in an
    // area and publishes the arrival. Nothing is read in the background.
    delivery: 'domainEvent',
    support: 'CONNECTED',
    backendEvent: 'MemberEnteredArea',
    gapKey: null,
    supportedConditions: ['distance', 'neighbourhood', 'country'],
    supportedActions: NOTIFY_SELF,
    allowedOwners: SELF,
    requiredCapability: 'automations.location',
    requiredIntegrations: ['location.presence'],
    requiresPrivacyConsent: true,
    privacyNote:
      'This needs “Location while the app is open”, which is off unless you switch it on. Your position is read only while Diaspora is on your screen, rounded, placed in an area and thrown away. Only the last area is remembered, no history is kept, and switching it off forgets that area.',
  },
  {
    key: 'location.countryChanged',
    domain: 'location',
    label: 'I move to a different country',
    description:
      'Runs when you start living in a new country — when you set a new country of residence. It uses the country you tell Diaspora, not tracking.',
    // A domain event since 21 Oct 2026: Location publishes
    // `CountryResidenceStarted` when a residence is declared or reopened, so it
    // fires whether or not the app is open.
    delivery: 'domainEvent',
    support: 'CONNECTED',
    backendEvent: 'CountryResidenceStarted',
    gapKey: null,
    supportedConditions: ['country'],
    supportedActions: NOTIFY_SELF,
    allowedOwners: SELF,
    requiredCapability: null,
    requiredIntegrations: [],
    requiresPrivacyConsent: false,
    privacyNote: null,
  },
];

/** By key, for lookup without a linear scan on every render. */
const BY_KEY = new Map<string, AutomationTriggerDefinition>(
  TRIGGER_CATALOG.map((trigger) => [trigger.key, trigger])
);

export function triggerDefinition(key: string): AutomationTriggerDefinition | undefined {
  return BY_KEY.get(key);
}

/** Grouped for the picker, in catalogue order so grouping is stable. */
export function triggersByDomain(): Map<AutomationDomainKey, AutomationTriggerDefinition[]> {
  const grouped = new Map<AutomationDomainKey, AutomationTriggerDefinition[]>();
  for (const trigger of TRIGGER_CATALOG) {
    const existing = grouped.get(trigger.domain);
    if (existing) existing.push(trigger);
    else grouped.set(trigger.domain, [trigger]);
  }
  return grouped;
}

/**
 * The triggers an owner kind may use.
 *
 * Filters on `allowedOwners` only — **not** on capability. Capability filtering
 * needs the server's answer and belongs in `access.ts`, and doing it here would
 * put a permission decision in a data file where nobody would look for it.
 */
export function triggersForOwner(ownerKind: AutomationOwnerKind): AutomationTriggerDefinition[] {
  return TRIGGER_CATALOG.filter((trigger) => trigger.allowedOwners.includes(ownerKind));
}

/**
 * Whether a trigger can fire without the app being open.
 *
 * The question a member actually has, answered from `delivery` rather than from
 * `support`: a `domainEvent` trigger will fire in the background *once the
 * platform ships*, whereas a `deviceLocal` one never will. Conflating them
 * would promise the wrong thing about the wrong half of the catalogue.
 */
export function firesInBackground(trigger: AutomationTriggerDefinition): boolean {
  return trigger.delivery === 'domainEvent' || trigger.delivery === 'schedule';
}
