// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Dependency check and preview (Frontend Phase 18, §34 · §54 · §55)
//
// §55 asks for nine things to be checked before an automation is activated, and
// §34 asks for the result to be shown to the member in words. This is both, in
// one pass, because two implementations would eventually disagree about whether
// an automation could be activated — and the one that said yes would win.
//
// ── The distinction the whole module turns on ────────────────────────────────
//
// §55 ends with the instruction that makes this phase's UX honest:
//
//     "If backend capability is missing: allow frontend configuration where
//      appropriate, but clearly classify: BACKEND_GAP"
//
// So a dependency has three states, not two:
//
//   `met`      nothing to do.
//   `missing`  **the member** must act. Connect a calendar, allow notifications,
//              choose a community. Blocks activation, because activating would
//              produce an automation that cannot work and nobody would know why.
//   `gap`      **the platform** must act. Does *not* block activation, is never
//              rendered in the register of things the member did wrong, and
//              carries its gap id so the notice can name it.
//
// Conflating `gap` with `missing` would be §77's forbidden move — disguising a
// backend gap as a frontend defect — and the member-visible consequence is
// real: they would see "you need to fix 4 things" for four things they cannot
// fix.
//
// ── Why `canActivate` is true for a gap-only automation ──────────────────────
//
// Because the configuration is genuinely complete and genuinely durable. §34
// asks the preview to say "Frontend configured — backend automation capability
// pending", which is a statement that the member has finished. Refusing to save
// would throw away work that will start functioning the day the platform ships,
// and would make the automation centre a list of things that are not allowed to
// exist yet.
// ─────────────────────────────────────────────────────────────────────────────

import { AUTOMATION_GAPS } from '@/config/automation-gaps';
import { allCountries } from '@/mocks/countries';
import type {
  AutomationAccess,
  AutomationAudience,
  AutomationConditionOutcome,
  AutomationDependency,
  AutomationDraft,
  AutomationPreview,
  AutomationSupportStatus,
} from '@/types/automation';
import { weakestSupport } from '@/types/automation';
import { actionDefinition, anyReachesOtherPeople, channelsForActions } from './actions';
import { conditionDefinition, anyRequiresServerEvaluation, OPERATOR_LABELS } from './conditions';
import { triggerDefinition, firesInBackground } from './triggers';
import { canUseAction, canUseTrigger } from './access';
import {
  resolvePartSupport,
  type CatalogPartKind,
  type ServedSupportLookup,
} from './served-support';
import { describeSchedule, validateSchedule } from './schedule';

/** What the check needs to know about the world outside the draft. */
export interface DependencyContext {
  access: AutomationAccess | null;
  /** Which Phase 16 integrations are connected and usable, by capability name. */
  connectedIntegrations: string[];
  /** Whether push is registered and permitted on this device. */
  pushEnabled: boolean;
  /** Whether the member has a verified email. */
  emailVerified: boolean;
  /** Which B13 channels the member has switched on. §53. */
  enabledChannels: string[];
  /** The server's audience answer, when one has been fetched. §34. */
  audience: AutomationAudience | null;
  isOffline: boolean;
  now: Date;
  /**
   * What the deployment says it can observe and do — Phase 5.
   *
   * **Every support decision below used to read a constant compiled into the
   * app.** Measured against the live catalogue on 11 Sep 2026: 59 of the 83
   * parts this build declares as gaps are served by the deployment. So a member
   * building a rule out of working parts was told "Diaspora cannot do this
   * automatically yet" about an action it does today, and "Diaspora cannot check
   * this yet, so it will be ignored" about a condition it checks.
   *
   * Optional. Absent means "use what this build declared", which is the honest
   * fallback while the catalogue has not answered and the only safe one if it
   * never does.
   */
  servedSupport?: ServedSupportLookup;
  /**
   * Whether this deployment runs schedules — `AutomationSupport.hasScheduler`,
   * true when it serves `reminder.schedule`, the action its scheduler sweeps for.
   *
   * Optional, and absent means "not known to", so a schedule keeps saying it
   * cannot run yet until the deployment has said otherwise.
   */
  hasScheduler?: boolean;
  /**
   * Whether "Location while the app is open" is on (`GET /location/me/presence`).
   * Undefined until the server has answered — never read as off.
   */
  presenceEnabled?: boolean;
}

