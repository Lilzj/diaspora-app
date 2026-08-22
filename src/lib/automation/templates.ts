// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Template catalogue (Frontend Phase 18, §31 · §32)
//
// The automations a member can have without building one.
//
// ── Why the catalogue is on the client ───────────────────────────────────────
//
// A template is a *composition of catalogue entries this build already
// understands*. A server-published template naming a trigger this app version
// does not have is a row that cannot be opened, so the client would have to
// filter server templates against its own catalogue anyway — at which point the
// client catalogue is the foundation and the server one is an addition.
// GAP-030 records the server-published version as the enhancement it is.
//
// ── §31: "Templates must be permission-aware and context-aware" ──────────────
//
// Permission-aware is `allowedOwners` plus `requiredCapabilities`, filtered
// through the server's capability set by `templatesFor()`. A template a member
// cannot use is **not shown** — same rule as everywhere else in this phase, and
// for the same reason: a greyed-out "Notify your whole community" row tells an
// ordinary member what moderators can do.
//
// Context-aware is `fields`. A template is not a finished automation; it is a
// shape with the two or three decisions that are genuinely the member's left
// open. "Notify me about new jobs" has to know *which* country and *which*
// category, and asking only those is the difference between a template and a
// builder with defaults.
//
// ── §32: templates declare, they do not duplicate ────────────────────────────
//
// §32 lists what a template defines and the list ends with "Do not duplicate
// rule definitions inside individual screens." So `support` and `gapKeys` are
// **derived** from the trigger, conditions and actions by `hydrateTemplate()`
// rather than written out per template — a declared support status is one that
// drifts the first time a trigger's status changes and forty templates do not.
// ─────────────────────────────────────────────────────────────────────────────

import { weakestSupport } from '@/types/automation';
import { resolvePartSupport } from './served-support';
import type { ServedSupportLookup } from './served-support';
import type {
  AutomationAccess,
  AutomationDraft,
  AutomationOwnerKind,
  AutomationScope,
  AutomationSupportStatus,
  AutomationTemplate,
  AutomationTemplateCategory,
} from '@/types/automation';
import { actionDefinition } from './actions';
import { conditionDefinition } from './conditions';
import { triggerDefinition } from './triggers';
import { canUseAction, canUseTrigger, hasCapability } from './access';
import { defaultEventSchedule, defaultSchedule } from './schedule';

/**
 * A template before its support status is derived.
 *
 * The two omitted fields are the derived ones. Making them absent from the
 * authoring type is what stops somebody declaring a status by hand.
 */
type TemplateSeed = Omit<AutomationTemplate, 'support' | 'gapKeys'>;

