// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — how the builder adds to a draft
//
// Moved out of `app/automation/create.tsx` on 11 Sep 2026 so that the test of
// what reaches the platform is a test of what the builder actually makes. The
// write-contract guard used to be fed drafts written by hand, whose actions had
// no id at all — and the builder gives every one an id. That difference is the
// whole of the defect the guard now exists for: see `toWriteBody`.
// ─────────────────────────────────────────────────────────────────────────────

import type { AutomationDraft } from '@/types/automation';
import { conditionDefinition } from './conditions';

/**
 * The draft with one more condition, or null for a key this build does not know.
 *
 * The id is the builder's own name for the row — `c1-country` — so two rows can
 * be told apart on screen. It is not an identity the platform assigned, and it
 * never reaches the platform as one.
 */
export function withConditionAdded(draft: AutomationDraft, key: string): AutomationDraft | null {
  const definition = conditionDefinition(key);
  if (!definition) return null;

  return {
    ...draft,
    conditions: [
      ...draft.conditions,
      {
        id: `c${draft.conditions.length + 1}-${key}`,
        key,
        operator: definition.operators[0],
        value: null,
      },
    ],
  };
}

/** Adds the action, or takes it away when the draft already has it. */
export function withActionToggled(draft: AutomationDraft, key: string): AutomationDraft {
  if (draft.actions.some((action) => action.key === key)) {
    return { ...draft, actions: draft.actions.filter((action) => action.key !== key) };
  }

  return {
    ...draft,
    actions: [...draft.actions, { id: `a${draft.actions.length + 1}-${key}`, key, parameters: {} }],
  };
}
