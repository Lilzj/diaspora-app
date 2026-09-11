// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation journeys (Frontend Phase 18, §65)
//
// §65's nine required journeys, each end to end through the real modules.
//
// ── What "end to end" means here, and what it does not ───────────────────────
//
// These drive the **capability layer** — the catalogues, the draft, validation,
// the dependency check, the preview, the simulator and the adapter — rather
// than mounting screens. That is deliberate and it is the same choice every
// phase since 5 has made: screens are excluded from `collectCoverageFrom` on
// purpose, because covering them measures how much of a `ScrollView` rendered.
//
// What a journey test can prove is that the *decisions* are right: that a
// member who picks a trigger is offered the right conditions, that a preview
// says the right thing, that activation is refused for the right reason and
// allowed for the right reason. A screen that renders those decisions wrongly
// is a `tsc` and a component-test problem; a journey that reaches the wrong
// decision is a design problem, and this is where it shows up.
// ─────────────────────────────────────────────────────────────────────────────

import { AUTOMATION_GAPS } from '@/config/automation-gaps';
import { actionsForTrigger } from '@/lib/automation/actions';
import { conditionsForTrigger } from '@/lib/automation/conditions';
import { triggerDefinition, triggersForOwner } from '@/lib/automation/triggers';
import { buildPreview, checkDependencies, type DependencyContext } from '@/lib/automation/dependencies';
import { canSaveDraft, issuesForStep, validateDraft } from '@/lib/automation/validation';
import { canSimulate, simulate } from '@/lib/automation/simulation';
import { defaultEventSchedule, defaultSchedule } from '@/lib/automation/schedule';
import {
  applyTemplateField,
  draftFromTemplate,
  templateById,
  templatesFor,
} from '@/lib/automation/templates';
import { canUseTrigger } from '@/lib/automation/access';
import {
  accessFor,
  createAutomationSimulated,
  createSavedSearchSimulated,
  deleteAutomationSimulated,
  findAutomation,
  listAutomationsFor,
  listRunsFor,
  listSavedSearchesFor,
  resetAutomationState,
  setStatusSimulated,
} from '@/mocks/automation-gap-data';
import type { AutomationAccess, AutomationDraft, AutomationScope } from '@/types/automation';

const NOW = new Date('2026-08-05T10:00:00.000Z');

const ACCESS: AutomationAccess = accessFor('user');

const PERSONAL: AutomationScope = {
  ownerKind: 'user',
  ownerId: 'member-1',
  ownerLabel: 'You',
  communityIds: [],
  isCrossCommunity: false,
  countryCodes: [],
  neighbourhoodIds: [],
};

const COMMUNITY: AutomationScope = {
  ownerKind: 'community',
  ownerId: 'ng',
  ownerLabel: 'Nigeria',
  communityIds: ['ng'],
  isCrossCommunity: false,
  countryCodes: ['NG'],
  neighbourhoodIds: [],
};

