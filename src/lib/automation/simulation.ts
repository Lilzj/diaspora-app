// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Safe simulation (Frontend Phase 18, §35 · §56 · §57)
//
// §35's "Test this automation", built so that it cannot become a real one.
//
// ── The four things a simulation must never do, and how each is prevented ────
//
// §35 lists them: no real financial transaction, no real external message, no
// irreversible action, nothing unconfirmed. The prevention is structural rather
// than a flag somebody remembers to check:
//
//   1. **This module dispatches nothing.** It has no import of the notification
//      API, the calendar capability, the financial API or the api client. It
//      cannot send because it cannot reach anything that sends. That is
//      asserted by `automation-boundary.test.ts` against this file's imports.
//
//   2. **The result is a distinct type.** `AutomationSimulation`, not
//      `AutomationRun`. A caller cannot accidentally store a simulation in a
//      history list or render it with the real-run component without the
//      compiler objecting.
//
//   3. **`isSimulated` is true on the inner run too**, so even the part that
//      *is* structurally a run carries its own marker. §57 requires mock
//      execution never to look indistinguishable from real execution, and a
//      screenshot of a simulation is a thing that will be pasted into a bug
//      report without its surrounding screen.
//
//   4. **Sensitive conditions are not answered.** See below.
//
// ── Why the client refuses to evaluate a sensitive condition ────────────────
//
// The tempting implementation evaluates everything it can and marks the rest
// as unknown. It is wrong, and the reason is worth stating because it looks
// like helpfulness:
//
// A simulation that answered "your balance is above £100 → matched" would be
// answering from whatever the client last fetched. The real execution answers
// server-side, at a different moment, from authoritative state. A member who
// tested and saw "matched" and then received nothing has been told two
// different things by one feature, and the first one was the one they trusted.
//
// So `requiresServerEvaluation` conditions come back as `evaluatedBy: 'server'`
// with `matched: false` and an explanation saying Diaspora will check this for
// real — which is both true and useful, whereas a confident guess is neither.
//
// ── What the simulation is genuinely good for ───────────────────────────────
//
// Showing the member the *shape* of what would happen: which actions in which
// order, who would be reached, which of their notification settings would
// suppress something, and which parts the platform cannot do yet. That is most
// of the value of a test, and none of it requires performing anything.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AutomationAudience,
  AutomationConditionOutcome,
  AutomationDraft,
  AutomationRun,
  AutomationRunStatus,
  AutomationSimulation,
} from '@/types/automation';
import { actionDefinition } from './actions';
import { conditionDefinition } from './conditions';
import { triggerDefinition } from './triggers';
import { describeCondition } from './dependencies';

export interface SimulationContext {
  /** The B13 channels the member has switched on. Drives the suppression preview. */
  enabledChannels: string[];
  audience: AutomationAudience | null;
  /** Injected so the result is deterministic under test. §56. */
  now: Date;
  /** Present when the platform answered. Null when the client simulated alone. */
  serverEvaluated: boolean;
}

/**
 * Run a draft without doing anything.
 *
 * Deterministic: the same draft and the same context produce the same result
 * on every call, which §56 asks for and which is what makes a simulation
 * testable at all. Nothing here reads the clock except through `context.now`.
 */
