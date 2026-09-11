// -----------------------------------------------------------------------------
// A builder that offers a trigger the server refuses saves and then 400s
//
// `canUseTrigger` gates on two fields this build ships as constants —
// `allowedOwners` and `requiredCapability` — and the server gates on its own
// copies in `AutomationCatalog`. `AutomationRuleValidator` checks the owner
// first and the capability second, so a disagreement in either produces a
// builder that shows a trigger, collects a whole rule, and fails at save.
//
// Both drifted at once on `community.announcementPublished`, and in opposite
// directions:
//
//   **The owner.** The server allowed Community only, and no module grants that
//   kind, so nobody could create one. Widening it to Organization without
//   widening this file would have left the builder refusing to show what the
//   server had just started accepting.
//
//   **The capability.** It required `automations.community`, which *nothing in
//   the platform grants* — the only three grants are the personal set,
//   `automations.organization` and `automations.creator`. So the trigger was
//   gated on a string no member can hold, and correcting the owner alone would
//   have moved the refusal one gate along rather than removing it.
//
// These assert the two sides agree for the triggers this session moved. The
// whole vocabulary cannot be compared here — the server's copy is not in this
// repository — but the fields that decide whether a member ever sees a trigger
// should not be left to a reading of two files by hand.
// -----------------------------------------------------------------------------

import { TRIGGER_CATALOG } from '@/lib/automation/triggers';
import { ACTION_CATALOG } from '@/lib/automation/actions';

/** What the deployed catalogue answers, read from the live platform 11 Sep 2026. */
const SERVER = {
  'community.announcementPublished': {
    allowedOwners: ['organization'],
    requiredCapability: 'automations.organization',
  },
  'community.memberJoined': {
    allowedOwners: ['community'],
    requiredCapability: 'automations.community',
  },
  'community.milestoneReached': {
    allowedOwners: ['community'],
    requiredCapability: 'automations.community',
  },
  'community.eventCreated': {
    allowedOwners: ['community'],
    requiredCapability: 'automations.community',
  },
  'creator.milestoneReached': { allowedOwners: ['creator'], requiredCapability: null },
  'creator.referralCompleted': { allowedOwners: ['creator'], requiredCapability: null },
  'creator.rewardAvailable': { allowedOwners: ['creator'], requiredCapability: null },
  'creator.performanceThreshold': { allowedOwners: ['creator'], requiredCapability: null },
  'creator.challengeCompleted': { allowedOwners: ['creator'], requiredCapability: null },
} as const;

/**
 * The capability strings some scope authority actually hands out.
 *
 * `SelfOnlyScopeAuthority.PersonalCapabilities`, CommunityLife's
 * `automations.organization`, Creator's `automations.creator`. Nothing grants
 * `automations.community`, which is why a trigger requiring it is refused for
 * every member however its owner list is set.
 */
const GRANTED_CAPABILITIES = new Set([
  'automations.financial',
  'automations.seller',
  'automations.landlord',
  'automations.employer',
  'automations.provider',
  'automations.organization',
  'automations.creator',
]);

/** Owner kinds an authority grants: the self kinds, plus organisation. */
const GRANTABLE_OWNERS = new Set([
  'user',
  'creator',
  'provider',
  'employer',
  'landlord',
  'seller',
  'organization',
]);

describe('the two catalogues agree on who may use a trigger', () => {
  for (const [key, expected] of Object.entries(SERVER)) {
    describe(key, () => {
      const trigger = TRIGGER_CATALOG.find((entry) => entry.key === key);

      it('exists in this build', () => {
        expect(trigger).toBeDefined();
      });

      it('allows the owners the server allows', () => {
        expect([...(trigger?.allowedOwners ?? [])].sort()).toEqual([...expected.allowedOwners].sort());
      });

      it('requires the capability the server requires', () => {
        expect(trigger?.requiredCapability).toBe(expected.requiredCapability);
      });
    });
  }
});

