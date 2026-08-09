// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Action catalogue (Frontend Phase 18, §10 · §28 · §48)
//
// Every THEN the builder can offer.
//
// ── The three absences, which are the most important thing in this file ──────
//
// §10 lists twenty-two candidate actions. Three families were deliberately not
// built, and each absence is a decision recorded here rather than an oversight
// somebody will later "fix":
//
//   **Nothing that moves money.** No transfer, no withdrawal, no credit, no
//   refund, no charge, no renewal, no claim. §48 forbids a frontend-only rule
//   doing any of it, and the enforcement is not a check — it is that no such
//   entry exists, `AutomationAction` has no amount or destination field, and
//   the adapter exports no function that could create one. Financial
//   automations in this phase *notify about* money that has already moved and
//   deep-link to the existing flow where the member acts themselves.
//
//   **Nothing that sends a message.** §29 forbids automatically sending
//   messages without explicit user authorization. An auto-reply would need a
//   per-run confirmation design nobody has asked for, so rather than ship a
//   half-authorized send, there is no send. The domain model keeps
//   `requiresPerRunConfirmation` so the design has somewhere to land later.
//
//   **Nothing that posts publicly.** No "share content", no "publish". §10
//   lists sharing, but an automation that posts on somebody's behalf is a
//   statement attributed to them that they did not write at the moment it went
//   out, and the platform has no review-before-publish flow to hang it on.
//
// ── `executor`, and why it is not an implementation detail ───────────────────
//
// §10: "The backend must remain authoritative for privileged actions." The test
// applied to each entry was *who does the actual work* — and the answer changes
// what the UI may promise. A `client` action cannot happen while the app is
// closed. A `server` action can, once the platform ships. Rendering both as
// "this will happen" would be true of only half of them.
//
// The device-calendar write is the interesting case: it is genuinely `client`,
// genuinely works today, and genuinely cannot fire unattended. The builder says
// so rather than letting a member set a reminder that silently needs the app
// open. Unattended calendar writing is GAP-025 and is a different action.
//
// ── `repeatRisk`, and §39 ────────────────────────────────────────────────────
//
// Three values because the UI does three different things:
//
//   `safe`         a retry button, no warning.
//   `deduplicated` a retry button, and an `AlreadyProcessed` response renders
//                  as **completed** rather than as an error. §39 is explicit.
//   `visible`      no automatic retry anywhere, and a member-initiated retry
//                  says what a second attempt would produce.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AutomationActionDefinition,
  AutomationDomainKey,
  AutomationOwnerKind,
} from '@/types/automation';

const EVERY_OWNER: AutomationOwnerKind[] = [
  'user',
  'creator',
  'provider',
  'employer',
  'landlord',
  'seller',
  'organization',
  'community',
];

const SELF_OWNERS: AutomationOwnerKind[] = [
  'user',
  'creator',
  'provider',
  'employer',
  'landlord',
  'seller',
];

