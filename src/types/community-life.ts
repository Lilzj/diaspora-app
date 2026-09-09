// ─────────────────────────────────────────────────────────────────────────────
// Community Life Module — Types and Interfaces
// ─────────────────────────────────────────────────────────────────────────────

export type EventCategory =
  | 'Wedding'
  | 'Naming Ceremony'
  | 'Birthday'
  | 'Graduation'
  | 'Football Match'
  | 'Basketball'
  | 'Concert'
  | 'Comedy Show'
  | 'Networking'
  | 'Career Fair'
  | 'Job Fair'
  | 'Business Seminar'
  | 'Conference'
  | 'Training'
  | 'Workshop'
  | 'Church Program'
  | 'Mosque Event'
  | 'Bible Study'
  | 'Prayer Meeting'
  | 'Youth Program'
  | 'Cultural Festival'
  | 'Independence Celebration'
  | 'Food Festival'
  | 'Picnic'
  | 'Volunteer Activity'
  | 'Charity Event'
  | 'Embassy Event'
  | 'Student Orientation'
  | 'Other';

export type OrgCategory =
  | 'Churches'
  | 'Mosques'
  | 'Associations'
  | 'Embassies'
  | 'Student Associations'
  | 'Professional Associations'
  | 'Community Centres'
  | 'NGOs'
  | 'Doctors'
  | 'Lawyers'
  | 'Accountants'
  | 'Immigration Consultants'
  | 'Cultural Organizations'
  | 'Sports Clubs'
  | 'Business Associations'
  | 'Volunteer Organizations'
  | 'Restaurants' // future-ready
  | 'Other';

/**
 * The server's `RsvpStatus`, plus `null` for "no RSVP".
 *
 * **Remediation Wave A′ — `'Maybe'` was never a platform value.** The backend
 * enum has seven members and none of them is `Maybe`, so a member who tapped it
 * was choosing a state the server could not store. It is replaced by
 * `Interested`, which is what it meant.
 *
 * Only `Interested` and `Going` may be *sent*. The remaining four are lifecycle
 * states the server assigns and the client renders: `Waitlisted` when an event
 * is full, `CheckedIn` and `Attended` afterwards, `NoShow` when somebody did not
 * arrive, `Cancelled` when the RSVP was withdrawn or the event was called off.
 */
export type RSVPStatus =
  | 'Interested'
  | 'Going'
  | 'Waitlisted'
  | 'CheckedIn'
  | 'Attended'
  | 'Cancelled'
  | 'NoShow'
  | null;

/**
 * `RsvpResponse` — what the RSVP routes return.
 *
 * `waitlistPosition` is the field that closes COMMUNITY-LIFE-GAP-005's "event
 * full" half: it is 1-based and non-null only while `status` is `Waitlisted`.
 */
export interface RsvpRecord {
  rsvpId: string;
  eventId: string;
  organizationId?: string | null;
  attendeeUserId: string;
  status: Exclude<RSVPStatus, null>;
  partySize: number;
  note?: string | null;
  /** Never null. `None` while the RSVP is live. */
  declineReason: string;
  respondedAt: string;
  checkedInAt?: string | null;
  checkInMethod?: string | null;
  revision: number;
  waitlistPosition?: number | null;
  seriesId?: string | null;
}

/**
 * `EventSummaryResponse`. Enough of an event to render a row.
 *
 * Served alongside the RSVPs on `/rsvps/mine` so a list of ten events is one
 * request rather than eleven.
 */
export interface EventSummary {
  eventId: string;
  title: string;
  slug: string;
  categoryKey: string;
  summary: string;
  organizationId?: string | null;
  organizationName?: string | null;
  startsAt: string;
  endsAt: string;
  timeZoneId: string;
  attendanceMode: string;
  venueName?: string | null;
  location: EventLocation;
  coverMediaId?: string | null;
  isFree: boolean;
  isFamilyFriendly: boolean;
}

/**
 * `RsvpPageResponse`. The caller's own RSVPs, and the events they are for.
 *
 * **Two arrays, joined on `eventId`.** The server sends the RSVPs and the event
 * summaries side by side rather than nesting one in the other, which keeps a
 * page of ten to a single request. The join is the client's to make — see
 * `joinRsvpsToEvents`, which is where it is made once rather than in every
 * screen that reads this.
 */
export interface MyRsvpPage {
  items: RsvpRecord[];
  events: EventSummary[];
  nextCursor?: string | null;
  hasMore: boolean;
}

/**
 * One row of "what am I going to": an RSVP with the event it belongs to.
 *
 * `event` is nullable because the join can miss. The server sends both arrays
 * from the same query and they should always agree, but a row whose event is
 * absent must render as an RSVP with an unknown event rather than disappear —
 * silently dropping somebody's commitment is the worse failure.
 */
