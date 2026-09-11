// -----------------------------------------------------------------------------
// The builder told members that 43 working triggers were not connected
//
// `AutomationTriggerDefinition.support` is a constant compiled into the app. It
// was this build's belief about the backend on the day it was written, and the
// builder rendered a badge from it, computed the preview card from it, and wrote
// the "Before you turn it on" limitations from it.
//
// Measured against the deployed catalogue on 11 Sep 2026: **59 of the 83 parts
// this build declares a gap are served by the deployment** — 43 triggers, 6
// conditions and 10 actions. `useAutomationCatalog` had been fetching the real
// answer since Wave C-06 and exactly one screen read it, the template gallery.
//
// So a member assembling a rule out of parts that all work today was told:
//
//   "Diaspora cannot do this automatically yet. Your setup is saved and will
//    start working when it can."
//
// about an action the platform performs, and
//
//   "Diaspora cannot check this yet, so it will be ignored until it can."
//
// about a condition it checks. Neither sentence was true, and the second is the
// one most likely to make somebody delete a condition that was working.
//
// The deployment now answers for the five seam-backed conditions too —
// `walletBalance`, `subscriptionActive`, `creatorStatus`, `metricAbove`,
// `metricBelow` — which its own catalogue had been denying while the evaluator
// resolved them. See `AutomationCatalogTruthfulnessTests` in the backend.
// -----------------------------------------------------------------------------

import { buildPreview } from '@/lib/automation/dependencies';
import { resolvePartSupport, servedSupportLookup } from '@/lib/automation/served-support';
import type { DependencyContext } from '@/lib/automation/dependencies';
import type { AutomationDraft } from '@/types/automation';

const CONNECTED_EVERYWHERE = servedSupportLookup({
  triggers: [{ key: 'event.startingSoon', domain: 'events', isAvailable: true }],
  conditions: [{ key: 'country', domain: 'community', isAvailable: true }],
  actions: [{ key: 'notify.self', domain: 'notifications', isAvailable: true }],
} as never);

const DENIED_EVERYWHERE = servedSupportLookup({
  triggers: [{ key: 'event.startingSoon', domain: 'events', isAvailable: false }],
  conditions: [{ key: 'country', domain: 'community', isAvailable: false }],
  actions: [{ key: 'notify.self', domain: 'notifications', isAvailable: false }],
} as never);

const DRAFT: AutomationDraft = {
  name: 'Test',
  scope: { ownerKind: 'user', ownerId: null, label: 'Me' },
  trigger: { key: 'event.startingSoon', parameters: {} },
  conditions: [{ id: 'c1', key: 'country', operator: 'equals', value: 'MU' }],
  actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
  schedule: null,
} as never;

function contextWith(servedSupport: DependencyContext['servedSupport']): DependencyContext {
  return {
    access: null,
    connectedIntegrations: [],
    pushEnabled: true,
    emailVerified: true,
    enabledChannels: ['InApp', 'Push'],
    audience: null,
    isOffline: false,
    now: new Date('2026-09-11T00:00:00Z'),
    servedSupport,
  };
}

describe('the deployment decides, not the compiled constant', () => {
  it('reports a part the deployment serves as connected', () => {
    expect(
      resolvePartSupport(CONNECTED_EVERYWHERE, 'trigger', 'event.startingSoon', 'BACKEND_GAP')
    ).toBe('CONNECTED');
  });

  it('reports a part the deployment refuses as a gap, whatever the build believed', () => {
    // The direction that matters most: a build shipped believing a part worked,
    // deployed against a platform that cannot do it. The deployment wins.
    expect(
      resolvePartSupport(DENIED_EVERYWHERE, 'action', 'notify.self', 'CONNECTED')
    ).toBe('BACKEND_GAP');
  });

  it('keeps what this build declared when the catalogue has not answered', () => {
    // Null until the fetch returns. Repainting every badge through a wrong state
    // on the way would be worse than being briefly out of date, and a catalogue
    // that never answers must not empty the builder.
    const unanswered = servedSupportLookup(null);

    expect(resolvePartSupport(unanswered, 'trigger', 'event.startingSoon', 'BACKEND_GAP'))
      .toBe('BACKEND_GAP');
    expect(resolvePartSupport(unanswered, 'trigger', 'event.startingSoon', 'CONNECTED'))
      .toBe('CONNECTED');
  });
});

describe('the preview card stops contradicting the platform', () => {
  it('does not call a served automation a gap', () => {
    const preview = buildPreview(DRAFT, contextWith(CONNECTED_EVERYWHERE));

    expect(preview.support).toBe('CONNECTED');
    expect(preview.limitations).toEqual([]);
  });

  it('still says so when the deployment genuinely cannot', () => {
    const preview = buildPreview(DRAFT, contextWith(DENIED_EVERYWHERE));

    expect(preview.support).toBe('BACKEND_GAP');
  });

  it('falls back to the build declaration with no catalogue', () => {
    // `event.startingSoon` is declared BACKEND_GAP by this build, so with no
    // deployment answer the preview must keep saying so rather than guessing.
    const preview = buildPreview(DRAFT, contextWith(undefined));

    expect(preview.support).toBe('BACKEND_GAP');
  });
});

describe('the builder is wired to it', () => {
  const fs = require('fs') as { readFileSync(p: string, e: string): string };
  const path = require('path') as { join(...s: string[]): string };
  const read = (...seg: string[]) =>
    fs.readFileSync(path.join(process.cwd(), 'src', ...seg), 'utf8');

  it('passes the lookup to both pickers', () => {
    const screen = read('app', 'automation', 'create.tsx');

    expect(screen).toMatch(/useAutomationCatalog\(\)/);
    expect((screen.match(/servedSupport=\{servedSupport\}/g) ?? []).length).toBe(2);
  });

  it('badges from the deployment rather than the constant', () => {
    const controls = read('components', 'automation', 'BuilderControls.tsx');

    expect(controls).toMatch(/resolvePartSupport\(servedSupport, 'trigger'/);
    expect(controls).toMatch(/resolvePartSupport\(servedSupport, 'action'/);
  });

  it('puts the lookup on the dependency context', () => {
    const hook = read('hooks', 'automation.ts');

    // The context object literal carries it, and the memo depends on it —
    // without the dependency the builder keeps the first lookup it ever saw,
    // which is the empty one, forever.
    expect(hook).toContain('servedSupport,');
    expect(hook).toContain('[access, support, isOffline, servedSupport]');
  });
});