/** One part's status: the deployment's answer where there is one. */
function statusOf(
  context: DependencyContext,
  kind: CatalogPartKind,
  key: string,
  declared: AutomationSupportStatus
): AutomationSupportStatus {
  return context.servedSupport
    ? resolvePartSupport(context.servedSupport, kind, key, declared)
    : declared;
}

/**
 * Every §55 check, as a list.
 *
 * Ordered by what a member would fix first: what it does, then whether they may
 * do it, then what it needs, then when it runs. A dependency list ordered by
 * internal category would make somebody read all of it to find the one thing
 * they have to change.
 */
export function checkDependencies(
  draft: AutomationDraft,
  context: DependencyContext
): AutomationDependency[] {
  const dependencies: AutomationDependency[] = [];

  const trigger = draft.trigger ? triggerDefinition(draft.trigger.key) : undefined;
  const actions = draft.actions.map((action) => actionDefinition(action.key)).filter(isDefined);
  const conditions = draft.conditions
    .map((condition) => conditionDefinition(condition.key))
    .filter(isDefined);

  // ── 1. Trigger available ──────────────────────────────────────────────────
  if (!trigger) {
    dependencies.push({
      kind: 'trigger',
      label: 'Choose what starts this',
      state: 'missing',
      detail: 'Every automation needs something to set it off.',
      actionLabel: 'Choose a trigger',
      actionRoute: null,
      gapId: null,
      blocksActivation: true,
    });
  } else {
    dependencies.push(triggerDependency(trigger.key, context));

    // §8's honesty requirement, surfaced rather than left in a data file: a
    // member should know before activating that a device-local trigger cannot
    // fire while the app is closed.
    if (!firesInBackground(trigger)) {
      dependencies.push({
        kind: 'trigger',
        label: 'Runs only while Diaspora is open',
        state: 'met',
        detail:
          'This kind of trigger is noticed by your phone rather than by Diaspora’s servers, so it can only happen while the app is running.',
        actionLabel: null,
        actionRoute: null,
        gapId: null,
        blocksActivation: false,
      });
    }
  }

  // ── 2. Permission to use it ───────────────────────────────────────────────
  if (trigger && !canUseTrigger(trigger, draft.scope.ownerKind, context.access)) {
    dependencies.push({
      kind: 'permission',
      label: 'You do not have permission to use this trigger',
      state: 'missing',
      detail:
        'Your role in this space does not allow this. An administrator here can check your permissions.',
      actionLabel: null,
      actionRoute: null,
      gapId: null,
      blocksActivation: true,
    });
  }

  // ── 2b. Somebody to reach ─────────────────────────────────────────────────
  //
  // Different from permission, and it reads differently too: the member may do
  // this, there is simply nobody on the other end yet. A community Diaspora has
  // not opened has its founder and nobody else.
  //
  // Only raised for actions that reach other people — "Tell me" is unaffected by
  // an empty community, and warning about it would be noise.
  // `provenance === 'server'` is load-bearing. A capabilities call that failed
  // leaves every field of `noAutomationAccess()` false, including this one — and
  // saying "there is nobody for this to reach" because the request timed out is
  // inventing a refusal the platform never made. Unanswered is not no.
  if (
    context.access?.provenance === 'server' &&
    !context.access.canReachMembers &&
    actions.some((action) => action.reachesOtherPeople)
  ) {
    dependencies.push({
      kind: 'permission',
      label: 'There is nobody for this to reach yet',
      state: 'missing',
      // The platform's sentence, shown as written. It knows why — not opened
      // yet, suspended, closed — and this does not try to guess which.
      detail:
        context.access.reachRefusal ??
        'This automation can be saved, but there is nobody it could notify yet.',
      actionLabel: null,
      actionRoute: null,
      gapId: null,

      // **Not a block.** The rule is correct and will start working the moment
      // the scope has members; refusing to save it would make the member come
      // back and build it again. They are told, and they decide.
      blocksActivation: false,
    });
  }

  for (const action of actions) {
    if (!canUseAction(action, draft.scope.ownerKind, context.access)) {
      dependencies.push({
        kind: 'permission',
        label: `You do not have permission to “${action.label}”`,
        state: 'missing',
        detail: 'Your role in this space does not allow this action.',
        actionLabel: null,
        actionRoute: null,
        gapId: null,
        blocksActivation: true,
      });
    }
  }

  // ── 3. Actions supported ──────────────────────────────────────────────────
  if (draft.actions.length === 0) {
    dependencies.push({
      kind: 'action',
      label: 'Choose what should happen',
      state: 'missing',
      detail: 'An automation with nothing to do would never do anything.',
      actionLabel: 'Add an action',
      actionRoute: null,
      gapId: null,
      blocksActivation: true,
    });
  }

  for (const action of actions) {
    if (statusOf(context, 'action', action.key, action.support) === 'BACKEND_GAP' && action.gapKey) {
      const gap = AUTOMATION_GAPS[action.gapKey];
      dependencies.push({
        kind: 'action',
        label: action.label,
        state: 'gap',
        detail: `Diaspora cannot do this automatically yet. Your setup is saved and will start working when it can.`,
        actionLabel: null,
        actionRoute: null,
        gapId: gap?.id ?? null,
        blocksActivation: false,
      });
    } else {
      // §55 lists "Action supported" as a check, so a supported action reports
      // itself rather than being silent. Without this the dependency list is
      // asymmetric — the trigger always appears and the actions only appear
      // when something is wrong, which reads as though the actions were not
      // checked at all.
      dependencies.push({
        kind: 'action',
        label: action.label,
        state: 'met',
        detail: action.description,
        actionLabel: null,
        actionRoute: null,
        gapId: null,
        blocksActivation: false,
      });
    }
  }

  // ── 4. Conditions supported ───────────────────────────────────────────────
  for (const condition of conditions) {
    if (
      statusOf(context, 'condition', condition.key, condition.support) === 'BACKEND_GAP' &&
      condition.gapKey
    ) {
      const gap = AUTOMATION_GAPS[condition.gapKey];
      dependencies.push({
        kind: 'condition',
        label: condition.label,
        state: 'gap',
        detail: 'Diaspora cannot check this yet, so it will be ignored until it can.',
        actionLabel: null,
        actionRoute: null,
        gapId: gap?.id ?? null,
        blocksActivation: false,
      });
    }
  }

  // §9, made visible: a member should know which of their conditions Diaspora
  // checks for itself. It is also what makes the simulation's
  // "serverEvaluationRequired" result comprehensible rather than alarming.
  if (anyRequiresServerEvaluation(draft.conditions.map((condition) => condition.key))) {
    dependencies.push({
      kind: 'condition',
      label: 'Some conditions are checked by Diaspora',
      state: 'met',
      detail:
        'Conditions about money, roles or statuses are checked on Diaspora’s servers rather than on your phone, so they are always based on the real, current answer.',
      actionLabel: null,
      actionRoute: null,
      gapId: null,
      blocksActivation: false,
    });
  }

  // ── 5. Integrations connected — §54 ───────────────────────────────────────
  const requiredIntegrations = new Set<string>([
    ...(trigger?.requiredIntegrations ?? []),
    ...actions.flatMap((action) => action.requiredIntegrations),
  ]);

  for (const integration of requiredIntegrations) {
    dependencies.push(integrationDependency(integration, context));
  }

  // ── 6. Notification preferences — §53 ─────────────────────────────────────
  const channels = channelsForActions(draft.actions.map((action) => action.key));
  for (const channel of channels) {
    if (!context.enabledChannels.includes(channel)) {
      dependencies.push({
        kind: 'permission',
        label: `${friendlyChannel(channel)} is switched off`,
        state: 'missing',
        detail:
          'This automation would send you something on a channel you have turned off, so you would not receive it. Turn it on, or choose a different way to be told.',
        actionLabel: 'Notification settings',
        actionRoute: '/settings/notifications',
        gapId: null,
        // Deliberately does **not** block. §53 forbids an automation
        // overriding a member's preferences, and blocking activation would put
        // pressure on them to change a setting they chose. Warning is the
        // correct strength.
        blocksActivation: false,
      });
    }
  }

  // ── 7. Scope valid — §14 · §45 ────────────────────────────────────────────
  if (draft.scope.ownerKind === 'community' && draft.scope.communityIds.length === 0) {
    dependencies.push({
      kind: 'scope',
      label: 'Choose which community this acts in',
      state: 'missing',
      detail:
        'You belong to more than one community, so an automation has to say which one it works in.',
      actionLabel: 'Choose a community',
      actionRoute: null,
      gapId: null,
      blocksActivation: true,
    });
  }

  // ── 8. Audience known — §34 ───────────────────────────────────────────────
  if (anyReachesOtherPeople(draft.actions.map((action) => action.key))) {
    const audience = context.audience;
    if (!audience || audience.provenance !== 'server') {
      dependencies.push({
        kind: 'scope',
        label: 'Who this reaches is not known yet',
        state: 'gap',
        detail:
          'Diaspora cannot work out how many people this would reach yet. It will only ever be sent to people who are eligible and who have not turned these notifications off.',
        actionLabel: null,
        actionRoute: null,
        gapId: AUTOMATION_GAPS.audienceEvaluation?.id ?? null,
        blocksActivation: false,
      });
    }
  }

  // ── 9. Schedule valid — §41 · §43 ─────────────────────────────────────────
  if (draft.schedule) {
    const scheduleIssues = validateSchedule(draft.schedule, context.now);
    const blocking = scheduleIssues.filter((issue) => issue.severity === 'error');

    if (blocking.length > 0) {
      dependencies.push({
        kind: 'schedule',
        label: 'The schedule needs fixing',
        state: 'missing',
        detail: blocking[0].message,
        actionLabel: 'Edit the schedule',
        actionRoute: null,
        gapId: null,
        blocksActivation: true,
      });
    } else if (context.hasScheduler) {
      // **This used to be a gap whatever the deployment said**, under a comment
      // that "the scheduler does not exist". It has existed since Wave C-02 —
      // `AutomationSchedulerWorker`, durable occurrences, missed-run counting —
      // and every schedule a member set was still told "Diaspora cannot run
      // things on a schedule yet", with the whole automation marked as waiting
      // on Diaspora. Found on the device on 11 Sep 2026.
      dependencies.push({
        kind: 'schedule',
        label: describeSchedule(draft.schedule),
        state: 'met',
        detail: `Diaspora runs this at these times, in ${draft.schedule.timezone.label}.`,
        actionLabel: null,
        actionRoute: null,
        gapId: null,
        blocksActivation: false,
      });
    } else {
      dependencies.push({
        kind: 'schedule',
        label: describeSchedule(draft.schedule),
        // Only while this deployment has not said it runs schedules. Saying so
        // is what stops the preview implying a daily reminder starts tomorrow.
        state: 'gap',
        detail:
          'Diaspora cannot run things on a schedule yet. Your times are saved and will be used when it can.',
        actionLabel: null,
        actionRoute: null,
        gapId: AUTOMATION_GAPS.automationScheduler?.id ?? null,
        blocksActivation: false,
      });
    }
  }

  // ── 10. Offline — §61 ─────────────────────────────────────────────────────
  if (context.isOffline) {
    dependencies.push({
      kind: 'backend',
      label: 'You are offline',
      state: 'missing',
      detail:
        'Your changes are held on this device. Nothing has been sent to Diaspora, and this automation is not running yet.',
      actionLabel: null,
      actionRoute: null,
      gapId: null,
      // Blocks, and the wording above is the reason: §61 forbids claiming a
      // server-side automation has been activated while offline, so the only
      // honest options are to block or to lie.
      blocksActivation: true,
    });
  }

  return dependencies;
}

