import { create } from 'zustand';
import type { AccountState } from '@/types/trust';
import { clearIdempotencyKeys } from '@/lib/idempotency';
import { clearCommunityPersistence } from '@/lib/community/persistence';
import { useCommunityContextStore } from '@/store/community-context';
import { deactivatePushToken } from '@/lib/integrations/push-lifecycle';
import { clearPendingFlows } from '@/lib/integrations/deep-links';
import { resetAutomationState } from '@/mocks/automation-gap-data';

interface User {
  userId: string;
  fullName: string;
  role: string;
  email?: string;
  phone?: string;
  nationality?: string;
  residenceCountry?: string;
  profilePhoto?: string;
  accountState: AccountState;
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  accessToken: string | null;
  isExploringLimited: boolean;
  login: (user: Omit<User, 'accountState'> & { accountState?: AccountState }, token: string) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
  setAccountState: (state: AccountState) => void;
  setExploringLimited: (val: boolean) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  user: null,
  accessToken: null,
  isExploringLimited: false,
  login: (user, token) =>
    set({
      isAuthenticated: true,
      user: {
        ...user,
        accountState: user.accountState || 'LimitedAccess',
      } as User,
      accessToken: token,
      isExploringLimited: false,
    }),
  logout: () => {
    // Frontend Phase 16, §44. **This runs first, and the order is load-bearing.**
    //
    // `DELETE /notifications/devices/{id}` is an authenticated call, so it needs
    // the session token that the `set()` at the end of this function is about to
    // discard. Deactivating after the clear would send an unauthenticated
    // request that 401s, and the device would stay registered — which means the
    // next member to sign in on this phone receives the previous member's
    // notifications on their lock screen. That is the worst failure available to
    // the notification integration and it is silent.
    //
    // `deactivatePushToken` never throws and clears its local state before the
    // network call, so a failure here leaves the client correct and at worst
    // leaves a stale row for B13's own suppression handling to retire. A
    // sign-out must not be blocked by an unreachable notification service — on a
    // shared device the member needs to be able to leave.
    void deactivatePushToken();

    // Frontend Phase 16, §40/§42. A half-finished OAuth or payment callback
    // belongs to the person who started it. Left in storage it would resume
    // inside the next member's session on this device — the pending record is
    // member-scoped precisely so that cannot happen, and this clears the one
    // that exists. Fire-and-forget, same as the others.
    const userId = get().user?.userId;
    if (userId) void clearPendingFlows(userId);

    // Financial idempotency keys are scoped to the person who created them. A
    // key left in storage would let the next member on this device resume — or
    // be refused as a duplicate of — an operation that was never theirs.
    // Fire-and-forget: a failure here must not block signing out.
    void clearIdempotencyKeys();

    // Frontend Phase 13, §41/§45. The active community, the recently-visited list
    // and the community display preferences all describe the person who was signed
    // in. Left on a shared device they would show the next member somebody else's
    // community selection — and on this platform a community selection can imply
    // nationality, immigration situation or religion. Same reasoning as the
    // idempotency keys above, and the same fire-and-forget: a failure here must not
    // block signing out.
    //
    // Membership itself needs no clearing because it was never written to disk —
    // see `lib/community/persistence.ts`.
    void clearCommunityPersistence();
    useCommunityContextStore.getState().reset();

    // Frontend Phase 18, §58/§59. The development adapter holds automations,
    // runs and saved searches in a per-process store, and a member's automation
    // rules are personal — a saved housing search states a budget and a
    // neighbourhood; a government advisory automation states an immigration
    // situation. The TanStack cache is keyed per member so the wrong entry
    // cannot be *found*, but the adapter's own store is not, and on a shared
    // device the next member would be served the previous one's automations
    // from it. Cleared here, and reseeded, so a development build behaves the
    // way the real contract must.
    resetAutomationState();

    set({ isAuthenticated: false, user: null, accessToken: null, isExploringLimited: false });
  },
  updateUser: (updatedUser) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...updatedUser } : null,
    })),
  setAccountState: (accountState) =>
    set((state) => ({
      user: state.user ? { ...state.user, accountState } : null,
    })),
  setExploringLimited: (val) => set({ isExploringLimited: val }),
}));
