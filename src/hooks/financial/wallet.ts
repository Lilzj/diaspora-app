// Financial hooks: wallet. ./index.ts is the overview of the whole module.

import { useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api/financial-api';
import { financialKeys } from '@/lib/api/financial-api';
import { FinancialError, offlineError, shouldRetryQuery } from '@/lib/transport/financial-errors';
import { resolveFinancialAccess, type FinancialAccess } from '@/lib/domain/financial-access';
import { useConnectivityStore } from '@/lib/platform/connectivity';
import { useAuthStore } from '@/store/auth';
import { resolveCurrency } from '@/lib/domain/money';
import type { Wallet } from '@/types/financial';
import { readOptions } from './shared';

/**
 * Reference data — currency symbols, exponents, deployment capabilities —
 * changes when a deployment is reconfigured, which is to say almost never.
 * An hour, and it is still refetched on a cold start.
 */
const REFERENCE_STALE_MS = 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Access
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What this member may do, mirroring B15's permission ladder.
 *
 * Advisory only: it decides what to draw, and every action it permits is
 * re-authorised by the server on the request that follows.
 */
export function useFinancialAccess(): FinancialAccess {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  return useMemo(
    () => resolveFinancialAccess(accountState, isAuthenticated),
    [accountState, isAuthenticated]
  );
}

/** Whether financial *writes* may be attempted at all right now. */
export function useCanTransact(): { canTransact: boolean; blockedBy: FinancialError | null } {
  const access = useFinancialAccess();
  const isOnline = useConnectivityStore((state) => state.isOnline);

  return useMemo(() => {
    if (!isOnline) return { canTransact: false, blockedBy: offlineError('Paying') };
    if (!access.canPay) return { canTransact: false, blockedBy: null };
    return { canTransact: true, blockedBy: null };
  }, [isOnline, access.canPay]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Deployment reference data
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What this deployment can actually do.
 *
 * Read before any payment sheet is drawn. An empty `gateways` array is the
 * "not configured" state §4-D requires be rendered honestly rather than hidden
 * behind a spinner that never resolves.
 */
export function useFinancialCapabilities() {
  return useQuery({
    queryKey: financialKeys.capabilities(),
    queryFn: api.fetchCapabilities,
    staleTime: REFERENCE_STALE_MS,
    retry: shouldRetryQuery,
  });
}

/** Symbols and exponents. One formatter for the whole app reads this. */
export function useCurrencies() {
  return useQuery({
    queryKey: financialKeys.currencies(),
    queryFn: api.fetchCurrencies,
    staleTime: REFERENCE_STALE_MS,
    retry: shouldRetryQuery,
  });
}

/** Exponent and symbol for one currency, from the catalogue. */
export function useCurrencyFacts(code: string): { exponent: number; symbol: string | null } {
  const { data } = useCurrencies();
  return useMemo(() => resolveCurrency(code, data), [code, data]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Wallet
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every wallet the caller holds.
 *
 * An empty array is a legitimate answer — a member whose verification has not
 * been approved has no financial identity yet — and the wallet screen renders
 * that as an explanation rather than as an error or as "£0.00".
 */
export function useWallets(currency?: string) {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialKeys.wallet(currency),
    queryFn: () => api.fetchWallets(currency),
    enabled: access.canReadWallet,
    ...readOptions,
  });
}

/**
 * The wallet the dashboard leads with.
 *
 * `Primary` in the member's own currency if there is one, otherwise the first
 * primary wallet, otherwise the first wallet at all. Never the platform's
 * clearing or revenue wallets — the backend already withholds those, and this
 * is belt and braces on a number that would be meaningless if it appeared.
 */
export function usePrimaryWallet(preferredCurrency?: string): {
  wallet: Wallet | null;
  wallets: Wallet[];
  isLoading: boolean;
  isError: boolean;
  error: FinancialError | null;
  refetch: () => void;
} {
  const query = useWallets();

  const wallets = useMemo(
    () => (query.data ?? []).filter((item) => item.walletType !== 'Clearing' && item.ownerType !== 'Platform'),
    [query.data]
  );

  const wallet = useMemo(() => {
    if (wallets.length === 0) return null;
    if (preferredCurrency) {
      const matched = wallets.find(
        (item) => item.walletType === 'Primary' && item.currency === preferredCurrency.toUpperCase()
      );
      if (matched) return matched;
    }
    return wallets.find((item) => item.walletType === 'Primary') ?? wallets[0];
  }, [wallets, preferredCurrency]);

  return {
    wallet,
    wallets,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as FinancialError) ?? null,
    refetch: query.refetch,
  };
}

/**
 * The statement, cursor-paged by ledger sequence.
 *
 * This is the only financial surface B15 paginates on the wire, and it is
 * therefore the surface the transactions screen points at when somebody wants
 * to go further back than one page. `afterSequence` is an opaque handle as far
 * as this client is concerned: it comes from the previous page and goes back
 * unmodified.
 */
export function useLedger(walletId: string | undefined, entryType?: string) {
  const access = useFinancialAccess();

  return useInfiniteQuery({
    queryKey: financialKeys.ledger(walletId ?? 'none', entryType),
    queryFn: ({ pageParam }) =>
      api.fetchLedger(walletId!, {
        afterSequence: pageParam ?? undefined,
        entryType,
        pageSize: 25,
      }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(walletId) && access.canReadWallet,
    ...readOptions,
  });
}

/**
 * The caller's transactions.
 *
 * One page. `GET /wallets/me/transactions` binds `type` and `pageSize` only —
 * the underlying query supports keyset paging and the endpoint does not expose
 * it — so there is no second page to ask for. GAP-06.
 */
export function useTransactions(type?: string, pageSize = 50) {
  const access = useFinancialAccess();

  return useQuery({
    queryKey: financialKeys.transactions(type),
    queryFn: () => api.fetchTransactions({ type, pageSize }),
    enabled: access.canReadWallet,
    ...readOptions,
  });
}
