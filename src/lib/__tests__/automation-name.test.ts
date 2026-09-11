// ─────────────────────────────────────────────────────────────────────────────
// What an unnamed automation is called — 11 Sep 2026
//
// The builder had two rules for one field. `validateDraft` refused to save a
// rule with no name — "Give this automation a name so you can recognise it
// later" — while the save itself had always supplied one: the trigger's label.
// The box showed that same label as placeholder text, so on the device it read
// like a name that was already filled in, above a disabled Save button.
//
// One rule now: an empty name takes the trigger's label, `nameForDraft` is the
// only place that decides it, and the screen says so under the field.
// ─────────────────────────────────────────────────────────────────────────────

import { nameForDraft } from '../automation/builder-draft';
import { canSaveDraft, issuesForStep, validateDraft } from '../automation/validation';
import { triggerDefinition } from '../automation/triggers';
import type { AutomationDraft, AutomationScope } from '@/types/automation';

const NOW = new Date('2026-09-11T10:00:00.000Z');

const scope: AutomationScope = {
  ownerKind: 'user',
  ownerId: '0dc73f0c-7efa-4b60-8706-7a60eacace65',
  ownerLabel: 'You',
  communityIds: [],
  isCrossCommunity: false,
  countryCodes: [],
  neighbourhoodIds: [],
};

function draft(overrides: Partial<AutomationDraft> = {}): AutomationDraft {
  return {
    id: null,
    name: '',
    description: '',
    scope,
    source: 'builder',
    templateId: null,
    trigger: { key: 'manual.run', parameters: {} },
    conditions: [],
    actions: [{ id: 'a1-notify.self', key: 'notify.self', parameters: {} }],
    schedule: null,
    ...overrides,
  };
}

describe('naming a rule', () => {
  it('takes the trigger’s label when the member leaves it blank', () => {
    const label = triggerDefinition('manual.run')!.label;

    expect(nameForDraft(draft(), label)).toBe(label);
  });

  it('keeps what the member typed, trimmed', () => {
    expect(nameForDraft(draft({ name: '  Morning check  ' }), 'Anything')).toBe('Morning check');
  });

  it('falls back to something rather than an empty name', () => {
    // No trigger chosen yet: the rule cannot be saved for that reason, and this
    // still never returns "".
    expect(nameForDraft(draft(), null)).toBe('My automation');
    expect(nameForDraft(draft(), '   ')).toBe('My automation');
  });
});

describe('what blocks a save', () => {
  it('does not block on an empty name', () => {
    const issues = validateDraft(draft(), NOW);

    expect(issuesForStep(issues, 'name')).toHaveLength(0);
    expect(canSaveDraft(issues)).toBe(true);
  });

  it('still blocks a name too long to render in a list', () => {
    const issues = validateDraft(draft({ name: 'x'.repeat(200) }), NOW);

    expect(issuesForStep(issues, 'name').length).toBeGreaterThan(0);
    expect(canSaveDraft(issues)).toBe(false);
  });

  it('still blocks the things that really are missing', () => {
    const issues = validateDraft(draft({ trigger: null, actions: [] }), NOW);

    expect(canSaveDraft(issues)).toBe(false);
    expect(issuesForStep(issues, 'trigger').length).toBeGreaterThan(0);
    expect(issuesForStep(issues, 'actions').length).toBeGreaterThan(0);
  });
});

describe('the screen and the save agree', () => {
  const fs = require('fs') as { readFileSync(p: string, e: string): string };
  const path = require('path') as { join(...s: string[]): string };
  const screen = fs.readFileSync(
    path.join(process.cwd(), 'src', 'app', 'automation', 'create.tsx'),
    'utf8'
  );

  it('sends the name that function decides', () => {
    expect(screen).toMatch(/name: nameForDraft\(draft, trigger\?\.label\)/);
    expect(screen).not.toMatch(/draft\.name\.trim\(\) \|\| \(trigger\?\.label/);
  });

  it('tells the member what it will be called', () => {
    expect(screen).toMatch(/Leave this blank and it will be called/);
  });
});
