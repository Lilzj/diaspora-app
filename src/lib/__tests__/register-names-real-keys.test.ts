// -----------------------------------------------------------------------------
// A register that names keys nothing has
//
// `AUTOMATION_GAPS` entries carry a `triggerKeys` array — the trigger keys the
// entry is about. Seventy-six keys are named across the register, and **28 of
// them exist in neither catalogue**: not in this build's `TRIGGER_CATALOG`, not
// in the platform's `AutomationCatalog`. They are names somebody wrote down.
//
// That is not harmless documentation drift. A sweep over this register produced
// "22 trigger keys absent from `AutomationCatalog`", which was carried into a
// phase plan as outstanding work — a figure derived entirely from names the
// register had invented. The two real catalogues agree exactly, at 49 keys, with
// zero drift in either direction.
//
// Some of the 28 are renames of keys that do exist — `boost.ending` is
// `placement.ending`, `wallet.transactionRecorded` is `payment.completed`,
// `analytics.thresholdReached` is `creator.performanceThreshold`. The rest name
// capabilities the platform genuinely does not have, which is what
// `missingBackendCapability` is for: a wish belongs in the field for wishes, not
// in the field that says what the entry covers.
// -----------------------------------------------------------------------------

import { AUTOMATION_GAPS } from '@/config/automation-gaps';
import { TRIGGER_CATALOG } from '@/lib/automation/triggers';

const OFFERED = new Set(TRIGGER_CATALOG.map((trigger) => trigger.key));

/**
 * `'*'` means every trigger, and one entry uses it.
 *
 * `automationEngine` is the gap for the engine itself rather than for any
 * particular trigger, so `triggerKeys: ['*']` and `actionKeys: ['*']` are the
 * honest way to say "all of them". Exempted by name rather than by pattern, so
 * a second wildcard convention would have to be added here deliberately.
 */
const WILDCARD = '*';

describe('the register names triggers that exist', () => {
  it('can see the catalogue it checks against', () => {
    // A probe over an empty set passes for the wrong reason.
    expect(OFFERED.size).toBeGreaterThan(40);
    expect(Object.keys(AUTOMATION_GAPS).length).toBeGreaterThan(10);
  });

  it('names no trigger key this build does not offer', () => {
    const phantom: string[] = [];

    for (const [key, gap] of Object.entries(AUTOMATION_GAPS)) {
      for (const triggerKey of gap.triggerKeys ?? []) {
        if (triggerKey === WILDCARD) continue;
        if (!OFFERED.has(triggerKey)) phantom.push(`${key}: ${triggerKey}`);
      }
    }

    expect(phantom).toEqual([]);
  });
});
