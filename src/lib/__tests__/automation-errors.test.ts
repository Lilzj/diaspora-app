// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation errors and idempotency (Frontend Phase 18, §38 · §39 · §40)
//
// §38's eleven failure situations and §39's idempotency rules.
//
// ── The two properties worth naming ──────────────────────────────────────────
//
// **`blame` is the difference between a screen that helps and one that
// accuses.** §77 forbids disguising a backend gap as a frontend defect, and the
// UI consequence is mechanical: `blame === 'platform'` means no retry button
// and no place in the register of things the member did wrong. These tests
// assert the field, because every screen derives its behaviour from it.
//
// **A duplicate is a safe completed state, not an error.** §39 says so in as
// many words, and the failure mode if it is got wrong is subtle: a member shown
// "error: duplicate" for a system correctly refusing to do something twice
// learns to distrust every other message the feature produces.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';

import {
  AutomationError,
  FAILURE_RECOVERY,
  backendGapError,
  invalidConfigurationError,
  isAutomationError,
  offlineError,
  permissionDeniedError,
  shouldRetryAutomation,
  toAutomationError,
} from '@/lib/automation/errors';
import { integrationError } from '@/lib/integrations/errors';
import { AUTOMATION_GAPS } from '@/config/automation-gaps';
import type { AutomationFailureKind } from '@/types/automation';

// ═════════════════════════════════════════════════════════════════════════════