const SEEDS: TemplateSeed[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // REMINDERS — §31's "Remind me about my upcoming event"
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'event-reminder',
    name: 'Remind me about events I am going to',
    description:
      'Get a reminder before an event starts, in the event’s own local time — so it stays right even if you travel.',
    category: 'reminders',
    domain: 'events',
    trigger: { key: 'event.startingSoon', parameters: {} },
    conditions: [],
    actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
    schedule: null,
    fields: [
      {
        key: 'offsetMinutes',
        label: 'How long before?',
        target: 'trigger',
        valueKind: 'choice',
        required: true,
        defaultValue: '1440',
        helpText: null,
        choices: [
          { value: '0', label: 'When it starts' },
          { value: '60', label: '1 hour before' },
          { value: '180', label: '3 hours before' },
          { value: '1440', label: '1 day before' },
          { value: '10080', label: '1 week before' },
        ],
      },
    ],
    allowedOwners: ['user'],
    requiredCapabilities: [],
    requiredIntegrations: [],
  },

  {
    id: 'event-to-calendar',
    name: 'Put events I register for in my calendar',
    description:
      'When you register for an event, it is added to your calendar with the right time zone.',
    category: 'reminders',
    domain: 'events',
    trigger: { key: 'event.rsvpConfirmed', parameters: {} },
    conditions: [],
    actions: [{ id: 'a1', key: 'calendar.addEvent', parameters: {} }],
    schedule: null,
    fields: [],
    allowedOwners: ['user'],
    requiredCapabilities: [],
    requiredIntegrations: ['calendar'],
  },

  {
    id: 'event-changed',
    name: 'Tell me if an event I saved moves',
    description: 'If the time, date or place changes, you hear about it — and your calendar is updated.',
    category: 'reminders',
    domain: 'events',
    trigger: { key: 'event.updated', parameters: {} },
    conditions: [],
    actions: [
      { id: 'a1', key: 'notify.self', parameters: {} },
      { id: 'a2', key: 'calendar.updateEvent', parameters: {} },
    ],
    schedule: null,
    fields: [],
    allowedOwners: ['user'],
    requiredCapabilities: [],
    requiredIntegrations: ['calendar'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ALERTS — §31's saved-search family
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'job-alert',
    name: 'Tell me when a job I would want is posted',
    description: 'Get told when a new job matches the country and kind of work you are looking for.',
    category: 'alerts',
    domain: 'jobs',
    trigger: { key: 'savedSearch.newMatch', parameters: { subject: 'jobs' } },
    conditions: [
      { id: 'c1', key: 'country', operator: 'equals', value: null },
      { id: 'c2', key: 'category', operator: 'includes', value: null },
    ],
    actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
    schedule: null,
    fields: [
      {
        key: 'value',
        label: 'Which country?',
        target: 'condition',
        targetId: 'c1',
        valueKind: 'country',
        required: true,
        defaultValue: null,
        helpText: null,
      },
      {
        key: 'value',
        label: 'What kind of work?',
        target: 'condition',
        targetId: 'c2',
        valueKind: 'category',
        required: false,
        defaultValue: null,
        helpText: 'Leave this empty to hear about every kind of job.',
      },
    ],
    allowedOwners: ['user'],
    requiredCapabilities: [],
    requiredIntegrations: [],
  },

  {
    id: 'housing-alert',
    name: 'Tell me when a home matching what I need comes up',
    description: 'Get told when a new place matches your area and your budget.',
    category: 'alerts',
    domain: 'housing',
    trigger: { key: 'savedSearch.newMatch', parameters: { subject: 'housing' } },
    conditions: [
      { id: 'c1', key: 'neighbourhood', operator: 'includes', value: null },
      { id: 'c2', key: 'priceBelow', operator: 'lessThan', value: null },
    ],
    actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
    schedule: null,
    fields: [
      {
        key: 'value',
        label: 'Which areas?',
        target: 'condition',
        targetId: 'c1',
        valueKind: 'neighbourhood',
        required: true,
        defaultValue: null,
        helpText: null,
      },
      {
        key: 'value',
        label: 'Most you want to pay',
        target: 'condition',
        targetId: 'c2',
        valueKind: 'money',
        required: false,
        defaultValue: null,
        // §50: a budget is personal. Saying where it stays is worth the line —
        // it is the field members hesitate over.
        helpText: 'This stays private to you and is never shown to landlords.',
      },
    ],
    allowedOwners: ['user'],
    requiredCapabilities: [],
    requiredIntegrations: [],
  },

  {
    id: 'price-drop',
    name: 'Tell me when the price drops on something I am watching',
    description: 'Get told when a listing you saved changes price.',
    category: 'alerts',
    domain: 'marketplace',
    trigger: { key: 'savedSearch.priceChanged', parameters: { subject: 'marketplace' } },
    conditions: [{ id: 'c1', key: 'priceBelow', operator: 'lessThan', value: null }],
    actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
    schedule: null,
    fields: [
      {
        key: 'value',
        label: 'Tell me when it drops below',
        target: 'condition',
        targetId: 'c1',
        valueKind: 'money',
        required: true,
        defaultValue: null,
        helpText: null,
      },
    ],
    allowedOwners: ['user'],
    requiredCapabilities: [],
    requiredIntegrations: [],
  },

  {
    id: 'guide-updates',
    name: 'Tell me when a guide I saved is updated',
    description:
      'Get told when a guide you saved changes in a meaningful way. Small edits and typo fixes do not count.',
    category: 'alerts',
    domain: 'guides',
    trigger: { key: 'guide.savedChanged', parameters: {} },
    conditions: [],
    actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
    schedule: null,
    fields: [],
    allowedOwners: ['user'],
    requiredCapabilities: [],
    requiredIntegrations: [],
  },

  {
    id: 'government-updates',
    name: 'Tell me about official updates for a country',
    description:
      'Get told when visa guidance or official notices change for a country you care about. Every notice shows which authority issued it.',
    category: 'alerts',
    domain: 'government',
    trigger: { key: 'government.advisoryUpdated', parameters: {} },
    conditions: [{ id: 'c1', key: 'country', operator: 'equals', value: null }],
    actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
    schedule: null,
    fields: [
      {
        key: 'value',
        label: 'Which country?',
        target: 'condition',
        targetId: 'c1',
        valueKind: 'country',
        required: true,
        defaultValue: null,
        helpText: 'This stays private to you. It is never shown to anyone else.',
      },
    ],
    allowedOwners: ['user'],
    requiredCapabilities: [],
    requiredIntegrations: [],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MONEY — §31's "Notify me when my subscription is about to expire"
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'subscription-expiring',
    name: 'Remind me before a subscription ends',
    description:
      'Get a reminder before a subscription runs out, so it does not lapse. Nothing is renewed or charged automatically.',
    category: 'money',
    domain: 'monetization',
    trigger: { key: 'subscription.expiring', parameters: { leadDays: 7 } },
    conditions: [],
    actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
    schedule: null,
    fields: [
      {
        key: 'leadDays',
        label: 'How much notice?',
        target: 'trigger',
        valueKind: 'choice',
        required: true,
        defaultValue: '7',
        helpText: null,
        choices: [
          { value: '1', label: '1 day before' },
          { value: '3', label: '3 days before' },
          { value: '7', label: '1 week before' },
          { value: '30', label: '1 month before' },
        ],
      },
    ],
    allowedOwners: ['user', 'creator', 'provider', 'employer', 'landlord', 'seller'],
    requiredCapabilities: [],
    requiredIntegrations: [],
  },

  {
    id: 'payment-failed',
    name: 'Tell me straight away if a payment fails',
    description: 'Get told quickly when a payment does not go through, so you can sort it out.',
    category: 'money',
    domain: 'wallet',
    trigger: { key: 'payment.failed', parameters: {} },
    conditions: [],
    actions: [{ id: 'a1', key: 'notify.push', parameters: {} }],
    schedule: null,
    fields: [],
    allowedOwners: ['user'],
    requiredCapabilities: ['automations.financial'],
    requiredIntegrations: ['push'],
  },

  {
    id: 'placement-ending',
    name: 'Remind me before a boost or placement ends',
    description: 'Get a reminder before something you paid to promote stops running.',
    category: 'money',
    domain: 'monetization',
    trigger: { key: 'placement.ending', parameters: { leadDays: 3 } },
    conditions: [],
    actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
    schedule: null,
    fields: [],
    allowedOwners: ['creator', 'provider', 'employer', 'landlord', 'seller'],
    requiredCapabilities: [],
    requiredIntegrations: [],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GROWTH — creator and business
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'creator-reward',
    name: 'Tell me when a reward is ready to claim',
    description:
      'Get told when you have a reward waiting, with a link straight to it. Claiming is always something you do yourself.',
    category: 'growth',
    domain: 'creator',
    trigger: { key: 'creator.rewardAvailable', parameters: {} },
    conditions: [],
    actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
    schedule: null,
    fields: [],
    allowedOwners: ['creator'],
    requiredCapabilities: ['automations.creator'],
    requiredIntegrations: [],
  },

  {
    id: 'creator-milestone',
    name: 'Tell me when I hit a milestone',
    description: 'Get told when you pass a milestone in the creator programme.',
    category: 'growth',
    domain: 'creator',
    trigger: { key: 'creator.milestoneReached', parameters: {} },
    conditions: [],
    actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
    schedule: null,
    fields: [],
    allowedOwners: ['creator'],
    requiredCapabilities: ['automations.creator'],
    requiredIntegrations: [],
  },

  {
    id: 'new-lead',
    name: 'Tell me when someone gets in touch',
    description:
      'Get told when a lead or enquiry arrives on your profile. Who it is from stays in your inbox.',
    category: 'growth',
    domain: 'providers',
    trigger: { key: 'provider.leadReceived', parameters: {} },
    conditions: [],
    actions: [{ id: 'a1', key: 'notify.push', parameters: {} }],
    schedule: null,
    fields: [],
    allowedOwners: ['provider'],
    requiredCapabilities: ['automations.provider'],
    requiredIntegrations: ['push'],
  },

  {
    id: 'new-application',
    name: 'Tell me when someone applies to my job',
    description: 'Get told when an application arrives on a job you posted.',
    category: 'growth',
    domain: 'jobs',
    trigger: { key: 'job.applicationSubmitted', parameters: {} },
    conditions: [],
    actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
    schedule: null,
    fields: [],
    allowedOwners: ['employer'],
    requiredCapabilities: ['automations.employer'],
    requiredIntegrations: [],
  },

  {
    id: 'listing-expiring',
    name: 'Remind me before my listing expires',
    description: 'Get a reminder before a listing you posted stops being shown.',
    category: 'growth',
    domain: 'marketplace',
    trigger: { key: 'listing.expiring', parameters: { leadDays: 3 } },
    conditions: [],
    actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
    schedule: null,
    fields: [],
    allowedOwners: ['seller'],
    requiredCapabilities: ['automations.seller'],
    requiredIntegrations: [],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMUNITY AND ADMIN — §13 · §46 · §47
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'welcome-new-members',
    name: 'Welcome people who join',
    description:
      'Send a welcome to each new member of your community. Everyone’s own notification settings still apply.',
    category: 'community',
    domain: 'community',
    trigger: { key: 'community.memberJoined', parameters: {} },
    conditions: [],
    actions: [{ id: 'a1', key: 'notify.community', parameters: {} }],
    schedule: null,
    fields: [],
    allowedOwners: ['community'],
    requiredCapabilities: ['automations.community'],
    requiredIntegrations: [],
  },

  {
    id: 'community-event-notice',
    name: 'Tell the community about new events',
    description:
      'When an event is published in your community, let eligible members know. You will see how many people this reaches before you switch it on.',
    category: 'community',
    domain: 'community',
    trigger: { key: 'community.eventCreated', parameters: {} },
    conditions: [{ id: 'c1', key: 'neighbourhood', operator: 'includes', value: null }],
    actions: [{ id: 'a1', key: 'notify.community', parameters: {} }],
    schedule: null,
    fields: [
      {
        key: 'value',
        label: 'Which areas? (optional)',
        target: 'condition',
        targetId: 'c1',
        valueKind: 'neighbourhood',
        required: false,
        defaultValue: null,
        helpText: 'Leave this empty to include the whole community.',
      },
    ],
    allowedOwners: ['community'],
    requiredCapabilities: ['automations.community'],
    requiredIntegrations: [],
  },

  {
    id: 'community-updates-for-me',
    name: 'Tell me about updates in my communities',
    description: 'Get told when something is posted in a community you follow.',
    category: 'community',
    domain: 'community',
    trigger: { key: 'community.updatePublished', parameters: {} },
    conditions: [{ id: 'c1', key: 'urgency', operator: 'greaterThan', value: 'normal' }],
    actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
    schedule: null,
    fields: [
      {
        key: 'value',
        label: 'How important should it be?',
        target: 'condition',
        targetId: 'c1',
        valueKind: 'choice',
        required: true,
        defaultValue: 'normal',
        helpText: null,
        choices: [
          { value: 'low', label: 'Everything' },
          { value: 'normal', label: 'Normal and above' },
          { value: 'high', label: 'Important only' },
          { value: 'critical', label: 'Urgent only' },
        ],
      },
    ],
    allowedOwners: ['user'],
    requiredCapabilities: [],
    requiredIntegrations: [],
  },

  {
    id: 'organization-registrations',
    name: 'Tell me when someone registers for our event',
    description: 'Get told when a registration arrives for an event your organization is running.',
    category: 'admin',
    domain: 'organizations',
    trigger: { key: 'organization.registrationReceived', parameters: {} },
    conditions: [],
    actions: [{ id: 'a1', key: 'notify.organization', parameters: {} }],
    schedule: null,
    fields: [],
    allowedOwners: ['organization'],
    requiredCapabilities: ['automations.organization'],
    requiredIntegrations: [],
  },

  {
    id: 'unread-nudge',
    name: 'Nudge me about unread messages',
    description:
      'Get a reminder when messages have been sitting unread. Nothing about what they say is read.',
    category: 'reminders',
    domain: 'messaging',
    trigger: { key: 'conversation.unreadReminder', parameters: {} },
    conditions: [{ id: 'c1', key: 'countAbove', operator: 'greaterThan', value: 3 }],
    actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
    schedule: null,
    fields: [
      {
        key: 'value',
        label: 'After how many unread?',
        target: 'condition',
        targetId: 'c1',
        valueKind: 'number',
        required: true,
        defaultValue: 3,
        helpText: null,
      },
    ],
    allowedOwners: ['user'],
    requiredCapabilities: [],
    requiredIntegrations: [],
  },
];

