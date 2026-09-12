// ─────────────────────────────────────────────────────────────────────────────
// The draft's owner follows the screen's — 12 Sep 2026
//
// Found on the device. The owner of a community opened the builder scoped to it,
// the list offered "The community reaches a milestone — WORKS NOW", and choosing
// it answered **"You do not have permission to use this trigger. Your role in
// this space does not allow this."** — to the person who founded the community.
//
// Neither check was wrong. They were reading different scopes:
//
//   the trigger list   `scope.ownerKind`        the screen's, which by then was
//                                               `community`
//   the needs panel    `draft.scope.ownerKind`  the draft's, captured at the
//                                               first render and never updated
//
// and on a deep link the first render has no `?scope=` parameter at all, so the
// draft kept the default personal scope for the life of the screen. Had the save
// button been reachable it would have written `ownerKind: 'user'` under a trigger
// only a community may own, and the platform would have refused it — the same
// way the organisation scope was dead before Phase 5.
//
// These tests pin the disagreement itself rather than the screen: given a draft
// whose scope has fallen behind, `canUseTrigger` must answer differently for the
// two owner kinds, and the resync must close it.
// ─────────────────────────────────────────────────────────────────────────────

import { canUseTrigger } from '../automation/access';
import { triggerDefinition } from '../automation/triggers';
import type { AutomationAccess, AutomationDraft, AutomationScope } from '@/types/automation';

const MEMBER = '0dc73f0c-7efa-4b60-8706-7a60eacace65';
const COMMUNITY = '01a09071-03f1-7b5b-99b1-283d2de06fe3';

/** What the platform grants the owner of a community, as `DescribeAsync` answers. */
const serverAccess: AutomationAccess = {
  canViewAutomations: true,
  canCreatePersonal: true,
  canCreateForCommunity: true,
  canCreateForOrganization: false,
  canCreateForCreator: false,
  canCreateForBusiness: false,
  canCreatePlatformWide: false,
  canNotifyOtherMembers: true,
  canUseFinancialTriggers: false,
  canUseLocationTriggers: false,
  canViewOthersRuns: false,
  canManageOthersAutomations: false,
  maxActiveAutomations: null,
  provenance: 'server',
  // The exact string the platform grants: `CommunityAutomationAuthority
  // .CommunityCapability`. Spelled out because a near-miss here would make
  // this suite agree with a bug rather than catch one.
  grantedCapabilities: ['automations.community'],
  canReachMembers: true,
  reachRefusal: null,
};

function scopeFor(ownerKind: 'user' | 'community'): AutomationScope {
  return {
    ownerKind,
    ownerId: ownerKind === 'community' ? COMMUNITY : MEMBER,
    ownerLabel: ownerKind === 'community' ? 'Diaspora QA Walkthrough' : 'Me',
    communityIds: ownerKind === 'community' ? [COMMUNITY] : [],
    isCrossCommunity: false,
    countryCodes: [],
    neighbourhoodIds: [],
  };
}

/** The resync the builder runs, as its own function so the test holds the rule. */
function withScope(draft: AutomationDraft, scope: AutomationScope): AutomationDraft {
  return draft.scope.ownerKind === scope.ownerKind && draft.scope.ownerId === scope.ownerId
    ? draft
    : { ...draft, scope };
}

function draftWith(scope: AutomationScope): AutomationDraft {
  return {
    id: null,
    name: '',
    description: '',
    scope,
    source: 'builder',
    templateId: null,
    trigger: { key: 'community.milestoneReached', parameters: {} },
    conditions: [],
    actions: [],
    schedule: null,
  };
}

describe('a community trigger under a stale draft scope', () => {
  const milestone = triggerDefinition('community.milestoneReached')!;

  it('is a trigger only a community may own', () => {
    // The premise. If this ever gains `user`, the defect below stops being one
    // and this test should be deleted rather than adjusted.
    expect(milestone.allowedOwners).toContain('community');
    expect(milestone.allowedOwners).not.toContain('user');
  });

  it('is offered to the community scope the screen is on', () => {
    expect(canUseTrigger(milestone, 'community', serverAccess)).toBe(true);
  });

  it('is refused under the personal scope a stale draft still carries', () => {
    // This is what the device showed. Same trigger, same member, same grant —
    // and the panel called it a permission problem, which it never was.
    expect(canUseTrigger(milestone, 'user', serverAccess)).toBe(false);
  });

  it('agrees again once the draft takes the screen’s scope', () => {
    const stale = draftWith(scopeFor('user'));
    const fresh = withScope(stale, scopeFor('community'));

    expect(canUseTrigger(milestone, stale.scope.ownerKind, serverAccess)).toBe(false);
    expect(canUseTrigger(milestone, fresh.scope.ownerKind, serverAccess)).toBe(true);
    expect(fresh.scope.ownerId).toBe(COMMUNITY);
  });

  it('keeps everything else the member has built', () => {
    const stale = { ...draftWith(scopeFor('user')), name: 'Tell me at ten' };
    const fresh = withScope(stale, scopeFor('community'));

    expect(fresh.name).toBe('Tell me at ten');
    expect(fresh.trigger).toEqual(stale.trigger);
  });

  it('returns the same object when the scopes already agree, so it cannot loop', () => {
    // The resync runs in an effect that sets state. Returning a new object for
    // an unchanged scope would re-render, re-run, and never settle.
    const settled = draftWith(scopeFor('community'));

    expect(withScope(settled, scopeFor('community'))).toBe(settled);
  });
});
