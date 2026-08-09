// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation permissions and security (Frontend Phase 18, §45–§49 · §66)
//
// §66's seven security requirements, each as an assertion:
//
//   User A cannot access User B's automations.          → automation-isolation
//   A member cannot access another community's.         → automation-isolation
//   A normal member cannot create platform-wide.        → here
//   An unauthorized organization member cannot create
//     organization automation.                          → here
//   Route manipulation cannot bypass authorization.     → here
//   Financial automation cannot execute through
//     frontend-only logic.                              → automation-boundary
//   Sensitive automation conditions are not leaked.     → here
//
// ── What a client-side permission test can and cannot prove ──────────────────
//
// It cannot prove authorization, because authorization is the server's. What it
// proves is the property §49 actually asks the *frontend* for: that the client
// **never decides** — that every affordance is gated on a boolean the server
// supplied, that a missing answer hides everything, and that there is no code
// path from a role to a permission.
//
// That is a real and checkable property, and it is the one that stops a
// frontend regression turning into an authorization bug.
// ─────────────────────────────────────────────────────────────────────────────

import {
  allowedOwnerKinds,
  can,
  canManageScope,
  canUseAction,
  canUseTrigger,
  evaluateAutomationAction,
  evaluateQuota,
  hasCapability,
  type AutomationAction as GatedAction,
} from '@/lib/automation/access';
import { ACTION_CATALOG, actionDefinition } from '@/lib/automation/actions';
import { TRIGGER_CATALOG, triggerDefinition, triggersForOwner } from '@/lib/automation/triggers';
import { CONDITION_CATALOG } from '@/lib/automation/conditions';
import { templatesFor } from '@/lib/automation/templates';
import { checkDependencies } from '@/lib/automation/dependencies';
import { noAutomationAccess, type AutomationAccess, type AutomationDraft, type AutomationScope } from '@/types/automation';

/** A capability set with everything granted. The permissive end of the range. */
const FULL: AutomationAccess = {
  canViewAutomations: true,
  canCreatePersonal: true,
  canCreateForCommunity: true,
  canCreateForOrganization: true,
  canCreateForCreator: true,
  canCreateForBusiness: true,
  // Still false. §66: there is no capability set a member surface constructs
  // that grants platform-wide authority, and a fixture that granted it would be
  // testing a state the client must never produce.
  canCreatePlatformWide: false,
  canNotifyOtherMembers: true,
  canUseFinancialTriggers: true,
  canUseLocationTriggers: true,
  canViewOthersRuns: true,
  canManageOthersAutomations: true,
  maxActiveAutomations: 20,
  provenance: 'server',
  grantedCapabilities: [
    'automations.community',
    'automations.organization',
    'automations.creator',
    'automations.provider',
    'automations.employer',
    'automations.landlord',
    'automations.seller',
    'automations.financial',
    'automations.location',
  ],
};

/** An ordinary member: personal automations only. */
const ORDINARY: AutomationAccess = {
  ...noAutomationAccess(),
  canViewAutomations: true,
  canCreatePersonal: true,
  provenance: 'server',
  maxActiveAutomations: 20,
  grantedCapabilities: [],
};

const SCOPE: AutomationScope = {
  ownerKind: 'user',
  ownerId: 'member-1',
  ownerLabel: 'A member',
  communityIds: [],
  isCrossCommunity: false,
  countryCodes: [],
  neighbourhoodIds: [],
};