function triggerDependency(triggerKey: string, context: DependencyContext): AutomationDependency {
  const trigger = triggerDefinition(triggerKey);
  if (!trigger) {
    return {
      kind: 'trigger',
      label: 'Unknown trigger',
      state: 'missing',
      detail: 'This automation uses something this version of the app does not recognise.',
      actionLabel: null,
      actionRoute: null,
      gapId: null,
      blocksActivation: true,
    };
  }

  // The deployment's answer, not the constant this build shipped with. Missed on
  // the first pass — actions and conditions were repointed and this was not, and
  // the preview card went on saying "Diaspora cannot watch for this yet" over an
  // automation whose own overall support had already flipped to CONNECTED. The
  // test that caught it asserts `limitations` rather than `support`, which is
  // why it saw what the summary flag hid.
  const triggerSupport = statusOf(context, 'trigger', trigger.key, trigger.support);

  if (triggerSupport === 'CONNECTED' || triggerSupport === 'DEVELOPMENT') {
    return {
      kind: 'trigger',
      label: trigger.label,
      state: 'met',
      detail: trigger.description,
      actionLabel: null,
      actionRoute: null,
      gapId: null,
      blocksActivation: false,
    };
  }

  const gap = trigger.gapKey ? AUTOMATION_GAPS[trigger.gapKey] : undefined;
  return {
    kind: 'trigger',
    label: trigger.label,
    state: 'gap',
    detail:
      'Diaspora cannot watch for this yet. Your setup is complete and saved, and it will start working when it can.',
    actionLabel: null,
    actionRoute: null,
    gapId: gap?.id ?? null,
    blocksActivation: false,
  };
}

