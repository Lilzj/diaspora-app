// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Condition catalogue (Frontend Phase 18, §9)
//
// Every IF the builder can offer.
//
// ── The field that does the work ─────────────────────────────────────────────
//
// §9 ends with one instruction: **"Do not execute sensitive conditions solely
// on client-side data."** `requiresServerEvaluation` is that instruction as a
// field, and it is true for every condition whose answer a member could change
// locally to gain something they should not have.
//
// The test applied to each entry below was: *if the client answered this and
// the client was lying, what would happen?*
//
//   "Country is Nigeria"        → they get a notification they wanted. Nothing
//                                 is gained. Client evaluation is fine.
//   "Wallet balance above £100" → they trigger something gated on having money.
//                                 Server only.
//   "My subscription is active" → they get a paid capability. Server only.
//   "Application status is
//    Shortlisted"               → they learn a status. It is *their* status, but
//                                 the client's copy can be stale, and a rule
//                                 firing on a stale copy is a member told they
//                                 were shortlisted when they were not. Server.
//
// The third case is the interesting one, and it is why the field is named for
// *where it must be evaluated* rather than for *whether it is a permission*.
// Some conditions need the server for correctness rather than for security, and
// a field called `isPrivileged` would have got them wrong.
//
// ── `isSensitive` is a different question ────────────────────────────────────
//
// Whether the *value* is personal, which governs logging and analytics rather
// than evaluation. A distance is not sensitive; a wallet balance is; a
// neighbourhood is. §50 and §52 both depend on it, and the two flags are
// genuinely independent: `country` is neither, `walletBalance` is both,
// `applicationStatus` needs the server and is sensitive, `metricAbove` needs
// the server and is not.
//
// ── Why there is no message-content condition ────────────────────────────────
//
// §9's candidate list does not include one and §29 forbids exposing message
// content unnecessarily, but the absence is worth stating: a condition over
// message text would be a content filter running across private conversations,
// and once the field existed somebody would populate it. There is no entry
// below that reads a message body, and `conversation.*` triggers offer only
// counts and timestamps.
// ─────────────────────────────────────────────────────────────────────────────

import type { AutomationConditionDefinition, AutomationDomainKey } from '@/types/automation';

