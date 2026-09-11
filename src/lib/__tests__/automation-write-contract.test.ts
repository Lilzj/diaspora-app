// ─────────────────────────────────────────────────────────────────────────────
// What the builder writes, read the way the platform reads it — 11 Sep 2026
//
// **Nothing the builder made had ever been accepted.** On the production APK a
// member built "when an event I am going to is starting soon, if the country is
// Mauritius, tell me", pressed Test, and was shown a result. The platform had
// answered `400` in 38 ms without a handler running:
//
//   The JSON value could not be converted to System.Nullable`1[System.Guid].
//   Path: $.conditions[0].id
//
// The builder names its rows `c1-country` and `a1-notify.self`, and the write
// routes bind those `id` fields as `Guid?`. Every create, every edit and every
// test failed at model binding, and the test screen swallowed the refusal and
// ran on the phone instead. With the ids removed, the body bound — and dropped
// the member's time zone, because the builder sent the schedule in the shape the
// platform *answers* with (`timezone: { mode, ianaId }`), while it *reads*
// `timezoneMode` and `timeZoneId` flat, and ignores what it does not know.
//
// The tests before this one posted drafts written by hand, whose actions carried
// no id, so they agreed with the platform and not with the builder. These are
// fed what the builder makes, and check every field against the request records
// in `Diaspora.Modules.Automation/Contracts/V1/Requests/AutomationRequests.cs`.
// ─────────────────────────────────────────────────────────────────────────────

import MockAdapter from 'axios-mock-adapter';

import { apiClient } from '../apiClient';
import {
  createAutomation,
  simulateAutomation,
  updateAutomation,
} from '../automation/certified-client';
import { withActionToggled, withConditionAdded } from '../automation/builder-draft';
import { defaultEventSchedule, defaultSchedule } from '../automation/schedule';
import { TEMPLATE_CATALOG, draftFromTemplate } from '../automation/templates';
import type { AutomationDraft, AutomationScope } from '@/types/automation';

// ── The platform's side, as `AutomationRequests.cs` declares it ─────────────

type Scalar = 'string' | 'guid' | 'int' | 'bool' | 'datetime';
type Kind = Scalar | `${Scalar}[]` | RecordName | `${RecordName}[]`;
type RecordName = keyof typeof RECORDS;

/**
 * Every field each request record has, and what it binds as. Every one is
 * nullable on the platform, so null is always acceptable; a value of the wrong
 * shape is a 400 for the whole request, and a field that is not here is read
 * by nobody.
 */
const RECORDS = {
  AutomationScopeRequest: {
    ownerKind: 'string',
    ownerId: 'guid',
    communityIds: 'guid[]',
    isCrossCommunity: 'bool',
    countryCodes: 'string[]',
    neighbourhoodIds: 'guid[]',
  },
  AutomationTriggerRequest: { key: 'string', parameters: 'string' },
  AutomationConditionRequest: {
    id: 'guid',
    key: 'string',
    operator: 'string',
    value: 'string',
    secondaryValue: 'string',
  },
  AutomationActionRequest: { id: 'guid', key: 'string', parameters: 'string' },
  AutomationScheduleRequest: {
    frequency: 'string',
    timezoneMode: 'string',
    timeZoneId: 'string',
    hour: 'int',
    minute: 'int',
    daysOfWeek: 'int[]',
    dayOfMonth: 'int',
    startsAt: 'datetime',
    endsAt: 'datetime',
    maxExecutions: 'int',
    eventOffsetMinutes: 'int',
    eventOffsetAnchor: 'string',
    customDescription: 'string',
  },
  CreateAutomationRequest: {
    name: 'string',
    description: 'string',
    scope: 'AutomationScopeRequest',
    source: 'string',
    templateId: 'string',
    trigger: 'AutomationTriggerRequest',
    conditions: 'AutomationConditionRequest[]',
    actions: 'AutomationActionRequest[]',
    schedule: 'AutomationScheduleRequest',
    status: 'string',
    idempotencyKey: 'string',
  },
  UpdateAutomationRequest: {
    name: 'string',
    description: 'string',
    trigger: 'AutomationTriggerRequest',
    conditions: 'AutomationConditionRequest[]',
    actions: 'AutomationActionRequest[]',
    schedule: 'AutomationScheduleRequest',
    scope: 'AutomationScopeRequest',
    expectedUpdatedAt: 'datetime',
  },
  SimulateAutomationRequest: {
    name: 'string',
    scope: 'AutomationScopeRequest',
    trigger: 'AutomationTriggerRequest',
    conditions: 'AutomationConditionRequest[]',
    actions: 'AutomationActionRequest[]',
    schedule: 'AutomationScheduleRequest',
    sampleSubjectId: 'guid',
  },
} as const satisfies Record<string, Record<string, string>>;

