// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — integration catalogue (Frontend Phase 16, §5 · §36 · §37 · §51)
//
// The static half of every integration: what it is, what it needs, and what a
// member is agreeing to. The live half — status, mode, account, errors — comes
// from the registry and the repository and is merged in by `hooks/integrations.ts`.
//
// ── §37 is the reason the consent copy is data rather than JSX ───────────────
//
// "Do not bury meaningful consent inside a generic Continue button."
//
// Consent written inline in a component is consent that gets shortened when the
// layout is tight, differs between the settings screen and the contextual
// sheet, and is impossible to review as a set. Here it is four required fields
// per integration — accesses, reasons, stores, does-not-store — plus a
// disconnect summary and a privacy note, so:
//
//   * a reviewer can read every consent claim the application makes in one
//     file and check it against what the code does,
//   * the same words appear wherever the integration is offered, and
//   * "what Diaspora does not store" cannot be dropped for space, because the
//     type requires it and the sheet renders it.
//
// The `doesNotStore` list is usually the more informative one and is the one
// that would never have been written if the type had not demanded it.
//
// ── §36, and the permission that is deliberately narrow ──────────────────────
//
// "Do not request permissions unrelated to the selected capability."
//
// The device calendar entry asks for **write-only** calendar access, not full
// access, because export is what it does. iOS 17 makes that a distinct grant
// and `device-calendar.ts` requests it. Listing "read your calendar" here when
// the code does not do it would be the more common failure — a consent screen
// that over-declares teaches members that the declarations are boilerplate.
// ─────────────────────────────────────────────────────────────────────────────

import { Platform } from 'react-native';
import { INTEGRATION_GAPS } from '@/config/integration-gaps';
import { INTEGRATION_PROVIDER_GAPS } from '@/config/integration-provider-gaps';
import type {
  IntegrationDescriptor,
  IntegrationDomain,
  IntegrationPermission,
  IntegrationProviderId,
} from '@/types/integrations';

// ─────────────────────────────────────────────────────────────────────────────
// Permissions — §36
// ─────────────────────────────────────────────────────────────────────────────

const CALENDAR_WRITE_PERMISSION: IntegrationPermission = {
  key: 'calendar.write',
  label: 'Add events to your calendar',
  // Rationale, not marketing. "To improve your experience" is the sentence this
  // field exists to prevent.
  rationale:
    'So an event you are going to appears in the calendar you already use, with a reminder before it starts.',
  kind: 'device',
  requiredFor: ['calendar.event.create', 'calendar.event.update', 'calendar.event.delete'],
  recoverBySettings: true,
  isMandatory: true,
};

const CALENDAR_READ_PERMISSION: IntegrationPermission = {
  key: 'calendar.read',
  label: 'Read your calendar',
  rationale:
    'Only needed for two-way sync, which is off by default. Without it Diaspora can add events but cannot see anything already in your calendar.',
  kind: 'device',
  requiredFor: ['calendar.sync.twoWay', 'calendar.event.import'],
  recoverBySettings: true,
  // Not mandatory: everything except two-way sync works without it, which is
  // exactly the distinction §36 asks to be preserved.
  isMandatory: false,
};

const NOTIFICATION_PERMISSION: IntegrationPermission = {
  key: 'notifications',
  label: 'Send you notifications',
  rationale:
    'So you hear about a reply, a job that matches you, or a payment on your account without opening the app.',
  kind: 'device',
  requiredFor: ['push.token', 'push.deepLink'],
  recoverBySettings: true,
  isMandatory: true,
};

const LOCATION_PERMISSION: IntegrationPermission = {
  key: 'location',
  label: 'Use your location',
  rationale:
    'To show what is near you on the map. You can browse any area without it by choosing a place instead.',
  kind: 'device',
  requiredFor: ['maps.render', 'maps.directions'],
  recoverBySettings: true,
  // Genuinely optional: Phase 8's map works from a chosen location, so this is
  // a convenience rather than a gate. Marking it mandatory would justify a
  // permission wall the product does not need.
  isMandatory: false,
};