export interface MyRsvp {
  rsvp: RsvpRecord;
  event: EventSummary | null;
}

export interface EventLocation {
  cityName: string;
  areaName: string;
  addressLine: string;
  landmark?: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
  /**
   * The country the event or organisation **is in** — the server's
   * `Location.CountryCode`, which is what `GET /community-life/events?countryCode=`
   * and `?…organizations?countryCode=` filter on
   * (`CommunityEventRepository.cs:619`, `OrganizationRepository.cs:291`).
   *
   * Added by Remediation Wave J because the browse routes bind that filter and
   * this type had no field for it, so a caller could send the filter and never
   * be able to read the value back.
   *
   * **Not the organiser's country of origin**, and therefore not a community
   * marker. `lib/community/scope.ts` projects a community onto a *heritage*
   * country; the two are different questions and conflating them would put a
   * Nigerian-community event in London outside a Nigerian-community scope.
   */
  countryCode?: string;
}

export interface EventContact {
  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
}

export interface AgendaItem {
  id: string;
  time: string;
  title: string;
  description?: string;
}

export interface EventHost {
  id: string;
  name: string;
  avatarUrl?: string;
  type: 'Organization' | 'User';
  isVerified: boolean;
}

/**
 * `EventCapacityResponse`. How many can come, and how many said they would.
 *
 * **Served on every event and read by nothing until now.** `EventResponse.
 * Capacity` is a *required* field on the wire — seven values arriving with
 * every event — and the client modelled none of it. So a member saw no sign an
 * event was filling up, and none that it was already full: they tapped "Going"
 * and were told afterwards they were fourth on a waitlist. The information to
 * say so beforehand arrived with the event.
 *
 * **Totals only, deliberately.** Who is coming is the most socially sensitive
 * thing the module holds and is served from the attendee endpoint under the
 * organisation's own visibility rules, so nothing here names anybody.
 */
export interface EventCapacity {
  /** Null means uncapped — not zero, which would read as "no places". */
  maximum?: number | null;
  goingCount: number;
  interestedCount: number;
  waitlistCount: number;
  /** Organisers only: a live attendance figure at the door. */
  checkedInCount?: number | null;
  remainingPlaces?: number | null;
  /** The server's answer, never derived here — see `isEventFull`. */
  isFull: boolean;
}

/**
 * Where an event is in its life.
 *
 * `Draft` is the one that matters to a screen: an event nobody but its
 * organisers can see. The sweep sets `InProgress` and `Completed` from the
 * clock, so a client never writes those.
 */
export type EventLifecycle =
  | 'Draft'
  | 'Published'
  | 'InProgress'
  | 'Completed'
  | 'Cancelled'
  | 'Archived';

export interface Event {
  id: string;
  title: string;
  description: string;
  coverImage: string;
  gallery: string[];
  category: EventCategory;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  endTime: string; // HH:MM
  timezone: string;
  location: EventLocation;
  /**
   * The entry fee, when one is known.
   *
   * **The platform sends no amount.** `EventResponse` says only `isFree`, so
   * this is 0 for a free event and `undefined` for a paid one — read
   * `isFree`, not the absence of a price, or you relabel every paid event FREE.
   */
  price?: number;
  currency?: string; // GBP, USD, NGN, etc.

  /**
   * Draft, Published, Cancelled — the platform's own word for it.
   *
   * Nothing read this, so no screen could tell a draft from an announced
   * event, and the organiser had no way to see that their event was still
   * invisible to everyone.
   */
  status?: EventLifecycle;

  /** Who can see it once published. The platform's word, unmapped. */
  visibility?: string | null;

  /** What the platform says about money: the only field it actually sends. */
  isFree?: boolean;

  /** Where it is being held, when the platform names a venue. */
  venueName?: string | null;
  /**
   * **The server sends no such object.** `EventResponse` carries `hostName`,
   * `organizerUserId`, `organizationId`, `organizationName` and
   * `isOrganizerVerified` — five flat fields, no nesting — and this was
   * declared required. The event screen read `event.host.type` and killed the
   * process on every real event with `Cannot read property 'type' of
   * undefined`.
   *
   * It survived because the mock catalogue does supply a nested host, so every
   * development build worked, and because the deployment had no events at all,
   * so nobody could open one.
   *
   * Optional now, and populated only by mocks and older cached events. Read it
   * through `eventHost`, which prefers the fields the server actually sends.
   */
  host?: EventHost;