/**
 * §54's "the UI must explain missing dependencies", per integration.
 *
 * The three cases are genuinely different and each gets its own wording: a
 * permission the member can grant, a connection they can make, and a capability
 * that does not exist. Rendering all three as "not connected" would send
 * somebody to a settings screen that cannot help them.
 */
function integrationDependency(
  integration: string,
  context: DependencyContext
): AutomationDependency {
  switch (integration) {
    case 'push':
      return context.pushEnabled
        ? met('integration', 'Push notifications', 'Ready to use.')
        : {
            kind: 'integration',
            label: 'Push notifications',
            state: 'missing',
            detail: 'Allow notifications so this automation can reach you.',
            actionLabel: 'Set up push',
            actionRoute: '/settings/integrations/push',
            gapId: null,
            blocksActivation: false,
          };

    case 'email':
      return context.emailVerified
        ? met('integration', 'Email', 'Ready to use.')
        : {
            kind: 'integration',
            label: 'Email',
            state: 'missing',
            detail: 'Confirm your email address so this automation can email you.',
            actionLabel: 'Confirm email',
            actionRoute: '/settings/integrations/email',
            gapId: null,
            blocksActivation: false,
          };

    case 'calendar':
      return context.connectedIntegrations.includes('calendar')
        ? met('integration', 'Calendar', 'Connected.')
        : {
            kind: 'integration',
            label: 'Calendar',
            state: 'missing',
            detail: 'Connect a calendar so events can be added to it.',
            actionLabel: 'Connect a calendar',
            actionRoute: '/settings/integrations/calendar',
            gapId: null,
            blocksActivation: false,
          };

    case 'location.presence':
      // `location.enteredArea` is noticed only from the foreground presence
      // report, which is off unless the member switches it on. Not blocking —
      // the rule saves and is ready the moment it is switched on — but said
      // before activation, with the way to switch it on. `undefined` is "not
      // known yet", and is not read as off.
      return context.presenceEnabled === true
        ? met(
            'integration',
            'Location while the app is open',
            'On. Arrivals are noticed while Diaspora is open on your phone.'
          )
        : {
            kind: 'integration',
            label: 'Location while the app is open',
            state: 'missing',
            detail:
              context.presenceEnabled === false
                ? 'This only works while “Location while the app is open” is on, and it is off. It is read only while Diaspora is open, coarse, and no history is kept.'
                : 'This only works while “Location while the app is open” is on. Diaspora could not check your setting just now.',
            actionLabel: 'Turn it on',
            actionRoute: '/settings/presence',
            gapId: null,
            blocksActivation: false,
          };

    default:
      return met('integration', integration, 'Ready to use.');
  }
}

