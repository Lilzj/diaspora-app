import { create } from 'zustand';
import type { AccountState } from '@/types/trust';
import { clearIdempotencyKeys } from '@/lib/idempotency';

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

export const useAuthStore = create<AuthState>((set) => ({
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
    // Financial idempotency keys are scoped to the person who created them. A
    // key left in storage would let the next member on this device resume — or
    // be refused as a duplicate of — an operation that was never theirs.
    // Fire-and-forget: a failure here must not block signing out.
    void clearIdempotencyKeys();

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
