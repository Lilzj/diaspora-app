// Automation hooks: what more than one file in this directory needs. ./index.ts does not
// re-export it, so nothing here is part of the module's public surface unless index.ts names it.

import { useAuthStore } from '@/store/auth';

/** The signed-in member, for the member-scoped cache keys — §58. */
export function useMemberId(): string | null {
  return useAuthStore((state) => state.user?.userId ?? null);
}