  /** The organiser's display name, flat, as the server sends it. */
  hostName?: string | null;
  organizerUserId?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  isOrganizerVerified?: boolean;
  agenda?: AgendaItem[];
  contact?: EventContact;
  rsvpStatus: RSVPStatus;
  /**
   * How full it is. Optional on the type and required on the wire: a cached
   * event stored before this field was read back has none, and a screen that
   * assumed it would crash on somebody's saved list.
   */
  capacity?: EventCapacity | null;
  isSaved?: boolean;
  viewCount: number;
  shareCount: number;
  saveCount: number;
  createdAt: string;
}

export interface OrgContact {
  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  facebook?: string;
  instagram?: string;
  twitter?: string;
  youtube?: string;
}

export interface OrgLeader {
  name: string;
  role: string;
  avatarUrl?: string;
}

export interface OpeningHour {
  day: string; // Monday, Tuesday, etc.
  hours: string; // e.g. "09:00 - 17:00" or "Closed"
}

/**
 * An organisation as the platform sends it.
 *
 * **Not `CommunityOrganization`.** That type is the mock catalogue's shape and
 * disagrees with the wire on almost every name — `id`/`organizationId`,
 * `logo`/`logoMediaId`, `coverImage`/`coverMediaId`, `category`/
 * `organizationTypeKey`, `openingHours`/`operatingHours` — and it carries
 * `rating`, `reputationLevel`, `followersCount` and `isFollowing`, none of
 * which the platform sends at all.
 *
 * The organisation screen reads the wire's names, so this is the type it
 * should have been holding. It held `any`, which is why three of those reads
 * were wrong and nothing said so.
 */
export interface OrganizationWire {
  organizationId: string;
  name: string;
  shortName?: string | null;
  slug?: string;
  organizationTypeKey?: string;
  organizationTypeName?: string | null;
  summary?: string;
  description?: string | null;
  mission?: string | null;
  vision?: string | null;

  location?: {
    countryCode?: string;
    regionName?: string | null;
    cityName?: string | null;
    neighborhoodName?: string | null;
    /** The platform's one-line rendering of the place. There is no address. */
    displayName?: string;
  } | null;

  /** Ways to reach the organisation. **Social links are not in here.** */
  contact?: {
    phone?: string | null;
    whatsApp?: string | null;
    email?: string | null;
    website?: string | null;
    contactName?: string | null;
  } | null;

  /**
   * Its social channels, in their own object.
   *
   * `youTube` and not `youtube`: the property is `YouTube` on the wire and the
   * camel-case policy lowercases only the leading run.
   */
  socialLinks?: {
    facebook?: string | null;
    instagram?: string | null;
    twitter?: string | null;
    youTube?: string | null;
    linkedIn?: string | null;
    tikTok?: string | null;
  } | null;

  /** Plain strings. What the organisation says it offers. */
  services?: string[];
  leaders?: Array<{
    id?: string;
    name?: string;
    role?: string;
    memberUserId?: string | null;
    photoMediaId?: string | null;
    order?: number;
  }>;
  operatingHours?: Array<{
    id?: string;
    day?: string;
    opensAt?: string | null;
    closesAt?: string | null;
    isClosed?: boolean;
    note?: string | null;
  }>;
  media?: Array<{ mediaId?: string; role?: string; order?: number; caption?: string | null }>;
  guides?: Array<{ guideId?: string; title?: string; slug?: string }>;

  logoMediaId?: string | null;
  coverMediaId?: string | null;
  isVerified?: boolean;
  verificationBadge?: string | null;
  statistics?: {
    memberCount?: number;
    publishedEventCount?: number;
    completedEventCount?: number;
    administratorCount?: number;
    volunteerCount?: number;
    pendingRequestCount?: number;
  } | null;
  status?: string;
  visibility?: string | null;
  providerId?: string | null;
  /**
   * The viewer's own role in this organisation, or null when they have none.
   *
   * `Administrator` and `Owner` are the two the platform describes as managing
   * the page, so they are what gates the publish control — a capability the
   * server states rather than one the client infers from an id.
   */
  viewerMembershipRole?: string | null;
  viewerMembershipStatus?: string | null;
  createdAt?: string;
}

export interface CommunityOrganization {
  id: string;
  name: string;
  logo: string;
  coverImage: string;
  category: OrgCategory;
  description: string;
  mission: string;
  services: string[];
  location: EventLocation;
  contact: OrgContact;
  openingHours: OpeningHour[];
  isVerified: boolean;
  rating?: number;
  reputationLevel?: string;
  followersCount: number;
  isFollowing?: boolean;
  leaders?: OrgLeader[];
  gallery?: string[];
  createdAt: string;
}

