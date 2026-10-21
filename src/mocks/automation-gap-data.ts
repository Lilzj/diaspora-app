// ═════════════════════════════════════════════════════════════════════════════
//
//   ⚠  BACKEND GAP / DEVELOPMENT ONLY  ⚠
//
//   NOTHING IN THIS FILE MIRRORS A CERTIFIED BACKEND CONTRACT.
//
//   The certified backend has no automation contract of any kind — no registry,
//   no engine, no scheduler, no run history, no saved searches, no reminders.
//   This module is the in-memory state a development build uses so the Phase 18
//   surfaces can be built, reviewed and tested now.
//
//   ── The rule this file follows ────────────────────────────────────────────
//
//   **Every record it produces carries `isSimulated: true`.**
//
//   Not "most". Not "the ones that matter". There is no function below with a
//   branch that produces `false`, and §57 is the reason: a simulated automation
//   that looked real in a list, a screenshot or a component test would make the
//   whole honesty apparatus of this phase decorative.
//
//   ── What is deliberately NOT here ─────────────────────────────────────────
//
//   **No money.** No amount, no balance, no payout, no reward credit. §48. The
//   financial *triggers* exist and produce notification-shaped runs; nothing
//   here moves or invents a figure.
//
//   **No real dispatch.** `simulateRun` builds a run record. It imports no
//   notification client and could not send if it wanted to.
//
//   **No widened permissions.** `DEVELOPMENT_ACCESS` has
//   `canCreatePlatformWide: false`, and there is no code path that sets it true
//   — so §66's security test runs against the same answer developers see.
//
//   **No member list, ever.** `audienceFor` returns a count and a sentence.
//   §50 forbids an audience preview becoming a way to enumerate a community.
//
//   See `src/config/automation-gaps.ts` and
//   `frontend-phase-18-backend-gap-register.md`.
//
// ═════════════════════════════════════════════════════════════════════════════

import type {
  AutomationAccess,
  AutomationAudience,
  AutomationAuditEntry,
  AutomationDefinition,
  AutomationRun,
  AutomationScope,
  SavedSearch,
  SavedSearchSubject,
} from '@/types/automation';
import { weakestSupport } from '@/types/automation';
import { actionDefinition } from '@/lib/automation/actions';
import { conditionDefinition } from '@/lib/automation/conditions';
import { triggerDefinition } from '@/lib/automation/triggers';
import { AUTOMATION_GAPS } from '@/config/automation-gaps';

// ─────────────────────────────────────────────────────────────────────────────
// Determinism
//
// Phase 15 established that a fixture whose values move is a fixture that makes
// an inconsistency between two screens a coin toss rather than a finding. So
// nothing here calls `Math.random()`, and time is derived from a fixed epoch
// plus an offset rather than from `Date.now()` — two renders of one automation
// produce byte-identical records, which is what lets a component test assert on
// them.
// ─────────────────────────────────────────────────────────────────────────────

/** A fixed point, so "3 days ago" is the same three days on every run. */
const EPOCH = Date.parse('2026-08-01T09:00:00.000Z');

function at(offsetMinutes: number): string {
  return new Date(EPOCH + offsetMinutes * 60_000).toISOString();
}

