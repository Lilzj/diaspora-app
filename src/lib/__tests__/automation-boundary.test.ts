// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation boundary (Frontend Phase 18, §48 · §49 · §56 · §57 · §66)
//
// The structural assertions. Each proves a property of the *shape* of the code
// rather than of a single behaviour, which is what makes them worth having: a
// behavioural test proves a function does the right thing today, and these
// prove that the wrong thing is not reachable at all.
//
// Eight properties:
//
//   **A release build reaches no simulated automation.** Every function in the
//   development arm refuses when the gap switch is off, and it *rejects* rather
//   than returning empty — the distinction between "you have no automations" (a
//   claim about the member) and "this build cannot show you this" (a claim
//   about the build, and the true one).
//
//   **The development arm moves no money.** Asserted by inspecting the module's
//   exports rather than by trusting a comment. §48.
//
//   **The domain model has nowhere to put an amount or a recipient.** §48's and
//   §49's strongest available enforcement: a type with no field for a
//   destination account cannot describe a transfer, and a type with no
//   recipient list cannot carry a client-chosen audience.
//
//   **The action catalogue contains nothing that moves money, sends a message
//   or posts publicly.** The three families §10, §29 and §48 exclude.
//
//   **The simulator can dispatch nothing.** Asserted against its imports,
//   because §35's guarantee is that it *cannot* send rather than that it
//   chooses not to.
//
//   **No simulated record can claim to be real.** §57, at the one point where a
//   mistake would be invisible.
//
//   **No automation event can carry a rule's contents.** The allow-list is the
//   whole privacy design of the telemetry layer. §52.
//
//   **Access is never derived from a role.** §49 — the module exports no
//   function that takes a role, an account state or a tier.
// ─────────────────────────────────────────────────────────────────────────────

import * as gapApi from '@/lib/automation-gap-api';
import * as certifiedApi from '@/lib/automation-api';
import * as access from '@/lib/automation/access';
import { AUTOMATION_GAPS, AUTOMATION_GAP_PREFIX } from '@/config/automation-gaps';
import { ACTION_CATALOG } from '@/lib/automation/actions';
import { TRIGGER_CATALOG } from '@/lib/automation/triggers';
import { CONDITION_CATALOG } from '@/lib/automation/conditions';
import { TEMPLATE_CATALOG } from '@/lib/automation/templates';
import { sanitise } from '@/lib/creator-analytics';
// Imported for its side effect: the allow-list extension is registered at
// module load, exactly as Phases 8, 12, 13, 15 and 16 do it. Without this
// import `sanitise` would drop every automation property and the assertions
// below would pass for the wrong reason.
import '@/lib/automation/events';
import { DEVELOPMENT_ACCESS, accessFor, resetAutomationState } from '@/mocks/automation-gap-data';
import { simulate } from '@/lib/automation/simulation';
import type { AutomationDraft, AutomationScope } from '@/types/automation';

// ─────────────────────────────────────────────────────────────────────────────
// Reading source files, without pulling Node's types into the project
//
// Several assertions below inspect module *source*, because they prove the
// absence of code and a behavioural test cannot do that.
//
// `require` locally with the narrowest possible signatures rather than
// `import fs from 'fs'`: adding `"node"` to `tsconfig.json`'s `types` array
// breaks twenty existing assertions in Phases 5, 6 and 12, because `@types/node`
// declares its own `globalThis` and shadows the ambient React Native
// declaration that gives those files `__DEV__`. Same technique
// `integration-boundary.test.ts` uses, and for the same reason.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
const path = require('path') as { join(...segments: string[]): string };

/**
 * Source with its comments removed.
 *
 * Several assertions are about what the code *does*, and the files being
 * inspected explain in prose why they do not do the forbidden thing —
 * `automation-gap-api.ts` names every absent capability in its header precisely
 * so nobody reintroduces one. A naive `toContain` would fail on the
 * explanation, which would mean deleting the most useful comment in the file to
 * satisfy a test about the code beneath it.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
}

function readSource(...segments: string[]): string {
  return withoutComments(fs.readFileSync(path.join(process.cwd(), ...segments), 'utf8'));
}

/**
 * Runs `body` with the gap switch off, as a release build has it.
 *
 * `await`s the body rather than returning it, so the flag is restored *after*
 * the assertion has settled. A synchronous `finally` around an async body
 * restores it on the first tick, which happens to work while every guard is
 * checked before the first `await` — and would stop working silently the moment
 * one was not.
 */
