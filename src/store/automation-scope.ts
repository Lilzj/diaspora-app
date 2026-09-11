import { create } from 'zustand';

/**
 * Which organisation the automation screens are acting for — 11 Sep 2026.
 *
 * **The community scope has had one of these since Phase 13** (`community-context`), and the
 * organisation scope never did: `useScopeFor('organization')` returned the *member's own user id*
 * as the owner, so an organisation automation was owned by nobody the platform would recognise and
 * was refused if it ever reached the server. It never did, because the Center offered no
 * organisation chip either — see `useAvailableScopes`.
 *
 * Deliberately not persisted, unlike the community context. That one is the lens the whole app is
 * read through and has to survive a restart; this is a choice made on one screen, and defaulting to
 * the first organisation the member helps run is a better answer on a fresh launch than a
 * remembered one they have since left.
 */
interface AutomationScopeState {
  /** Null until the member picks one, or until the default is applied. */
  organizationId: string | null;
  setOrganizationId: (organizationId: string | null) => void;
}

export const useAutomationScopeStore = create<AutomationScopeState>((set) => ({
  organizationId: null,
  setOrganizationId: (organizationId) => set({ organizationId }),
}));