/**
 * A B13 channel name, as a member would say it.
 *
 * B13's identifiers are `InApp`, `Push`, `Email`, `Sms` — correct as contract
 * values and wrong in a sentence. Mapped here rather than in the component so
 * the builder, the preview and the run detail all say "in Diaspora" rather than
 * one of them saying "InApp".
 */
function friendlyChannel(channel: string): string {
  const names: Record<string, string> = {
    InApp: 'In-app notifications',
    Push: 'Push notifications',
    Email: 'Email',
    Sms: 'Text messages',
    WhatsApp: 'WhatsApp',
    Voice: 'Voice calls',
  };
  return names[channel] ?? channel;
}

function met(
  kind: AutomationDependency['kind'],
  label: string,
  detail: string
): AutomationDependency {
  return {
    kind,
    label,
    state: 'met',
    detail,
    actionLabel: null,
    actionRoute: null,
    gapId: null,
    blocksActivation: false,
  };
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

// ═════════════════════════════════════════════════════════════════════════════
// THE PREVIEW — §34
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Everything §34 asks to be shown before activation.
 *
 * Assembled here rather than in the preview component so the same summary can
 * be rendered on the builder's review step, on the automation's detail screen
 * and inside a simulation result without three implementations drifting.
 */
export function buildPreview(
  draft: AutomationDraft,
  context: DependencyContext
): AutomationPreview {
  const trigger = draft.trigger ? triggerDefinition(draft.trigger.key) : undefined;
  const dependencies = checkDependencies(draft, context);

  const supports: AutomationSupportStatus[] = [
    trigger
      ? statusOf(context, 'trigger', trigger.key, trigger.support)
      : 'BACKEND_GAP',
    ...draft.conditions.map((condition) => {
      const definition = conditionDefinition(condition.key);
      return definition
        ? statusOf(context, 'condition', definition.key, definition.support)
        : 'BACKEND_GAP';
    }),
    ...draft.actions.map((action) => {
      const definition = actionDefinition(action.key);
      return definition
        ? statusOf(context, 'action', definition.key, definition.support)
        : 'BACKEND_GAP';
    }),
  ];
  const support = weakestSupport(supports);

  const gapIds = Array.from(
    new Set(dependencies.map((dependency) => dependency.gapId).filter((id): id is string => !!id))
  ).sort();

  return {
    triggerSummary: trigger?.label ?? 'Not chosen yet',
    conditionSummaries: draft.conditions.map(describeCondition),
    actionSummaries: draft.actions.map(
      (action) => actionDefinition(action.key)?.label ?? action.key
    ),
    audience: context.audience ?? selfAudience(),
    scheduleSummary: draft.schedule ? describeSchedule(draft.schedule) : null,
    timezoneSummary: draft.schedule ? draft.schedule.timezone.label : null,
    dependencies,
    support,
    gapIds,
    expectedBehaviour: describeExpectedBehaviour(support, dependencies),
    limitations: dependencies
      .filter((dependency) => dependency.state === 'gap')
      .map((dependency) => `${dependency.label}: ${dependency.detail}`),
    canActivate: !dependencies.some((dependency) => dependency.blocksActivation),
  };
}

/** "Country is Nigeria". One wording, shared with the run detail. */
export function describeCondition(condition: {
  key: string;
  operator: string;
  value: unknown;
  secondaryValue?: unknown;
}): string {
  const definition = conditionDefinition(condition.key);
  const label = definition?.label ?? condition.key;
  const operator = OPERATOR_LABELS[condition.operator] ?? condition.operator;

  // A country is stored as the code the platform compares — `MU` — and read as
  // its name. A code this list does not know is shown as it is.
  const shown = (entry: unknown): string => {
    const text = String(entry ?? '');
    if (definition?.valueKind !== 'country') return text;
    return allCountries.find((country) => country.code === text.trim())?.name ?? text;
  };

  const value = Array.isArray(condition.value)
    ? condition.value.map(shown).join(', ')
    : definition?.valueKind === 'country' && typeof condition.value === 'string'
      ? condition.value.split(',').map(shown).join(', ')
      : shown(condition.value);

  if (condition.operator === 'between' && condition.secondaryValue !== undefined) {
    return `${label} ${operator} ${value} and ${String(condition.secondaryValue)}`;
  }

  if (condition.operator === 'isTrue' || condition.operator === 'isFalse') {
    return `${label} ${operator}`;
  }

  const unit = definition?.unit ? ` ${definition.unit}` : '';
  return `${label} ${operator} ${value}${unit}`;
}

/**
 * The platform's verdicts, in the words the member built the rule with.
 *
 * The platform names a check by its key — it titles a verdict `country` and
 * explains it as "The 'country' check matched." — because it does not know the
 * words this build uses. Shown as sent, the one screen that answers "would my
 * rule have run for this event?" answered in identifiers (seen on the device on
 * 11 Sep 2026). Each verdict is titled with the member's own condition —
 * "Country is Mauritius" — and the key in its explanation becomes the same
 * words. The verdict itself, matched or not, is never touched.
 */
export function presentServerOutcomes(
  conditions: AutomationDraft['conditions'],
  outcomes: AutomationConditionOutcome[]
): AutomationConditionOutcome[] {
  return outcomes.map((outcome, index) => {
    const key = outcome.label;
    const condition = conditions.find((entry) => entry.key === key) ?? conditions[index];
    const words = conditionDefinition(condition?.key ?? key)?.label;

    if (!condition || !words) return outcome;

    return {
      ...outcome,
      label: describeCondition(condition),
      explanation: outcome.explanation.split(`'${key}'`).join(words.toLowerCase()),
    };
  });
}

function selfAudience(): AutomationAudience {
  return {
    kind: 'self',
    // Not a server figure and does not pretend to be one — but it is also not
    // an estimate. An automation that only notifies its owner reaches exactly
    // one person and the client knows that without asking.
    estimatedRecipients: 1,
    provenance: 'server',
    description: 'Only you',
    serverSideFilters: ['Your own notification settings, including quiet hours'],
  };
}

/**
 * §34's "expected behaviour", in a sentence.
 *
 * The `BACKEND_GAP` wording is close to §34's own suggested phrasing, because
 * the phrase has to say two things at once — that the member has finished, and
 * that nothing will happen yet — and those pull in opposite directions.
 */
function describeExpectedBehaviour(
  support: AutomationSupportStatus,
  dependencies: AutomationDependency[]
): string {
  const blocking = dependencies.filter((dependency) => dependency.blocksActivation);
  if (blocking.length > 0) {
    return `There ${blocking.length === 1 ? 'is one thing' : `are ${blocking.length} things`} to finish before this can be switched on.`;
  }

  switch (support) {
    case 'CONNECTED':
      return 'This will run whenever its trigger happens.';
    case 'PARTIAL':
      return 'This will run, and some parts of it depend on capabilities Diaspora is still building. Those parts are listed below.';
    case 'DEVELOPMENT':
      return 'This works on this device while Diaspora is open. It cannot run in the background yet.';
    case 'BACKEND_GAP':
      // Not "saved": the builder shows this before anything has been, and it
      // is shared with the page of an automation that has.
      return 'Diaspora cannot run this automatically yet. Nothing will happen until that capability is ready, and it is not something you need to fix.';
  }
}
