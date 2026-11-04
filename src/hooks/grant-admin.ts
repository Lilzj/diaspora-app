// The administrators' grants. See `lib/creator/grant-admin-api.ts`.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createGrant,
  fetchAdminGrants,
  setGrantWindow,
  updateGrant,
  type AdminGrant,
  type GrantWindowAction,
} from '@/lib/creator/grant-admin-api';
import type { SaveGrantRequest } from '@/lib/creator/grant-admin-form';

export const grantAdminKeys = {
  list: () => ['creator-gap', 'grants', 'admin'] as const,
};

export function useAdminGrants() {
  const query = useQuery({ queryKey: grantAdminKeys.list(), queryFn: fetchAdminGrants, retry: false });
  return {
    grants: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    isRefetching: query.isRefetching,
  };
}

/** Saves and window changes. Each refreshes the admin list and every member's grant list. */
export function useGrantAdminActions() {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: ['creator-gap', 'grants'] });

  const save = useMutation({
    mutationFn: ({ grantId, request }: { grantId?: string; request: SaveGrantRequest }): Promise<AdminGrant> =>
      grantId ? updateGrant(grantId, request) : createGrant(request),
    onSuccess: refresh,
  });

  const windowChange = useMutation({
    mutationFn: ({ grantId, action }: { grantId: string; action: GrantWindowAction }) =>
      setGrantWindow(grantId, action),
    onSuccess: refresh,
  });

  return { save, setWindow: windowChange };
}