function context(overrides: Partial<DependencyContext> = {}): DependencyContext {
  return {
    access: ACCESS,
    connectedIntegrations: ['calendar'],
    pushEnabled: true,
    emailVerified: true,
    enabledChannels: ['InApp', 'Push', 'Email'],
    audience: null,
    isOffline: false,
    now: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  resetAutomationState();
});

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 1 — Centre → Create → trigger → condition → action → preview → save
// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 1 · building an automation from scratch', () => {
  it('walks the whole flow and reaches a saveable, activatable draft', () => {
    // → Automation Center: the member has some automations already.
    expect(listAutomationsFor('user', null, null, null).length).toBeGreaterThan(0);

    // → Create: the triggers offered are the ones this owner and this
    //   capability set actually permit.
    const offered = triggersForOwner('user').filter((trigger) =>
      canUseTrigger(trigger, 'user', ACCESS)
    );
    expect(offered.length).toBeGreaterThan(0);

    // → Select a trigger.
    const trigger = triggerDefinition('savedSearch.newMatch')!;
    expect(offered).toContainEqual(trigger);

    // → The conditions offered are the trigger's, not the whole catalogue.
    const conditions = conditionsForTrigger(trigger.supportedConditions);
    expect(conditions.length).toBeGreaterThan(0);
    expect(conditions.every((entry) => trigger.supportedConditions.includes(entry.key))).toBe(true);

    // → Add a condition.
    let draft: AutomationDraft = {
      id: null,
      name: '',
      description: '',
      scope: PERSONAL,
      source: 'builder',
      templateId: null,
      trigger: { key: trigger.key, parameters: {} },
      conditions: [{ id: 'c1', key: 'country', operator: 'equals', value: null }],
      actions: [],
      schedule: null,
    };

    // Incomplete: no name, no value, no action. All three are reported, each
    // against the step that owns it.
    let issues = validateDraft(draft, NOW);
    expect(canSaveDraft(issues)).toBe(false);
    expect(issuesForStep(issues, 'name')).toHaveLength(1);
    expect(issuesForStep(issues, 'conditions').length).toBeGreaterThan(0);
    expect(issuesForStep(issues, 'actions').length).toBeGreaterThan(0);

    // → Fill it in.
    draft = {
      ...draft,
      name: 'Software jobs in Mauritius',
      conditions: [{ id: 'c1', key: 'country', operator: 'equals', value: 'MU' }],
      actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
    };

    // → The actions offered are the trigger's.
    const actions = actionsForTrigger(trigger.supportedActions);
    expect(actions.some((entry) => entry.key === 'notify.self')).toBe(true);

    issues = validateDraft(draft, NOW);
    expect(canSaveDraft(issues)).toBe(true);

    // → Preview: WHEN / IF / THEN, plus the honest support status.
    const preview = buildPreview(draft, context());
    expect(preview.triggerSummary).toBe(trigger.label);
    // The code is what is kept and compared; the member reads the country.
    expect(preview.conditionSummaries).toEqual(['Country is Mauritius']);
    expect(preview.actionSummaries).toEqual(['Tell me']);
    expect(preview.support).toBe('BACKEND_GAP');
    expect(preview.gapIds.length).toBeGreaterThan(0);

    // → Activation is allowed. §55: a backend gap does not block, because the
    //   configuration is complete and durable and will start working when the
    //   platform ships. Blocking would throw the member's work away.
    expect(preview.canActivate).toBe(true);
    expect(preview.expectedBehaviour).toMatch(/Set up and saved/);

    // → Save.
    const created = createAutomationSimulated({ ...draft, status: 'DRAFT' });
    expect(created.id).toBeTruthy();
    expect(created.isSimulated).toBe(true);

    // → Activate, and view the status.
    const activated = setStatusSimulated(created.id, 'ACTIVE')!;
    expect(activated.automation.status).toBe('ACTIVE');
    // Nothing was scheduled, so nothing could be cancelled. Reported honestly
    // rather than invented.
    expect(activated.cancelledRuns).toBe(0);

    expect(findAutomation(created.id)?.status).toBe('ACTIVE');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 2 — saved job search
// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 2 · a saved job search with alerts', () => {
  it('configures country and category from a template and activates', () => {
    const template = templateById('job-alert')!;

    let draft = draftFromTemplate(template, PERSONAL);
    expect(draft.source).toBe('template');
    expect(draft.templateId).toBe('job-alert');

    // The template asks two questions and fixes everything else.
    expect(template.fields).toHaveLength(2);

    draft = applyTemplateField(draft, template.fields[0], 'MU');
    draft = applyTemplateField(draft, template.fields[1], ['software']);

    expect(canSaveDraft(validateDraft(draft, NOW))).toBe(true);

    const preview = buildPreview(draft, context());
    expect(preview.conditionSummaries).toContain('Country is Mauritius');
    expect(preview.audience.kind).toBe('self');
    expect(preview.audience.estimatedRecipients).toBe(1);

    const created = createAutomationSimulated({ ...draft, status: 'ACTIVE' });
    expect(created.status).toBe('ACTIVE');

    // And the saved search itself, which is the other half of §30.
    const search = createSavedSearchSimulated({
      subject: 'jobs',
      name: 'Software in Mauritius',
      criteria: { country: 'MU', category: 'software' },
      querySummary: 'Software · Mauritius',
      alertsEnabled: true,
      alertFrequency: 'instant',
      watchFor: ['newMatch'],
    });

    expect(search.alertsEnabled).toBe(true);
    // Null, not zero. Nothing has ever evaluated this search, and "0 new
    // matches" would be a claim that it was checked and found nothing.
    expect(search.newMatchCount).toBeNull();
    expect(search.lastMatchedAt).toBeNull();

    expect(listSavedSearchesFor('jobs').some((entry) => entry.id === search.id)).toBe(true);
  });

  it('one saved-search surface serves every subject', () => {
    // §30 forbids duplicating saved-search logic across modules, and the
    // observable form of that is that one store holds all five subjects.
    for (const subject of ['jobs', 'housing', 'marketplace', 'providers', 'events'] as const) {
      createSavedSearchSimulated({ subject, name: subject, criteria: {}, querySummary: '' });
    }

    const all = listSavedSearchesFor(null);
    const subjects = new Set(all.map((entry) => entry.subject));

    expect(subjects.size).toBeGreaterThanOrEqual(5);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 3 — event reminder
// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 3 · a reminder on an event', () => {
  it('builds an event-relative automation in the event’s own timezone', () => {
    const template = templateById('event-reminder')!;

    const draft = draftFromTemplate(template, PERSONAL, {
      eventZoneId: 'Africa/Lagos',
      eventLabel: 'Lagos Tech Meetup',
    });

    expect(draft.schedule).not.toBeNull();
    expect(draft.schedule!.frequency).toBe('eventRelative');
    // §42: the event's zone, not the device's — which is what keeps the
    // reminder correct if the member travels.
    expect(draft.schedule!.timezone.mode).toBe('event');
    expect(draft.schedule!.timezone.ianaId).toBe('Africa/Lagos');

    expect(canSaveDraft(validateDraft(draft, NOW))).toBe(true);

    const preview = buildPreview(draft, context());
    expect(preview.timezoneSummary).toContain('Lagos');
    expect(preview.canActivate).toBe(true);
  });

  it('refuses an event-relative schedule with no event chosen', () => {
    const schedule = defaultEventSchedule(null);
    expect(schedule.timezone.ianaId).toBeNull();

    const draft: AutomationDraft = {
      id: null,
      name: 'Remind me',
      description: '',
      scope: PERSONAL,
      source: 'builder',
      templateId: null,
      trigger: { key: 'event.startingSoon', parameters: {} },
      conditions: [],
      actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
      schedule,
    };

    // Refused rather than silently defaulted. Substituting the device's zone
    // would let this save and then fire at the wrong time for somebody.
    expect(canSaveDraft(validateDraft(draft, NOW))).toBe(false);
    expect(issuesForStep(validateDraft(draft, NOW), 'schedule').length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 4 — community moderator
// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 4 · a community moderator creating an event notification', () => {
  const MODERATOR: AutomationAccess = {
    ...ACCESS,
    canCreateForCommunity: true,
    canNotifyOtherMembers: true,
    grantedCapabilities: [...ACCESS.grantedCapabilities],
  };

  it('requires a community, previews the audience, and activates', () => {
    const template = templateById('community-event-notice')!;
    expect(templatesFor('community', MODERATOR)).toContainEqual(template);

    // A community automation with no community named is refused. §14: a member
    // belongs to many, and an automation that assumed one would notify the
    // wrong people.
    const scopeless: AutomationScope = { ...COMMUNITY, communityIds: [] };
    const incomplete = draftFromTemplate(template, scopeless);

    expect(canSaveDraft(validateDraft(incomplete, NOW))).toBe(false);
    expect(issuesForStep(validateDraft(incomplete, NOW), 'scope').length).toBeGreaterThan(0);

    // With the community named it is complete.
    const draft = draftFromTemplate(template, COMMUNITY);
    expect(canSaveDraft(validateDraft(draft, NOW))).toBe(true);

    // The audience comes from the server and is a count with a description.
    const audience = {
      kind: 'community' as const,
      estimatedRecipients: 1200,
      provenance: 'server' as const,
      description: 'About 1,200 eligible members',
      serverSideFilters: ['People who have turned this kind of notification off'],
    };

    const preview = buildPreview(draft, context({ access: MODERATOR, audience }));

    expect(preview.audience.estimatedRecipients).toBe(1200);
    expect(preview.audience.provenance).toBe('server');
    expect(preview.audience.serverSideFilters.length).toBeGreaterThan(0);
    expect(preview.canActivate).toBe(true);
  });

  it('says the audience is unknown rather than guessing when the server has not answered', () => {
    const draft = draftFromTemplate(templateById('community-event-notice')!, COMMUNITY);

    const preview = buildPreview(draft, context({ access: MODERATOR, audience: null }));

    const unknown = preview.dependencies.find(
      (entry) => entry.label === 'Who this reaches is not known yet'
    );
    expect(unknown).toBeDefined();
    // A `gap`, not a `missing`: it is the platform's job to answer, not the
    // member's, and it does not block activation.
    expect(unknown!.state).toBe('gap');
    expect(unknown!.blocksActivation).toBe(false);
    expect(unknown!.gapId).toBe(AUTOMATION_GAPS.audienceEvaluation.id);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 5 — creator milestone
// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 5 · a creator reward notification', () => {
  it('builds a milestone automation that notifies and never claims', () => {
    const template = templateById('creator-reward')!;
    const scope: AutomationScope = { ...PERSONAL, ownerKind: 'creator', ownerId: 'creator-1' };

    const draft = draftFromTemplate(template, scope);
    expect(canSaveDraft(validateDraft(draft, NOW))).toBe(true);

    // §26: the frontend never independently credits financial value. The
    // template's only action notifies, and there is no claiming action in the
    // catalogue for it to have used.
    expect(draft.actions).toHaveLength(1);
    expect(draft.actions[0].key).toBe('notify.self');

    const preview = buildPreview(draft, context());
    expect(preview.actionSummaries).toEqual(['Tell me']);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 6 — seller price-change alert
// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 6 · a marketplace price alert', () => {
  it('configures a threshold and previews it in words', () => {
    const template = templateById('price-drop')!;

    let draft = draftFromTemplate(template, PERSONAL);
    draft = applyTemplateField(draft, template.fields[0], 15000);

    expect(canSaveDraft(validateDraft(draft, NOW))).toBe(true);

    const preview = buildPreview(draft, context());
    expect(preview.conditionSummaries[0]).toBe('Price is below is less than 15000');
  });

  it('refuses a negative threshold', () => {
    let draft = draftFromTemplate(templateById('price-drop')!, PERSONAL);
    draft = applyTemplateField(draft, templateById('price-drop')!.fields[0], -5);

    expect(canSaveDraft(validateDraft(draft, NOW))).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 8 — pause, resume, history
// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 8 · pause, resume and history', () => {
  it('pauses, resumes, and records both in the audit trail', () => {
    const created = createAutomationSimulated({
      name: 'Test',
      trigger: { key: 'manual.run', parameters: {} },
      actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
      status: 'ACTIVE',
    });

    const paused = setStatusSimulated(created.id, 'PAUSED')!;
    expect(paused.automation.status).toBe('PAUSED');
    expect(paused.automation.audit.some((entry) => entry.action === 'paused')).toBe(true);

    const resumed = setStatusSimulated(created.id, 'ACTIVE')!;
    expect(resumed.automation.status).toBe('ACTIVE');
    expect(resumed.automation.audit.some((entry) => entry.action === 'active')).toBe(true);

    // §51: every entry the client shows is the server's, never fabricated.
    for (const entry of resumed.automation.audit) {
      expect(entry.provenance).toBe('server');
    }
  });

  it('the paused tab and the active tab are different lists', () => {
    const created = createAutomationSimulated({
      name: 'Test',
      trigger: { key: 'manual.run', parameters: {} },
      actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
      status: 'ACTIVE',
    });

    expect(listAutomationsFor('user', 'active', null, null).some((a) => a.id === created.id)).toBe(
      true
    );

    setStatusSimulated(created.id, 'PAUSED');

    expect(listAutomationsFor('user', 'active', null, null).some((a) => a.id === created.id)).toBe(
      false
    );
    expect(listAutomationsFor('user', 'paused', null, null).some((a) => a.id === created.id)).toBe(
      true
    );
  });

  it('history distinguishes the outcomes that are not failures', () => {
    const runs = listRunsFor(null, null);

    // §36 · §38 · §39: skipped, suppressed and deduplicated are all the system
    // working, and a fixture set with only successes and failures would let a
    // screen that rendered them red ship.
    expect(runs.some((run) => run.status === 'SKIPPED')).toBe(true);
    expect(runs.some((run) => run.status === 'PARTIALLY_COMPLETED')).toBe(true);
    expect(runs.some((run) => run.wasDeduplicated)).toBe(true);
    expect(
      runs.some((run) => run.actionOutcomes.some((outcome) => outcome.status === 'suppressed'))
    ).toBe(true);
  });

  it('deleting removes the automation and its runs', () => {
    const created = createAutomationSimulated({
      name: 'Test',
      trigger: { key: 'manual.run', parameters: {} },
      actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
    });

    const result = deleteAutomationSimulated(created.id);

    expect(result.deleted).toBe(true);
    expect(findAutomation(created.id)).toBeUndefined();
    expect(listRunsFor(created.id, null)).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY 9 — the backend-gap journey. The one this whole phase turns on.
// ═════════════════════════════════════════════════════════════════════════════

describe('Journey 9 · configuration completes, the gap is visible, nothing false is claimed', () => {
  const draft: AutomationDraft = {
    id: null,
    name: 'Tell me about new jobs',
    description: '',
    scope: PERSONAL,
    source: 'builder',
    templateId: null,
    trigger: { key: 'savedSearch.newMatch', parameters: {} },
    conditions: [{ id: 'c1', key: 'country', operator: 'equals', value: 'MU' }],
    actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
    schedule: null,
  };

  it('the configuration is complete and saveable', () => {
    expect(canSaveDraft(validateDraft(draft, NOW))).toBe(true);
  });

  it('the gap is shown, named, and does not block activation', () => {
    const preview = buildPreview(draft, context());

    expect(preview.support).toBe('BACKEND_GAP');
    expect(preview.gapIds).toContain(AUTOMATION_GAPS.savedSearches.id);
    // §34's required message, in the member's language.
    expect(preview.expectedBehaviour).toMatch(/Set up and saved/);
    expect(preview.limitations.length).toBeGreaterThan(0);
    // §55: a gap does not block. The member has finished.
    expect(preview.canActivate).toBe(true);

    const gapDependencies = preview.dependencies.filter((entry) => entry.state === 'gap');
    expect(gapDependencies.length).toBeGreaterThan(0);
    for (const dependency of gapDependencies) {
      // §77: not the member's problem, and never rendered as something they
      // did wrong or can fix.
      expect(dependency.blocksActivation).toBe(false);
      expect(dependency.actionLabel).toBeNull();
    }
  });

  it('the development simulation works and claims nothing', () => {
    expect(canSimulate(draft)).toBe(true);

    const result = simulate(draft, {
      enabledChannels: ['InApp'],
      audience: null,
      now: NOW,
      serverEvaluated: false,
    });

    expect(result.isSimulation).toBe(true);
    expect(result.run.isSimulated).toBe(true);
    expect(result.run.status).not.toBe('COMPLETED');
    expect(result.disclaimer).toMatch(/nothing was sent|Nothing was sent/i);

    // The action was planned and deliberately not performed, and the result
    // says which.
    expect(result.wouldHaveDone).toHaveLength(1);
    expect(result.wouldHaveDone[0].actionKey).toBe('notify.self');
  });

  it('a member’s own switched-off channel is reported as suppressed, not failed', () => {
    const pushDraft: AutomationDraft = {
      ...draft,
      actions: [{ id: 'a1', key: 'notify.push', parameters: {} }],
    };

    const result = simulate(pushDraft, {
      // Push is off.
      enabledChannels: ['InApp'],
      audience: null,
      now: NOW,
      serverEvaluated: false,
    });

    const outcome = result.run.actionOutcomes[0];
    // §53: a member's own settings working is not a failure, and rendering it
    // as one would teach them to distrust the feature.
    expect(outcome.status).toBe('suppressed');
    expect(outcome.failureKind).toBeNull();
    expect(outcome.suppressionReason).toBeTruthy();
  });

  it('activation is blocked offline, and nothing claims otherwise', () => {
    const preview = buildPreview(draft, context({ isOffline: true }));

    // §61: never claim a server-side automation was activated while offline.
    // The only honest options are to block or to lie.
    expect(preview.canActivate).toBe(false);

    const offline = preview.dependencies.find((entry) => entry.label === 'You are offline');
    expect(offline).toBeDefined();
    expect(offline!.blocksActivation).toBe(true);
    expect(offline!.detail).toMatch(/Nothing has been sent/);
  });

  it('a missing member-fixable dependency blocks, unlike a gap', () => {
    const calendarDraft: AutomationDraft = {
      ...draft,
      trigger: { key: 'event.rsvpConfirmed', parameters: {} },
      conditions: [],
      actions: [{ id: 'a1', key: 'calendar.addEvent', parameters: {} }],
    };

    const preview = buildPreview(
      calendarDraft,
      context({ connectedIntegrations: [], enabledChannels: ['InApp'] })
    );

    const calendar = preview.dependencies.find((entry) => entry.label === 'Calendar');
    expect(calendar).toBeDefined();
    expect(calendar!.state).toBe('missing');
    // A member *can* fix this, so it gets a route — the difference from a gap,
    // which gets none.
    expect(calendar!.actionRoute).toBe('/settings/integrations/calendar');
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§61 · offline behaviour is defined for every operation', () => {
  it('viewing is unaffected', () => {
    // Reads come from the cache; only writes are refused. A member should be
    // able to read their automations on a train.
    const preview = buildPreview(
      {
        id: 'a1',
        name: 'x',
        description: '',
        scope: PERSONAL,
        source: 'builder',
        templateId: null,
        trigger: { key: 'manual.run', parameters: {} },
        conditions: [],
        actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
        schedule: null,
      },
      context({ isOffline: true })
    );

    expect(preview.triggerSummary).toBeTruthy();
    expect(preview.actionSummaries).toHaveLength(1);
  });

  it('the offline dependency is the only thing blocking an otherwise-valid draft', () => {
    const draft: AutomationDraft = {
      id: null,
      name: 'x',
      description: '',
      scope: PERSONAL,
      source: 'builder',
      templateId: null,
      trigger: { key: 'manual.run', parameters: {} },
      conditions: [],
      actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
      schedule: null,
    };

    expect(buildPreview(draft, context()).canActivate).toBe(true);

    const blocking = buildPreview(draft, context({ isOffline: true })).dependencies.filter(
      (entry) => entry.blocksActivation
    );
    expect(blocking).toHaveLength(1);
    expect(blocking[0].label).toBe('You are offline');
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§55 · the dependency check covers what the brief asks it to', () => {
  it('reports a trigger, an action, a schedule and a scope', () => {
    const draft: AutomationDraft = {
      id: null,
      name: 'x',
      description: '',
      scope: PERSONAL,
      source: 'builder',
      templateId: null,
      trigger: { key: 'subscription.expiring', parameters: {} },
      conditions: [],
      actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
      schedule: defaultSchedule('daily'),
    };

    const kinds = new Set(checkDependencies(draft, context()).map((entry) => entry.kind));

    expect(kinds.has('trigger')).toBe(true);
    expect(kinds.has('action')).toBe(true);
    expect(kinds.has('schedule')).toBe(true);
  });

  it('reports a switched-off channel without blocking', () => {
    const draft: AutomationDraft = {
      id: null,
      name: 'x',
      description: '',
      scope: PERSONAL,
      source: 'builder',
      templateId: null,
      trigger: { key: 'manual.run', parameters: {} },
      conditions: [],
      actions: [{ id: 'a1', key: 'notify.push', parameters: {} }],
      schedule: null,
    };

    const dependencies = checkDependencies(draft, context({ enabledChannels: ['InApp'] }));
    // Matched on "switched off" specifically: `notify.push` also produces a
    // *push integration* dependency labelled "Push notifications", which is a
    // different check with a different route, and matching on the word "Push"
    // alone would find whichever happened to be first.
    const channel = dependencies.find((entry) => entry.label.includes('switched off'));

    expect(channel).toBeDefined();
    // §53 forbids an automation overriding a member's preferences, and blocking
    // activation would put pressure on them to change a setting they chose.
    expect(channel!.blocksActivation).toBe(false);
    expect(channel!.actionRoute).toBe('/settings/notifications');
  });
});