const ALL_ACTIONS: GatedAction[] = [
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

// ═════════════════════════════════════════════════════════════════════════════

describe('§49 · the client never decides', () => {
  it('a null capability set hides every action', () => {
    for (const action of ALL_ACTIONS) {
      expect(evaluateAutomationAction(action, null).outcome).toBe('hidden');
    }
  });

  it('a capability set the server did not produce hides every action', () => {
    // `provenance` is the field that carries this, and it is checked before any
    // boolean is read — a locally-constructed set with every flag true still
    // grants nothing.
    const forged: AutomationAccess = { ...FULL, provenance: 'unavailable' };

    for (const action of ALL_ACTIONS) {
      expect(evaluateAutomationAction(action, forged).outcome).toBe('hidden');
    }
  });

  it('hidden rather than disabled, always', () => {
    // §66: route manipulation must not reveal what authorization would have
    // allowed, and a greyed-out control is a disclosure. There is no `blocked`
    // verdict reachable from a missing capability.
    for (const action of ALL_ACTIONS) {
      const verdict = evaluateAutomationAction(action, ORDINARY);
      expect(verdict.outcome === 'allowed' || verdict.outcome === 'hidden').toBe(true);
    }
  });

  it('a capability the server did not grant is not held', () => {
    expect(hasCapability('automations.community', ORDINARY)).toBe(false);
    expect(hasCapability('automations.community', FULL)).toBe(true);
    expect(hasCapability('automations.community', null)).toBe(false);

    // A null requirement means "no specific capability needed" — but only once
    // the server has answered at all. With no answer the result is `false`
    // whatever the requirement, which is the fail-closed direction and was a
    // real defect until this test caught it: the reverse order let the template
    // gallery offer eleven templates to a member the server had said nothing
    // about, which in production is every member.
    expect(hasCapability(null, ORDINARY)).toBe(true);
    expect(hasCapability(null, null)).toBe(false);
    expect(hasCapability(null, noAutomationAccess())).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§66 · a normal member cannot create platform-wide automation', () => {
  it('the platform action is never allowed, even with everything else granted', () => {
    expect(can('create-platform', FULL)).toBe(false);
    expect(can('create-platform', ORDINARY)).toBe(false);
  });

  it('the platform scope is never in the allowed owner list', () => {
    expect(allowedOwnerKinds(FULL)).not.toContain('platform');
    expect(allowedOwnerKinds(ORDINARY)).not.toContain('platform');
  });

  it('no trigger in the catalogue lists platform as an allowed owner', () => {
    // The second line of defence: even if a capability set somehow granted it,
    // there is no trigger a platform-scoped automation could use.
    for (const trigger of TRIGGER_CATALOG) {
      expect(trigger.allowedOwners).not.toContain('platform');
    }
  });

  it('no action in the catalogue lists platform as an allowed owner', () => {
    for (const action of ACTION_CATALOG) {
      expect(action.allowedOwners).not.toContain('platform');
    }
  });

  it('no template is offered to the platform scope', () => {
    expect(templatesFor('platform', FULL)).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§46 · §47 · community and organization authority', () => {
  it('an ordinary member is offered no community trigger', () => {
    const communityTriggers = TRIGGER_CATALOG.filter((trigger) =>
      trigger.allowedOwners.includes('community')
    );
    expect(communityTriggers.length).toBeGreaterThan(0);

    for (const trigger of communityTriggers) {
      expect(canUseTrigger(trigger, 'community', ORDINARY)).toBe(false);
    }
  });

  it('an ordinary member is offered no organization trigger', () => {
    const orgTriggers = TRIGGER_CATALOG.filter((trigger) =>
      trigger.allowedOwners.includes('organization')
    );
    expect(orgTriggers.length).toBeGreaterThan(0);

    for (const trigger of orgTriggers) {
      expect(canUseTrigger(trigger, 'organization', ORDINARY)).toBe(false);
    }
  });

  it('an ordinary member cannot use an action that reaches other people', () => {
    const reaching = ACTION_CATALOG.filter((action) => action.reachesOtherPeople);
    expect(reaching.length).toBeGreaterThan(0);

    for (const action of reaching) {
      for (const owner of action.allowedOwners) {
        expect(canUseAction(action, owner, ORDINARY)).toBe(false);
      }
    }
  });

  it('a moderator is offered community triggers and still no platform ones', () => {
    const moderator: AutomationAccess = {
      ...ORDINARY,
      canCreateForCommunity: true,
      canNotifyOtherMembers: true,
      grantedCapabilities: ['automations.community'],
    };

    const communityTrigger = triggerDefinition('community.memberJoined')!;
    expect(canUseTrigger(communityTrigger, 'community', moderator)).toBe(true);

    expect(allowedOwnerKinds(moderator)).toContain('community');
    expect(allowedOwnerKinds(moderator)).not.toContain('platform');
    expect(allowedOwnerKinds(moderator)).not.toContain('organization');
  });

  it('a community capability does not grant organization authority', () => {
    const moderator: AutomationAccess = {
      ...ORDINARY,
      canCreateForCommunity: true,
      canNotifyOtherMembers: true,
      grantedCapabilities: ['automations.community'],
    };

    const orgTrigger = triggerDefinition('organization.memberJoined')!;
    // §46 and §47 are separate permissions and the capability keys are
    // separate strings, so one cannot be mistaken for the other.
    expect(canUseTrigger(orgTrigger, 'organization', moderator)).toBe(false);
  });

  it('managing somebody else’s automation needs its own capability', () => {
    expect(canManageScope('community', false, ORDINARY)).toBe(false);
    expect(canManageScope('community', false, FULL)).toBe(true);
    // A member's own personal automation only needs the create capability —
    // reviewing a colleague's and editing it are different permissions.
    expect(canManageScope('user', true, ORDINARY)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§48 · financial authority is separately granted', () => {
  it('a member without the financial capability is offered no wallet trigger', () => {
    const walletTriggers = TRIGGER_CATALOG.filter((trigger) => trigger.domain === 'wallet');
    expect(walletTriggers.length).toBeGreaterThan(0);

    for (const trigger of walletTriggers) {
      expect(canUseTrigger(trigger, 'user', ORDINARY)).toBe(false);
    }
  });

  it('the financial gate is independent of the personal one', () => {
    // §48: financial automations require stronger authorization, and a separate
    // field is what lets the server grant one without the other. Deriving it
    // from anything else on the client would be the re-implementation the
    // access module refuses to contain.
    const personalOnly: AutomationAccess = {
      ...ORDINARY,
      canUseFinancialTriggers: false,
      grantedCapabilities: ['automations.financial'],
    };

    const walletTrigger = TRIGGER_CATALOG.find((trigger) => trigger.domain === 'wallet')!;
    expect(canUseTrigger(walletTrigger, 'user', personalOnly)).toBe(false);
  });

  it('every wallet trigger requires the financial capability', () => {
    for (const trigger of TRIGGER_CATALOG) {
      if (trigger.domain === 'wallet') {
        expect(trigger.requiredCapability).toBe('automations.financial');
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§15 · location authority is separately granted, and not held', () => {
  it('a member without the location capability is offered no geofence trigger', () => {
    const geofence = triggerDefinition('location.enteredArea')!;

    expect(canUseTrigger(geofence, 'user', ORDINARY)).toBe(false);
  });

  it('the location gate is independent of everything else', () => {
    const withoutLocation: AutomationAccess = { ...FULL, canUseLocationTriggers: false };
    const geofence = triggerDefinition('location.enteredArea')!;

    expect(canUseTrigger(geofence, 'user', withoutLocation)).toBe(false);
  });

  it('a location trigger carries an explicit privacy note', () => {
    // §15 · §50: continuous location monitoring requires explicit permission,
    // and the note is what the member is agreeing to. A trigger flagged as
    // needing consent with nothing to show them would be a consent screen with
    // no text.
    for (const trigger of TRIGGER_CATALOG) {
      if (trigger.requiresPrivacyConsent) {
        expect(trigger.privacyNote).toBeTruthy();
        expect(trigger.privacyNote!.length).toBeGreaterThan(40);
      }
    }
  });

  it('background location is a dependency the member cannot resolve', () => {
    const draft: AutomationDraft = {
      id: null,
      name: 'Near me',
      description: '',
      scope: SCOPE,
      source: 'builder',
      templateId: null,
      trigger: { key: 'location.enteredArea', parameters: {} },
      conditions: [],
      actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
      schedule: null,
    };

    const dependencies = checkDependencies(draft, {
      access: FULL,
      connectedIntegrations: [],
      pushEnabled: true,
      emailVerified: true,
      enabledChannels: ['InApp', 'Push', 'Email'],
      audience: null,
      isOffline: false,
      now: new Date('2026-08-05T10:00:00.000Z'),
    });

    const background = dependencies.find((entry) => entry.label === 'Background location');
    expect(background).toBeDefined();
    // A `gap`, not `missing`: there is nothing the member can grant, because
    // the app does not request it. Offering a "grant permission" button would
    // be offering something that does not exist.
    expect(background!.state).toBe('gap');
    expect(background!.actionLabel).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§9 · §50 · sensitive conditions are not decided or leaked by the client', () => {
  it('every entitlement condition is marked server-evaluated', () => {
    const entitlements = [
      'walletBalance',
      'amountAbove',
      'subscriptionActive',
      'creatorStatus',
      'applicationStatus',
      'metricAbove',
      'metricBelow',
      'countAbove',
    ];

    for (const key of entitlements) {
      const condition = CONDITION_CATALOG.find((entry) => entry.key === key);
      expect(condition).toBeDefined();
      // A member who could change the answer locally could gain something they
      // should not have, or be told something untrue about themselves.
      expect(condition!.requiresServerEvaluation).toBe(true);
    }
  });

  it('every money condition is marked sensitive', () => {
    for (const condition of CONDITION_CATALOG) {
      if (condition.valueKind === 'money') {
        expect(condition.isSensitive).toBe(true);
      }
    }
  });

  it('no condition reads message content', () => {
    // §29 · §50: a condition over message text would be a content filter
    // running across private conversations, and once the field existed somebody
    // would populate it.
    for (const condition of CONDITION_CATALOG) {
      expect(condition.key).not.toMatch(/message|conversation.*text|body/i);
    }
  });

  it('a sensitive condition’s explanation never quotes the member’s value', () => {
    const { simulate } = require('@/lib/automation/simulation') as {
      simulate: (
        draft: AutomationDraft,
        context: {
          enabledChannels: string[];
          audience: null;
          now: Date;
          serverEvaluated: boolean;
        }
      ) => { run: { conditionOutcomes: { explanation: string }[] } };
    };

    const result = simulate(
      {
        id: null,
        name: 'x',
        description: '',
        scope: SCOPE,
        source: 'builder',
        templateId: null,
        trigger: { key: 'payment.completed', parameters: {} },
        conditions: [{ id: 'c1', key: 'amountAbove', operator: 'greaterThan', value: 412.6 }],
        actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
        schedule: null,
      },
      { enabledChannels: ['InApp'], audience: null, now: new Date(0), serverEvaluated: false }
    );

    // The explanation is durable — a run record has a longer retention than the
    // data it would quote — so it says what was checked, never what it said.
    for (const outcome of result.run.conditionOutcomes) {
      expect(outcome.explanation).not.toContain('412');
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§55 · quota is surfaced before it is hit', () => {
  it('warns while there is still room', () => {
    const quota = evaluateQuota(18, FULL);

    expect(quota.isAtLimit).toBe(false);
    expect(quota.isNearLimit).toBe(true);
    expect(quota.remaining).toBe(2);
  });

  it('reports the limit reached', () => {
    const quota = evaluateQuota(20, FULL);

    expect(quota.isAtLimit).toBe(true);
    expect(quota.remaining).toBe(0);
  });

  it('scales the warning threshold with the limit', () => {
    // A member with a limit of 200 should be warned at 180, not at 197.
    const large: AutomationAccess = { ...FULL, maxActiveAutomations: 200 };

    expect(evaluateQuota(175, large).isNearLimit).toBe(false);
    expect(evaluateQuota(185, large).isNearLimit).toBe(true);
  });

  it('an unlimited allowance never warns', () => {
    const unlimited: AutomationAccess = { ...FULL, maxActiveAutomations: null };
    const quota = evaluateQuota(1000, unlimited);

    expect(quota.isAtLimit).toBe(false);
    expect(quota.isNearLimit).toBe(false);
    expect(quota.remaining).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§31 · templates are permission-aware', () => {
  it('an ordinary member is offered no community template', () => {
    const offered = templatesFor('community', ORDINARY);
    expect(offered).toHaveLength(0);
  });

  it('an ordinary member is offered personal templates', () => {
    const offered = templatesFor('user', ORDINARY);
    expect(offered.length).toBeGreaterThan(0);
  });

  it('a template requiring a capability is withheld without it', () => {
    const withFinancial = templatesFor('user', FULL);
    const withoutFinancial = templatesFor('user', ORDINARY);

    // The payment-failed template requires `automations.financial`.
    expect(withFinancial.some((entry) => entry.id === 'payment-failed')).toBe(true);
    expect(withoutFinancial.some((entry) => entry.id === 'payment-failed')).toBe(false);
  });

  it('a member with no capability set is offered nothing', () => {
    expect(templatesFor('user', null)).toHaveLength(0);
    expect(templatesFor('user', noAutomationAccess())).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§45 · owner scope is enforced in the catalogue as well as the capability set', () => {
  it('a trigger is never offered to an owner kind it does not list', () => {
    for (const trigger of TRIGGER_CATALOG) {
      for (const owner of ['user', 'community', 'organization', 'creator', 'seller'] as const) {
        if (!trigger.allowedOwners.includes(owner)) {
          // Even with everything granted. The catalogue is the first gate and
          // the capability set is the second; a member needs to pass both.
          expect(canUseTrigger(trigger, owner, FULL)).toBe(false);
        }
      }
    }
  });

  it('an action is never offered to an owner kind it does not list', () => {
    for (const action of ACTION_CATALOG) {
      for (const owner of ['user', 'community', 'organization', 'creator', 'seller'] as const) {
        if (!action.allowedOwners.includes(owner)) {
          expect(canUseAction(action, owner, FULL)).toBe(false);
        }
      }
    }
  });

  it('the personal owner is offered a usable set', () => {
    // The sanity check that stops the gates above being trivially satisfied by
    // offering nothing to anybody.
    const offered = triggersForOwner('user').filter((trigger) =>
      canUseTrigger(trigger, 'user', FULL)
    );

    expect(offered.length).toBeGreaterThan(5);
    expect(offered.some((trigger) => trigger.key === 'manual.run')).toBe(true);
  });

  it('every action a trigger offers exists in the action catalogue', () => {
    for (const trigger of TRIGGER_CATALOG) {
      for (const key of trigger.supportedActions) {
        expect(actionDefinition(key)).toBeDefined();
      }
    }
  });

  it('every condition a trigger offers exists in the condition catalogue', () => {
    for (const trigger of TRIGGER_CATALOG) {
      for (const key of trigger.supportedConditions) {
        expect(CONDITION_CATALOG.some((entry) => entry.key === key)).toBe(true);
      }
    }
  });
});