export const ACTION_CATALOG: AutomationActionDefinition[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // NOTIFY — §10 · §28 · §53. Every one routes through B13.
  // ═══════════════════════════════════════════════════════════════════════════

  {
    key: 'notify.self',
    domain: 'notifications',
    label: 'Tell me',
    description:
      'Sends you a notification. It follows your normal notification settings, including quiet hours.',
    executor: 'server',
    repeatRisk: 'deduplicated',
    support: 'PARTIAL',
    gapKey: 'automationNotificationDispatch',
    // B13's channels and B13's categories. There is no automation inbox.
    notificationChannel: 'InApp',
    notificationCategoryKey: 'automation.personal',
    requiredIntegrations: [],
    requiredCapability: null,
    reachesOtherPeople: false,
    requiresPerRunConfirmation: false,
    simulatable: true,
    allowedOwners: EVERY_OWNER,
  },
  {
    key: 'notify.community',
    domain: 'community',
    label: 'Tell the community',
    description:
      'Sends a notification to eligible members of the community. Who receives it is decided by Diaspora, and each person’s own settings still apply.',
    executor: 'server',
    repeatRisk: 'deduplicated',
    support: 'BACKEND_GAP',
    gapKey: 'automationNotificationDispatch',
    notificationChannel: 'InApp',
    notificationCategoryKey: 'community.announcement',
    requiredIntegrations: [],
    requiredCapability: 'automations.community',
    reachesOtherPeople: true,
    // Not per-run: a moderator who set up "welcome new members" is authorizing
    // the pattern, and confirming each individual welcome would make the
    // automation pointless. The control is the *capability*, re-checked at
    // execution, plus the audience preview before activation — §34 and §46.
    requiresPerRunConfirmation: false,
    simulatable: true,
    allowedOwners: ['community'],
  },
  {
    key: 'notify.organization',
    domain: 'organizations',
    label: 'Tell the organization',
    description: 'Sends a notification to eligible members of your organization.',
    executor: 'server',
    repeatRisk: 'deduplicated',
    support: 'BACKEND_GAP',
    gapKey: 'automationNotificationDispatch',
    notificationChannel: 'InApp',
    notificationCategoryKey: 'organization.announcement',
    requiredIntegrations: [],
    requiredCapability: 'automations.organization',
    reachesOtherPeople: true,
    requiresPerRunConfirmation: false,
    simulatable: true,
    allowedOwners: ['organization'],
  },
  {
    key: 'notify.followers',
    domain: 'creator',
    label: 'Tell my followers',
    description: 'Sends a notification to people who follow you.',
    executor: 'server',
    repeatRisk: 'deduplicated',
    support: 'BACKEND_GAP',
    gapKey: 'automationNotificationDispatch',
    notificationChannel: 'InApp',
    notificationCategoryKey: 'creator.update',
    requiredIntegrations: [],
    requiredCapability: 'automations.creator',
    reachesOtherPeople: true,
    requiresPerRunConfirmation: false,
    simulatable: true,
    allowedOwners: ['creator'],
  },
  {
    key: 'notify.push',
    domain: 'notifications',
    label: 'Send me a push notification',
    description:
      'Sends a push notification to your phone. Needs push to be switched on, and follows your quiet hours.',
    executor: 'server',
    repeatRisk: 'deduplicated',
    // B13's device registry and preference contracts are real; what is missing
    // is the device-side token, which is Phase 16's *provider* gap rather than
    // a backend one. PARTIAL is the honest reading and pointing this at a
    // backend gap would send a backend team work it cannot do.
    support: 'PARTIAL',
    gapKey: 'automationNotificationDispatch',
    notificationChannel: 'Push',
    notificationCategoryKey: 'automation.personal',
    requiredIntegrations: ['push'],
    requiredCapability: null,
    reachesOtherPeople: false,
    requiresPerRunConfirmation: false,
    simulatable: true,
    allowedOwners: SELF_OWNERS,
  },
  {
    key: 'notify.email',
    domain: 'notifications',
    label: 'Email me',
    description: 'Sends you an email. Needs a verified email address and follows your email settings.',
    executor: 'server',
    repeatRisk: 'deduplicated',
    support: 'PARTIAL',
    gapKey: 'automationNotificationDispatch',
    notificationChannel: 'Email',
    notificationCategoryKey: 'automation.personal',
    requiredIntegrations: ['email'],
    requiredCapability: null,
    reachesOtherPeople: false,
    requiresPerRunConfirmation: false,
    simulatable: true,
    allowedOwners: SELF_OWNERS,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // REMINDERS AND CALENDAR — §11 · §12
  // ═══════════════════════════════════════════════════════════════════════════

  {
    key: 'reminder.schedule',
    domain: 'events',
    label: 'Remind me before it starts',
    description: 'Sets a reminder for a time you choose before something starts, in its own local time.',
    executor: 'server',
    repeatRisk: 'deduplicated',
    support: 'BACKEND_GAP',
    gapKey: 'eventReminders',
    notificationChannel: 'InApp',
    notificationCategoryKey: 'automation.reminder',
    requiredIntegrations: [],
    requiredCapability: null,
    reachesOtherPeople: false,
    requiresPerRunConfirmation: false,
    simulatable: true,
    allowedOwners: SELF_OWNERS,
  },
  {
    key: 'calendar.addEvent',
    domain: 'events',
    label: 'Add it to my calendar',
    description:
      'Adds it to a calendar you have connected. On your phone’s own calendar this works while the app is open; unattended adding needs the platform.',
    // Genuinely the device's own work when the device calendar is the target,
    // and it calls Phase 16's single `exportEventToCalendar`. §11 forbids
    // duplicating calendar logic and none is duplicated here.
    executor: 'client',
    // A second write is a second entry in somebody's calendar. The most visible
    // failure this integration has, and never retried automatically.
    repeatRisk: 'visible',
    support: 'PARTIAL',
    gapKey: 'automationCalendarWrite',
    notificationChannel: null,
    notificationCategoryKey: null,
    requiredIntegrations: ['calendar'],
    requiredCapability: null,
    reachesOtherPeople: false,
    requiresPerRunConfirmation: false,
    simulatable: true,
    allowedOwners: SELF_OWNERS,
  },
  {
    key: 'calendar.updateEvent',
    domain: 'events',
    label: 'Update it in my calendar',
    description: 'Changes an entry Diaspora already added, rather than adding a second one.',
    executor: 'client',
    repeatRisk: 'deduplicated',
    support: 'BACKEND_GAP',
    // Updating needs a record of which Diaspora event maps to which external
    // entry, and nothing holds one — so this is a gap even though the *write*
    // half works. Marking it PARTIAL would imply an update is possible today.
    gapKey: 'automationCalendarWrite',
    notificationChannel: null,
    notificationCategoryKey: null,
    requiredIntegrations: ['calendar'],
    requiredCapability: null,
    reachesOtherPeople: false,
    requiresPerRunConfirmation: false,
    simulatable: true,
    allowedOwners: SELF_OWNERS,
  },
  {
    key: 'calendar.removeEvent',
    domain: 'events',
    label: 'Remove it from my calendar',
    description: 'Takes out an entry Diaspora added, for example when an event is cancelled.',
    executor: 'client',
    repeatRisk: 'safe',
    support: 'BACKEND_GAP',
    gapKey: 'automationCalendarWrite',
    notificationChannel: null,
    notificationCategoryKey: null,
    requiredIntegrations: ['calendar'],
    requiredCapability: null,
    reachesOtherPeople: false,
    requiresPerRunConfirmation: false,
    simulatable: true,
    allowedOwners: SELF_OWNERS,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ON-DEVICE — the actions that genuinely work today
  // ═══════════════════════════════════════════════════════════════════════════

  {
    key: 'item.save',
    domain: 'search',
    label: 'Save it for me',
    description: 'Adds it to your saved items so you can find it later.',
    executor: 'client',
    repeatRisk: 'safe',
    // Saving is real today. It is the member's own list and needs no platform
    // capability, which is why this and `open.deepLink` are the two actions a
    // member can rely on now.
    support: 'CONNECTED',
    gapKey: null,
    notificationChannel: null,
    notificationCategoryKey: null,
    requiredIntegrations: [],
    requiredCapability: null,
    reachesOtherPeople: false,
    requiresPerRunConfirmation: false,
    simulatable: true,
    allowedOwners: SELF_OWNERS,
  },
  {
    key: 'open.deepLink',
    domain: 'notifications',
    label: 'Open a screen',
    description: 'Takes you straight to the right place in the app when you tap the notification.',
    executor: 'client',
    repeatRisk: 'safe',
    support: 'CONNECTED',
    gapKey: null,
    notificationChannel: null,
    notificationCategoryKey: null,
    requiredIntegrations: [],
    requiredCapability: null,
    reachesOtherPeople: false,
    requiresPerRunConfirmation: false,
    simulatable: true,
    allowedOwners: EVERY_OWNER,
  },
];

const BY_KEY = new Map<string, AutomationActionDefinition>(
  ACTION_CATALOG.map((action) => [action.key, action])
);

export function actionDefinition(key: string): AutomationActionDefinition | undefined {
  return BY_KEY.get(key);
}

/** The actions a trigger offers, in catalogue order for a stable picker. */
export function actionsForTrigger(supportedKeys: readonly string[]): AutomationActionDefinition[] {
  const allowed = new Set(supportedKeys);
  return ACTION_CATALOG.filter((action) => allowed.has(action.key));
}

export function actionsByDomain(): Map<AutomationDomainKey, AutomationActionDefinition[]> {
  const grouped = new Map<AutomationDomainKey, AutomationActionDefinition[]>();
  for (const action of ACTION_CATALOG) {
    const existing = grouped.get(action.domain);
    if (existing) existing.push(action);
    else grouped.set(action.domain, [action]);
  }
  return grouped;
}

/** Whether any action reaches somebody else. Drives the audience preview. §34. */
export function anyReachesOtherPeople(keys: readonly string[]): boolean {
  return keys.some((key) => BY_KEY.get(key)?.reachesOtherPeople === true);
}

/**
 * Whether any action would produce a second visible thing if repeated.
 *
 * Drives §39's UX: a retry control on a `visible` action must say what a second
 * attempt would create, and no automatic retry may be offered at all.
 */
export function anyRepeatIsVisible(keys: readonly string[]): boolean {
  return keys.some((key) => BY_KEY.get(key)?.repeatRisk === 'visible');
}

/**
 * A stable token for a set of action keys, for the audience cache key.
 *
 * Sorted, so the same set assembled in two orders is one cache entry — the
 * audience depends on *which* actions reach people, not on the order the
 * builder happened to add them in.
 */
export function actionsToken(keys: readonly string[]): string {
  return [...keys].sort().join(',') || 'none';
}

/**
 * The notification channels a set of actions would use, de-duplicated.
 *
 * Used by the preview to name which of the member's B13 preferences apply —
 * §53, and the reason the builder can say "this will use push, and you have
 * push switched off" rather than leaving them to find out.
 */
export function channelsForActions(keys: readonly string[]): string[] {
  const channels = new Set<string>();
  for (const key of keys) {
    const channel = BY_KEY.get(key)?.notificationChannel;
    if (channel) channels.add(channel);
  }
  return Array.from(channels);
}