export function simulate(draft: AutomationDraft, context: SimulationContext): AutomationSimulation {
  const trigger = draft.trigger ? triggerDefinition(draft.trigger.key) : undefined;
  const startedAt = context.now.toISOString();

  const conditionOutcomes: AutomationConditionOutcome[] = draft.conditions.map((condition) => {
    const definition = conditionDefinition(condition.key);
    const label = describeCondition(condition);

    if (!definition) {
      return {
        conditionId: condition.id,
        label,
        matched: false,
        evaluatedBy: 'client',
        explanation: 'This condition is not recognised, so it could not be checked.',
      };
    }

    if (definition.requiresServerEvaluation) {
      return {
        conditionId: condition.id,
        label,
        // Deliberately not matched. See the file header: a confident guess here
        // is worse than an honest "Diaspora checks this".
        matched: false,
        evaluatedBy: 'server',
        explanation:
          'Diaspora checks this on its own servers when the automation runs, using the real, current answer. It is not checked here.',
      };
    }

    return {
      conditionId: condition.id,
      label,
      // A simulation has no real trigger subject to compare against, so it
      // reports what *would* be compared rather than an outcome. Saying
      // "matched" against a subject that does not exist would be inventing one.
      matched: true,
      evaluatedBy: 'client',
      explanation: 'This would be checked against whatever set the automation off.',
    };
  });

  const wouldHaveDone: AutomationSimulation['wouldHaveDone'] = [];

  const actionOutcomes = draft.actions.map((action) => {
    const definition = actionDefinition(action.key);
    const label = definition?.label ?? action.key;

    if (!definition) {
      return {
        actionId: action.id,
        actionKey: action.key,
        label,
        status: 'failed' as const,
        suppressionReason: null,
        failureKind: 'invalidConfiguration' as const,
        message: 'This action is not recognised by this version of the app.',
        resultRef: null,
        completedAt: startedAt,
      };
    }

    // A member's own notification preferences, applied in the preview exactly
    // as B13 would apply them at dispatch. §53 — and the reason this is worth
    // simulating is that "it ran and you heard nothing" is the most confusing
    // possible outcome, and this is where somebody finds out why.
    const channel = action.channel ?? definition.notificationChannel;
    if (channel && !context.enabledChannels.includes(channel)) {
      wouldHaveDone.push({
        actionKey: action.key,
        label,
        reason: `Nothing would be sent: you have turned this kind of notification off.`,
      });

      return {
        actionId: action.id,
        actionKey: action.key,
        label,
        // `suppressed`, not `failed`. A member's own settings working is not a
        // failure and §36 depends on the difference.
        status: 'suppressed' as const,
        suppressionReason: 'Your notification settings',
        failureKind: null,
        message: null,
        resultRef: null,
        completedAt: startedAt,
      };
    }

    if (definition.support === 'BACKEND_GAP') {
      wouldHaveDone.push({
        actionKey: action.key,
        label,
        reason: 'Diaspora cannot do this automatically yet, so nothing would happen.',
      });

      return {
        actionId: action.id,
        actionKey: action.key,
        label,
        status: 'skipped' as const,
        suppressionReason: null,
        failureKind: 'backendGap' as const,
        message: 'This capability is not available yet.',
        resultRef: null,
        completedAt: startedAt,
      };
    }

    wouldHaveDone.push({
      actionKey: action.key,
      label,
      reason: definition.reachesOtherPeople
        ? 'Nobody was contacted. In a real run this would reach eligible people, minus anyone whose settings block it.'
        : 'Nothing was actually done. In a real run this would happen.',
    });

    return {
      actionId: action.id,
      actionKey: action.key,
      label,
      // `pending` rather than `succeeded`: nothing succeeded, because nothing
      // was attempted. A simulation reporting success is the exact thing §57
      // forbids — it would be indistinguishable from a real one in every list,
      // every log and every component test.
      status: 'pending' as const,
      suppressionReason: null,
      failureKind: null,
      message: 'Would run',
      resultRef: null,
      completedAt: null,
    };
  });

  const run: AutomationRun = {
    id: `sim-${startedAt}`,
    automationId: draft.id ?? 'draft',
    automationName: draft.name || 'Untitled automation',
    status: deriveSimulationStatus(actionOutcomes),
    startedAt,
    completedAt: startedAt,
    durationMs: 0,
    triggerSummary: trigger?.label ?? 'Not chosen',
    triggeredAt: startedAt,
    conditionOutcomes,
    actionOutcomes,
    failureKind: null,
    failureMessage: null,
    recoveryHint: null,
    correlationId: null,
    isSimulated: true,
    wasDeduplicated: false,
  };

  return {
    run,
    wouldHaveDone,
    isSimulation: true,
    disclaimer: context.serverEvaluated
      ? 'This was a test. Nothing was sent, nobody was notified, no money moved and nothing was added to a calendar.'
      : 'This was a test run on your phone. Nothing was sent, nobody was notified, no money moved and nothing was added to a calendar. Conditions about money, roles or statuses were not checked — Diaspora checks those itself when an automation really runs.',
  };
}

/**
 * The overall status of a simulation.
 *
 * Never `COMPLETED`. A simulation that reported completion would be claiming
 * something happened, and the whole point is that nothing did — `SKIPPED` is
 * the honest answer when every action was skipped, and `RUNNING` when actions
 * are `pending`, because "would run" is what pending means here.
 */
function deriveSimulationStatus(
  outcomes: readonly { status: string }[]
): AutomationRunStatus {
  if (outcomes.length === 0) return 'SKIPPED';
  if (outcomes.some((outcome) => outcome.status === 'failed')) return 'PARTIALLY_COMPLETED';
  if (outcomes.every((outcome) => outcome.status === 'skipped' || outcome.status === 'suppressed')) {
    return 'SKIPPED';
  }
  return 'RUNNING';
}

/**
 * The sentence shown above a simulation result.
 *
 * Separate from `disclaimer` because it appears in a different place and has a
 * different job: this is the heading a member reads first, and it has to say
 * "test" before they read anything that looks like an outcome.
 */
export const SIMULATION_HEADING = 'Test run — nothing actually happened';

/**
 * Whether a simulation is worth offering at all.
 *
 * A draft with no actions has nothing to simulate, and offering the button
 * would produce an empty result that reads like a failure.
 */
export function canSimulate(draft: AutomationDraft): boolean {
  return draft.trigger !== null && draft.actions.length > 0;
}

/**
 * Whether the phone's own test may stand in for the platform's, once the
 * platform's has failed.
 *
 * **It used to stand in for every failure**, on the reasoning that the local
 * test was the product and an error over a working one would mislead. On
 * 11 Sep 2026 every test the builder sent was refused at model binding, and the
 * member was shown a result each time — under a card naming the real event they
 * had asked it to be checked against, which the phone cannot check.
 *
 * Two failures are said rather than replaced:
 *
 *  - **A chosen subject.** "Would this have run for the Diaspora test evening?"
 *    is a question about something only the platform holds.
 *  - **A refusal** — `blame: 'member'`, a 400 or a 403. The platform read the
 *    rule and would not accept it; a local run calling it good is the opposite
 *    of what the member needs to hear.
 *
 * What remains is the case the old reasoning was right about: no connection, or
 * a capability this build has not got. Then the phone's test is the honest
 * answer, and its heading already says whose test it was.
 *
 * Takes the failure's `blame` rather than the error type so that this module
 * keeps importing nothing that could reach the network.
 */
export function localTestMayStandIn(
  failure: { blame: 'member' | 'platform' | 'transient' },
  sampleSubjectId: string | null
): boolean {
  if (sampleSubjectId) return false;
  return failure.blame !== 'member';
}