async function withReleaseBuild(body: () => Promise<void>): Promise<void> {
  const globals = globalThis as { __DEV__?: boolean };
  const previous = globals.__DEV__;
  globals.__DEV__ = false;
  const previousEnv = process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;
  delete process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW;

  try {
    await body();
  } finally {
    globals.__DEV__ = previous;
    if (previousEnv !== undefined) process.env.EXPO_PUBLIC_ENABLE_GAP_PREVIEW = previousEnv;
  }
}

const SCOPE: AutomationScope = {
  ownerKind: 'user',
  ownerId: 'member-1',
  ownerLabel: 'A member',
  communityIds: [],
  isCrossCommunity: false,
  countryCodes: [],
  neighbourhoodIds: [],
};

const DRAFT: AutomationDraft = {
  id: null,
  name: 'Test',
  description: '',
  scope: SCOPE,
  source: 'builder',
  templateId: null,
  trigger: { key: 'manual.run', parameters: {} },
  conditions: [],
  actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
  schedule: null,
};

// ═════════════════════════════════════════════════════════════════════════════

describe('§66 · a release build reaches no simulated automation', () => {
  const calls: { name: string; call: () => Promise<unknown> }[] = [
    { name: 'listAutomations', call: () => gapApi.listAutomations(SCOPE, { tab: 'all', domain: null, ownerKind: null, communityId: null, search: '' }, null) },
    { name: 'fetchAutomation', call: () => gapApi.fetchAutomation('a1') },
    { name: 'createAutomation', call: () => gapApi.createAutomation(DRAFT, 'key-1') },
    { name: 'updateAutomation', call: () => gapApi.updateAutomation('a1', {}, null) },
    { name: 'setAutomationStatus', call: () => gapApi.setAutomationStatus('a1', 'ACTIVE') },
    { name: 'deleteAutomation', call: () => gapApi.deleteAutomation('a1') },
    { name: 'listRuns', call: () => gapApi.listRuns(null, null, null) },
    { name: 'fetchRun', call: () => gapApi.fetchRun('a1', 'r1') },
    { name: 'runAutomationManually', call: () => gapApi.runAutomationManually('a1', 'key-1') },
    { name: 'simulateAutomation', call: () => gapApi.simulateAutomation(DRAFT) },
    { name: 'fetchAccess', call: () => gapApi.fetchAccess(SCOPE) },
    { name: 'fetchAudience', call: () => gapApi.fetchAudience(SCOPE, ['notify.self']) },
    { name: 'fetchAudit', call: () => gapApi.fetchAudit('a1') },
    { name: 'listSavedSearches', call: () => gapApi.listSavedSearches(null) },
    {
      name: 'createSavedSearch',
      call: () =>
        gapApi.createSavedSearch({
          subject: 'jobs',
          name: 'x',
          criteria: {},
          querySummary: '',
          alertsEnabled: false,
          alertFrequency: 'off',
          watchFor: [],
        }),
    },
    { name: 'updateSavedSearch', call: () => gapApi.updateSavedSearch('s1', {}) },
    { name: 'deleteSavedSearch', call: () => gapApi.deleteSavedSearch('s1') },
    { name: 'listReminders', call: () => gapApi.listReminders('event', 'e1') },
    {
      name: 'createReminder',
      call: () =>
        gapApi.createReminder(
          {
            subjectKind: 'event',
            subjectId: 'e1',
            offsetMinutes: 60,
            anchor: 'start',
            channel: 'InApp',
            timeZoneId: 'Africa/Lagos',
          },
          'key-1'
        ),
    },
    { name: 'cancelReminder', call: () => gapApi.cancelReminder('r1') },
    { name: 'fetchTriggerContext', call: () => gapApi.fetchTriggerContext('event.created', 'e1') },
  ];

  for (const entry of calls) {
    it(`${entry.name} rejects rather than returning empty`, async () => {
      await withReleaseBuild(async () => {
        // Rejecting, not resolving with `[]`. An empty result renders as a
        // claim about the member; a rejection renders as a claim about the
        // build, and only the second is true.
        await expect(entry.call()).rejects.toMatchObject({
          kind: 'backendGap',
          blame: 'platform',
          isRetryable: false,
        });
      });
    });
  }

  it('every rejection names a real gap id', async () => {
    await withReleaseBuild(async () => {
      const ids = new Set(Object.values(AUTOMATION_GAPS).map((gap) => gap.id));

      // Caught by hand rather than through `.rejects`, because the assertion is
      // about a *field* of the rejection and the id has to be looked up in the
      // register. A notice that renders an unknown id is a member told "not
      // available yet" with nothing they or support can look up.
      for (const entry of calls) {
        let caught: unknown;
        try {
          await entry.call();
        } catch (error) {
          caught = error;
        }

        const gapId = (caught as { gapId?: string | null } | undefined)?.gapId ?? null;
        expect({ name: entry.name, known: gapId !== null && ids.has(gapId) }).toEqual({
          name: entry.name,
          known: true,
        });
      }
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§48 · nothing in this phase moves money', () => {
  const MONEY_WORDS = [
    'pay',
    'payment',
    'charge',
    'refund',
    'withdraw',
    'deposit',
    'transfer',
    'credit',
    'settle',
    'payout',
    'renew',
    'purchase',
    'claim',
  ];

  it('the development arm exports no money-moving function', () => {
    const exported = Object.keys(gapApi).filter(
      (name) => typeof (gapApi as Record<string, unknown>)[name] === 'function'
    );

    for (const name of exported) {
      const lower = name.toLowerCase();
      for (const word of MONEY_WORDS) {
        expect(lower).not.toContain(word);
      }
    }
  });

  it('the certified arm exports no money-moving function', () => {
    const exported = Object.keys(certifiedApi).filter(
      (name) => typeof (certifiedApi as Record<string, unknown>)[name] === 'function'
    );

    for (const name of exported) {
      const lower = name.toLowerCase();
      for (const word of MONEY_WORDS) {
        expect(lower).not.toContain(word);
      }
    }
  });

  it('the development arm never imports the financial client', () => {
    const source = readSource('src', 'lib', 'automation-gap-api.ts');

    // The strongest available form of this assertion: a module that cannot
    // reach `financial-api` cannot move money however it is called.
    expect(source).not.toContain('financial-api');
    expect(source).not.toContain('financial-gap-api');
  });

  it('the action catalogue contains no action that moves money', () => {
    for (const action of ACTION_CATALOG) {
      const text = `${action.key} ${action.label}`.toLowerCase();
      for (const word of MONEY_WORDS) {
        expect(text).not.toContain(word);
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§48 · §49 · the domain model cannot describe a transfer or an audience', () => {
  it('AutomationAction has no amount, currency, account or recipient field', () => {
    const source = readSource('src', 'types', 'automation.ts');

    // Isolate the interface so a mention of "amount" in another type — the
    // condition catalogue legitimately compares amounts — does not fail this.
    const start = source.indexOf('export interface AutomationAction {');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf('}', start));

    for (const field of ['amount', 'currency', 'account', 'destination', 'recipients', 'recipientIds']) {
      expect(body).not.toContain(field);
    }
  });

  it('AutomationAudience carries a count, never a list of members', () => {
    const source = readSource('src', 'types', 'automation.ts');
    const start = source.indexOf('export interface AutomationAudience {');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf('}', start));

    expect(body).toContain('estimatedRecipients');
    // §50: an audience preview that named members would be an enumeration tool
    // for a community, reachable by anybody who can open the builder.
    expect(body).not.toContain('members:');
    expect(body).not.toContain('memberIds');
    expect(body).not.toContain('userIds');
  });

  it('no automation type has a field that could hold a credential', () => {
    const source = readSource('src', 'types', 'automation.ts');

    for (const field of ['accessToken', 'refreshToken', 'clientSecret', 'apiKey', 'webhookUrl']) {
      expect(source).not.toContain(field);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§10 · §29 · the three excluded action families', () => {
  it('no action sends a message', () => {
    // §29: messages are never sent without explicit per-occurrence
    // authorization, and rather than ship a half-authorized send there is none.
    for (const action of ACTION_CATALOG) {
      expect(action.key).not.toMatch(/message\.send|send\.message|reply/i);
    }
  });

  it('no action posts publicly', () => {
    for (const action of ACTION_CATALOG) {
      expect(action.key).not.toMatch(/publish|post\.|share\./i);
    }
  });

  it('every action that reaches other people requires a capability', () => {
    // §49: the recipient set is never trusted from the client, and the first
    // client-side gate is that an action reaching others cannot be offered
    // without a server-granted capability.
    for (const action of ACTION_CATALOG) {
      if (action.reachesOtherPeople) {
        expect(action.requiredCapability).not.toBeNull();
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§35 · §56 · the simulator cannot perform anything', () => {
  it('imports nothing that could dispatch', () => {
    const source = readSource('src', 'lib', 'automation', 'simulation.ts');

    // The safety property is structural: it cannot send because it cannot
    // reach anything that sends.
    for (const forbidden of [
      'apiClient',
      'notifications-api',
      'financial-api',
      'integrations/calendar',
      'automation-gap-api',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('every simulated action outcome is pending, skipped or suppressed — never succeeded', () => {
    const result = simulate(DRAFT, {
      enabledChannels: ['InApp'],
      audience: null,
      now: new Date('2026-08-01T09:00:00.000Z'),
      serverEvaluated: false,
    });

    for (const outcome of result.run.actionOutcomes) {
      // §57: a simulation reporting success would be indistinguishable from a
      // real run in every list, log and component test.
      expect(outcome.status).not.toBe('succeeded');
    }
  });

  it('a simulated run is always marked simulated', () => {
    const result = simulate(DRAFT, {
      enabledChannels: ['InApp'],
      audience: null,
      now: new Date('2026-08-01T09:00:00.000Z'),
      serverEvaluated: true,
    });

    expect(result.run.isSimulated).toBe(true);
    expect(result.isSimulation).toBe(true);
  });

  it('never evaluates a sensitive condition locally', () => {
    const sensitive = CONDITION_CATALOG.find((entry) => entry.requiresServerEvaluation);
    expect(sensitive).toBeDefined();

    const result = simulate(
      {
        ...DRAFT,
        conditions: [
          { id: 'c1', key: sensitive!.key, operator: sensitive!.operators[0], value: 100 },
        ],
      },
      {
        enabledChannels: ['InApp'],
        audience: null,
        now: new Date('2026-08-01T09:00:00.000Z'),
        serverEvaluated: false,
      }
    );

    const outcome = result.run.conditionOutcomes[0];
    expect(outcome.evaluatedBy).toBe('server');
    // Not optimistically matched. A confident guess here would be teaching the
    // member to trust a number the real execution will not use.
    expect(outcome.matched).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§57 · no simulated record can claim to be real', () => {
  beforeEach(() => {
    resetAutomationState();
  });

  it('every seeded automation is marked simulated', async () => {
    const { listAutomationsFor } = require('@/mocks/automation-gap-data') as {
      listAutomationsFor: (
        ownerKind: string,
        status: string | null,
        domain: string | null,
        search: string | null
      ) => { isSimulated: boolean }[];
    };

    const automations = listAutomationsFor('user', null, null, null);
    expect(automations.length).toBeGreaterThan(0);

    for (const automation of automations) {
      expect(automation.isSimulated).toBe(true);
    }
  });

  it('every seeded run is marked simulated', () => {
    const { listRunsFor } = require('@/mocks/automation-gap-data') as {
      listRunsFor: (automationId: string | null, status: string | null) => { isSimulated: boolean }[];
    };

    const runs = listRunsFor(null, null);
    expect(runs.length).toBeGreaterThan(0);

    for (const run of runs) {
      expect(run.isSimulated).toBe(true);
    }
  });

  it('no seeded automation carries a nextRunAt', () => {
    const { listAutomationsFor } = require('@/mocks/automation-gap-data') as {
      listAutomationsFor: (
        ownerKind: string,
        status: string | null,
        domain: string | null,
        search: string | null
      ) => { nextRunAt: string | null }[];
    };

    // §41: nothing schedules, so a simulated `nextRunAt` would be the adapter
    // displaying a time nothing will honour.
    for (const automation of listAutomationsFor('user', null, null, null)) {
      expect(automation.nextRunAt).toBeNull();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§66 · the development adapter grants no platform-wide authority', () => {
  it('canCreatePlatformWide is false', () => {
    // Asserted against the development set specifically, so §66's security test
    // runs against the same answer developers see rather than only in
    // production.
    expect(DEVELOPMENT_ACCESS.canCreatePlatformWide).toBe(false);
  });

  it('asking for the platform scope grants nothing', () => {
    const granted = accessFor('platform');

    expect(granted.canCreatePlatformWide).toBe(false);
    expect(granted.canCreatePersonal).toBe(false);
    expect(granted.canNotifyOtherMembers).toBe(false);
    expect(granted.grantedCapabilities).toHaveLength(0);
  });

  it('the location capability matches the server: granted over the member\'s own scope', () => {
    // Until 21 Oct 2026 this asserted the opposite — "§15: background location
    // is not implemented" — and it was right then. Background location is still
    // not taken; the server now grants `automations.location` because area
    // triggers are fed by the opt-in, foreground-only presence report. The
    // development set must give the same answer as production, in both
    // directions.
    expect(DEVELOPMENT_ACCESS.grantedCapabilities).toContain('automations.location');
    expect(DEVELOPMENT_ACCESS.canUseLocationTriggers).toBe(true);
    // And still nothing platform-wide.
    expect(accessFor('platform').canUseLocationTriggers).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§52 · no automation event can carry a rule’s contents', () => {
  it('drops an automation name', () => {
    const { safe, dropped } = sanitise({
      triggerKey: 'savedSearch.newMatch',
      automationName: 'Housing under 20,000 in Curepipe',
    });

    expect(safe.triggerKey).toBe('savedSearch.newMatch');
    // A member's automation name is free text they wrote, and can be personal.
    expect(safe.automationName).toBeUndefined();
    expect(dropped).toContain('automationName');
  });

  it('drops a condition value', () => {
    const { safe, dropped } = sanitise({
      conditionKey: 'priceBelow',
      conditionValue: 20000,
      countryCode: 'SY',
    });

    expect(safe.conditionKey).toBe('priceBelow');
    expect(safe.conditionValue).toBeUndefined();
    // The one worth defending explicitly: a stream of
    // `triggerKey=government.advisoryUpdated · countryCode=SY` is a record of
    // who is watching asylum guidance for which country.
    expect(safe.countryCode).toBeUndefined();
    expect(dropped).toEqual(expect.arrayContaining(['conditionValue', 'countryCode']));
  });

  it('drops a recipient count and a schedule time', () => {
    const { safe } = sanitise({
      actionKey: 'notify.community',
      recipientCount: 1200,
      scheduleTime: '09:00',
    });

    expect(safe.actionKey).toBe('notify.community');
    expect(safe.recipientCount).toBeUndefined();
    expect(safe.scheduleTime).toBeUndefined();
  });

  it('keeps the shape properties the vocabulary is built on', () => {
    const { safe } = sanitise({
      triggerKey: 'event.startingSoon',
      actionKey: 'notify.self',
      conditionCount: 2,
      actionCount: 1,
      supportStatus: 'BACKEND_GAP',
      wasSimulated: true,
    });

    expect(safe).toEqual({
      triggerKey: 'event.startingSoon',
      actionKey: 'notify.self',
      conditionCount: 2,
      actionCount: 1,
      supportStatus: 'BACKEND_GAP',
      wasSimulated: true,
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§49 · access is never derived from a role', () => {
  it('exports no function that takes a role, an account state or a tier', () => {
    const source = readSource('src', 'lib', 'automation', 'access.ts');

    for (const forbidden of [
      'CommunityRole',
      'AccountState',
      'CreatorStatus',
      'SubscriptionTier',
      'AccessTier',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('a missing capability set hides everything', () => {
    const actions: access.AutomationAction[] = [
      'view-automations',
      'create-personal',
      'create-community',
      'create-organization',
      'create-creator',
      'create-business',
      'create-platform',
      'notify-others',
      'use-financial-triggers',
      'use-location-triggers',
      'view-others-runs',
      'manage-others-automations',
    ];

    for (const action of actions) {
      // Failing closed is the only correct direction: a capability set that has
      // not loaded is not evidence of permission.
      expect(access.evaluateAutomationAction(action, null).outcome).toBe('hidden');
    }
  });

  it('an unavailable capability set hides everything', () => {
    const { noAutomationAccess } = require('@/types/automation') as {
      noAutomationAccess: () => { provenance: string };
    };

    expect(
      access.evaluateAutomationAction('create-personal', noAutomationAccess() as never).outcome
    ).toBe('hidden');
  });

  it('hidden, never disabled — there is no third "blocked by role" verdict path', () => {
    // §66: route manipulation must not reveal what authorization would have
    // allowed, and a greyed-out control is a disclosure.
    expect(access.evaluateAutomationAction('create-platform', DEVELOPMENT_ACCESS).outcome).toBe(
      'hidden'
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('the gap register is internally consistent', () => {
  it('every gap id is unique and correctly formatted', () => {
    const ids = Object.values(AUTOMATION_GAPS).map((gap) => gap.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^FRONTEND-PHASE18-GAP-\d{3}$/);
    }
  });

  it('every gap key matches its record key', () => {
    for (const [key, gap] of Object.entries(AUTOMATION_GAPS)) {
      expect(gap.key).toBe(key);
    }
  });

  it('every blockedBy names a real gap id', () => {
    const ids = new Set(Object.values(AUTOMATION_GAPS).map((gap) => gap.id));

    for (const gap of Object.values(AUTOMATION_GAPS)) {
      if (gap.blockedBy) expect(ids.has(gap.blockedBy)).toBe(true);
    }
  });

  it('every catalogue gapKey resolves to a registered gap', () => {
    for (const trigger of TRIGGER_CATALOG) {
      if (trigger.gapKey) expect(AUTOMATION_GAPS[trigger.gapKey]).toBeDefined();
    }
    for (const condition of CONDITION_CATALOG) {
      if (condition.gapKey) expect(AUTOMATION_GAPS[condition.gapKey]).toBeDefined();
    }
    for (const action of ACTION_CATALOG) {
      if (action.gapKey) expect(AUTOMATION_GAPS[action.gapKey]).toBeDefined();
    }
  });

  it('a gap-backed catalogue entry always names its gap', () => {
    // Without this, a BACKEND_GAP entry could render a notice with no id and a
    // member would be told "not available yet" with nothing to look up.
    for (const trigger of TRIGGER_CATALOG) {
      if (trigger.support === 'BACKEND_GAP') expect(trigger.gapKey).not.toBeNull();
    }
    for (const action of ACTION_CATALOG) {
      if (action.support === 'BACKEND_GAP') expect(action.gapKey).not.toBeNull();
    }
  });

  it('the simulated prefix is never the real one', () => {
    expect(AUTOMATION_GAP_PREFIX).toBe('/automation-gap/v0');
    expect(AUTOMATION_GAP_PREFIX).not.toBe('/automations');

    const source = readSource('src', 'lib', 'automation-gap-api.ts');
    // Every route in the development arm goes through `PREFIX`. A literal
    // `/automations` path would be a call that collides with the namespace a
    // real backend would claim.
    expect(source).not.toMatch(/apiClient\.(get|post|patch|put|delete)<[^>]*>\(\s*[`'"]\/automations/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§32 · templates derive their support rather than declaring it', () => {
  it('no template claims more support than its parts', () => {
    for (const template of TEMPLATE_CATALOG) {
      const trigger = TRIGGER_CATALOG.find((entry) => entry.key === template.trigger.key);
      expect(trigger).toBeDefined();

      const rank = { BACKEND_GAP: 0, DEVELOPMENT: 1, PARTIAL: 2, CONNECTED: 3 };

      expect(rank[template.support]).toBeLessThanOrEqual(rank[trigger!.support]);

      for (const action of template.actions) {
        const definition = ACTION_CATALOG.find((entry) => entry.key === action.key);
        expect(definition).toBeDefined();
        expect(rank[template.support]).toBeLessThanOrEqual(rank[definition!.support]);
      }
    }
  });

  it('every template references catalogue entries this build has', () => {
    for (const template of TEMPLATE_CATALOG) {
      expect(TRIGGER_CATALOG.some((entry) => entry.key === template.trigger.key)).toBe(true);

      for (const condition of template.conditions) {
        expect(CONDITION_CATALOG.some((entry) => entry.key === condition.key)).toBe(true);
      }
      for (const action of template.actions) {
        expect(ACTION_CATALOG.some((entry) => entry.key === action.key)).toBe(true);
      }
    }
  });

  it('every template’s actions are permitted by its trigger', () => {
    for (const template of TEMPLATE_CATALOG) {
      const trigger = TRIGGER_CATALOG.find((entry) => entry.key === template.trigger.key)!;

      for (const action of template.actions) {
        expect(trigger.supportedActions).toContain(action.key);
      }
      for (const condition of template.conditions) {
        expect(trigger.supportedConditions).toContain(condition.key);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Remediation Wave C-02 — the hooks read the platform, not the adapter
//
// Structural, for the same reason the eight properties above are: a behavioural
// test proves one hook called one route today. These prove the wrong arm is not
// reachable from the hooks at all, which is the property that has to survive
// somebody adding a twentieth hook next year.
//
// The failure this guards against is specific and has happened here before. The
// gap-adapter pattern makes closing a gap an import swap, and an import swap is
// exactly the kind of change that gets done for nineteen call sites and missed
// on the twentieth — leaving one hook quietly reading `/automation-gap/v0` in a
// build where the switch is off, which is a hook that returns nothing and says
// the member has no automations.
// ─────────────────────────────────────────────────────────────────────────────

describe('Wave C-02 · the hooks are on the certified arm', () => {
  const hooks = readSource('src', 'hooks', 'automation.ts');

  it('imports the certified client', () => {
    expect(hooks).toContain("from '@/lib/automation/certified-client'");
  });

  it('imports nothing from the development arm', () => {
    // `Diaspora.Modules.Automation` serves the twenty routes these hooks need.
    // A surviving import is a hook still pointed at a prefix that 404s at the
    // gateway in any real deployment.
    expect(hooks).not.toContain("from '@/lib/automation-gap-api'");
    expect(hooks).not.toContain('automation-gap-api');
  });

  it('no longer gates any hook on the gap switch', () => {
    // The switch answered "does this build have a simulated automation
    // backend". Now that the routes are real the question is not one the hooks
    // should be asking: a production build was returning `noAutomationAccess()`
    // and an empty registry for capabilities the platform had all along.
    expect(hooks).not.toContain('areAutomationGapsEnabled');
  });

  it('leaves the development arm itself intact for the routes still missing', () => {
    // Rule 6: the adapter is not deleted, because the thirteen trigger-context
    // routes are genuinely absent and its register entries are still the record
    // of what is missing.
    expect(typeof gapApi.fetchTriggerContext).toBe('function');
    expect(AUTOMATION_GAP_PREFIX).toBe('/automation-gap/v0');
  });
});

describe('Wave C-02 · the development handler mirrors the server, not the client', () => {
  const handler = readSource('src', 'mocks', 'handlers', 'automation.ts');

  it('serves the real path rather than the gap prefix', () => {
    expect(handler).toContain("const ROOT = '/automations'");
    expect(handler).not.toContain(AUTOMATION_GAP_PREFIX);
  });

  it('refuses a create with no idempotency key', () => {
    // Mandatory server-side, and in the body — the module reads no HTTP headers
    // at all. A handler that accepted a keyless create would let the surface be
    // built against something the real contract refuses, which is how the five
    // handlers this remediation has already had to correct went wrong.
    expect(handler).toContain('automation.idempotencyKey.required');
  });

  it('refuses a reminder with no subject moment', () => {
    // `SubjectMoment` is a non-nullable `DateTimeOffset`: omitted, it binds to
    // `0001-01-01` rather than failing. The development arm never sent one and
    // happily returned a reminder, which is why the omission survived.
    expect(handler).toContain('automation.reminder.subjectUnknown');
  });

  it('refuses an owner id the route could not bind', () => {
    expect(handler).toContain('automation.ownerId.invalid');
  });

  it('returns the page inside data rather than alongside it', () => {
    // `{ data: { items, nextCursor, totalCount } }`. The register declared
    // `data[] + meta`, and a client built on that reads `items === undefined`
    // and crashes on the first row.
    expect(handler).toContain('function okPage');
    expect(handler).toContain('hasMore');
  });
});