export const CONDITION_CATALOG: AutomationConditionDefinition[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // PLACE — §9 · §14 · §15
  // ═══════════════════════════════════════════════════════════════════════════

  {
    key: 'country',
    domain: 'community',
    label: 'Country',
    description: 'Only run for a country you choose.',
    valueKind: 'country',
    operators: ['equals', 'notEquals', 'includes'],
    support: 'CONNECTED',
    gapKey: null,
    // The country on a piece of content is public and on the item itself. A
    // client that filtered wrongly would show a member the wrong notification
    // and gain nothing by it.
    requiresServerEvaluation: false,
    isSensitive: false,
  },
  {
    key: 'community',
    domain: 'community',
    label: 'Community',
    description: 'Only run for one of the communities you belong to or follow.',
    valueKind: 'community',
    operators: ['equals', 'includes', 'excludes'],
    support: 'PARTIAL',
    gapKey: 'communityTriggers',
    // Membership is a permission. A member who could assert membership locally
    // could receive community-scoped content they are not entitled to, so the
    // server decides — §46, and Phase 13's rule that community state is never
    // trusted from the client.
    requiresServerEvaluation: true,
    isSensitive: false,
  },
  {
    key: 'neighbourhood',
    domain: 'location',
    label: 'Neighbourhood',
    description: 'Only run for a specific area.',
    valueKind: 'neighbourhood',
    operators: ['equals', 'includes'],
    support: 'CONNECTED',
    gapKey: null,
    requiresServerEvaluation: false,
    // Where somebody lives or looks for a home. §50.
    isSensitive: true,
  },
  {
    key: 'distance',
    domain: 'location',
    label: 'Distance from a place',
    description: 'Only run when something is within a distance of a place you choose.',
    valueKind: 'distance',
    operators: ['lessThan', 'greaterThan', 'within'],
    support: 'CONNECTED',
    gapKey: null,
    // Computed from a place the member picked and a coordinate on the item,
    // both of which the client already has. Phase 8's `utils/geo.ts` does the
    // arithmetic and there is no second implementation.
    requiresServerEvaluation: false,
    isSensitive: true,
    unit: 'km',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTENT
  // ═══════════════════════════════════════════════════════════════════════════

  {
    key: 'category',
    domain: 'search',
    label: 'Category',
    description: 'Only run for a category you choose.',
    valueKind: 'category',
    operators: ['equals', 'includes', 'excludes'],
    support: 'CONNECTED',
    gapKey: null,
    requiresServerEvaluation: false,
    isSensitive: false,
  },
  {
    key: 'eventType',
    domain: 'events',
    label: 'Kind of event',
    description: 'Only run for a kind of event — social, professional, religious, and so on.',
    valueKind: 'choice',
    operators: ['equals', 'includes'],
    support: 'CONNECTED',
    gapKey: null,
    choices: [
      { value: 'social', label: 'Social' },
      { value: 'professional', label: 'Professional' },
      { value: 'cultural', label: 'Cultural' },
      { value: 'religious', label: 'Religious' },
      { value: 'educational', label: 'Educational' },
      { value: 'sports', label: 'Sports' },
      { value: 'volunteer', label: 'Volunteering' },
    ],
    requiresServerEvaluation: false,
    // A religious event preference is a belief signal. It is the member's own
    // rule and stays private to them, and §52 keeps it out of analytics.
    isSensitive: true,
  },
  {
    key: 'urgency',
    domain: 'community',
    label: 'Urgency',
    description: 'Only run for updates at or above an urgency level.',
    valueKind: 'choice',
    operators: ['equals', 'greaterThan'],
    support: 'CONNECTED',
    gapKey: null,
    choices: [
      { value: 'low', label: 'Low' },
      { value: 'normal', label: 'Normal' },
      { value: 'high', label: 'High' },
      { value: 'critical', label: 'Urgent' },
    ],
    requiresServerEvaluation: false,
    isSensitive: false,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIME — §42
  // ═══════════════════════════════════════════════════════════════════════════

  {
    key: 'dayOfWeek',
    domain: 'events',
    label: 'Day of the week',
    description: 'Only run on the days you choose.',
    valueKind: 'dayOfWeek',
    operators: ['includes', 'excludes'],
    support: 'CONNECTED',
    gapKey: null,
    // Evaluated in the automation's own timezone, never the device's — the
    // schedule carries the zone and `schedule.ts` resolves it. A "weekdays only"
    // rule that used the device's clock would fire on Sunday evening for a
    // member who had flown east.
    requiresServerEvaluation: false,
    isSensitive: false,
  },
  {
    key: 'timeOfDay',
    domain: 'events',
    label: 'Time of day',
    description: 'Only run between two times.',
    valueKind: 'time',
    operators: ['between'],
    support: 'CONNECTED',
    gapKey: null,
    requiresServerEvaluation: false,
    isSensitive: false,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MONEY AND NUMBERS — §9 · §48
  // ═══════════════════════════════════════════════════════════════════════════

  {
    key: 'priceBelow',
    domain: 'marketplace',
    label: 'Price is below',
    description: 'Only run when the price is under an amount you set.',
    valueKind: 'money',
    operators: ['lessThan'],
    support: 'CONNECTED',
    gapKey: null,
    // The price is on the item and is public. This is a filter, not an
    // entitlement.
    requiresServerEvaluation: false,
    // A budget. Personal, and kept out of analytics by §52.
    isSensitive: true,
  },
  {
    key: 'priceAbove',
    domain: 'marketplace',
    label: 'Price is above',
    description: 'Only run when the price is over an amount you set.',
    valueKind: 'money',
    operators: ['greaterThan'],
    support: 'CONNECTED',
    gapKey: null,
    requiresServerEvaluation: false,
    isSensitive: true,
  },
  {
    key: 'amountAbove',
    domain: 'wallet',
    label: 'Amount is above',
    description: 'Only run for payments over an amount you set.',
    valueKind: 'money',
    operators: ['greaterThan'],
    support: 'BACKEND_GAP',
    gapKey: 'financialTriggers',
    // A financial figure. §9 and §48 both put this server-side, and the client
    // never sees the comparison happen.
    requiresServerEvaluation: true,
    isSensitive: true,
  },
  {
    key: 'walletBalance',
    domain: 'wallet',
    label: 'My balance is',
    description: 'Only run when your balance is above or below an amount.',
    valueKind: 'money',
    operators: ['greaterThan', 'lessThan'],
    support: 'BACKEND_GAP',
    gapKey: 'financialTriggers',
    requiresServerEvaluation: true,
    isSensitive: true,
  },
  {
    key: 'paymentKind',
    domain: 'wallet',
    label: 'Kind of payment',
    description: 'Only run for a kind of payment.',
    valueKind: 'choice',
    operators: ['equals', 'includes'],
    support: 'BACKEND_GAP',
    gapKey: 'financialTriggers',
    choices: [
      { value: 'purchase', label: 'Purchase' },
      { value: 'subscription', label: 'Subscription' },
      { value: 'donation', label: 'Donation' },
      { value: 'contribution', label: 'Contribution' },
      { value: 'refund', label: 'Refund' },
      { value: 'reward', label: 'Reward' },
    ],
    requiresServerEvaluation: true,
    isSensitive: true,
  },
  {
    key: 'countAbove',
    domain: 'analytics',
    label: 'Count is above',
    description: 'Only run once a count passes a number you set.',
    valueKind: 'number',
    operators: ['greaterThan'],
    support: 'BACKEND_GAP',
    gapKey: 'analyticsThresholds',
    requiresServerEvaluation: true,
    isSensitive: false,
  },
  {
    key: 'ratingBelow',
    domain: 'providers',
    label: 'Rating is below',
    description: 'Only run for reviews under a rating you set.',
    valueKind: 'number',
    operators: ['lessThan'],
    support: 'CONNECTED',
    gapKey: null,
    requiresServerEvaluation: false,
    isSensitive: false,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS — the entitlement family. Every one is server-evaluated.
  // ═══════════════════════════════════════════════════════════════════════════

  {
    key: 'applicationStatus',
    domain: 'jobs',
    label: 'Application status is',
    description: 'Only run when an application reaches a status you choose.',
    valueKind: 'choice',
    operators: ['equals', 'includes'],
    support: 'BACKEND_GAP',
    gapKey: 'jobTriggers',
    choices: [
      { value: 'submitted', label: 'Submitted' },
      { value: 'reviewing', label: 'Being reviewed' },
      { value: 'shortlisted', label: 'Shortlisted' },
      { value: 'interviewing', label: 'Interviewing' },
      { value: 'offered', label: 'Offered' },
      { value: 'rejected', label: 'Not successful' },
      { value: 'withdrawn', label: 'Withdrawn' },
    ],
    // Correctness rather than security: it is the member's own status, but a
    // stale client copy would fire "you were shortlisted" for somebody who was
    // not. See the file header.
    requiresServerEvaluation: true,
    isSensitive: true,
  },
  {
    key: 'subscriptionActive',
    domain: 'monetization',
    label: 'My subscription is active',
    description: 'Only run while a subscription of yours is running.',
    valueKind: 'boolean',
    operators: ['isTrue', 'isFalse'],
    support: 'BACKEND_GAP',
    gapKey: 'monetizationTriggers',
    requiresServerEvaluation: true,
    isSensitive: true,
  },
  {
    key: 'creatorStatus',
    domain: 'creator',
    label: 'My creator level is',
    description: 'Only run at or above a creator level.',
    valueKind: 'choice',
    operators: ['equals', 'greaterThan'],
    support: 'BACKEND_GAP',
    gapKey: 'creatorTriggers',
    choices: [
      { value: 'contributor', label: 'Contributor' },
      { value: 'creator', label: 'Creator' },
      { value: 'verified', label: 'Verified creator' },
      { value: 'top', label: 'Top creator' },
    ],
    requiresServerEvaluation: true,
    isSensitive: false,
  },
  {
    key: 'listingStatus',
    domain: 'marketplace',
    label: 'Listing status is',
    description: 'Only run when a listing is in a state you choose.',
    valueKind: 'choice',
    operators: ['equals', 'includes'],
    support: 'BACKEND_GAP',
    gapKey: 'marketplaceTriggers',
    choices: [
      { value: 'active', label: 'Active' },
      { value: 'reserved', label: 'Reserved' },
      { value: 'sold', label: 'Sold' },
      { value: 'expired', label: 'Expired' },
    ],
    requiresServerEvaluation: true,
    isSensitive: false,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ANALYTICS — §27. Server-evaluated by definition.
  // ═══════════════════════════════════════════════════════════════════════════

  {
    key: 'metricAbove',
    domain: 'analytics',
    label: 'A figure goes above',
    description: 'Only run when one of your figures passes a number. Checked by Diaspora, not on your phone.',
    valueKind: 'number',
    operators: ['greaterThan'],
    support: 'BACKEND_GAP',
    gapKey: 'analyticsThresholds',
    // §27: frontend analytics are not authoritative triggers. This is the
    // canonical case — a number the client could compute and must not.
    requiresServerEvaluation: true,
    isSensitive: false,
  },
  {
    key: 'metricBelow',
    domain: 'analytics',
    label: 'A figure drops below',
    description: 'Only run when one of your figures falls under a number.',
    valueKind: 'number',
    operators: ['lessThan'],
    support: 'BACKEND_GAP',
    gapKey: 'analyticsThresholds',
    requiresServerEvaluation: true,
    isSensitive: false,
  },
];

const BY_KEY = new Map<string, AutomationConditionDefinition>(
  CONDITION_CATALOG.map((condition) => [condition.key, condition])
);

export function conditionDefinition(key: string): AutomationConditionDefinition | undefined {
  return BY_KEY.get(key);
}

/**
 * The conditions a trigger offers, in catalogue order.
 *
 * Ordered by the *catalogue* rather than by the trigger's list so the same
 * conditions appear in the same order under every trigger — a picker whose
 * order changed per trigger would be a picker nobody learned.
 */
export function conditionsForTrigger(supportedKeys: readonly string[]): AutomationConditionDefinition[] {
  const allowed = new Set(supportedKeys);
  return CONDITION_CATALOG.filter((condition) => allowed.has(condition.key));
}

export function conditionsByDomain(): Map<AutomationDomainKey, AutomationConditionDefinition[]> {
  const grouped = new Map<AutomationDomainKey, AutomationConditionDefinition[]>();
  for (const condition of CONDITION_CATALOG) {
    const existing = grouped.get(condition.domain);
    if (existing) existing.push(condition);
    else grouped.set(condition.domain, [condition]);
  }
  return grouped;
}

/** Whether any condition in a set needs the server. Drives the preview's note. */
export function anyRequiresServerEvaluation(keys: readonly string[]): boolean {
  return keys.some((key) => BY_KEY.get(key)?.requiresServerEvaluation === true);
}

/** Whether any condition in a set holds a personal value. Drives §50's notice. */
export function anyIsSensitive(keys: readonly string[]): boolean {
  return keys.some((key) => BY_KEY.get(key)?.isSensitive === true);
}

/**
 * Human wording for an operator, for the preview and the run detail.
 *
 * Kept here rather than in a component so the builder's summary and the run
 * detail's explanation cannot drift into two vocabularies for one comparison.
 */
export const OPERATOR_LABELS: Record<string, string> = {
  equals: 'is',
  notEquals: 'is not',
  includes: 'is one of',
  excludes: 'is not one of',
  greaterThan: 'is more than',
  lessThan: 'is less than',
  between: 'is between',
  within: 'is within',
  isTrue: 'is true',
  isFalse: 'is false',
};