/**
 * Fields the platform does not read on a particular request, and that are safe
 * to send anyway. Named one by one: an unknown field is how the schedule's zone
 * went missing, so the default is that one is a problem.
 */
const IGNORED_ON: Partial<Record<RecordName, readonly string[]>> = {
  // The simulate route takes a draft's rule, not its bookkeeping.
  SimulateAutomationRequest: ['description', 'source', 'templateId'],
  // Where a rule came from is fixed when it is created. An edit carrying it
  // changes nothing, and the route does not read it.
  UpdateAutomationRequest: ['source', 'templateId'],
};

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function scalarProblem(value: unknown, kind: Scalar): string | null {
  switch (kind) {
    case 'string':
      return typeof value === 'string' ? null : `is ${typeof value}, not a string`;
    case 'guid':
      return typeof value === 'string' && GUID.test(value) ? null : `${JSON.stringify(value)} is not a Guid`;
    case 'int':
      return Number.isInteger(value) ? null : `${JSON.stringify(value)} is not an integer`;
    case 'bool':
      return typeof value === 'boolean' ? null : `${JSON.stringify(value)} is not a boolean`;
    case 'datetime':
      return typeof value === 'string' && !Number.isNaN(Date.parse(value))
        ? null
        : `${JSON.stringify(value)} is not a date`;
  }
}

/** Everything about `value` the platform would refuse or ignore, as sentences. */
function problemsWith(value: unknown, kind: Kind, path: string): string[] {
  if (value === null || value === undefined) return [];

  if (kind.endsWith('[]')) {
    if (!Array.isArray(value)) return [`${path} is not a list`];
    const element = kind.slice(0, -2) as Kind;
    return value.flatMap((item, index) => problemsWith(item, element, `${path}[${index}]`));
  }

  if (kind in RECORDS) {
    if (typeof value !== 'object' || Array.isArray(value)) return [`${path} is not an object`];

    const record = RECORDS[kind as RecordName] as Record<string, Kind>;
    const ignored = IGNORED_ON[kind as RecordName] ?? [];

    return Object.entries(value as Record<string, unknown>).flatMap(([field, fieldValue]) =>
      field in record
        ? problemsWith(fieldValue, record[field], `${path}.${field}`)
        : ignored.includes(field)
          ? []
          : [`${path}.${field} is not read by the platform`]
    );
  }

  const problem = scalarProblem(value, kind as Scalar);
  return problem ? [`${path} ${problem}`] : [];
}

// ── The builder's side ───────────────────────────────────────────────────────

const MEMBER = '0dc73f0c-7efa-4b60-8706-7a60eacace65';
const EVENT = '01a083f8-a050-7465-90c6-3ba0f0adfb3e';
const PLATFORM_CONDITION_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

const personal: AutomationScope = {
  ownerKind: 'user',
  ownerId: MEMBER,
  ownerLabel: 'Kemi',
  communityIds: [],
  isCrossCommunity: false,
  countryCodes: [],
  neighbourhoodIds: [],
};

function empty(scope: AutomationScope = personal): AutomationDraft {
  return {
    id: null,
    name: '',
    description: '',
    scope,
    source: 'builder',
    templateId: null,
    trigger: null,
    conditions: [],
    actions: [],
    schedule: null,
  };
}

/** The draft the device sent on 11 Sep 2026, built the way the builder builds it. */
function deviceDraft(): AutomationDraft {
  let draft: AutomationDraft = {
    ...empty(),
    trigger: { key: 'event.startingSoon', parameters: {} },
    schedule: defaultSchedule('daily'),
  };
  draft = withConditionAdded(draft, 'country')!;
  draft = { ...draft, conditions: [{ ...draft.conditions[0], value: 'MU' }] };
  return withActionToggled(draft, 'notify.self');
}