describe('§38 · every failure kind has actionable guidance', () => {
  const kinds: AutomationFailureKind[] = [
    'triggerUnavailable',
    'conditionEvaluationFailed',
    'actionFailed',
    'providerUnavailable',
    'backendUnavailable',
    'permissionDenied',
    'rateLimited',
    'integrationExpired',
    'invalidConfiguration',
    'timeout',
    'duplicateSuppressed',
    'backendGap',
  ];

  it('covers all eleven of §38’s situations, plus the gap', () => {
    for (const kind of kinds) {
      expect(FAILURE_RECOVERY[kind]).toBeDefined();
    }
  });

  it('every entry names something the member can do, or says plainly there is nothing', () => {
    for (const kind of kinds) {
      const recovery = FAILURE_RECOVERY[kind];

      expect(recovery.summary.length).toBeGreaterThan(10);
      expect(recovery.hint.length).toBeGreaterThan(10);
      // An encouraging sentence that leads nowhere is worse than saying there
      // is nothing to do, so every hint has to be one or the other.
      expect(recovery.blame).toMatch(/^(member|platform|transient)$/);
    }
  });

  it('no message contains an identifier, a host or a stack frame', () => {
    // §36: do not expose internal infrastructure detail to ordinary members.
    for (const kind of kinds) {
      const text = `${FAILURE_RECOVERY[kind].summary} ${FAILURE_RECOVERY[kind].hint}`;

      expect(text).not.toMatch(/https?:\/\//);
      expect(text).not.toMatch(/\bat\s+\w+\.\w+/);
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
    }
  });

  it('a platform failure is never blamed on the member', () => {
    for (const kind of ['backendGap', 'triggerUnavailable'] as const) {
      const recovery = FAILURE_RECOVERY[kind];

      expect(recovery.blame).toBe('platform');
      expect(recovery.hint).toMatch(/nothing (is )?wrong|nothing for you to fix|not the member/i);
    }
  });

  it('an integration failure sends the member somewhere useful', () => {
    expect(FAILURE_RECOVERY.integrationExpired.route).toBe('/settings/integrations');
    expect(FAILURE_RECOVERY.integrationExpired.blame).toBe('member');
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§39 · a duplicate is a completed state, not an error', () => {
  it('reads as a normal outcome rather than a fault', () => {
    const recovery = FAILURE_RECOVERY.duplicateSuppressed;

    expect(recovery.summary).toMatch(/already been done/);
    expect(recovery.hint).toMatch(/Nothing is wrong/);
    // Not `member` — nobody did anything wrong, and blaming them for a system
    // working correctly is exactly what §39 is guarding against.
    expect(recovery.blame).not.toBe('member');
  });

  it('a Conflict from the integration layer becomes a duplicate rather than a failure', () => {
    const conflict = integrationError('Conflict', {
      message: 'This has already been recorded.',
      isRetryable: false,
      isTerminal: true,
      isIndeterminate: false,
      needsMemberAction: false,
    });

    const error = toAutomationError(conflict);

    expect(error.kind).toBe('duplicateSuppressed');
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§77 · a backend gap is never a frontend defect', () => {
  it('carries platform blame, is terminal, and is not retryable', () => {
    const error = backendGapError('savedSearches');

    expect(error.kind).toBe('backendGap');
    expect(error.blame).toBe('platform');
    expect(error.isRetryable).toBe(false);
    expect(error.isTerminal).toBe(true);
    expect(error.needsMemberAction).toBe(false);
    expect(error.gapId).toBe(AUTOMATION_GAPS.savedSearches.id);
  });

  it('says the member’s setup is complete', () => {
    const error = backendGapError('automationRegistry');

    expect(error.recoveryHint).toMatch(/nothing for you to fix/);
  });

  it('an unknown gap key still produces a usable refusal', () => {
    const error = backendGapError('notAKey');

    expect(error.kind).toBe('backendGap');
    expect(error.blame).toBe('platform');
    // Null rather than a fabricated id — a notice with an id nobody can look up
    // is worse than one with none.
    expect(error.gapId).toBeNull();
  });

  it('is never retried', () => {
    // The UI consequence: no spinner running three times before a screen that
    // was always going to say "not available yet".
    expect(shouldRetryAutomation(0, backendGapError('savedSearches'))).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§61 · an offline refusal says nothing was sent', () => {
  it('is transient, retryable and not indeterminate', () => {
    const error = offlineError('Creating an automation');

    expect(error.blame).toBe('transient');
    expect(error.isRetryable).toBe(true);
    // Nothing left the device, so there is no ambiguity about whether it
    // happened — which is what stops a member retrying in fear of a duplicate.
    expect(error.isIndeterminate).toBe(false);
  });

  it('says nothing was changed', () => {
    const error = offlineError('Creating an automation');

    expect(error.message).toMatch(/nothing was sent/i);
    expect(error.recoveryHint).toMatch(/Nothing was changed/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§38 · retry policy', () => {
  it('never retries something the member must fix', () => {
    const error = invalidConfigurationError('Bad', 'Fix it');

    expect(error.needsMemberAction).toBe(true);
    expect(shouldRetryAutomation(0, error)).toBe(false);
  });

  it('never retries a permission denial', () => {
    expect(shouldRetryAutomation(0, permissionDeniedError())).toBe(false);
  });

  it('never retries an indeterminate failure', () => {
    // The one worth naming: an indeterminate failure retried automatically is
    // how one automation activation becomes two.
    const indeterminate = new AutomationError({
      kind: 'actionFailed',
      message: 'Timed out',
      recoveryHint: null,
      blame: 'transient',
      gapId: null,
      isRetryable: true,
      isTerminal: false,
      isIndeterminate: true,
      needsMemberAction: false,
      retryAfterSeconds: null,
      correlationId: null,
      recoveryRoute: null,
    });

    expect(shouldRetryAutomation(0, indeterminate)).toBe(false);
  });

  it('retries a transient failure, twice at most', () => {
    const transient = new AutomationError({
      kind: 'backendUnavailable',
      message: 'Offline',
      recoveryHint: null,
      blame: 'transient',
      gapId: null,
      isRetryable: true,
      isTerminal: false,
      isIndeterminate: false,
      needsMemberAction: false,
      retryAfterSeconds: null,
      correlationId: null,
      recoveryRoute: null,
    });

    expect(shouldRetryAutomation(0, transient)).toBe(true);
    expect(shouldRetryAutomation(1, transient)).toBe(true);
    expect(shouldRetryAutomation(2, transient)).toBe(false);
  });

  it('retries an unrecognised failure once, in case it is transient', () => {
    expect(shouldRetryAutomation(0, new Error('who knows'))).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('the error layer wraps rather than replaces', () => {
  it('passes an AutomationError through untouched', () => {
    const original = permissionDeniedError('No.');

    expect(toAutomationError(original)).toBe(original);
  });

  it('carries isIndeterminate through from the integration layer', () => {
    // The field most easily lost in a re-wrap, and the one §39 depends on: a
    // caller has to be able to tell "it definitely did not happen" from "it may
    // have happened anyway".
    const indeterminate = integrationError('ProviderUnavailable', {
      message: 'The service did not answer.',
      isRetryable: true,
      isTerminal: false,
      isIndeterminate: true,
      needsMemberAction: false,
    });

    expect(toAutomationError(indeterminate).isIndeterminate).toBe(true);
  });

  it('carries needsMemberAction through, and blames the member for it', () => {
    const permission = integrationError('PermissionDenied', {
      message: 'Allow notifications to continue.',
      isRetryable: false,
      isTerminal: false,
      isIndeterminate: false,
      needsMemberAction: true,
    });

    const error = toAutomationError(permission);

    expect(error.needsMemberAction).toBe(true);
    expect(error.blame).toBe('member');
    expect(error.recoveryRoute).toBe('/settings/integrations');
  });

  it('blames the platform when the integration layer named a gap', () => {
    const gap = integrationError('BackendGap', {
      message: 'Not available yet.',
      gapId: 'FRONTEND-PHASE16-GAP-004',
      isRetryable: false,
      isTerminal: true,
      isIndeterminate: false,
      needsMemberAction: false,
    });

    const error = toAutomationError(gap);

    expect(error.blame).toBe('platform');
    // Another phase's id, carried through rather than rewritten — the calendar
    // gap belongs to Phase 16 and restating it here would produce two backend
    // tickets for one contract.
    expect(error.gapId).toBe('FRONTEND-PHASE16-GAP-004');
  });

  it('normalises an axios failure through the existing status handling', () => {
    const failure = new axios.AxiosError(
      'Request failed',
      'ERR_BAD_RESPONSE',
      undefined,
      undefined,
      { status: 503, data: {}, statusText: '', headers: {}, config: {} as never }
    );

    const error = toAutomationError(failure, { mutating: false });

    expect(isAutomationError(error)).toBe(true);
    expect(error.message.length).toBeGreaterThan(0);
  });

  it('turns an unknown thrown value into something renderable', () => {
    const error = toAutomationError('a string');

    expect(isAutomationError(error)).toBe(true);
    expect(error.message).toBe('Something went wrong.');
    expect(error.recoveryHint).toBeTruthy();
  });

  it('an unrecognised integration kind degrades to a plain action failure', () => {
    // `IntegrationErrorKind` belongs to another phase, and a member added there
    // should not break this build — it should fall through to the honest
    // default rather than to `undefined`.
    const unknown = integrationError('UnknownError', {
      message: 'Something happened.',
      isRetryable: true,
      isTerminal: false,
      isIndeterminate: false,
      needsMemberAction: false,
    });

    expect(toAutomationError(unknown).kind).toBe('actionFailed');
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('§36 · no error carries anything internal', () => {
  it('a constructed error has no correlation id unless one was supplied', () => {
    expect(backendGapError('savedSearches').correlationId).toBeNull();
    expect(offlineError('x').correlationId).toBeNull();
  });

  it('a permission denial does not name the missing permission', () => {
    // §66: the shape of a community's governance is not something an
    // unauthorized member should be able to enumerate by trying things and
    // reading the errors.
    const error = permissionDeniedError();

    expect(error.message).not.toMatch(/automations\.[a-z]+/);
    expect(error.recoveryHint).not.toMatch(/automations\.[a-z]+/);
  });
});
