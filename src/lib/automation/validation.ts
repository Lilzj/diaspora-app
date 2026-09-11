// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Draft validation (Frontend Phase 18, §33 · §43 · §55)
//
// Whether a draft can be saved, and what is wrong with it if not.
//
// ── Why this is separate from `dependencies.ts` ──────────────────────────────
//
// They answer two different questions and a member fixes them in two different
// places:
//
//   validation    "is this a coherent rule?" — a condition with no value, an
//                 action that does not belong to this trigger, an end date
//                 before a start date. **Entirely about the draft.** Pure,
//                 synchronous, no network, no capability set.
//   dependencies  "can this platform run it, for this member, right now?" —
//                 permissions, integrations, gaps, connectivity. Needs the
//                 world.
//
// Keeping them apart means the builder can validate on every keystroke without
// a capability set loaded, and means a test of "is a between-condition missing
// its second value caught?" does not have to construct an access object.
//
// ── `step` is the field that makes the errors useful ─────────────────────────
//
// §33's builder has steps, and an error that cannot say which step it belongs
// to produces the failure mode every long form has: a message at the bottom
// about a field three screens up. Every issue below names its step, and the
// builder scrolls there.
// ─────────────────────────────────────────────────────────────────────────────

import type { AutomationDraft, AutomationValidationIssue } from '@/types/automation';
import { actionDefinition } from './actions';
import { conditionDefinition } from './conditions';
import { triggerDefinition } from './triggers';
import { validateSchedule } from './schedule';

/** Longer than any sensible name and short enough to render in a list row. */
const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 280;

/**
 * Every problem with a draft, in the order the builder presents its steps.
 *
 * `now` is a parameter rather than `Date.now()` so the whole function is pure
 * and the schedule tests can assert against fixed dates.
 */