function drafts(): [string, AutomationDraft][] {
  const eventRelative: AutomationDraft = {
    ...withActionToggled(
      { ...empty(), trigger: { key: 'event.startingSoon', parameters: {} } },
      'reminder.schedule'
    ),
    schedule: defaultEventSchedule('Indian/Mauritius', 'Diaspora test evening'),
  };

  const weekly: AutomationDraft = {
    ...withActionToggled({ ...empty(), trigger: { key: 'manual.run', parameters: {} } }, 'notify.self'),
    schedule: {
      ...defaultSchedule('weekly'),
      daysOfWeek: [1, 3],
      startsAt: '2026-09-14T00:00:00.000Z',
      endsAt: '2026-12-14T00:00:00.000Z',
      maxExecutions: 10,
    },
  };

  const placeholderOwner: AutomationDraft = {
    ...deviceDraft(),
    // `usePersonalScope()` before the member id is known.
    scope: { ...personal, ownerId: 'me' },
  };

  return [
    ['the draft the device sent', deviceDraft()],
    ['an event-relative reminder', eventRelative],
    ['a weekly schedule with dates', weekly],
    ['a scope whose owner is not known yet', placeholderOwner],
    ...TEMPLATE_CATALOG.map(
      (template) =>
        [`template ${template.id}`, draftFromTemplate(template, personal)] as [
          string,
          AutomationDraft,
        ]
    ),
  ];
}

let api: MockAdapter;

beforeEach(() => {
  api = new MockAdapter(apiClient);
  api.onPost('/automations').reply(201, { data: { id: 'x' } });
  api.onPatch(/\/automations\/.+/).reply(200, { data: { id: 'x' } });
  api.onPost('/automations/simulate').reply(200, {
    data: { run: { conditionOutcomes: [] }, wouldHaveDone: [] },
  });
});

afterEach(() => {
  api.restore();
});

function lastBody(method: 'post' | 'patch'): unknown {
  const calls = api.history[method];
  return JSON.parse(calls[calls.length - 1].data);
}

describe.each(drafts())('%s', (_name, draft) => {
  it('is read in full by the create route', async () => {
    await createAutomation(draft, 'idem-1');
    expect(problemsWith(lastBody('post'), 'CreateAutomationRequest', 'body')).toEqual([]);
  });

  it('is read in full by the edit route', async () => {
    await updateAutomation('x', draft, '2026-09-11T12:00:00.000Z');
    expect(problemsWith(lastBody('patch'), 'UpdateAutomationRequest', 'body')).toEqual([]);
  });

  it('is read in full by the test route', async () => {
    await simulateAutomation(draft, EVENT);
    expect(problemsWith(lastBody('post'), 'SimulateAutomationRequest', 'body')).toEqual([]);
  });
});

describe('what the platform is told', () => {
  it('keeps the zone the member chose', async () => {
    const draft = deviceDraft();
    await createAutomation(draft, 'idem-1');

    const body = lastBody('post') as { schedule: Record<string, unknown> };

    expect(body.schedule.timeZoneId).toBe(draft.schedule!.timezone.ianaId);
    expect(body.schedule.timezoneMode).toBe(draft.schedule!.timezone.mode);
  });

  it('keeps how long before the event a reminder goes', async () => {
    const draft: AutomationDraft = {
      ...deviceDraft(),
      schedule: defaultEventSchedule('Indian/Mauritius'),
    };
    await createAutomation(draft, 'idem-1');

    const body = lastBody('post') as { schedule: Record<string, unknown> };

    expect(body.schedule.eventOffsetMinutes).toBe(24 * 60);
    expect(body.schedule.eventOffsetAnchor).toBe('start');
    expect(body.schedule.timeZoneId).toBe('Indian/Mauritius');
  });

  it('sends no schedule for a rule that has none, rather than an empty one', async () => {
    await createAutomation({ ...deviceDraft(), schedule: null }, 'idem-1');

    expect((lastBody('post') as { schedule: unknown }).schedule).toBeNull();
  });

  it('keeps an id the platform gave a condition, so an edit does not replace it', async () => {
    const loaded = deviceDraft();
    const edited: AutomationDraft = {
      ...loaded,
      conditions: [{ ...loaded.conditions[0], id: PLATFORM_CONDITION_ID }],
    };

    await updateAutomation('x', edited, null);

    const body = lastBody('patch') as { conditions: { id: string | null }[] };
    expect(body.conditions[0].id).toBe(PLATFORM_CONDITION_ID);
  });

  it('sends the subject a test is checked against', async () => {
    await simulateAutomation(deviceDraft(), EVENT);

    expect((lastBody('post') as { sampleSubjectId: string }).sampleSubjectId).toBe(EVENT);
  });
});