/** A stable pseudo-id. Deterministic, and visibly not a real identifier. */
function simId(prefix: string, index: number): string {
  return `sim-${prefix}-${String(index).padStart(3, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutable state
//
// A development build has to let a member create, edit, pause and delete, or
// the surfaces cannot be exercised. The state is per-process and is reset by
// `resetAutomationState()`, which the tests call between cases so one test's
// automation cannot appear in another's list — the in-memory analogue of the
// cache isolation §58 requires.
// ─────────────────────────────────────────────────────────────────────────────

interface Store {
  automations: Map<string, AutomationDefinition>;
  runs: Map<string, AutomationRun>;
  savedSearches: Map<string, SavedSearch>;
  nextId: number;
}

function emptyStore(): Store {
  return {
    automations: new Map(),
    runs: new Map(),
    savedSearches: new Map(),
    nextId: 1,
  };
}

let store: Store = emptyStore();

/**
 * Wipe everything.
 *
 * Called on sign-out as well as between tests. §59: a member who signs out must
 * leave nothing behind for the next one, and while the query cache is keyed per
 * member (`lib/automation/query-keys.ts`), a shared in-memory adapter store
 * would be a second way for one member's automations to reach another.
 */
export function resetAutomationState(): void {
  store = emptyStore();
  seed();
}

// ─────────────────────────────────────────────────────────────────────────────
// Support derivation
//
// Shared with `templates.ts` and the preview so a simulated automation's badge
// matches what the builder said when it was created. Declaring it per fixture
// would drift the first time a trigger's status changed.
// ─────────────────────────────────────────────────────────────────────────────

function deriveSupport(
  triggerKey: string,
  conditionKeys: string[],
  actionKeys: string[]
): { support: AutomationDefinition['support']; gapIds: string[] } {
  const trigger = triggerDefinition(triggerKey);

  const support = weakestSupport([
    trigger?.support ?? 'BACKEND_GAP',
    ...conditionKeys.map((key) => conditionDefinition(key)?.support ?? 'BACKEND_GAP'),
    ...actionKeys.map((key) => actionDefinition(key)?.support ?? 'BACKEND_GAP'),
  ]);

  const gapKeys = new Set<string>();
  if (trigger?.gapKey) gapKeys.add(trigger.gapKey);
  for (const key of conditionKeys) {
    const gapKey = conditionDefinition(key)?.gapKey;
    if (gapKey) gapKeys.add(gapKey);
  }
  for (const key of actionKeys) {
    const gapKey = actionDefinition(key)?.gapKey;
    if (gapKey) gapKeys.add(gapKey);
  }

  const gapIds = Array.from(gapKeys)
    .map((key) => AUTOMATION_GAPS[key]?.id)
    .filter((id): id is string => !!id)
    .sort();

  return { support, gapIds };
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed
//
// Five automations covering the states a member would actually be in, chosen so
// every branch of the Automation Center has something to render: an active one,
// a paused one, one that needs attention, a draft, and one that has run and
// partly failed. A seed of five identical active automations would leave four
// of the five list states untested.
// ─────────────────────────────────────────────────────────────────────────────

const MEMBER_SCOPE: AutomationScope = {
  ownerKind: 'user',
  ownerId: 'me',
  ownerLabel: 'You',
  communityIds: [],
  isCrossCommunity: false,
  countryCodes: [],
  neighbourhoodIds: [],
};

/**
 * A community scope, for the seeded moderator automations.
 *
 * The Center shows one scope at a time, so a build with only `user`-scoped
 * seeds would show an empty list the moment somebody switched to "For a
 * community" — which reads as a fault rather than as the honest empty state it
 * would be. Seeding both means the scope switcher can be exercised.
 */
const COMMUNITY_SCOPE: AutomationScope = {
  ownerKind: 'community',
  ownerId: 'ng',
  ownerLabel: 'Nigeria',
  communityIds: ['ng'],
  isCrossCommunity: false,
  countryCodes: ['NG'],
  neighbourhoodIds: [],
};

const CREATOR_SCOPE: AutomationScope = {
  ownerKind: 'creator',
  ownerId: 'me',
  ownerLabel: 'You, as a creator',
  communityIds: [],
  isCrossCommunity: false,
  countryCodes: [],
  neighbourhoodIds: [],
};

const SELLER_SCOPE: AutomationScope = {
  ownerKind: 'seller',
  ownerId: 'me',
  ownerLabel: 'You, as a seller',
  communityIds: [],
  isCrossCommunity: false,
  countryCodes: [],
  neighbourhoodIds: [],
};

function makeAutomation(input: {
  index: number;
  name: string;
  description: string;
  status: AutomationDefinition['status'];
  triggerKey: string;
  conditions: { key: string; operator: string; value: unknown }[];
  actionKeys: string[];
  scope?: AutomationScope;
  lastRunStatus?: AutomationDefinition['lastRunStatus'];
  attentionReason?: string | null;
  createdOffset: number;
}): AutomationDefinition {
  const conditionKeys = input.conditions.map((condition) => condition.key);
  const { support, gapIds } = deriveSupport(input.triggerKey, conditionKeys, input.actionKeys);

  return {
    id: simId('auto', input.index),
    name: input.name,
    description: input.description,
    status: input.status,
    scope: input.scope ?? MEMBER_SCOPE,
    source: 'template',
    templateId: null,
    trigger: { key: input.triggerKey, parameters: {} },
    conditions: input.conditions.map((condition, position) => ({
      id: `c${position + 1}`,
      key: condition.key,
      operator: condition.operator as never,
      value: condition.value as never,
    })),
    actions: input.actionKeys.map((key, position) => ({
      id: `a${position + 1}`,
      key,
      parameters: {},
    })),
    schedule: null,
    support,
    gapIds,
    createdAt: at(input.createdOffset),
    updatedAt: at(input.createdOffset + 10),
    lastRunAt: input.lastRunStatus ? at(input.createdOffset + 2880) : null,
    // Null on every fixture, and deliberately: the scheduler does not exist
    // (GAP-003), so a simulated `nextRunAt` would be the client displaying a
    // time nothing will honour. §41's rule holds inside the adapter too.
    nextRunAt: null,
    executionCount: input.lastRunStatus ? 3 : 0,
    lastRunStatus: input.lastRunStatus ?? null,
    attentionReason: input.attentionReason ?? null,
    audit: [
      {
        action: 'created',
        at: at(input.createdOffset),
        actorLabel: 'You',
        provenance: 'server',
      },
      ...(input.status === 'ACTIVE'
        ? [
            {
              action: 'activated',
              at: at(input.createdOffset + 10),
              actorLabel: 'You',
              provenance: 'server' as const,
            },
          ]
        : []),
      ...(input.status === 'PAUSED'
        ? [
            {
              action: 'paused',
              at: at(input.createdOffset + 1440),
              actorLabel: 'You',
              provenance: 'server' as const,
            },
          ]
        : []),
    ] satisfies AutomationAuditEntry[],
    isSimulated: true,
  };
}

function seed(): void {
  const automations: AutomationDefinition[] = [
    makeAutomation({
      index: 1,
      name: 'Remind me about events',
      description: 'A day before anything I have registered for.',
      status: 'ACTIVE',
      triggerKey: 'event.startingSoon',
      conditions: [],
      actionKeys: ['notify.self'],
      lastRunStatus: 'COMPLETED',
      createdOffset: -20160,
    }),
    makeAutomation({
      index: 2,
      name: 'Software jobs in Mauritius',
      description: 'New engineering roles as they are posted.',
      status: 'ACTIVE',
      triggerKey: 'savedSearch.newMatch',
      conditions: [
        { key: 'country', operator: 'equals', value: 'MU' },
        { key: 'category', operator: 'includes', value: ['software'] },
      ],
      actionKeys: ['notify.self'],
      lastRunStatus: 'COMPLETED',
      createdOffset: -14400,
    }),
    makeAutomation({
      index: 3,
      name: 'Housing under 20,000 in Curepipe',
      description: 'Paused while I decide.',
      status: 'PAUSED',
      triggerKey: 'savedSearch.newMatch',
      conditions: [{ key: 'priceBelow', operator: 'lessThan', value: 20000 }],
      actionKeys: ['notify.self'],
      lastRunStatus: 'SKIPPED',
      createdOffset: -10080,
    }),
    makeAutomation({
      index: 4,
      name: 'Add events to my calendar',
      description: 'Whenever I register for something.',
      status: 'NEEDS_ATTENTION',
      triggerKey: 'event.rsvpConfirmed',
      conditions: [],
      actionKeys: ['calendar.addEvent'],
      lastRunStatus: 'FAILED',
      attentionReason: 'Your calendar connection needs setting up again.',
      createdOffset: -7200,
    }),
    makeAutomation({
      index: 5,
      name: 'Untitled automation',
      description: '',
      status: 'DRAFT',
      triggerKey: 'manual.run',
      conditions: [],
      actionKeys: ['notify.self'],
      createdOffset: -60,
    }),

    // ── Other scopes ────────────────────────────────────────────────────────
    //
    // The Center shows one scope at a time, so these exist for the same reason
    // the five above cover five different lifecycle states: without them, the
    // scope switcher would show an empty list for every option but the first.
    makeAutomation({
      index: 6,
      name: 'Welcome new members',
      description: 'Send a welcome the moment somebody joins.',
      status: 'ACTIVE',
      triggerKey: 'community.memberJoined',
      conditions: [],
      actionKeys: ['notify.community'],
      scope: COMMUNITY_SCOPE,
      lastRunStatus: 'COMPLETED',
      createdOffset: -18000,
    }),
    makeAutomation({
      index: 7,
      name: 'Tell the community about new events',
      description: 'When an event is published in Nigeria.',
      status: 'PAUSED',
      triggerKey: 'community.eventCreated',
      conditions: [{ key: 'country', operator: 'equals', value: 'NG' }],
      actionKeys: ['notify.community'],
      scope: COMMUNITY_SCOPE,
      createdOffset: -12000,
    }),
    makeAutomation({
      index: 8,
      name: 'Tell me when a reward is ready',
      description: 'So a claimable reward does not sit unnoticed.',
      status: 'ACTIVE',
      triggerKey: 'creator.rewardAvailable',
      conditions: [],
      actionKeys: ['notify.self'],
      scope: CREATOR_SCOPE,
      createdOffset: -9000,
    }),
    makeAutomation({
      index: 9,
      name: 'Remind me before a listing expires',
      description: 'Three days before it stops being shown.',
      status: 'ACTIVE',
      triggerKey: 'listing.expiring',
      conditions: [],
      actionKeys: ['notify.self'],
      scope: SELLER_SCOPE,
      lastRunStatus: 'SKIPPED',
      createdOffset: -6000,
    }),
  ];

  for (const automation of automations) {
    store.automations.set(automation.id, automation);
  }

  seedRuns();
  seedSavedSearches();
  store.nextId = automations.length + 1;
}

/**
 * Runs covering every §36 outcome.
 *
 * Including the two that are *not* failures — skipped and suppressed — because
 * those are the ones most likely to be rendered wrongly, and a fixture set with
 * only successes and failures would let that ship.
 */
function seedRuns(): void {
  const runs: AutomationRun[] = [
    {
      id: simId('run', 1),
      automationId: simId('auto', 1),
      automationName: 'Remind me about events',
      status: 'COMPLETED',
      startedAt: at(-2880),
      completedAt: at(-2879),
      durationMs: 840,
      triggerSummary: 'Lagos Tech Meetup starts tomorrow',
      triggeredAt: at(-2880),
      conditionOutcomes: [],
      actionOutcomes: [
        {
          actionId: 'a1',
          actionKey: 'notify.self',
          label: 'Tell me',
          status: 'succeeded',
          suppressionReason: null,
          failureKind: null,
          message: null,
          resultRef: { kind: 'notification', id: simId('notif', 1), deepLink: '/notifications' },
          completedAt: at(-2879),
        },
      ],
      failureKind: null,
      failureMessage: null,
      recoveryHint: null,
      correlationId: 'sim-corr-0001',
      isSimulated: true,
      wasDeduplicated: false,
    },
    {
      id: simId('run', 2),
      automationId: simId('auto', 2),
      automationName: 'Software jobs in Mauritius',
      status: 'SKIPPED',
      startedAt: at(-1440),
      completedAt: at(-1440),
      durationMs: 120,
      triggerSummary: 'A new job was posted',
      triggeredAt: at(-1440),
      conditionOutcomes: [
        {
          conditionId: 'c1',
          label: 'Country is MU',
          matched: false,
          evaluatedBy: 'server',
          explanation: 'The job was posted in a different country.',
        },
      ],
      actionOutcomes: [],
      failureKind: null,
      failureMessage: null,
      recoveryHint: null,
      correlationId: 'sim-corr-0002',
      isSimulated: true,
      wasDeduplicated: false,
    },
    {
      id: simId('run', 3),
      automationId: simId('auto', 4),
      automationName: 'Add events to my calendar',
      status: 'FAILED',
      startedAt: at(-720),
      completedAt: at(-719),
      durationMs: 2100,
      triggerSummary: 'You registered for Diaspora Business Breakfast',
      triggeredAt: at(-720),
      conditionOutcomes: [],
      actionOutcomes: [
        {
          actionId: 'a1',
          actionKey: 'calendar.addEvent',
          label: 'Add it to my calendar',
          status: 'failed',
          suppressionReason: null,
          failureKind: 'integrationExpired',
          message: 'Your calendar connection needs setting up again.',
          resultRef: null,
          completedAt: at(-719),
        },
      ],
      failureKind: 'integrationExpired',
      failureMessage: 'Your calendar connection needs setting up again.',
      recoveryHint: 'Reconnect your calendar and this will start working again.',
      correlationId: 'sim-corr-0003',
      isSimulated: true,
      wasDeduplicated: false,
    },
    {
      id: simId('run', 4),
      automationId: simId('auto', 1),
      automationName: 'Remind me about events',
      status: 'PARTIALLY_COMPLETED',
      startedAt: at(-360),
      completedAt: at(-359),
      durationMs: 1400,
      triggerSummary: 'Community Iftar starts in one day',
      triggeredAt: at(-360),
      conditionOutcomes: [],
      actionOutcomes: [
        {
          actionId: 'a1',
          actionKey: 'notify.self',
          label: 'Tell me',
          status: 'succeeded',
          suppressionReason: null,
          failureKind: null,
          message: null,
          resultRef: { kind: 'notification', id: simId('notif', 2), deepLink: '/notifications' },
          completedAt: at(-359),
        },
        {
          actionId: 'a2',
          actionKey: 'notify.push',
          label: 'Send me a push notification',
          // Not a failure. A member's own settings working correctly, and the
          // fixture exists so a screen that rendered this as red would be
          // caught.
          status: 'suppressed',
          suppressionReason: 'You have push notifications turned off',
          failureKind: null,
          message: null,
          resultRef: null,
          completedAt: at(-359),
        },
      ],
      failureKind: null,
      failureMessage: null,
      recoveryHint: null,
      correlationId: 'sim-corr-0004',
      isSimulated: true,
      wasDeduplicated: false,
    },
    {
      id: simId('run', 5),
      automationId: simId('auto', 2),
      automationName: 'Software jobs in Mauritius',
      status: 'COMPLETED',
      startedAt: at(-120),
      completedAt: at(-120),
      durationMs: 90,
      triggerSummary: 'A job matching your search was reposted',
      triggeredAt: at(-120),
      conditionOutcomes: [
        {
          conditionId: 'c1',
          label: 'Country is MU',
          matched: true,
          evaluatedBy: 'server',
          explanation: 'The job is in Mauritius.',
        },
      ],
      actionOutcomes: [
        {
          actionId: 'a1',
          actionKey: 'notify.self',
          label: 'Tell me',
          status: 'suppressed',
          suppressionReason: 'You had already been told about this job',
          failureKind: null,
          message: null,
          resultRef: null,
          completedAt: at(-120),
        },
      ],
      failureKind: null,
      failureMessage: null,
      recoveryHint: null,
      correlationId: 'sim-corr-0005',
      isSimulated: true,
      // §39's case: the backend said AlreadyProcessed, and the run renders as a
      // safe completed state rather than as an error. The fixture exists so
      // that rendering is exercised.
      wasDeduplicated: true,
    },
  ];

  for (const run of runs) {
    store.runs.set(run.id, run);
  }
}

function seedSavedSearches(): void {
  const searches: SavedSearch[] = [
    {
      id: simId('search', 1),
      subject: 'jobs',
      name: 'Software in Mauritius',
      criteria: { country: 'MU', category: 'software' },
      querySummary: 'Software · Mauritius',
      alertsEnabled: true,
      alertFrequency: 'instant',
      watchFor: ['newMatch'],
      createdAt: at(-14400),
      lastMatchedAt: null,
      newMatchCount: null,
      automationId: simId('auto', 2),
      isSimulated: true,
    },
    {
      id: simId('search', 2),
      subject: 'housing',
      name: 'Curepipe under 20,000',
      criteria: { neighbourhood: 'curepipe', maxPrice: 20000 },
      querySummary: 'Curepipe · up to 20,000',
      alertsEnabled: false,
      alertFrequency: 'off',
      watchFor: ['newMatch', 'priceChange'],
      createdAt: at(-10080),
      lastMatchedAt: null,
      newMatchCount: null,
      automationId: simId('auto', 3),
      isSimulated: true,
    },
  ];

  for (const search of searches) {
    store.savedSearches.set(search.id, search);
  }
}

seed();

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

export function listAutomationsFor(
  ownerKind: string,
  status: string | null,
  domain: string | null,
  search: string | null
): AutomationDefinition[] {
  let items = Array.from(store.automations.values()).filter(
    (automation) => automation.scope.ownerKind === ownerKind
  );

  if (status && status !== 'all') {
    const wanted = STATUS_TABS[status];
    if (wanted) items = items.filter((automation) => wanted.includes(automation.status));
  }

  if (domain) {
    items = items.filter(
      (automation) => triggerDefinition(automation.trigger.key)?.domain === domain
    );
  }

  if (search) {
    const needle = search.trim().toLowerCase();
    items = items.filter((automation) => automation.name.toLowerCase().includes(needle));
  }

  // Newest first, and stable: two automations created in the same simulated
  // minute fall back to id so the order does not change between renders.
  return items.sort((a, b) =>
    b.createdAt === a.createdAt ? a.id.localeCompare(b.id) : b.createdAt.localeCompare(a.createdAt)
  );
}

/** Which definition statuses each Automation Center tab covers. */
const STATUS_TABS: Record<string, AutomationDefinition['status'][]> = {
  active: ['ACTIVE'],
  paused: ['PAUSED', 'DISABLED'],
  attention: ['NEEDS_ATTENTION', 'EXPIRED'],
  draft: ['DRAFT'],
};

export function findAutomation(id: string): AutomationDefinition | undefined {
  return store.automations.get(id);
}

export function listRunsFor(
  automationId: string | null,
  status: string | null
): AutomationRun[] {
  let runs = Array.from(store.runs.values());
  if (automationId) runs = runs.filter((run) => run.automationId === automationId);
  if (status) runs = runs.filter((run) => run.status === status);
  return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function findRun(id: string): AutomationRun | undefined {
  return store.runs.get(id);
}

export function listSavedSearchesFor(subject: string | null): SavedSearch[] {
  const searches = Array.from(store.savedSearches.values());
  return subject ? searches.filter((search) => search.subject === subject) : searches;
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────────

export function createAutomationSimulated(body: Record<string, unknown>): AutomationDefinition {
  const index = store.nextId++;
  const triggerKey = (body.trigger as { key?: string } | undefined)?.key ?? 'manual.run';
  const conditions = (body.conditions as { id: string; key: string }[] | undefined) ?? [];
  const actions = (body.actions as { id: string; key: string }[] | undefined) ?? [];

  const { support, gapIds } = deriveSupport(
    triggerKey,
    conditions.map((condition) => condition.key),
    actions.map((action) => action.key)
  );

  const automation: AutomationDefinition = {
    id: simId('auto', index),
    name: (body.name as string) || 'Untitled automation',
    description: (body.description as string) ?? '',
    // A newly created automation is a DRAFT unless it asked to be ACTIVE, and
    // the adapter honours the request rather than inventing a state — the
    // builder decides, because the builder is where the dependency check ran.
    status: body.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT',
    scope: (body.scope as AutomationScope) ?? MEMBER_SCOPE,
    source: (body.source as AutomationDefinition['source']) ?? 'builder',
    templateId: (body.templateId as string | null) ?? null,
    trigger: (body.trigger as AutomationDefinition['trigger']) ?? {
      key: 'manual.run',
      parameters: {},
    },
    conditions: (body.conditions as AutomationDefinition['conditions']) ?? [],
    actions: (body.actions as AutomationDefinition['actions']) ?? [],
    schedule: (body.schedule as AutomationDefinition['schedule']) ?? null,
    support,
    gapIds,
    createdAt: at(0),
    updatedAt: at(0),
    lastRunAt: null,
    nextRunAt: null,
    executionCount: 0,
    lastRunStatus: null,
    attentionReason: null,
    audit: [{ action: 'created', at: at(0), actorLabel: 'You', provenance: 'server' }],
    isSimulated: true,
  };

  store.automations.set(automation.id, automation);
  return automation;
}

export function updateAutomationSimulated(
  id: string,
  changes: Record<string, unknown>
): AutomationDefinition | undefined {
  const existing = store.automations.get(id);
  if (!existing) return undefined;

  const updated: AutomationDefinition = {
    ...existing,
    ...(changes.name !== undefined ? { name: changes.name as string } : {}),
    ...(changes.description !== undefined ? { description: changes.description as string } : {}),
    ...(changes.trigger !== undefined
      ? { trigger: changes.trigger as AutomationDefinition['trigger'] }
      : {}),
    ...(changes.conditions !== undefined
      ? { conditions: changes.conditions as AutomationDefinition['conditions'] }
      : {}),
    ...(changes.actions !== undefined
      ? { actions: changes.actions as AutomationDefinition['actions'] }
      : {}),
    ...(changes.schedule !== undefined
      ? { schedule: changes.schedule as AutomationDefinition['schedule'] }
      : {}),
    updatedAt: at(1),
    audit: [
      ...existing.audit,
      { action: 'updated', at: at(1), actorLabel: 'You', provenance: 'server' },
    ],
  };

  // Recomputed rather than carried over: an edit that swapped a CONNECTED
  // action for a gap-backed one must change the badge, and copying the old
  // support status is how a stale one survives an edit.
  const derived = deriveSupport(
    updated.trigger.key,
    updated.conditions.map((condition) => condition.key),
    updated.actions.map((action) => action.key)
  );
  updated.support = derived.support;
  updated.gapIds = derived.gapIds;

  store.automations.set(id, updated);
  return updated;
}

export function setStatusSimulated(
  id: string,
  status: AutomationDefinition['status']
): { automation: AutomationDefinition; cancelledRuns: number } | undefined {
  const existing = store.automations.get(id);
  if (!existing) return undefined;

  const updated: AutomationDefinition = {
    ...existing,
    status,
    updatedAt: at(1),
    // Clearing the reason on any transition away from NEEDS_ATTENTION: a
    // member who has dealt with a problem should not keep reading about it.
    attentionReason: status === 'NEEDS_ATTENTION' ? existing.attentionReason : null,
    audit: [
      ...existing.audit,
      {
        action: status.toLowerCase(),
        at: at(1),
        actorLabel: 'You',
        provenance: 'server',
      },
    ],
  };

  store.automations.set(id, updated);

  // Always zero, and honestly so: nothing is scheduled because there is no
  // scheduler (GAP-003), so no pending run can be cancelled. Inventing a
  // non-zero count would be the adapter claiming the platform does something
  // it does not.
  return { automation: updated, cancelledRuns: 0 };
}

export function deleteAutomationSimulated(id: string): { id: string; deleted: boolean; cancelledRuns: number } {
  store.automations.delete(id);
  const removed = Array.from(store.runs.values()).filter((run) => run.automationId === id);
  for (const run of removed) store.runs.delete(run.id);
  return { id, deleted: true, cancelledRuns: 0 };
}

export function createSavedSearchSimulated(body: Record<string, unknown>): SavedSearch {
  const index = store.nextId++;
  const search: SavedSearch = {
    id: simId('search', index),
    subject: (body.subject as SavedSearchSubject) ?? 'jobs',
    name: (body.name as string) || 'Saved search',
    criteria: (body.criteria as SavedSearch['criteria']) ?? {},
    querySummary: (body.querySummary as string) ?? '',
    alertsEnabled: body.alertsEnabled === true,
    alertFrequency: (body.alertFrequency as SavedSearch['alertFrequency']) ?? 'off',
    watchFor: (body.watchFor as SavedSearch['watchFor']) ?? ['newMatch'],
    createdAt: at(0),
    // Null rather than 0. Nothing has ever evaluated this search, and "0 new
    // matches" is a claim that it was checked and found nothing — which would
    // be the adapter asserting a capability that does not exist.
    lastMatchedAt: null,
    newMatchCount: null,
    automationId: null,
    isSimulated: true,
  };

  store.savedSearches.set(search.id, search);
  return search;
}

export function updateSavedSearchSimulated(
  id: string,
  changes: Record<string, unknown>
): SavedSearch | undefined {
  const existing = store.savedSearches.get(id);
  if (!existing) return undefined;

  const updated: SavedSearch = {
    ...existing,
    ...(changes.name !== undefined ? { name: changes.name as string } : {}),
    ...(changes.alertsEnabled !== undefined
      ? { alertsEnabled: changes.alertsEnabled as boolean }
      : {}),
    ...(changes.alertFrequency !== undefined
      ? { alertFrequency: changes.alertFrequency as SavedSearch['alertFrequency'] }
      : {}),
    ...(changes.watchFor !== undefined
      ? { watchFor: changes.watchFor as SavedSearch['watchFor'] }
      : {}),
  };

  store.savedSearches.set(id, updated);
  return updated;
}

export function deleteSavedSearchSimulated(id: string): { id: string; deleted: boolean } {
  store.savedSearches.delete(id);
  return { id, deleted: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Access — fixed, and deliberately not widenable
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The development capability set.
 *
 * Chosen so a developer can exercise every surface **except** the ones §66
 * requires to be unreachable. `canCreatePlatformWide` is false and there is no
 * argument, no request field and no environment variable that changes it — so
 * the security test asserting a normal member cannot create platform-wide
 * automation runs against exactly the same answer in development as in
 * production.
 */
export const DEVELOPMENT_ACCESS: AutomationAccess = {
  canViewAutomations: true,
  canCreatePersonal: true,
  canCreateForCommunity: true,
  canCreateForOrganization: true,
  canCreateForCreator: true,
  canCreateForBusiness: true,
  canCreatePlatformWide: false,
  canNotifyOtherMembers: true,
  canUseFinancialTriggers: true,
  // Granted with the member's own scope since 21 Oct 2026, as the server does.
  canUseLocationTriggers: true,
  canViewOthersRuns: false,
  canManageOthersAutomations: false,
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
    // Granted on the server since 21 Oct 2026: area triggers are fed by the
    // opt-in, foreground-only presence report, never by background location.
    'automations.location',
  ],


  // Everything this fixture grants includes somebody to reach.
  canReachMembers: true,
  reachRefusal: null,
};

export function accessFor(ownerKind: string): AutomationAccess {
  if (ownerKind === 'platform') {
    // Every field false. §66's exact scenario, answered the same way the real
    // server must answer it.
    return {
      ...DEVELOPMENT_ACCESS,
      canCreatePersonal: false,
      canCreateForCommunity: false,
      canCreateForOrganization: false,
      canCreateForCreator: false,
      canCreateForBusiness: false,
      canCreatePlatformWide: false,
      canNotifyOtherMembers: false,
      // The server reads this from the grant, and nothing is granted here.
      canUseLocationTriggers: false,
      grantedCapabilities: [],
      canReachMembers: true,
      reachRefusal: null,
    };
  }
  return DEVELOPMENT_ACCESS;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audience — a count and a sentence, never a list
// ─────────────────────────────────────────────────────────────────────────────

export function audienceFor(scope: AutomationScope, actionKeys: string[]): AutomationAudience {
  const reachesOthers = actionKeys.some(
    (key) => actionDefinition(key)?.reachesOtherPeople === true
  );

  if (!reachesOthers) {
    return {
      kind: 'self',
      estimatedRecipients: 1,
      provenance: 'server',
      description: 'Only you',
      serverSideFilters: ['Your own notification settings, including quiet hours'],
    };
  }

  // A fixed, deterministic figure derived from the scope rather than a random
  // one, so two renders agree and a test can assert on it.
  const base = scope.communityIds.length > 0 ? 1200 : 340;

  return {
    kind: scope.ownerKind === 'organization' ? 'organization' : 'community',
    estimatedRecipients: base,
    provenance: 'server',
    description:
      scope.communityIds.length > 0
        ? `About ${base} eligible members across ${scope.communityIds.length} ${scope.communityIds.length === 1 ? 'community' : 'communities'}`
        : `About ${base} eligible members`,
    serverSideFilters: [
      'People who have turned this kind of notification off',
      'People outside the areas you chose',
      'People whose membership is not active',
      'Quiet hours in each person’s own timezone',
    ],
  };
}
