// The four triggers the backend wired on 21 Oct 2026 (3df412e) are offered.
//
// `community.memberJoined`, `community.eventCreated`, `location.countryChanged`
// and `location.enteredArea` were each "unavailable" in this build: a
// BACKEND_GAP badge, a device-local delivery, or a background-location
// dependency nobody could resolve. Each is now observed by the server, so the
// builder must offer each to the owner the server allows, with no gap marker,
// and the area trigger must point at the presence setting rather than at a gap.

import { TRIGGER_CATALOG, firesInBackground, triggerDefinition } from '@/lib/automation/triggers';
import { canUseTrigger } from '@/lib/automation/access';
import { checkDependencies } from '@/lib/automation/dependencies';
import { servedSupportLookup, resolvePartSupport } from '@/lib/automation/served-support';
import type { AutomationAccess, AutomationDraft, AutomationOwnerKind } from '@/types/automation';

const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
const path = require('path') as { join(...segments: string[]): string };

const KEYS = [
  'community.memberJoined',
  'community.eventCreated',
  'location.countryChanged',
  'location.enteredArea',
] as const;

/** What `GET /automations/capabilities` answers a member now. */
function access(overrides: Partial<AutomationAccess> = {}): AutomationAccess {
  return {
    canViewAutomations: true,
    canCreatePersonal: true,
    canCreateForCommunity: true,
    canCreateForOrganization: false,
    canCreateForCreator: false,
    canCreateForBusiness: false,
    canCreatePlatformWide: false,
    canNotifyOtherMembers: true,
    canUseFinancialTriggers: true,
    canUseLocationTriggers: true,
    canViewOthersRuns: false,
    canManageOthersAutomations: false,
    maxActiveAutomations: 20,
    provenance: 'server',
    grantedCapabilities: ['automations.location', 'automations.community', 'automations.financial'],
    canReachMembers: true,
    reachRefusal: null,
    ...overrides,
  } as AutomationAccess;
}

const OWNER: Record<(typeof KEYS)[number], AutomationOwnerKind> = {
  'community.memberJoined': 'community',
  'community.eventCreated': 'community',
  'location.countryChanged': 'user',
  'location.enteredArea': 'user',
};

describe('the four newly wired triggers are available', () => {
  for (const key of KEYS) {
    describe(key, () => {
      const trigger = triggerDefinition(key)!;

      it('is declared connected, with no gap to point at', () => {
        expect(trigger.support).toBe('CONNECTED');
        expect(trigger.gapKey).toBeNull();
      });

      it('is observed by the server, so it fires with the app closed', () => {
        expect(trigger.delivery).toBe('domainEvent');
        expect(firesInBackground(trigger)).toBe(true);
        expect(trigger.backendEvent).toBeTruthy();
      });

      it('is offered to the owner the server allows', () => {
        expect(canUseTrigger(trigger, OWNER[key], access())).toBe(true);
      });

      it('stays connected when the served catalogue says so', () => {
        const lookup = servedSupportLookup({
          triggers: [{ key, domain: null, isAvailable: true, unavailableReason: null, requiredCapability: null, allowedOwners: null }],
          conditions: [],
          actions: [],
        });
        expect(resolvePartSupport(lookup, 'trigger', key, trigger.support)).toBe('CONNECTED');
      });
    });
  }

  it('location triggers are still withheld from a member the server has not granted', () => {
    const withheld = access({ canUseLocationTriggers: false, grantedCapabilities: [] });
    expect(canUseTrigger(triggerDefinition('location.enteredArea')!, 'user', withheld)).toBe(false);
  });

  it('no trigger anywhere still depends on background location', () => {
    expect(TRIGGER_CATALOG.filter((t) => t.requiredIntegrations.includes('location.background'))).toEqual([]);
  });

  it('no location trigger is device-local any more', () => {
    expect(TRIGGER_CATALOG.filter((t) => t.domain === 'location' && t.delivery === 'deviceLocal')).toEqual([]);
  });
});

describe('choosing "I arrive in an area I chose"', () => {
  const draft: AutomationDraft = {
    id: null,
    name: '',
    description: '',
    scope: {
      ownerKind: 'user',
      ownerId: 'me',
      ownerLabel: 'You',
      communityIds: [],
      isCrossCommunity: false,
      countryCodes: [],
      neighbourhoodIds: [],
    },
    source: 'builder',
    templateId: null,
    trigger: { key: 'location.enteredArea', parameters: {} },
    conditions: [],
    actions: [{ id: 'a1', key: 'notify.self', parameters: {} }],
    schedule: null,
  };
  const context = {
    access: access(),
    connectedIntegrations: [],
    pushEnabled: true,
    emailVerified: true,
    enabledChannels: ['InApp'],
    audience: null,
    isOffline: false,
    now: new Date('2026-10-21T10:00:00Z'),
  };

  it('is no longer a gap, and is not refused for permission', () => {
    const dependencies = checkDependencies(draft, { ...context, presenceEnabled: true });
    expect(dependencies.filter((d) => d.state === 'gap')).toEqual([]);
    expect(dependencies.some((d) => d.kind === 'permission')).toBe(false);
  });

  it('prompts to turn presence on when it is off, linking to the setting', () => {
    const prompt = checkDependencies(draft, { ...context, presenceEnabled: false }).find(
      (d) => d.actionRoute === '/settings/presence'
    );
    expect(prompt?.actionLabel).toBe('Turn it on');
  });

  it('the builder shows the prompt under the trigger', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'automation', 'create.tsx'), 'utf8');
    expect(source).toMatch(/draft\.trigger\?\.key === 'location\.enteredArea' && presence && !presence\.enabled/);
    expect(source).toContain("router.push('/settings/presence'");
  });
});
