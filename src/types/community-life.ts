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
  price?: number; // 0 or undefined means Free
  currency?: string; // GBP, USD, NGN, etc.
  host: EventHost;
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
  description: string;
  mission: string;
  logo: string;
  coverImage: string;
  services: string[];
  cityName: string;
  areaName: string;
  addressLine: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  openingHours: OpeningHour[];
  verificationDocument?: string;
  hasMembershipPlans?: boolean;
}