/**
 * A seed with its support status and gap ids derived from its parts.
 *
 * §32: no template declares its own support. `weakestSupport` is the same
 * function the preview uses, so a template's badge and the preview a member
 * sees after choosing it cannot disagree.
 */
/**
 * A template's support, recomputed against what the deployment says it can run.
 *
 * `hydrate` derives the badge from this build's static parts tables, which is
 * right in shape and wrong in fact: 59 of the 83 parts both sides name were
 * declared not-connected here while the deployment reported them available.
 * This applies the same `weakestSupport` rule to the deployment's answers,
 * falling back to the declaration for any part it does not name.
 *
 * Per part, not per template id: the two catalogues share ids without sharing
 * definitions, so a template-level copy would be a claim about a different
 * automation. See `served-support.ts`.
 */
export function templateSupportFrom(
  template: AutomationTemplate,
  lookup: ServedSupportLookup
): AutomationSupportStatus {
  const parts: AutomationSupportStatus[] = [
    resolvePartSupport(
      lookup,
      'trigger',
      template.trigger.key,
      triggerDefinition(template.trigger.key)?.support ?? 'BACKEND_GAP'
    ),
    ...template.conditions.map((condition) =>
      resolvePartSupport(
        lookup,
        'condition',
        condition.key,
        conditionDefinition(condition.key)?.support ?? 'BACKEND_GAP'
      )
    ),
    ...template.actions.map((action) =>
      resolvePartSupport(
        lookup,
        'action',
        action.key,
        actionDefinition(action.key)?.support ?? 'BACKEND_GAP'
      )
    ),
  ];

  return weakestSupport(parts);
}