export function validateDraft(draft: AutomationDraft, now: Date): AutomationValidationIssue[] {
  const issues: AutomationValidationIssue[] = [];

  const error = (step: AutomationValidationIssue['step'], message: string, targetId: string | null = null) =>
    issues.push({ step, targetId, message, severity: 'error' });
  const warn = (step: AutomationValidationIssue['step'], message: string, targetId: string | null = null) =>
    issues.push({ step, targetId, message, severity: 'warning' });

  // ── Name ──────────────────────────────────────────────────────────────────
  //
  // **An empty name is not an error, because it was never treated as one.** The
  // builder has always saved an unnamed rule as its trigger's label — "An event
  // I am going to is starting soon" — while this said "Give this automation a
  // name so you can recognise it later" and the Save button stayed off. Two
  // rules for one field, and the screen showed the label in the box as
  // placeholder text, which reads like a name already filled in. The name the
  // rule will take is now shown under the field instead. Seen on the device on
  // 11 Sep 2026.
  const name = draft.name.trim();
  if (name.length > MAX_NAME_LENGTH) {
    error('name', `The name is too long. Keep it under ${MAX_NAME_LENGTH} characters.`);
  }

  if (draft.description.trim().length > MAX_DESCRIPTION_LENGTH) {
    error('name', `The description is too long. Keep it under ${MAX_DESCRIPTION_LENGTH} characters.`);
  }

  // ── Trigger ───────────────────────────────────────────────────────────────
  const trigger = draft.trigger ? triggerDefinition(draft.trigger.key) : undefined;

  if (!draft.trigger) {
    error('trigger', 'Choose what starts this automation.');
  } else if (!trigger) {
    // A stored automation naming a trigger this build does not know — an app
    // older than the automation, or a server-published template referencing
    // something newer. Failing closed with a readable message beats rendering
    // a row that cannot be opened.
    error('trigger', 'This automation uses a trigger this version of the app does not recognise. Updating the app may help.');
  }

  // ── Scope — §14 · §45 ─────────────────────────────────────────────────────
  if (!draft.scope.ownerId) {
    error('scope', 'This automation has no owner.');
  }

  if (draft.scope.ownerKind === 'community' && draft.scope.communityIds.length === 0) {
    error('scope', 'Choose which community this automation acts in.');
  }

  if (draft.scope.isCrossCommunity && draft.scope.communityIds.length < 2) {
    warn('scope', 'This is marked as spanning communities but only one is selected.');
  }

  if (trigger && !trigger.allowedOwners.includes(draft.scope.ownerKind)) {
    error('scope', 'This trigger cannot be used for this kind of automation.');
  }

  // ── Conditions ────────────────────────────────────────────────────────────
  const seenConditionKeys = new Set<string>();

  for (const condition of draft.conditions) {
    const definition = conditionDefinition(condition.key);

    if (!definition) {
      error('conditions', 'One of the conditions is not recognised by this version of the app.', condition.id);
      continue;
    }

    if (trigger && !trigger.supportedConditions.includes(condition.key)) {
      error('conditions', `“${definition.label}” cannot be used with this trigger.`, condition.id);
    }

    if (!definition.operators.includes(condition.operator)) {
      error('conditions', `“${definition.label}” cannot be compared that way.`, condition.id);
    }

    const needsValue = condition.operator !== 'isTrue' && condition.operator !== 'isFalse';
    if (needsValue && isEmptyValue(condition.value)) {
      error('conditions', `Choose a value for “${definition.label}”.`, condition.id);
    }

    if (
      (condition.operator === 'between' || condition.operator === 'within') &&
      isEmptyValue(condition.secondaryValue ?? null)
    ) {
      error('conditions', `“${definition.label}” needs both ends of the range.`, condition.id);
    }

    if (
      definition.valueKind === 'number' ||
      definition.valueKind === 'money' ||
      definition.valueKind === 'distance'
    ) {
      const numeric = Number(condition.value);
      if (condition.value !== null && Number.isNaN(numeric)) {
        error('conditions', `“${definition.label}” needs a number.`, condition.id);
      } else if (numeric < 0) {
        error('conditions', `“${definition.label}” cannot be negative.`, condition.id);
      }
    }

    // Two conditions on one key are usually a mistake — "country is Nigeria"
    // and "country is Ghana" match nothing, because conditions are ANDed. A
    // warning rather than an error: a range expressed as two conditions is a
    // legitimate use of the same key twice, and refusing it would be the UI
    // second-guessing something reasonable.
    if (seenConditionKeys.has(condition.key)) {
      warn(
        'conditions',
        `You have more than one “${definition.label}” condition. All conditions have to be true at once, so this may never match.`,
        condition.id
      );
    }
    seenConditionKeys.add(condition.key);
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  if (draft.actions.length === 0) {
    error('actions', 'Choose at least one thing for this automation to do.');
  }

  const seenActionKeys = new Set<string>();

  for (const action of draft.actions) {
    const definition = actionDefinition(action.key);

    if (!definition) {
      error('actions', 'One of the actions is not recognised by this version of the app.', action.id);
      continue;
    }

    if (trigger && !trigger.supportedActions.includes(action.key)) {
      error('actions', `“${definition.label}” cannot be used with this trigger.`, action.id);
    }

    if (!definition.allowedOwners.includes(draft.scope.ownerKind)) {
      error('actions', `“${definition.label}” cannot be used for this kind of automation.`, action.id);
    }

    // The same action twice is always a mistake, and unlike a repeated
    // condition there is no legitimate reading: two identical notifications is
    // never what somebody meant, and §39's whole subject is not doing things
    // twice.
    if (seenActionKeys.has(action.key)) {
      error('actions', `“${definition.label}” is added more than once.`, action.id);
    }
    seenActionKeys.add(action.key);

    if (definition.notificationChannel && action.channel) {
      // A channel override has to be a channel the action can actually use.
      if (action.channel !== definition.notificationChannel && !isCompatibleChannel(action.channel)) {
        error('actions', `“${definition.label}” cannot be sent that way.`, action.id);
      }
    }
  }

  // ── Schedule — §41 · §43 ──────────────────────────────────────────────────
  if (draft.schedule) {
    issues.push(...validateSchedule(draft.schedule, now));
  }

  // An event-relative schedule needs an event-relative trigger, and the reverse.
  // Getting this wrong produces an automation that looks configured and has no
  // moment to fire at.
  if (draft.schedule?.frequency === 'eventRelative' && trigger && trigger.delivery !== 'schedule') {
    warn(
      'schedule',
      'This trigger does not run relative to an event, so the offset you have set will be ignored.'
    );
  }

  if (trigger?.delivery === 'schedule' && !draft.schedule) {
    error('schedule', 'This trigger runs on a schedule, so it needs one.');
  }

  return issues;
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** The channels an action may be overridden to. B13's member-facing set. */
function isCompatibleChannel(channel: string): boolean {
  return channel === 'InApp' || channel === 'Push' || channel === 'Email';
}

/** Whether a draft can be saved at all. Warnings never block. */
export function canSaveDraft(issues: readonly AutomationValidationIssue[]): boolean {
  return !issues.some((issue) => issue.severity === 'error');
}

/** The first blocking issue, for the "fix this" affordance. */
export function firstBlockingIssue(
  issues: readonly AutomationValidationIssue[]
): AutomationValidationIssue | null {
  return issues.find((issue) => issue.severity === 'error') ?? null;
}

/** Issues for one step, so a step can render its own state. */
export function issuesForStep(
  issues: readonly AutomationValidationIssue[],
  step: AutomationValidationIssue['step']
): AutomationValidationIssue[] {
  return issues.filter((issue) => issue.step === step);
}