describe('a trigger a member can select has something they can do with it', () => {
  // An Organization owner has exactly one action available: `notify.organization`.
  // `notify.self` is EveryBusinessOwner, which is the six role kinds and not this
  // one. So a trigger offered to an organisation whose actions they cannot use is
  // a dead end reached after choosing — half an opening, which reads as finished.
  it('pairs the announcement trigger with an action an organisation can use', () => {
    const trigger = TRIGGER_CATALOG.find(
      (entry) => entry.key === 'community.announcementPublished'
    );

    const usable = (trigger?.supportedActions ?? []).filter((key) => {
      const action = ACTION_CATALOG.find((entry) => entry.key === key);
      return (action?.allowedOwners ?? []).includes('organization');
    });

    expect(usable.length).toBeGreaterThan(0);
  });
});

/**
 * Capabilities deliberately granted to nobody, and why.
 *
 * An unobtainable capability is usually a defect — `automations.community` was
 * one, gating a trigger on a string no member can hold. It can also be the
 * mechanism by which a decision is enforced, and the two look identical from
 * here, so the difference has to be written down.
 */
const DELIBERATELY_UNGRANTED: Record<string, string> = {
  'automations.location':
    'Location triggers need background location, which this platform has decided not to take. ' +
    'The server hard-codes `canUseLocationTriggers: false` and grants the capability to nobody; ' +
    'the trigger stays in the catalogue so the decision is visible rather than absent.',
};

describe('nothing offered is gated on something nobody can hold', () => {
  it('keeps a written reason for each deliberate exception', () => {
    for (const reason of Object.values(DELIBERATELY_UNGRANTED)) {
      expect(reason.length).toBeGreaterThan(80);
    }
  });

  it('asks only for capabilities an authority grants, or none', () => {
    const unobtainable = TRIGGER_CATALOG.filter((trigger) => {
      const owners = trigger.allowedOwners ?? [];

      // Only triggers a member could reach at all. One allowed solely to an
      // ungranted owner kind is refused earlier and for a different reason,
      // which the backend's own guard records.
      if (!owners.some((owner) => GRANTABLE_OWNERS.has(owner))) return false;

      if (!trigger.requiredCapability) return false;
      if (DELIBERATELY_UNGRANTED[trigger.requiredCapability]) return false;

      return !GRANTED_CAPABILITIES.has(trigger.requiredCapability);
    });

    expect(unobtainable.map((trigger) => trigger.key)).toEqual([]);
  });
});

describe('a personal trigger is not gated on permission to reach other people', () => {
  // ── The rule, in the authority's own words ─────────────────────────────────
  //
  // `CreatorAutomationAuthority`: *"The bar for owning is lower than the bar for
  // broadcasting, deliberately. Any recognised creator may automate their own
  // affairs — a milestone reaching them, a reward becoming available. Reaching
  // an audience needs a creator the programme has verified."*
  //
  // It grants `automations.creator` only where the creator may broadcast. All
  // four creator triggers notify nobody but the owner, and all four required it
  // — so a Contributor, an EmergingCreator or somebody PendingVerification had
  // `CanOwn: true` and could select no creator trigger at all, including the two
  // that sentence names by example. The catalogue enforced the opposite of the
  // rule it was implementing.
  //
  // Broadcast is gated where it belongs, at `notify.followers`, which is the
  // only creator part that reaches anybody.

  /** Capabilities an authority hands out only alongside permission to reach members. */
  const REACH_GATED = new Set(['automations.creator', 'automations.organization']);

  it('holds for every trigger in this build', () => {
    const offenders = TRIGGER_CATALOG.filter((trigger) => {
      if (!trigger.requiredCapability) return false;
      if (!REACH_GATED.has(trigger.requiredCapability)) return false;

      const reaches = (trigger.supportedActions ?? []).some((key) => {
        const action = ACTION_CATALOG.find((entry) => entry.key === key);
        return action?.reachesOtherPeople === true;
      });

      return !reaches;
    });

    expect(offenders.map((trigger) => trigger.key)).toEqual([]);
  });

  it('still gates the action that does reach people', () => {
    const followers = ACTION_CATALOG.find((entry) => entry.key === 'notify.followers');

    expect(followers?.reachesOtherPeople).toBe(true);
    expect(followers?.requiredCapability).toBe('automations.creator');
  });
});