function hydrate(seed: TemplateSeed): AutomationTemplate {
  const trigger = triggerDefinition(seed.trigger.key);

  const supports: AutomationSupportStatus[] = [
    trigger?.support ?? 'BACKEND_GAP',
    ...seed.conditions.map((c) => conditionDefinition(c.key)?.support ?? 'BACKEND_GAP'),
    ...seed.actions.map((a) => actionDefinition(a.key)?.support ?? 'BACKEND_GAP'),
  ];

  const gapKeys = new Set<string>();
  if (trigger?.gapKey) gapKeys.add(trigger.gapKey);
  for (const condition of seed.conditions) {
    const key = conditionDefinition(condition.key)?.gapKey;
    if (key) gapKeys.add(key);
  }
  for (const action of seed.actions) {
    const key = actionDefinition(action.key)?.gapKey;
    if (key) gapKeys.add(key);
  }

  return {
    ...seed,
    support: weakestSupport(supports),
    gapKeys: Array.from(gapKeys).sort(),
  };
}

export const TEMPLATE_CATALOG: AutomationTemplate[] = SEEDS.map(hydrate);

const BY_ID = new Map<string, AutomationTemplate>(
  TEMPLATE_CATALOG.map((template) => [template.id, template])
);

export function templateById(id: string): AutomationTemplate | undefined {
  return BY_ID.get(id);
}

