import { create } from 'zustand';

interface User {
  userId: string;
  fullName: string;
  role: string;
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  accessToken: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  user: null,
  accessToken: null,
  login: (user, token) => set({ isAuthenticated: true, user, accessToken: token }),
  logout: () => set({ isAuthenticated: false, user: null, accessToken: null }),
}));