export interface Holiday {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  type: 'National' | 'Community';
  countryCode: string;
  description?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string;
  type: 'Event' | 'Holiday' | 'Reminder';
  associatedId?: string; // event id or holiday id
  color?: string;
}

// Creation Wizard Form states
/**
 * The event wizard's local state.
 *
 * ── Remediation: this form could not create an event ────────────────────────
 *
 * `CreateEventRequest` declares six `required` members — `Title`, `Summary`,
 * `CategoryKey`, `StartsAt`, `EndsAt`, `CountryCode` — and this form supplied
 * exactly one of them. C# `required` means System.Text.Json **refuses the body
 * before any handler runs**, so every publish and every draft-save 400'd.
 *
 * It was invisible to every earlier wave because those verified *responses*, and
 * there was no response to inspect. It took the request-binding check, which
 * compares what leaves the device against the DTO the route binds.
 *
 * Three fields below are new and each answers a `required` member that had no
 * source at all: `summary`, `countryCode`, and the IANA `timeZoneId` that
 * replaces an abbreviation the server cannot parse.
 */
export interface EventFormState {
  category: EventCategory;
  title: string;
  /**
   * The one-line blurb. **Required by the server**, and genuinely distinct from
   * `description` — the DTO declares `Summary` required and `Description`
   * optional, so a list card can show the short form without loading the long
   * one. Deriving it by truncating `description` was rejected: a sentence cut at
   * 140 characters reads as a mistake, and the member is the only one who knows
   * what the short version should say.
   */
  summary: string;
  description: string;
  coverImage: string;
  gallery: string[];
  date: string;
  time: string;
  endTime: string;
  /**
   * The event's IANA zone — `Europe/London`, `Africa/Lagos`.
   *
   * Was an abbreviation (`'BST'`), which `TimeZoneId` cannot parse and which is
   * ambiguous anyway: `BST` is British Summer Time for half the year and
   * Bangladesh Standard Time all of it. `startsAt`/`endsAt` are computed *in*
   * this zone, so getting it wrong moves the event by hours.
   */
  timezone: string;
  /**
   * ISO-3166-1 alpha-2, **required by the server**.
   *
   * Defaulted from the member's `countryOfResidence` — required at registration
   * since Wave A — but **editable**, because where an event is need not be where
   * its organiser lives, and a diaspora platform is the last place to assume
   * otherwise. Not silently defaulted: Wave A had to remove `|| 'GB'` fallbacks
   * from the registration flow for the same reason, and a listing filed under
   * the wrong country is worse than a form with one more question.
   */
  countryCode: string;
  cityName: string;
  areaName: string;
  addressLine: string;
  landmark?: string;
  organizerName: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  email?: string;
  /**
   * Whether there is anything to pay at the door.
   *
   * Replaces `price` and `currency`. The server has **no price field** and says
   * why: *"paid events and ticketing are explicitly out of scope, and a price
   * field would be the first half of a payment system."* So the amount a member
   * typed was collected, shown back to them on the confirm step, and dropped —
   * and an event advertised at £15 in the preview would have published as free.
   */
  isFree: boolean;
  /**
   * Recurrence is a **separate contract** — `POST /community-life/events/series`
   * with its own occurrence model. `CreateEventRequest` has no recurrence field
   * of any kind, so these two were collected and discarded.
   *
   * Kept in the form state, and the UI now says plainly that a repeating event
   * has to be created as a series, rather than offering a toggle that does
   * nothing. Removing them outright would lose the member's intent silently,
   * which is the same failure one layer down.
   */
  isRecurring?: boolean;
  recurrencePattern?: string;
  neighborhood?: string;
}

export interface OrgFormState {
  category: OrgCategory;
  name: string;
  /**
   * The one line people see in a list. `CreateOrganizationRequest.Summary` is
   * **required**, and the form never had a field for it — so every attempt to
   * register an organisation was refused before it left the building.
   */
  summary: string;
  description: string;
  mission: string;
  logo: string;
  coverImage: string;
  services: string[];
  cityName: string;
  areaName: string;
  addressLine: string;
  /** ISO-3166 alpha-2. Required by the create route; defaulted from residence. */
  countryCode: string;
  phone?: string;
  whatsapp?: string;
  /**
   * The organisation's social channels.
   *
   * The form had inputs for these with **no `value` and no `onChangeText`** —
   * a member typed a Facebook link and it went nowhere, not even into state.
   * `CreateOrganizationRequest.SocialLinks` has accepted them all along.
   */
  facebook?: string;
  instagram?: string;
  twitter?: string;
  email?: string;
  website?: string;
  openingHours: OpeningHour[];
  verificationDocument?: string;
  hasMembershipPlans?: boolean;
}
