// ─────────────────────────────────────────────────────────────────────────────
// Who is offered a community's automations — 11 Sep 2026
//
// On the production APK the founder of a community opened Automations and was
// offered "For me", "As a creator" and the four business scopes — and no
// community. The platform answers `canCreateForCommunity` for the scope it is
// asked about, and the Center asked with the member's personal scope, so the
// question the community authority evaluated was "does this member run the
// community whose id is their own user id". Nobody does. No member had ever
// been offered a community scope here.
//
// The mock below answers exactly as `AutomationAccessService.DescribeAsync`
// does: community access only for the id of a community the member runs.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useAvailableScopes } from '../automation';
import { useAuthStore } from '@/store/auth';
import { useCommunityContextStore } from '@/store/community-context';
import { noAutomationAccess, type AutomationScope } from '@/types/automation';

const MEMBER = '0dc73f0c-7efa-4b60-8706-7a60eacace65';
const RUNS = '01a0902e-4289-7f61-9d8b-d50638c7fb1b';
const BELONGS = '01a0902e-0000-7f61-9d8b-d50638c7fb1b';

const mockFetchAccess = jest.fn();

jest.mock('@/lib/automation/certified-client', () => ({
  ...jest.requireActual('@/lib/automation/certified-client'),
  fetchAccess: (scope: AutomationScope) => mockFetchAccess(scope),
}));

/** The platform's answer: community access for a community the member runs, by that id. */
function platformAnswer(scope: AutomationScope) {
  return Promise.resolve({
    ...noAutomationAccess(),
    provenance: 'server',
    canViewAutomations: true,
    canCreatePersonal: true,
    canCreateForBusiness: true,
    canCreateForCommunity: scope.ownerKind === 'community' && scope.ownerId === RUNS,
  });
}

// One client per test, made outside the wrapper so a re-render does not start
// the cache over, and with nothing left scheduled to hold Jest open afterwards.
let client: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => {
  client.clear();
});

function inCommunity(id: string | null) {
  useCommunityContextStore.setState({
    activeCommunityId: id as never,
    selectedCommunityIds: (id ? [id] : []) as never,
  });
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  mockFetchAccess.mockReset();
  mockFetchAccess.mockImplementation(platformAnswer);
  useAuthStore.setState({ user: { userId: MEMBER, fullName: 'Joshua' } as never });
});

it('offers the founder the community they are in', async () => {
  inCommunity(RUNS);

  const { result } = renderHook(() => useAvailableScopes(), { wrapper });

  await waitFor(() => expect(result.current.kinds).toContain('community'));
  expect(mockFetchAccess).toHaveBeenCalledWith(
    expect.objectContaining({ ownerKind: 'community', ownerId: RUNS })
  );
});

it('does not offer it for a community the member only belongs to', async () => {
  inCommunity(BELONGS);

  const { result } = renderHook(() => useAvailableScopes(), { wrapper });

  await waitFor(() => expect(result.current.kinds).toContain('user'));
  await waitFor(() =>
    expect(mockFetchAccess).toHaveBeenCalledWith(
      expect.objectContaining({ ownerKind: 'community', ownerId: BELONGS })
    )
  );
  expect(result.current.kinds).not.toContain('community');
});

it('does not ask about a community when the member is in none', async () => {
  inCommunity(null);

  const { result } = renderHook(() => useAvailableScopes(), { wrapper });

  await waitFor(() => expect(result.current.kinds).toContain('user'));
  expect(result.current.kinds).not.toContain('community');
  expect(mockFetchAccess).not.toHaveBeenCalledWith(
    expect.objectContaining({ ownerKind: 'community' })
  );
});
