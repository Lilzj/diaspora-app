// ─────────────────────────────────────────────────────────────────────────────
// Saying there is nobody to reach, before the rule is turned on — 12 Sep 2026
//
// The platform has always known. `CommunityAutomationAuthority` writes the
// sentence — "This community has not been opened yet, so there is nobody to
// notify. It will reach members once Diaspora opens it." — and
// `AutomationActionDispatcher` reads it and records it as the reason an action
// did nothing.
//
// **Nobody was ever shown it in time.** The capabilities route carried neither
// `canReachMembers` nor `reachRefusal`, and the dry run did not consult the
// grant either, so a member could build "when this community reaches a
// milestone, tell the community", turn it on, and learn from a run record that
// there had been nobody to tell. Found on the device: the builder said
// "This will run whenever its trigger happens." with no caveat at all, on a
// community Diaspora had not opened.
//
// Both fields are served now. These tests pin what the builder does with them.
// ─────────────────────────────────────────────────────────────────────────────

import { checkDependencies } from '../automation/dependencies';
import { noAutomationAccess, type AutomationAccess, type AutomationDraft } from '@/types/automation';
import type { DependencyContext } from '../automation/dependencies';

const COMMUNITY = '01a09071-03f1-7b5b-99b1-283d2de06fe3';

/** The platform's own words for a community it has not opened. */
const NOT_OPENED =
  'This community has not been opened yet, so there is nobody to notify. It will reach members '
  + 'once Diaspora opens it.';

function accessWith(reach: { canReachMembers: boolean; reachRefusal: string | null }): AutomationAccess {
  return {
    ...noAutomationAccess(),
    provenance: 'server',
    canViewAutomations: true,
    canCreatePersonal: true,
    canCreateForCommunity: true,
    canNotifyOtherMembers: true,
    grantedCapabilities: ['automations.community'],
    ...reach,
  };
}

function contextWith(access: AutomationAccess): DependencyContext {
  return {
    access,
    connectedIntegrations: [],
    pushEnabled: true,
    emailVerified: true,
    enabledChannels: ['InApp', 'Push', 'Email'],
    audience: null,
    isOffline: false,
    now: new Date('2026-09-12T01:00:00.000Z'),
    // Absent, so each part keeps the status this build declares — the honest
    // fallback, and the one thing this suite is not about.
    servedSupport: undefined,
    hasScheduler: true,
  } as DependencyContext;
}

function draftWith(actionKey: string): AutomationDraft {
  return {
    id: null,
    name: 'When we reach ten',
    description: '',
    scope: {
      ownerKind: 'community',
      ownerId: COMMUNITY,
      ownerLabel: 'Diaspora QA Walkthrough',
      communityIds: [COMMUNITY],
      isCrossCommunity: false,
      countryCodes: [],
      neighbourhoodIds: [],
    },
    source: 'builder',
    templateId: null,
    trigger: { key: 'community.milestoneReached', parameters: {} },
    conditions: [],
    // The builder names its rows like this; the platform reads them as ids it
    // strips before writing — see `toWriteBody`.
    actions: [{ id: `a1-${actionKey}`, key: actionKey, parameters: {} }],
    schedule: null,
  };
}

const reachEntry = (draft: AutomationDraft, access: AutomationAccess) =>
  checkDependencies(draft, contextWith(access)).find(
    (entry) => entry.label === 'There is nobody for this to reach yet'
  );

describe('a community the platform has not opened', () => {
  const closed = accessWith({ canReachMembers: false, reachRefusal: NOT_OPENED });

  it('tells the member before they turn it on, in the platform’s own words', () => {
    const entry = reachEntry(draftWith('notify.community'), closed);

    expect(entry).toBeDefined();
    expect(entry!.detail).toBe(NOT_OPENED);
  });

  it('does not block saving it', () => {
    // The rule is correct and starts working the moment the community opens.
    // Refusing to save would make the member build it a second time.
    expect(reachEntry(draftWith('notify.community'), closed)!.blocksActivation).toBe(false);
  });

  it('says nothing about an action that reaches only the member', () => {
    // "Tell me" is unaffected by an empty community. Warning here would be noise
    // on the one automation that would have worked perfectly well.
    expect(reachEntry(draftWith('notify.self'), closed)).toBeUndefined();
  });
});

describe('a community that is open', () => {
  const open = accessWith({ canReachMembers: true, reachRefusal: null });

  it('says nothing at all', () => {
    expect(reachEntry(draftWith('notify.community'), open)).toBeUndefined();
  });
});

describe('a deployment that answers nothing', () => {
  it('makes no claim at all, because unanswered is not no', () => {
    // `noAutomationAccess()` is what the client holds when the capabilities call
    // failed. Every field is false, this one included — so the guard is on
    // `provenance`, not on the flag. A timeout must not be rendered as the
    // platform saying this community has nobody in it.
    expect(noAutomationAccess().canReachMembers).toBe(false);
    expect(noAutomationAccess().reachRefusal).toBeNull();

    expect(reachEntry(draftWith('notify.community'), noAutomationAccess())).toBeUndefined();
  });

  it('falls back to plain words when the platform refuses without giving a reason', () => {
    const silent = accessWith({ canReachMembers: false, reachRefusal: null });

    expect(reachEntry(draftWith('notify.community'), silent)!.detail).toBe(
      'This automation can be saved, but there is nobody it could notify yet.'
    );
  });
});