const GOOGLE_CALENDAR_SCOPE: IntegrationPermission = {
  key: 'google.calendar.events',
  label: 'Manage events Diaspora creates in your Google Calendar',
  rationale:
    'The narrow Google permission that covers creating and updating events. Diaspora does not ask for access to read your existing events.',
  kind: 'providerScope',
  requiredFor: ['calendar.event.create', 'calendar.event.update', 'calendar.event.delete'],
  // An OAuth scope refusal is fixed by authorizing again, not in device
  // settings. Getting this wrong sends a member to a Settings screen with no
  // relevant toggle on it.
  recoverBySettings: false,
  isMandatory: true,
};

const IDENTITY_SCOPE: IntegrationPermission = {
  key: 'identity.profile',
  label: 'Your name and email address',
  rationale: 'To recognise your account when you sign in and to send you receipts and security alerts.',
  kind: 'providerScope',
  requiredFor: ['identity.signIn', 'identity.link'],
  recoverBySettings: false,
  isMandatory: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// The catalogue
// ─────────────────────────────────────────────────────────────────────────────

function deviceCalendarDescriptor(): IntegrationDescriptor {
  return {
    provider: 'calendar.device',
    domain: 'calendar',
    name: Platform.OS === 'ios' ? 'Apple Calendar' : 'Device calendar',
    description: 'Add events you are going to straight into the calendar on this phone.',
    capabilities: [
      'calendar.list',
      'calendar.event.create',
      'calendar.event.update',
      'calendar.event.delete',
    ],
    permissions: [CALENDAR_WRITE_PERMISSION, CALENDAR_READ_PERMISSION],
    consent: {
      accesses: ['The calendars on this device', 'Permission to add events to the one you choose'],
      reasons: [
        'So you can pick which calendar an event goes into',
        'So the event and its reminder appear where you already look',
      ],
      stores: [
        'Which calendar you chose as your default, on this device only',
        'Which Diaspora events you have added, so the same event is not added twice',
      ],
      doesNotStore: [
        'Anything already in your calendar',
        'The titles, times or attendees of your other events',
        'Any copy of your calendar on Diaspora’s servers',
      ],
      disconnectSummary:
        'Turn it off here at any time. Events already added stay in your calendar until you delete them there.',
      privacyNote:
        'Everything happens on this device. No calendar data is sent to Diaspora or to anyone else.',
    },
    isMemberConnectable: true,
    // The whole integration works with no network — it is a device API. That is
    // unusual enough among these nine to be worth stating rather than implying.
    offlineCapabilities: [
      'calendar.list',
      'calendar.event.create',
      'calendar.event.update',
      'calendar.event.delete',
    ],
    gapIds: [INTEGRATION_PROVIDER_GAPS.deviceCalendar.id],
    contextualEntryPoints: [
      '/community-life/event/[id]',
      '/community-life/occurrence/[id]',
      '/community-life/series/[id]',
    ],
  };
}

const GOOGLE_CALENDAR_DESCRIPTOR: IntegrationDescriptor = {
  provider: 'calendar.google',
  domain: 'calendar',
  name: 'Google Calendar',
  description: 'Add Diaspora events to a Google calendar, on every device you use it on.',
  capabilities: [
    'calendar.list',
    'calendar.event.create',
    'calendar.event.update',
    'calendar.event.delete',
    'calendar.sync.oneWay',
  ],
  permissions: [GOOGLE_CALENDAR_SCOPE],
  consent: {
    accesses: [
      'The names of the calendars in your Google account',
      'Permission to create and change events Diaspora adds',
    ],
    reasons: [
      'So you can pick which calendar to use',
      'So an event you have already added can be updated if its time changes',
    ],
    stores: [
      'Which Google account you connected, and which calendar you chose',
      'The Google identifier of each event Diaspora created, so it can be updated later',
    ],
    doesNotStore: [
      'Your Google password',
      'Events in your calendar that Diaspora did not create',
      'Your Google contacts, files, or anything else in your account',
    ],
    disconnectSummary:
      'Disconnect here, and Diaspora’s access is withdrawn from your Google account. You can also remove it from your Google account settings.',
    privacyNote:
      'Diaspora asks Google only for permission to manage events it creates — not to read your existing calendar.',
  },
  isMemberConnectable: true,
  // Nothing works offline: every operation is a request to Google.
  offlineCapabilities: [],
  gapIds: [
    INTEGRATION_GAPS.oauthExchange.id,
    INTEGRATION_GAPS.googleCalendarList.id,
    INTEGRATION_GAPS.googleCalendarWrite.id,
  ],
  contextualEntryPoints: ['/community-life/event/[id]', '/settings/integrations/calendar'],
};

const PUSH_DESCRIPTOR: IntegrationDescriptor = {
  provider: 'push.expo',
  domain: 'push',
  name: 'Notifications',
  description: 'Get told about replies, jobs, payments and events on this device.',
  capabilities: ['push.permission', 'push.token', 'push.deviceRegistry', 'push.preferences', 'push.deepLink'],
  permissions: [NOTIFICATION_PERMISSION],
  consent: {
    accesses: ['Permission to show notifications on this device'],
    reasons: ['So you hear about things that need you without having to check the app'],
    stores: [
      'A delivery address for this device, so notifications reach the right phone',
      'Which kinds of notification you want, which you can change at any time',
    ],
    doesNotStore: [
      'Anything else on your device',
      'What you do in other apps',
      'Your location',
    ],
    disconnectSummary:
      'Turn notifications off here or in your device settings. The delivery address for this device is removed when you sign out.',
    privacyNote:
      'The delivery address identifies this device, not you. It is removed when you sign out so notifications for your account never reach the next person who signs in on this phone.',
  },
  isMemberConnectable: true,
  // The inbox works offline; delivery does not.
  offlineCapabilities: ['push.preferences'],
  gapIds: [INTEGRATION_PROVIDER_GAPS.pushToken.id, INTEGRATION_GAPS.integrationNotificationTemplates.id],
  contextualEntryPoints: ['/settings/notifications', '/job/[id]', '/conversation/[id]'],
};

const MAPS_DESCRIPTOR: IntegrationDescriptor = {
  provider: 'maps.platform',
  domain: 'maps',
  name: 'Maps and navigation',
  description: 'See what is nearby, search addresses, and plan how to get there.',
  capabilities: [
    'maps.render',
    'maps.geocode',
    'maps.reverseGeocode',
    'maps.places',
    'maps.directions',
    'maps.travelTime',
  ],
  permissions: [LOCATION_PERMISSION],
  consent: {
    accesses: ['Your location, if you allow it'],
    reasons: ['To centre the map where you are and to work out how far things are'],
    stores: [
      'The area you last chose to browse, so the map opens where you left it',
    ],
    doesNotStore: [
      'A history of where you have been',
      'A history of the routes you have planned',
      'Your precise location on Diaspora’s servers',
    ],
    disconnectSummary:
      'Turn location off in your device settings. The map keeps working — you choose an area instead.',
    privacyNote:
      'Diaspora asks for your location only while you are using the app, never in the background.',
  },
  // Not member-connectable: maps are a platform capability, and offering a
  // "Connect" button for something that is already working would be nonsense.
  isMemberConnectable: false,
  offlineCapabilities: ['maps.render'],
  gapIds: [],
  contextualEntryPoints: ['/map', '/neighborhood/[id]', '/housing/[id]', '/provider/[id]'],
};

const EMAIL_DESCRIPTOR: IntegrationDescriptor = {
  provider: 'email.platform',
  domain: 'email',
  name: 'Email',
  description: 'Where receipts, security alerts and anything you have asked for by email are sent.',
  capabilities: ['email.preferences', 'email.verification', 'email.change', 'email.unsubscribe'],
  permissions: [],
  consent: {
    accesses: ['Your email address'],
    reasons: ['To send receipts, security alerts and the updates you have chosen'],
    stores: ['Your address and whether it has been confirmed', 'Which kinds of email you want'],
    doesNotStore: ['Your mailbox', 'Anything you send or receive elsewhere'],
    disconnectSummary:
      'Turn off any kind of email here. Security and payment emails cannot be turned off — they are how you find out if something happens to your account.',
    privacyNote:
      'Marketing email is off unless you switch it on. It is a separate setting from receipts and alerts.',
  },
  isMemberConnectable: false,
  offlineCapabilities: [],
  gapIds: [INTEGRATION_GAPS.emailVerification.id, INTEGRATION_GAPS.emailPreferenceDetail.id],
  contextualEntryPoints: ['/settings/notifications', '/profile/account-security'],
};

const SMS_DESCRIPTOR: IntegrationDescriptor = {
  provider: 'sms.platform',
  domain: 'sms',
  name: 'Phone number',
  description: 'Used to sign in and to confirm it is you.',
  capabilities: ['sms.verification', 'sms.preferences'],
  permissions: [],
  consent: {
    accesses: ['Your phone number'],
    reasons: ['To send the code that signs you in and confirms changes to your account'],
    stores: ['Your number and whether it has been confirmed'],
    doesNotStore: ['Your contacts', 'Your messages', 'Your call history'],
    disconnectSummary:
      'Your number cannot be removed while it is the only way you can sign in. Add another way first.',
    privacyNote:
      'Your number is shown only to you. Choosing a country code is about reaching your phone and says nothing about your nationality.',
  },
  isMemberConnectable: false,
  offlineCapabilities: [],
  gapIds: [INTEGRATION_GAPS.smsVerificationState.id],
  contextualEntryPoints: ['/(auth)/login', '/verification/phone', '/profile/account-security'],
};

const GOVERNMENT_DESCRIPTOR: IntegrationDescriptor = {
  provider: 'government.official',
  domain: 'government',
  name: 'Country information',
  description: 'Official notices, travel advice and embassy details for a country you choose.',
  capabilities: [
    'government.notices',
    'government.advisories',
    'government.embassy',
    'government.services',
  ],
  permissions: [],
  consent: {
    accesses: ['The country you choose to look at'],
    reasons: ['To show information for that country rather than for everywhere'],
    stores: ['Nothing about what you read'],
    doesNotStore: [
      'Which countries you looked at',
      'Any conclusion about your nationality or immigration status',
    ],
    disconnectSummary: 'Nothing to disconnect. You choose a country each time.',
    // The most important sentence in this file. §20's rule, in a place a member
    // will actually read it.
    privacyNote:
      'Diaspora is not a government and does not speak for one. Every item shows who published it and when it was last checked, and links to the official page where there is one.',
  },
  isMemberConnectable: false,
  offlineCapabilities: [],
  gapIds: [INTEGRATION_GAPS.governmentNotices.id, INTEGRATION_GAPS.governmentProxy.id],
  contextualEntryPoints: ['/country/[code]', '/settings/integrations/government'],
};

const IDENTITY_GOOGLE_DESCRIPTOR: IntegrationDescriptor = {
  provider: 'identity.google',
  domain: 'identity',
  name: 'Google',
  description: 'Sign in with your Google account as well as your phone number.',
  capabilities: ['identity.signIn', 'identity.link', 'identity.unlink'],
  permissions: [IDENTITY_SCOPE],
  consent: {
    accesses: ['Your name and email address from Google'],
    reasons: ['To recognise your account when you sign in this way'],
    stores: ['That your Google account is linked, and which address it uses'],
    doesNotStore: [
      'Your Google password',
      'Your Google Calendar — that is a separate connection you choose separately',
      'Your contacts, files or anything else in your Google account',
    ],
    disconnectSummary:
      'Unlink here at any time, as long as you have another way to sign in.',
    privacyNote:
      'Signing in with Google and connecting Google Calendar are different things. Doing one does not do the other.',
  },
  isMemberConnectable: true,
  offlineCapabilities: [],
  gapIds: [INTEGRATION_GAPS.oauthExchange.id, INTEGRATION_GAPS.identityLinking.id],
  contextualEntryPoints: ['/(auth)/login', '/profile/account-security'],
};

const IDENTITY_APPLE_DESCRIPTOR: IntegrationDescriptor = {
  provider: 'identity.apple',
  domain: 'identity',
  name: 'Apple',
  description: 'Sign in with your Apple account as well as your phone number.',
  capabilities: ['identity.signIn', 'identity.link', 'identity.unlink'],
  permissions: [IDENTITY_SCOPE],
  consent: {
    accesses: ['Your name, and an email address Apple gives us'],
    reasons: ['To recognise your account when you sign in this way'],
    stores: ['That your Apple account is linked, and the address Apple provided'],
    doesNotStore: ['Your Apple password', 'Anything else in your Apple account'],
    disconnectSummary: 'Unlink here at any time, as long as you have another way to sign in.',
    privacyNote:
      'Apple lets you hide your real email address. If you do, we get a forwarding address instead — mail still reaches you, and we never see your real one.',
  },
  isMemberConnectable: true,
  offlineCapabilities: [],
  gapIds: [INTEGRATION_GAPS.oauthExchange.id, INTEGRATION_GAPS.identityLinking.id],
  contextualEntryPoints: ['/(auth)/login', '/profile/account-security'],
};

const PAYMENTS_DESCRIPTOR: IntegrationDescriptor = {
  provider: 'payments.platform',
  domain: 'payments',
  name: 'Payments',
  description: 'How money moves in and out of your Diaspora wallet.',
  capabilities: [
    'payments.initialize',
    'payments.authorize',
    'payments.confirm',
    'payments.cancel',
    'payments.status',
    'payments.receipt',
    'payments.methods',
  ],
  permissions: [],
  consent: {
    accesses: ['Nothing on this device'],
    reasons: ['Card details are collected by the payment provider, never by Diaspora'],
    stores: ['A record of each payment and its receipt', 'The last four digits and card type, to help you recognise it'],
    doesNotStore: [
      'Your full card number',
      'Your card security code',
      'Anything that could be used to charge your card outside Diaspora',
    ],
    disconnectSummary:
      'Remove a saved payment method at any time. Records of past payments are kept because they are your receipts.',
    privacyNote:
      'A payment is only complete when the payment provider confirms it — not when this app returns from the payment screen.',
  },
  isMemberConnectable: false,
  // A wallet balance can be read from cache; nothing can be paid offline.
  offlineCapabilities: [],
  gapIds: [
    INTEGRATION_GAPS.paymentGatewaySession.id,
    INTEGRATION_GAPS.paymentNextAction.id,
    INTEGRATION_GAPS.paymentMethodRegistry.id,
  ],
  contextualEntryPoints: ['/wallet', '/wallet/add-money', '/marketplace/[id]', '/monetization'],
};

/**
 * Every integration, in the order the connection centre lists them.
 *
 * The order is not alphabetical and not by domain. It is roughly by how likely
 * a member is to want it: notifications and calendar first because those are
 * the two anybody actually connects, identity and payments next because they
 * are account-shaped, and the platform-level ones last because there is nothing
 * to do with them.
 */
export function integrationCatalog(): IntegrationDescriptor[] {
  const catalog: IntegrationDescriptor[] = [
    PUSH_DESCRIPTOR,
    deviceCalendarDescriptor(),
    GOOGLE_CALENDAR_DESCRIPTOR,
    IDENTITY_GOOGLE_DESCRIPTOR,
  ];

  // Same rule as the registry's: listed on Apple platforms, where it is both
  // required by App Review and actually available.
  if (Platform.OS === 'ios') catalog.push(IDENTITY_APPLE_DESCRIPTOR);

  catalog.push(
    SMS_DESCRIPTOR,
    EMAIL_DESCRIPTOR,
    PAYMENTS_DESCRIPTOR,
    MAPS_DESCRIPTOR,
    GOVERNMENT_DESCRIPTOR
  );

  return catalog;
}

export function descriptorFor(provider: IntegrationProviderId): IntegrationDescriptor | undefined {
  return integrationCatalog().find((entry) => entry.provider === provider);
}

export function descriptorsForDomain(domain: IntegrationDomain): IntegrationDescriptor[] {
  return integrationCatalog().filter((entry) => entry.domain === domain);
}
