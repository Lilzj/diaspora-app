// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Analytics, certified arm (Frontend Phase 15)
//
// **Every route in this file is real.** Not one is simulated, not one is behind
// the gap switch, and nothing here needs `areAnalyticsGapsEnabled()`.
//
// That makes it the shortest client in the phase and the most important one to
// get right, because it is the difference between a dashboard that is honestly
// half-real and one that is dishonestly all-simulated. §37's last line — the UI
// must never silently turn a backend gap into a fake production number — has a
// corollary nobody writes down: it must not turn a real number into a marked
// simulated one either. A reviewer who sees "development data" on a figure the
// platform genuinely knows learns to ignore the marker.
//
// ── What is genuinely certified, and how it is used ──────────────────────────
//
//   **Inventory counts.** `GET /jobs`, `/housing`, `/marketplace`, `/listings`,
//   `/community-life/events` and `/community-life/organizations` each return a
//   real `meta.totalCount` honouring the filter. Requesting one item and reading
//   the count is a real measurement of platform inventory.
//
//   **Neighbourhood resources.** `GET /neighborhood/{id}` returns a real
//   `resourceCounts` across six domains.
//
//   **Area activity.** `GET /location/nearby` genuinely aggregates six domains
//   for a centre and radius.
//
//   **The wallet ledger.** `GET /financial/wallets/{id}/ledger` is a real,
//   cursor-paged record of real money — and, per Phase 5's own gap report, the
//   *only* cursor-paged financial route there is. Aggregating it on the device is
//   §5's `client-derived` case, and `aggregateLedgerActivity` marks it as such
//   rather than dressing a client-side sum as a server aggregate.
//
//   It is reached through `fetchLedger` in `financial-api.ts` rather than through
//   a request built here. §68 forbids duplicating wallet logic, and a second
//   client for a financial route is where two versions of "what counts as a
//   refund" start. This file does arithmetic on what that client returns and
//   owns no financial route of its own.
//
// ── The one thing this file refuses to do ────────────────────────────────────
//
// It does not page an unbounded ledger. `WALLET_PAGE_CAP` stops at eight pages
// and the result says it was truncated. §51 forbids making the app slow, and a
// member with four years of transactions asking for "all time" would otherwise
// pull tens of thousands of records to a phone to add them up. The truncation is
// surfaced — a partial total presented as a total would be worse than refusing.
// That cap is the whole substance of FRONTEND-PHASE15-GAP-018.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { fetchLedger } from './financial-api';
import { toFinancialError } from './financial-errors';
import { add, zeroLike } from './money';
import type { LedgerEntry, Money } from '@/types/financial';
import type {
  AnalyticsMetric,
  AnalyticsMetricKey,
  AnalyticsTimeRange,
  DataFreshness,
} from '@/types/analytics';
import { ANALYTICS_DEFINITIONS } from './analytics/definitions';

/**
 * The certified list envelope, in all three shapes it actually takes.
 *
 * This is not defensive coding, it is a finding. The certified routes do not
 * agree on where a total count lives:
 *
 *   `/jobs`, `/housing`, `/marketplace`, `/listings`   `pagination.totalCount`
 *   `/community-life/events`, `/organizations`         `totalCount` (top level)
 *   the financial routes                               `meta` (cursor-paged)
 *
 * A reader that assumed one of the three would silently report nothing for two
 * thirds of the platform's inventory — and, worse, would look like it worked,
 * because `undefined` reads as "no count" rather than as an error. Reading all
 * three positions is the honest response to the surface as it is; normalising the
 * envelope is registered as part of FRONTEND-PHASE15-GAP-024.
 */
interface Envelope<T> {
  data: T;
  meta?: { totalCount?: number; nextCursor?: string | null; hasMore?: boolean } & Record<string, unknown>;
  pagination?: { totalCount?: number } & Record<string, unknown>;
  totalCount?: number;
}

async function read<T>(path: string, params?: object, signal?: AbortSignal): Promise<Envelope<T>> {
  try {
    const response = await apiClient.get<Envelope<T>>(path, { params, signal });
    return response.data;
  } catch (cause) {
    throw toFinancialError(cause, 'read');
  }
}

/**
 * The total count, from wherever this route happens to put it.
 *
 * Returns `null` rather than zero when no count is published anywhere. That
 * distinction is the whole point: a route that answered without a count has not
 * told us the count, and printing "0 jobs" over a working jobs board is a worse
 * failure than an absent card.
 *
 * It deliberately does **not** fall back to `data.length`. The list routes return
 * a page, so the array length is the page size and not the total — reading it
 * would report 20 jobs on a platform with two thousand.
 */