/**
 * The templates this member may actually use. §31.
 *
 * Filters on three things and each removes a different kind of row: the owner
 * kind removes templates for a role they do not have, the capability check
 * removes ones the server has not granted, and the per-part checks remove ones
 * whose trigger or actions they cannot use even though the template's own
 * requirements were met.
 *
 * **Support status is deliberately not filtered on.** A template whose parts
 * are all backend gaps is still offered, with its status shown — §31 asks for
 * permission-awareness, not for hiding what the platform is still building, and
 * a member who configures one today has an automation that starts working the
 * day it ships.
 */
export function templatesFor(
  ownerKind: AutomationOwnerKind,
  access: AutomationAccess | null
): AutomationTemplate[] {
  return TEMPLATE_CATALOG.filter((template) => {
    if (!template.allowedOwners.includes(ownerKind)) return false;

    for (const capability of template.requiredCapabilities) {
      if (!hasCapability(capability, access)) return false;
    }

    const trigger = triggerDefinition(template.trigger.key);
    if (!trigger || !canUseTrigger(trigger, ownerKind, access)) return false;

    for (const action of template.actions) {
      const definition = actionDefinition(action.key);
      if (!definition || !canUseAction(definition, ownerKind, access)) return false;
    }

    return true;
  });
}

export function templatesByCategory(
  templates: readonly AutomationTemplate[]
): Map<AutomationTemplateCategory, AutomationTemplate[]> {
  const grouped = new Map<AutomationTemplateCategory, AutomationTemplate[]>();
  for (const template of templates) {
    const existing = grouped.get(template.category);
    if (existing) existing.push(template);
    else grouped.set(template.category, [template]);
  }
  return grouped;
}

export const TEMPLATE_CATEGORY_LABELS: Record<AutomationTemplateCategory, string> = {
  reminders: 'Reminders',
  alerts: 'Alerts',
  community: 'Community',
  money: 'Money',
  growth: 'Growing what you do',
  admin: 'Running things',
};

/**
 * A template, as a draft ready for the builder.
 *
 * Deep-copies the conditions and actions rather than referencing them: a
 * template is a shared constant, and a builder that mutated one would change it
 * for every member of the session who opened it afterwards. That is the kind of
 * bug that only shows up when two people use one device.
 */
export function draftFromTemplate(
  template: AutomationTemplate,
  scope: AutomationScope,
  options: { eventZoneId?: string | null; eventLabel?: string } = {}
): AutomationDraft {
  const trigger = triggerDefinition(template.trigger.key);

  const schedule =
    template.schedule ??
    (trigger?.delivery === 'schedule'
      ? trigger.key === 'event.startingSoon'
        ? defaultEventSchedule(options.eventZoneId ?? null, options.eventLabel)
        : defaultSchedule('daily')
      : null);

  return {
    id: null,
    name: template.name,
    description: template.description,
    scope,
    source: 'template',
    templateId: template.id,
    trigger: { key: template.trigger.key, parameters: { ...template.trigger.parameters } },
    // An **optional** field whose condition has no default is omitted rather
    // than carried with a null value.
    //
    // "Leave this empty to include the whole community" has to produce a draft
    // with no such condition, because a condition with no value is not a
    // condition — it is an incomplete one, and validation rightly refuses to
    // save it. Carrying it made every template with an optional filter
    // unsaveable until the member filled in a field the template told them they
    // could skip. `applyTemplateField` re-adds it, in the template's own
    // position, the moment a value arrives.
    conditions: template.conditions
      .filter((condition) => !isOmittedOptional(template, condition.id))
      .map((condition) => ({
        ...condition,
        value: Array.isArray(condition.value) ? [...condition.value] : condition.value,
      })),
    actions: template.actions.map((action) => ({
      ...action,
      parameters: { ...action.parameters },
    })),
    schedule,
  };
}