function totalCountFrom(envelope: Envelope<unknown>): number | null {
  const candidates = [
    envelope.meta?.totalCount,
    envelope.pagination?.totalCount,
    envelope.totalCount,
  ];

  const found = candidates.find((value) => typeof value === 'number' && Number.isFinite(value));
  return typeof found === 'number' ? found : null;
}

/**
 * Freshness for a figure counted live from a certified route.
 *
 * `sourceName` names the platform rather than an adapter, because this is the
 * platform's own count. The `computedAt` is the instant of the request, which is
 * literally true for a live count — unlike a nightly rollup, where it would be a
 * lie by an average of twelve hours.
 */
function liveFreshness(sourceName: string): DataFreshness {
  return {
    computedAt: new Date().toISOString(),
    sourceName,
    methodology: 'Counted from live records at the moment of the request.',
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// INVENTORY — FRONTEND-PHASE15-GAP-024, and genuinely connected
// ═════════════════════════════════════════════════════════════════════════════

/** The list routes that return a real `meta.totalCount`, and their metric keys. */
const INVENTORY_ROUTES: { metricKey: AnalyticsMetricKey; path: string; label: string }[] = [
  { metricKey: 'inventory.jobs', path: '/jobs', label: 'Jobs' },
  { metricKey: 'inventory.housing', path: '/housing', label: 'Housing' },
  { metricKey: 'inventory.listings', path: '/marketplace', label: 'Marketplace' },
  { metricKey: 'inventory.providers', path: '/listings', label: 'Providers' },
  { metricKey: 'inventory.events', path: '/community-life/events', label: 'Events' },
  { metricKey: 'inventory.organizations', path: '/community-life/organizations', label: 'Organizations' },
];

export interface InventoryScope {
  /** Passed to routes that accept it. A country code, never a community id. */
  countryCode?: string | null;
  cityName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radiusKm?: number | null;
}

/**
 * Real counts of what exists, for a scope.
 *
 * Six requests rather than one, which is the wasteful half of GAP-024 and is
 * documented there rather than hidden.
 *
 * `limit: 1` is sent because a count-only caller wants no items — but the
 * certified routes do not currently honour it, and the honest statement is that
 * this is a request for a smaller payload rather than a guarantee of one. It
 * costs nothing to send and starts working the day the routes page properly;
 * claiming it as an optimisation today would be describing an intention as a
 * behaviour.
 *
 * `Promise.allSettled` rather than `all`: if the jobs route is down, five real
 * counts are still worth showing. A rejected route contributes no metric and its
 * key lands in the dataset's `unavailableMetrics`, which is exactly §37's
 * `PARTIAL` — one domain being unreachable must not blank a dashboard.
 */
export async function fetchInventoryCounts(
  scope: InventoryScope = {},
  signal?: AbortSignal
): Promise<{ metrics: AnalyticsMetric[]; unavailable: AnalyticsMetricKey[] }> {
  const params = {
    countryCode: scope.countryCode || undefined,
    cityName: scope.cityName || undefined,
    latitude: scope.latitude ?? undefined,
    longitude: scope.longitude ?? undefined,
    radiusKm: scope.radiusKm ?? undefined,
    limit: 1,
  };

  const settled = await Promise.allSettled(
    INVENTORY_ROUTES.map((route) => read<unknown[]>(route.path, params, signal))
  );

  const metrics: AnalyticsMetric[] = [];
  const unavailable: AnalyticsMetricKey[] = [];

  settled.forEach((outcome, index) => {
    const route = INVENTORY_ROUTES[index];
    const definition = ANALYTICS_DEFINITIONS[route.metricKey];

    // A route that answered without a count has not told us the count. See
    // `totalCountFrom`.
    const count = outcome.status === 'fulfilled' ? totalCountFrom(outcome.value) : null;

    if (count === null) {
      unavailable.push(route.metricKey);
      return;
    }

    metrics.push({
      key: route.metricKey,
      label: definition.label,
      value: { value: count, source: 'backend' },
      format: 'count',
      computation: 'server-aggregate',
      money: null,
      higherIsBetter: definition.higherIsBetter,
      comparison: null,
      freshness: liveFreshness('Diaspora'),
      privacyClass: definition.privacyClass,
    });
  });

  return { metrics, unavailable };
}

// ═════════════════════════════════════════════════════════════════════════════
// NEIGHBOURHOOD — real `resourceCounts`
// ═════════════════════════════════════════════════════════════════════════════

interface NeighborhoodResponse {
  id: string;
  name: string;
  resourceCounts?: {
    providers: number;
    jobs: number;
    housing: number;
    marketplace: number;
    events: number;
    organizations: number;
  };
}

const RESOURCE_METRIC: Record<string, AnalyticsMetricKey> = {
  providers: 'inventory.providers',
  jobs: 'inventory.jobs',
  housing: 'inventory.housing',
  marketplace: 'inventory.listings',
  events: 'inventory.events',
  organizations: 'inventory.organizations',
};

/**
 * A neighbourhood's real resource counts, as analytics metrics.
 *
 * One request for six real numbers, which is why the neighbourhood dashboard is
 * the most connected surface in the phase.
 */
export async function fetchNeighborhoodInventory(
  neighborhoodId: string,
  signal?: AbortSignal
): Promise<AnalyticsMetric[]> {
  const envelope = await read<NeighborhoodResponse>(
    `/neighborhood/${encodeURIComponent(neighborhoodId)}`,
    undefined,
    signal
  );

  const counts = envelope.data?.resourceCounts;
  if (!counts) return [];

  return Object.entries(counts)
    .map(([resource, count]): AnalyticsMetric | null => {
      const metricKey = RESOURCE_METRIC[resource];
      if (!metricKey || typeof count !== 'number') return null;
      const definition = ANALYTICS_DEFINITIONS[metricKey];

      return {
        key: metricKey,
        label: definition.label,
        value: { value: count, source: 'backend' },
        format: 'count',
        computation: 'server-aggregate',
        money: null,
        higherIsBetter: definition.higherIsBetter,
        comparison: null,
        freshness: liveFreshness('Diaspora'),
        privacyClass: definition.privacyClass,
      };
    })
    .filter((metric): metric is AnalyticsMetric => metric !== null);
}

// ═════════════════════════════════════════════════════════════════════════════
// WALLET — FRONTEND-PHASE15-GAP-018 · §5's `client-derived` case
// ═════════════════════════════════════════════════════════════════════════════

/**
 * How many ledger pages the client will read before giving up.
 *
 * Eight pages at the server's page size. Past that the aggregate is reported as
 * truncated rather than completed — see the file header. This is the cap that
 * makes GAP-018 a real gap rather than a stylistic preference.
 */
const WALLET_PAGE_CAP = 8;

export interface WalletActivityAggregate {
  /** One entry per currency. Never summed across currencies — see below. */
  totals: {
    currency: string;
    deposits: Money;
    withdrawals: Money;
    refunds: Money;
    net: Money;
    transactionCount: number;
  }[];
  /** True where the page cap stopped the walk before the range was covered. */
  isTruncated: boolean;
  /** How many entries were actually read, so the UI can say. */
  entriesRead: number;
}

/**
 * Sums real ledger entries into a period aggregate.
 *
 * Four rules, each of which would be a real bug if broken:
 *
 *   **Never sum across currencies.** A member holding GBP and NGN has two
 *   totals, not one. The platform does not convert — `lib/money.ts` refuses to
 *   add mismatched currencies and that refusal is load-bearing here. A single
 *   "total" would require an exchange rate this client has no authority to pick.
 *
 *   **Arithmetic in minor units.** `add()` from the existing money module, never
 *   `+` on `amount`. §68 forbids recreating financial calculations and the
 *   nearest thing to recreating one is redoing it in floating point.
 *
 *   **Direction comes from the server's `direction` field**, not from the sign
 *   of the amount and not from parsing the reason text. `LedgerEntry.direction`
 *   is stated from the owner's point of view by the system that wrote the entry,
 *   which is the only party entitled to decide it.
 *
 *   **Only `Available` and `Pending` buckets are counted.** A `Reserved` entry is
 *   money set aside for an in-flight operation and counting it as a withdrawal
 *   would double-count when it settles. §16's rule that pending is never
 *   presented as available applies to the aggregate as much as to the balance.
 */
export function aggregateLedgerActivity(
  entries: LedgerEntry[],
  range: AnalyticsTimeRange,
  options: { isTruncated?: boolean } = {}
): WalletActivityAggregate {
  const byCurrency = new Map<
    string,
    { deposits: Money; withdrawals: Money; refunds: Money; net: Money; transactionCount: number }
  >();

  const inRange = entries.filter((entry) => {
    if (entry.bucket === 'Reserved') return false;
    // A civil-date comparison against a civil range. The entry's instant is
    // truncated to its UTC date by taking the ISO prefix — an approximation
    // where the reporting timezone is not UTC, and precisely the reason GAP-018
    // asks for a server-side aggregate that can cut buckets in the right zone.
    const day = (entry.occurredAt ?? '').slice(0, 10);
    return day >= range.from && day <= range.to;
  });

  for (const entry of inRange) {
    const amount = entry.amount;
    if (!amount) continue;

    const existing = byCurrency.get(amount.currency) ?? {
      deposits: zeroLike(amount),
      withdrawals: zeroLike(amount),
      refunds: zeroLike(amount),
      net: zeroLike(amount),
      transactionCount: 0,
    };

    const isRefund = String(entry.entryType).toLowerCase().includes('refund');
    const isCredit = entry.direction === 'Credit';
    const magnitude: Money = {
      ...amount,
      minorUnits: Math.abs(amount.minorUnits),
      amount: Math.abs(amount.amount),
    };
    const signed: Money = {
      ...magnitude,
      minorUnits: isCredit ? magnitude.minorUnits : -magnitude.minorUnits,
      amount: isCredit ? magnitude.amount : -magnitude.amount,
    };

    byCurrency.set(amount.currency, {
      deposits: isCredit && !isRefund ? add(existing.deposits, magnitude) : existing.deposits,
      withdrawals: !isCredit && !isRefund ? add(existing.withdrawals, magnitude) : existing.withdrawals,
      refunds: isRefund ? add(existing.refunds, magnitude) : existing.refunds,
      net: add(existing.net, signed),
      transactionCount: existing.transactionCount + 1,
    });
  }

  return {
    totals: [...byCurrency.entries()].map(([currency, totals]) => ({ currency, ...totals })),
    isTruncated: options.isTruncated ?? false,
    entriesRead: entries.length,
  };
}

/**
 * Reads the ledger for a period, bounded.
 *
 * Stops at `WALLET_PAGE_CAP` pages **or** when entries fall before the range's
 * start, whichever comes first — the statement is newest-first and its
 * `sequence` is gapless, so an entry older than the range means every remaining
 * entry is too and paging further is pure waste.
 *
 * Goes through `fetchLedger`, the certified financial client, rather than
 * issuing its own request. See the file header.
 */
export async function fetchWalletActivity(
  walletId: string,
  range: AnalyticsTimeRange
): Promise<WalletActivityAggregate> {
  const collected: LedgerEntry[] = [];
  let afterSequence: number | undefined;
  let pages = 0;
  let reachedStart = false;

  while (pages < WALLET_PAGE_CAP && !reachedStart) {
    const page = await fetchLedger(walletId, { afterSequence, pageSize: 100 });
    const entries = page.entries ?? [];
    collected.push(...entries);
    pages += 1;

    reachedStart = entries.some((entry) => (entry.occurredAt ?? '').slice(0, 10) < range.from);

    if (!page.hasMore || page.nextCursor === null || page.nextCursor === undefined) break;
    afterSequence = page.nextCursor;
  }

  return aggregateLedgerActivity(collected, range, {
    isTruncated: pages >= WALLET_PAGE_CAP && !reachedStart,
  });
}

/**
 * Turns a wallet aggregate into metrics.
 *
 * Every metric produced here is `backend`-sourced and `client-derived`, which is
 * the pair §5 exists for: the records are the platform's, the arithmetic is this
 * device's, and a member is entitled to know both.
 *
 * Takes the **currency to report in** rather than picking one. A member with two
 * wallets gets two calls and two sections; a function that silently chose the
 * first currency would report a third of somebody's activity as all of it.
 */
export function walletMetricsFor(
  aggregate: WalletActivityAggregate,
  currency: string
): AnalyticsMetric[] {
  const totals = aggregate.totals.find((entry) => entry.currency === currency);
  if (!totals) return [];

  const freshness: DataFreshness = {
    computedAt: new Date().toISOString(),
    sourceName: 'Your Diaspora wallet',
    methodology: `Added up on this device from ${aggregate.entriesRead} of your own statement entries.`,
    limitations: aggregate.isTruncated
      ? [
          'This period has more entries than can be added up on your phone, so the figures below cover only the most recent ones.',
        ]
      : undefined,
  };

  /** A money metric. `value.value` is the major-unit figure; `money` is authoritative. */
  const money = (key: AnalyticsMetricKey, amount: Money): AnalyticsMetric => {
    const definition = ANALYTICS_DEFINITIONS[key];
    return {
      key,
      label: definition.label,
      value: { value: amount.minorUnits / 10 ** amount.exponent, source: 'backend' },
      format: 'currency',
      // The whole point of this file. See §5.
      computation: 'client-derived',
      money: amount,
      higherIsBetter: definition.higherIsBetter,
      comparison: null,
      freshness,
      privacyClass: definition.privacyClass,
    };
  };

  const count = (key: AnalyticsMetricKey, value: number): AnalyticsMetric => {
    const definition = ANALYTICS_DEFINITIONS[key];
    return {
      key,
      label: definition.label,
      value: { value, source: 'backend' },
      format: 'count',
      computation: 'client-derived',
      money: null,
      higherIsBetter: definition.higherIsBetter,
      comparison: null,
      freshness,
      privacyClass: definition.privacyClass,
    };
  };

  return [
    money('wallet.deposits', totals.deposits),
    money('wallet.withdrawals', totals.withdrawals),
    money('revenue.refunded', totals.refunds),
    count('wallet.transactions', totals.transactionCount),
  ];
}

export { WALLET_PAGE_CAP };