/** Whether this condition is filled in by an optional field and has no default. */
function isOmittedOptional(template: AutomationTemplate, conditionId: string): boolean {
  const condition = template.conditions.find((entry) => entry.id === conditionId);
  if (!condition) return false;
  if (condition.value !== null && condition.value !== undefined) return false;

  const field = template.fields.find(
    (entry) => entry.target === 'condition' && entry.targetId === conditionId
  );

  // A condition with no value and no field at all is a template authoring
  // mistake rather than an optional filter, so it is kept and validation
  // reports it — silently dropping it would hide the mistake.
  if (!field) return false;

  return !field.required && field.defaultValue === null;
}

/**
 * Apply a member's answer to a template field.
 *
 * Returns a new draft rather than mutating, so the builder's undo and its
 * validation both see whole states rather than a half-applied one.
 */
export function applyTemplateField(
  draft: AutomationDraft,
  field: AutomationTemplate['fields'][number],
  value: string | number | boolean | string[] | null
): AutomationDraft {
  if (field.target === 'trigger') {
    if (!draft.trigger) return draft;
    return {
      ...draft,
      trigger: {
        ...draft.trigger,
        parameters: {
          ...draft.trigger.parameters,
          [field.key]: value as string | number | boolean | string[],
        },
      },
    };
  }

  if (field.target === 'condition') {
    const isEmpty =
      value === null ||
      value === undefined ||
      (typeof value === 'string' && value.trim().length === 0) ||
      (Array.isArray(value) && value.length === 0);

    // Clearing an optional field removes the condition rather than leaving it
    // empty — the mirror of `draftFromTemplate`'s omission, so a member who
    // fills a field in and then clears it ends up where they started rather
    // than with a draft that will not save.
    if (isEmpty && !field.required) {
      return {
        ...draft,
        conditions: draft.conditions.filter((condition) => condition.id !== field.targetId),
      };
    }

    const existing = draft.conditions.find((condition) => condition.id === field.targetId);

    if (existing) {
      return {
        ...draft,
        conditions: draft.conditions.map((condition) =>
          condition.id === field.targetId ? { ...condition, value } : condition
        ),
      };
    }

    // The condition was omitted as an empty optional and the member has now
    // supplied a value. Re-added from the template so its key and operator are
    // the template's rather than something this function had to guess.
    const template = draft.templateId ? templateById(draft.templateId) : undefined;
    const definition = template?.conditions.find((condition) => condition.id === field.targetId);
    if (!definition) return draft;

    return {
      ...draft,
      conditions: [...draft.conditions, { ...definition, value }],
    };
  }

  return {
    ...draft,
    actions: draft.actions.map((action) =>
      action.id === field.targetId
        ? {
            ...action,
            parameters: {
              ...action.parameters,
              [field.key]: value as string | number | boolean | string[],
            },
          }
        : action
    ),
  };
}
