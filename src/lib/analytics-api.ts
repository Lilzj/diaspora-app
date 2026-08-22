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
//   **Inventory counts.** Requesting one item and reading the server's declared
//   total is a real measurement of platform inventory.
//
//   Remediation Wave A′/B corrected this in two ways at once, and the previous
//   text is worth keeping as a record of what it claimed: it said the counts
//   came from `GET /jobs`, `/housing`, `/marketplace`, `/listings`,
//   `/community-life/events` and `/community-life/organizations` via a real
//   `meta.totalCount`. Three of those routes do not exist, a fourth is a
//   dashboard, and `meta` has never carried a count. Every inventory figure
//   resolved to null while rendering as certified.
//
//   The routes are now `/jobs`, `/housing/search`, `POST /marketplace/search`,
//   `/providers`, `/community-life/events` and `/community-life/organizations`,
//   and the count is read from the page inside `data` — see
//   `lib/platform-envelope.ts`.
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
import type { CreatorAnalyticsSummary } from '@/types/creator-economy';
import type {
  AnalyticsAccess,
  AnalyticsComparison,
  AnalyticsComparisonBasis,
  AnalyticsComparisonUnavailableReason,
  AnalyticsDataStatus,
  AnalyticsDataset,
  AnalyticsDefinition,
  AnalyticsGranularity,
  AnalyticsMetric,
  AnalyticsMetricFormat,
  AnalyticsMetricKey,
  AnalyticsPrivacyClass,
  AnalyticsRangePreset,
  AnalyticsSeries,
  AnalyticsSubject,
  AnalyticsSubjectType,
  AnalyticsTimeRange,
  DataFreshness,
} from '@/types/analytics';
import { ANALYTICS_DEFINITIONS } from './analytics/definitions';
import {
  catalogueKeyFor,
  isCatalogueKey,
  learnCatalogueKeys,
  translateMetricKeys,
} from './analytics/catalogue-keys';
import { readTotalCount } from './platform-envelope';

/**
 * The platform envelope.
 *
 * **The three-position probe that used to live here was wrong in all three
 * positions**, and it is worth recording why it looked right for so long. It
 * read `meta.totalCount`, `pagination.totalCount` and an envelope-level
 * `totalCount`, and it was documented as "not defensive coding, it is a
 * finding" — an honest response to a surface the author believed disagreed with
 * itself.
 *
 * The surface does disagree with itself, but about different things. `ApiMeta`
 * is `requestId`, `correlationId` and `timestamp` and has never carried a count;
 * `pagination` exists only in this repository's own development handlers. The
 * count lives *inside* `data`, on the page object, and it is spelled
 * `totalCount` on some routes and `totalMatches` on others.
 *
 * Because `undefined` reads as "no count" rather than as an error, the probe
 * failed silently on every route. `lib/platform-envelope.ts` now owns this, and
 * FRONTEND-PHASE15-GAP-024's normalisation half is closed by it.
 */
interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
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
function totalCountFrom(body: unknown): number | null {
  // Remediation Wave B — the real contract first.
  //
  // The count lives *inside* `data`, on the page object, spelled `totalCount`
  // on some routes and `totalMatches` on others. It has never lived in `meta`:
  // `ApiMeta` is `requestId`, `correlationId` and `timestamp`, full stop.
  const declared = readTotalCount(body);
  if (declared !== null) return declared;

  // ── Development-handler compatibility, and it is a debt, not a design ──────
  //
  // `mocks/handlers/{jobs,community-life}.ts` answer `{ data: [...],
  // pagination: { totalCount } }` — a third shape that exists nowhere on the
  // platform. They were written from this client's old assumption rather than
  // from the server's contract, which is the same fault that let the sign-in
  // routes stay wrong for so long.
  //
  // Those two handlers are corrected in Wave D, when the Jobs and Community
  // Life list contracts have been read from source the way Housing, Marketplace
  // and Providers were. Until then this branch keeps a development build
  // honest about *which* domains it can count, and it is deliberately narrow:
  // it reads only an explicitly declared `pagination.totalCount` and still
  // never falls back to a page length.
  if (body && typeof body === 'object') {
    const pagination = (body as { pagination?: { totalCount?: unknown } }).pagination;
    if (pagination && typeof pagination.totalCount === 'number') {
      return pagination.totalCount;
    }
  }

  return null;
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

/**
 * The list routes an inventory count is read from.
 *
 * **Remediation Wave A′/B — three of the six were wrong and the count came from
 * nowhere.** `/housing` and `/listings` have never existed, and `/marketplace`
 * is a dashboard rather than a filtered list. The three that did resolve had
 * their count read from `meta.totalCount`, which no route on this platform
 * populates — `ApiMeta` carries `requestId`, `correlationId` and `timestamp`
 * and nothing else.
 *
 * So every inventory figure resolved to null while rendering as a certified
 * measurement. That is worse than a gap: the gap notice was deliberately absent
 * because the number was believed real.
 *
 * `method` is here because the platform is not symmetric — marketplace search is
 * a POST with a body while everything else is a GET with a query string.
 */
const INVENTORY_ROUTES: {
  metricKey: AnalyticsMetricKey;
  path: string;
  label: string;
  method?: 'get' | 'post';
}[] = [
  { metricKey: 'inventory.jobs', path: '/jobs', label: 'Jobs' },
  { metricKey: 'inventory.housing', path: '/housing/search', label: 'Housing' },
  { metricKey: 'inventory.listings', path: '/marketplace/search', label: 'Marketplace', method: 'post' },
  // Requires `providers.read`; an unauthenticated caller gets null rather than
  // a zero, which `totalCountFrom` already distinguishes.
  { metricKey: 'inventory.providers', path: '/providers', label: 'Providers' },
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
    INVENTORY_ROUTES.map((route) =>
      // Marketplace search is a POST with a body; the rest are GETs with a query
      // string. Sending the GET parameter names in a body would be silently
      // ignored by the server, which is the failure mode this whole wave exists
      // to remove.
      route.method === 'post'
        ? apiClient
            .post<unknown>(route.path, {
              countryCode: scope.countryCode || undefined,
              city: scope.cityName || undefined,
              latitude: scope.latitude ?? undefined,
              longitude: scope.longitude ?? undefined,
              radiusKm: scope.radiusKm ?? undefined,
              limit: 1,
            }, { signal })
            .then((response) => response.data)
        : read<unknown>(route.path, params, signal)
    )
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

/**
 * `NeighborhoodProfileResponse`, as much of it as this file reads.
 *
 * Remediation Wave A′: the identifier is `areaId`, not `id` — neighbourhoods are
 * the one read on the platform that does not key on `id`, because they are
 * Location areas rather than a Housing entity. And the counts live under
 * `statistics.nearbyResourceCounts`.
 */
interface NeighborhoodResponse {
  areaId?: string;
  /** Retained: fixtures and older handlers still key on `id`. */
  id?: string;
  name: string;
  statistics?: {
    nearbyResourceCounts?: Record<string, number>;
  };
  /** The shape this client previously expected. Read as a fallback. */
  resourceCounts?: Record<string, number>;
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
  // Remediation Wave A′. `/neighborhood/{id}` has never existed; the profile is
  // `/housing/neighborhoods/{idOrSlug}`, which accepts a slug — so the
  // slug-keyed subject id this phase chose still works.
  //
  // The counts moved with it: the server publishes them at
  // `statistics.nearbyResourceCounts`, not at a top-level `resourceCounts`.
  // Both are read, newest first, because a fixture written against the old
  // shape is still a valid answer to the same question.
  const envelope = await read<NeighborhoodResponse>(
    `/housing/neighborhoods/${encodeURIComponent(neighborhoodId)}`,
    undefined,
    signal
  );

  const counts = envelope.data?.statistics?.nearbyResourceCounts ?? envelope.data?.resourceCounts;
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

// ═════════════════════════════════════════════════════════════════════════════
// THE ANALYTICS MODULE — `/api/v1/analytics`, read from source
//
// Three routes that this client believed did not exist. The Phase 15 register
// declared the whole analytics surface absent — "the certified backend has no
// analytics contract of any kind" — and `Diaspora.Modules.Analytics` has been
// serving `/access`, `/definitions` and `/content/{type}/{id}` since Wave 7.
//
// ── What each one is honestly worth ──────────────────────────────────────────
//
//   `/access` is the linchpin and it is real. It is also *thin*: four of its six
//   capabilities are hardcoded `false` on the server (money, comparison, export,
//   report building) because the contracts behind them are genuinely unbuilt.
//   §48's rule — where no capability is reported, hide rather than disable — is
//   what makes that honest rather than broken, and nothing here promotes a false
//   to a true.
//
//   `/definitions` is a real catalogue that overlaps the client's by fourteen
//   rows out of a hundred and something. It reconciles rather than replaces; see
//   `fetchAnalyticsDefinitions`.
//
//   `/content/{type}/{id}` is a real per-item dataset with **empty
//   `breakdowns`, `funnels`, `insights` and `leaderboards`, always**. Those are
//   later phases, the server declines to invent them, and a screen must render
//   the emptiness as "not available for this content" rather than as a zero.
//
// ── The three shapes that would each have been a live defect ─────────────────
//
//   **`/definitions` is an envelope, not an array.** `{ version, definitions }`,
//   inside `data`. Typing it as a list is the `undefined.map` this repository
//   has already shipped once, on `/rewards/rules`.
//
//   **`comparison.changePercent` on this route is a ratio.** `0.18` means
//   eighteen percent. The Phase 7 creator contract sends `18` for the same
//   change, and `lib/analytics/adapters.ts` divides that by a hundred. Applying
//   the same division here would be a hundredfold understatement in front of a
//   member; not applying it there would be a hundredfold overstatement. The two
//   conversions live in two files and neither may be copied to the other.
//
//   **`restrictedMetrics` arrives in the Phase 7 snake key-space.** See
//   `lib/analytics/catalogue-keys.ts` — this is the file that fixes it.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Development-only diagnostics.
 *
 * Same path and same rule as `trackPlatformEvent`'s dropped-property warning in
 * `lib/creator-analytics.ts`: loud where a developer will see it, silent in a
 * release binary. A contract divergence that is only visible in a debugger is
 * one nobody finds until a member reports a wrong number.
 */
function warnInDevelopment(message: string): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  // eslint-disable-next-line no-console
  console.warn(`[analytics] ${message}`);
}

/** Narrows a server string onto a client union, or returns null. */
function oneOf<T extends string>(allowed: readonly T[], value: unknown): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

const RANGE_PRESETS: readonly AnalyticsRangePreset[] = [
  'today',
  'yesterday',
  'last7d',
  'last30d',
  'last90d',
  'thisMonth',
  'previousMonth',
  'thisYear',
  'previousYear',
  'allTime',
  'custom',
];

const COMPARISON_BASES: readonly AnalyticsComparisonBasis[] = [
  'none',
  'previousPeriod',
  'previousMonth',
  'previousYear',
  'custom',
  'platformAverage',
  'communityAverage',
  'countryAverage',
];

const METRIC_FORMATS: readonly AnalyticsMetricFormat[] = [
  'count',
  'percentage',
  'ratio',
  'currency',
  'duration',
  'rate',
  'score',
];

const PRIVACY_CLASSES: readonly AnalyticsPrivacyClass[] = [
  'public',
  'owner',
  'privileged',
  'administrative',
  'financial',
];

const GRANULARITIES: readonly AnalyticsGranularity[] = [
  'hour',
  'day',
  'week',
  'month',
  'quarter',
  'year',
];

const COMPARISON_REASONS: readonly AnalyticsComparisonUnavailableReason[] = [
  'insufficientHistory',
  'zeroBaseline',
  'unsupported',
  'suppressed',
];

// ── The wire, as `Diaspora.Modules.Analytics` declares it ────────────────────
//
// Transcribed from `Contracts/V1/Responses/`. Everything the server marks
// `required` is required here; everything it marks nullable is optional. The
// point of writing them out rather than reusing the client's own types is that
// the two are *not* the same shape, and a shared type would hide exactly the
// divergences this section exists to encode.

interface AccessWire {
  subject: { type: string; id?: string | null; label?: string | null };
  canView: boolean;
  canViewFinancial: boolean;
  canViewAdministrative: boolean;
  canCompare: boolean;
  canExport: boolean;
  canBuildReports: boolean;
  supportedRanges: string[];
  supportedComparisons: string[];
  /** Phase 7 snake keys. See `lib/analytics/catalogue-keys.ts`. */
  restrictedMetrics: string[];
  /** Non-nullable on this platform — it always publishes a reporting zone. */
  reportingTimezone: string;
}

interface DefinitionWire {
  key: string;
  catalogueKey: string;
  label: string;
  definition: string;
  formula?: string | null;
  format: string;
  higherIsBetter: boolean;
  privacyClass: string;
  owner: string;
  freshnessPolicy: string;
  trustClass: string;
  /** `CONNECTED`, `AWAITING_SOURCE` or `NOT_MEASURED`. Upper case. */
  status: string;
}

interface DefinitionsWire {
  version: string;
  definitions: DefinitionWire[];
}

interface FreshnessWire {
  computedAt: string;
  sourceName: string;
  methodology?: string | null;
  limitations?: string[] | null;
}

interface ComparisonWire {
  basis: string;
  baselineFrom?: string | null;
  baselineTo?: string | null;
  baselineValue?: number | null;
  /** A **ratio**. 0.18 is eighteen percent. See the section header. */
  changePercent?: number | null;
  changeAbsolute?: number | null;
  unavailableReason?: string | null;
}

interface DatasetMetricWire {
  /** The dotted catalogue key, not the snake key `/access` sends. */
  key: string;
  label: string;
  value: { value: number; source: string };
  format: string;
  computation: string;
  higherIsBetter: boolean;
  comparison?: ComparisonWire | null;
  freshness: FreshnessWire;
  privacyClass: string;
  isSuppressed?: boolean;
}

interface DatasetSeriesWire {
  key: string;
  label: string;
  granularity: string;
  format: string;
  points: { at: string; value: number; baselineValue?: number | null; isPartialBucket?: boolean }[];
  source: string;
}

interface DatasetWire {
  subject: { type: string; id?: string | null; label?: string | null };
  range: {
    preset: string;
    from: string;
    to: string;
    timezone: string;
    isDeviceTimezone: boolean;
  };
  comparison: string;
  /** `LIVE` or `PARTIAL` from this route. `ESTIMATED`/`UNAVAILABLE` never occur. */
  status: string;
  metrics: DatasetMetricWire[];
  series: DatasetSeriesWire[];
  /** Always `[]` from this route. Kept in the type so the emptiness is stated. */
  breakdowns: unknown[];
  funnels: unknown[];
  leaderboards: unknown[];
  insights: unknown[];
  freshness: FreshnessWire;
  /** Dotted catalogue keys. */
  unavailableMetrics: string[];
}

// ═════════════════════════════════════════════════════════════════════════════
// ACCESS — FRONTEND-PHASE15-GAP-025, and it exists
// ═════════════════════════════════════════════════════════════════════════════

/**
 * What the server says this caller may see for this subject.
 *
 * **A refusal is a 200 with everything false, and it must stay one.** The
 * handler answers rather than 403s, deliberately: a screen renders "not
 * available to you" instead of an error, and — the reason that actually matters
 * — the existence of an administrative dashboard is not confirmed by a status
 * code. Translating an all-false answer into a thrown error here would undo
 * that in one line and look like defensive coding while doing it.
 *
 * **Four capabilities are hardcoded `false` server-side** and this function does
 * not paper over them. `canViewFinancial` is B15's and is not analytics'
 * authority to grant; `canCompare` is GAP-006; `canExport` is GAP-026;
 * `canBuildReports` is GAP-027. Every one of those surfaces is gated through
 * `evaluateAnalyticsAction`, which renders **nothing** for a missing capability
 * rather than a disabled control — §48 — so the effect of the server's honesty
 * is that four affordances disappear rather than four buttons that 404.
 *
 * The subject echoed back is the **requested** one, not the server's. The server
 * lower-cases and re-serialises the type it was given, and a round trip through
 * its route-segment vocabulary would turn a client `listing` into a `listing`
 * that means something subtly different (see `AnalyticsContentTypes` — B6, Phase
 * 7 and Phase 15 disagree about that word). Echoing the request keeps the
 * capability set keyed to the subject the screen actually asked about.
 */
export async function fetchAnalyticsAccess(
  subject: AnalyticsSubject,
  signal?: AbortSignal
): Promise<AnalyticsAccess> {
  const envelope = await read<AccessWire>(
    '/analytics/access',
    { subjectType: subject.type, subjectId: subject.id ?? undefined },
    signal
  );

  const wire = envelope.data;

  const restricted = translateMetricKeys(wire.restrictedMetrics);

  if (restricted.untranslated.length > 0) {
    // Not fatal, and worth saying out loud. An untranslated restriction is one
    // this client cannot enforce; it is harmless only for as long as a metric
    // this build cannot name is also one it cannot render.
    warnInDevelopment(
      `/analytics/access restricted ${restricted.untranslated.length} metric ` +
        `${restricted.untranslated.length === 1 ? 'key' : 'keys'} this build cannot ` +
        `translate: ${restricted.untranslated.join(', ')}.`
    );
  }

  return {
    subject,
    canView: wire.canView === true,
    canViewFinancial: wire.canViewFinancial === true,
    canViewAdministrative: wire.canViewAdministrative === true,
    canCompare: wire.canCompare === true,
    canExport: wire.canExport === true,
    canBuildReports: wire.canBuildReports === true,
    // The deployment answers six of the client's eleven presets — `today`,
    // `last7d`, `last30d`, `last90d`, `thisYear`, `custom`. Anything outside the
    // union is dropped rather than passed through, because the picker renders
    // what is in this list and a preset the range resolver cannot resolve is a
    // control that produces an error.
    supportedRanges: wire.supportedRanges
      .map((preset) => oneOf(RANGE_PRESETS, preset))
      .filter((preset): preset is AnalyticsRangePreset => preset !== null),
    // `previousPeriod` only. `none` is *not* served and must not be inferred as
    // missing — `supportedComparisons()` in `lib/analytics/access.ts` prepends
    // it, because §7 requires being able to turn a comparison off and that is a
    // client capability rather than a server one.
    supportedComparisons: wire.supportedComparisons
      .map((basis) => oneOf(COMPARISON_BASES, basis))
      .filter((basis): basis is AnalyticsComparisonBasis => basis !== null),
    restrictedMetrics: restricted.keys,
    reportingTimezone: wire.reportingTimezone || null,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// DEFINITIONS — FRONTEND-PHASE15-GAP-030
// ═════════════════════════════════════════════════════════════════════════════

export interface AnalyticsDefinitionsResult {
  /** The catalogue version the figures were computed under. */
  version: string;
  /** The shipped catalogue, with the server's prose and status folded in. */
  definitions: AnalyticsDefinition[];
  /** How many rows the server's answer actually changed. */
  reconciledCount: number;
  /** Server rows this build has no catalogue key for. Named, not hidden. */
  unknownCatalogueKeys: string[];
}

/**
 * The platform's metric catalogue, reconciled with the shipped one.
 *
 * **The client's catalogue stays the foundation** and that is the right trade,
 * unchanged from when it was written: a definition the app cannot show because
 * the network is down is worse than one a release behind. So this function
 * *reconciles* rather than replaces —
 *
 *   the server's `definition`, `formula`, `owner` and `freshnessPolicy` win,
 *   because they are prose about what the platform actually measures and the
 *   platform is the only authority on that. The freshness sentence in particular
 *   carries this deployment's real projection interval and retention windows,
 *   which no client constant can know;
 *
 *   the server's `status` wins, mapped below, because whether a metric is
 *   connected is a fact about the deployment;
 *
 *   the client's `label`, `format`, `higherIsBetter` and `privacyClass` win,
 *   because those four decide how a *tile* renders and the tiles read them from
 *   `ANALYTICS_DEFINITIONS` directly. A definitions screen disagreeing with the
 *   card beside it about whether a number is a percentage would be worse than
 *   either being a release behind;
 *
 *   the client's `dimensions` and `subjects` are kept because the server has
 *   neither. It publishes no dimension list and no subject list at all.
 *
 * **A server row whose `catalogueKey` this build does not know is dropped.** The
 * definitions screen makes every row openable and a row with no local entry has
 * no label, no format and nothing to open; rendering it would be a worse answer
 * than omitting it. The count is returned so the omission is visible rather than
 * silent.
 *
 * Every pair the response carries is also fed to `learnCatalogueKeys`, which is
 * how the snake→dotted table stays correct for metrics added after this release.
 */
export async function fetchAnalyticsDefinitions(
  signal?: AbortSignal
): Promise<AnalyticsDefinitionsResult> {
  // **An envelope, not an array.** `{ data: { version, definitions } }`. Typing
  // the payload as a list is the exact `undefined.map` this repository already
  // shipped once against `/rewards/rules`, and it fails at render rather than at
  // parse, which is the worst place for it to fail.
  const envelope = await read<DefinitionsWire>('/analytics/definitions', undefined, signal);

  const wire = envelope.data;
  const rows = Array.isArray(wire?.definitions) ? wire.definitions : [];

  learnCatalogueKeys(rows.map((row) => ({ key: row.key, catalogueKey: row.catalogueKey })));

  const merged = new Map<AnalyticsMetricKey, AnalyticsDefinition>();
  const unknown: string[] = [];

  for (const row of rows) {
    const key = catalogueKeyFor(row.catalogueKey ?? '');

    if (key === null) {
      unknown.push(row.catalogueKey ?? row.key ?? '(unnamed)');
      continue;
    }

    const shipped = ANALYTICS_DEFINITIONS[key];

    merged.set(key, {
      ...shipped,
      definition: row.definition || shipped.definition,
      // `null` is a meaningful answer here — the platform says a count has no
      // formula — so it is taken as given rather than coalesced to the shipped
      // one, which would reinstate a formula the platform just denied.
      formula: row.formula ?? null,
      owner: row.owner || shipped.owner,
      freshnessPolicy: row.freshnessPolicy || shipped.freshnessPolicy,
      status: mapDefinitionStatus(row.status, shipped.status),
      // A gap key belongs to a metric that is still a gap. Where the platform
      // now says CONNECTED, keeping the register entry beside it would tell a
      // reader to go and read about a gap that has closed.
      gapKey: mapDefinitionStatus(row.status, shipped.status) === 'CONNECTED'
        ? null
        : shipped.gapKey ?? null,
    });
  }

  if (unknown.length > 0) {
    warnInDevelopment(
      `/analytics/definitions published ${unknown.length} metric ` +
        `${unknown.length === 1 ? 'row' : 'rows'} this build has no catalogue entry ` +
        `for: ${unknown.join(', ')}.`
    );
  }

  const definitions = Object.values(ANALYTICS_DEFINITIONS).map(
    (entry) => merged.get(entry.key) ?? entry
  );

  return {
    version: typeof wire?.version === 'string' ? wire.version : '',
    definitions,
    reconciledCount: merged.size,
    unknownCatalogueKeys: unknown,
  };
}

/**
 * The server's status vocabulary onto the client's.
 *
 * They share exactly one member — `CONNECTED` — and the other two need a
 * judgement rather than a rename:
 *
 *   `AWAITING_SOURCE` means the ingestion contract exists and nothing has ever
 *   submitted the event it counts. The figure is a true zero rather than a
 *   measurement. That is `PARTIAL` — "partly real" — and not `BACKEND_GAP`,
 *   because the backend is not missing: the *data* is, and the day a client
 *   starts emitting the event it becomes real with no server change.
 *
 *   `NOT_MEASURED` means this deployment records nothing the metric could be
 *   computed from and no honest approximation exists. That is `BACKEND_GAP`.
 *
 * An unrecognised status keeps the shipped one. A future `DEPRECATED` must not
 * silently become "not measured yet".
 */
function mapDefinitionStatus(
  status: string | undefined,
  fallback: AnalyticsDefinition['status']
): AnalyticsDefinition['status'] {
  switch (status) {
    case 'CONNECTED':
      return 'CONNECTED';
    case 'AWAITING_SOURCE':
      return 'PARTIAL';
    case 'NOT_MEASURED':
      return 'BACKEND_GAP';
    default:
      return fallback;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// CONTENT DATASET — FRONTEND-PHASE15-GAP-008
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The route segments `AnalyticsContentTypes.FromRouteSegment` actually accepts,
 * keyed by the client subject type that asks for them.
 *
 * All six of the client's per-item dashboard types resolve, which is worth
 * stating because two of them look like they might not:
 *
 *   `update` is a community **post** on the server. The segment is accepted
 *   verbatim (`"update" or "post"`), so nothing needs translating.
 *
 *   `listing` is a **marketplace item** on the Phase 15 route and a *service
 *   provider* in B6's vocabulary. The server reconciles the two in one file
 *   precisely so a provider's analytics can never be attributed to a
 *   marketplace seller. The segment this client sends is the Phase 15 one and
 *   resolves to Marketplace, which is what the screen means.
 *
 * `provider` and `organization` also resolve server-side but have no per-item
 * dashboard in this client, so they are absent here rather than speculatively
 * mapped. Any subject type not in this table keeps the development arm.
 */
const CONTENT_ROUTE_SEGMENT: Partial<Record<AnalyticsSubjectType, string>> = {
  guide: 'guide',
  event: 'event',
  update: 'update',
  job: 'job',
  listing: 'listing',
  housing: 'housing',
};

/** Whether the certified per-item route serves this subject at all. */
export function isCertifiedContentSubject(subject: AnalyticsSubject): boolean {
  return Boolean(CONTENT_ROUTE_SEGMENT[subject.type] && subject.id);
}

/**
 * One content item's performance.
 *
 * Behind `AnalyticsPolicies.ContentRead`, and the handler re-checks ownership of
 * *this* item rather than trusting the policy — so a 403 here means "not yours"
 * and is a correct answer rather than a bug to route around. Nothing in this
 * function softens it.
 *
 * **`breakdowns`, `funnels`, `insights` and `leaderboards` always come back
 * empty from this route**, and they are served rather than omitted so the
 * emptiness is a statement. The server declines to invent a funnel or a
 * retention grid for a phase that has not built them. A screen must render that
 * as "not available for this content" — an absent section — rather than as a
 * section reading zero, which would be a claim that nobody converted.
 *
 * The failure codes worth switching on, all of them from `AnalyticsErrorCodes`:
 * `analytics.subject.unsupported`, `analytics.subject.not-found`,
 * `analytics.range.too-long`, `analytics.period.unsupported`,
 * `analytics.timezone.unknown`, and the two that keep Phase 7's prefix because
 * the client's period selector has handled those exact strings since it shipped
 * — `creator.analytics.range_incomplete` and `creator.analytics.range_inverted`.
 * All arrive as 400 and fold into the `validation` kind.
 */
export async function fetchContentAnalytics(
  subject: AnalyticsSubject,
  range: AnalyticsTimeRange,
  signal?: AbortSignal
): Promise<AnalyticsDataset> {
  const segment = CONTENT_ROUTE_SEGMENT[subject.type];

  if (!segment || !subject.id) {
    // Not a network failure — a programming one. Sending an unmapped segment
    // would earn `analytics.subject.unsupported` from the server, which is the
    // right code for a bad request and the wrong story for a caller that should
    // have checked `isCertifiedContentSubject` first.
    throw new Error(
      `No certified analytics route for subject "${subject.type}" without an id.`
    );
  }

  const envelope = await read<DatasetWire>(
    `/analytics/content/${encodeURIComponent(segment)}/${encodeURIComponent(subject.id)}`,
    {
      period: range.preset,
      from: range.from,
      to: range.to,
      timezone: range.timezone,
    },
    signal
  );

  return toDataset(envelope.data, subject, range);
}

/**
 * The signed-in creator's own figures, from the certified route.
 *
 * ── Why this had to be written ───────────────────────────────────────────────
 *
 * `GET /analytics/creators/me/summary` has been serving 200 with fourteen
 * metrics, a comparison range and a series — and **no certified client called
 * it**. `useCreatorAnalytics` read `analytics-gap-api` instead and returned a
 * hardcoded `isSimulated: true`, so in a release build, where the gap arms are
 * off, the creator analytics screen had nothing at all behind it and the Creator
 * Studio overview told the member their last thirty days were "not measured
 * yet".
 *
 * Measured against the running platform on 22 Aug 2026, that sentence was wrong
 * about two of the three things it named: `content_views` and `saves` are
 * served, `reach` is not.
 *
 * ── `unavailableMetrics` is the platform's own answer ────────────────────────
 *
 * The response names the metrics this deployment cannot compute — on that date
 * `reach`, `followers`, `engagement_rate`, `profile_views` and `revenue`. A
 * client that hardcodes which figures are missing is a client that will be wrong
 * the first time a deployment gains one, and only ever in the direction of
 * denying something that works. It is returned here so a screen can say what is
 * true rather than what this build believed.
 */
export async function fetchCreatorSummary(
  range: AnalyticsTimeRange,
  /**
   * The period **in the route's own vocabulary** — `today`, `7d`, `30d`, `90d`,
   * `year`, `custom`.
   *
   * Passed separately rather than derived from `range.preset`, because the two
   * vocabularies do not translate: the analytics module spells thirty days
   * `last30d` and this route spells it `30d`. Sending the analytics spelling
   * makes the route answer **500**, not 400 — an unrecognised period is an
   * unhandled exception rather than a refusal, which is worth knowing when
   * reading its logs.
   *
   * `range` still supplies `from`, `to` and the timezone, which are shared.
   */
  period: string,
  signal?: AbortSignal
): Promise<{ summary: CreatorAnalyticsSummary; unavailableMetrics: string[] }> {
  const envelope = await read<CreatorSummaryWire>(
    '/analytics/creators/me/summary',
    {
      period,
      from: range.from,
      to: range.to,
      timezone: range.timezone,
    },
    signal
  );

  const wire = envelope.data;

  return {
    summary: {
      // `AnalyticsRange` spells it `period`; the certified time range spells it
      // `preset`. Echoing the server's own range where it sends one, so the
      // figures and the period they describe cannot disagree.
      range: {
        period: (wire?.range?.period ?? range.preset) as CreatorAnalyticsSummary['range']['period'],
        from: wire?.range?.from ?? range.from ?? null,
        to: wire?.range?.to ?? range.to ?? null,
      },
      metrics: wire?.metrics ?? [],
      series: wire?.series ?? [],
      generatedAt: wire?.generatedAt ?? new Date().toISOString(),
      freshnessNote: wire?.freshnessNote ?? null,
    },
    // Never invented: absent means the deployment did not say, which is not the
    // same as "everything works".
    unavailableMetrics: Array.isArray(wire?.unavailableMetrics)
      ? wire.unavailableMetrics
      : [],
  };
}

/** The creator summary exactly as the route serves it. */
interface CreatorSummaryWire {
  range?: { period?: string; from?: string; to?: string; timezone?: string };
  metrics?: CreatorAnalyticsSummary['metrics'];
  series?: CreatorAnalyticsSummary['series'];
  generatedAt?: string;
  freshnessNote?: string | null;
  unavailableMetrics?: string[];
}

/** The server's dataset in the client's shape. */
function toDataset(
  wire: DatasetWire,
  subject: AnalyticsSubject,
  requested: AnalyticsTimeRange
): AnalyticsDataset {
  const freshness = toFreshness(wire.freshness);
  const dropped: string[] = [];

  const metrics = wire.metrics
    .map((metric) => toMetric(metric, dropped))
    .filter((metric): metric is AnalyticsMetric => metric !== null);

  const series = wire.series
    .map((entry) => toSeries(entry, dropped))
    .filter((entry): entry is AnalyticsSeries => entry !== null);

  const unavailable = translateMetricKeys(wire.unavailableMetrics);

  if (dropped.length > 0 || unavailable.untranslated.length > 0) {
    warnInDevelopment(
      `/analytics/content served ${dropped.length + unavailable.untranslated.length} ` +
        'entries with catalogue keys this build does not know: ' +
        [...dropped, ...unavailable.untranslated].join(', ') +
        '.'
    );
  }

  return {
    subject,
    range: {
      // The server echoes a *resolved* range, and the resolved range is the one
      // the figures were counted in. Taking the request's dates instead would
      // put the platform's numbers under the device's understanding of the
      // period, which is the whole failure §58 is about. `isDeviceTimezone` is
      // always false from this platform — it publishes a reporting zone, so the
      // client never has to fall back and never has to say it did.
      preset: oneOf(RANGE_PRESETS, wire.range?.preset) ?? requested.preset,
      from: wire.range?.from || requested.from,
      to: wire.range?.to || requested.to,
      timezone: wire.range?.timezone || requested.timezone,
      isDeviceTimezone: wire.range?.isDeviceTimezone === true,
    },
    comparison: oneOf(COMPARISON_BASES, wire.comparison) ?? 'previousPeriod',
    // `LIVE` or `PARTIAL`, and never `ESTIMATED` — every figure this deployment
    // serves is a count of stored facts, so a status claiming a model would be
    // a claim about a model that does not exist.
    status: oneOf<AnalyticsDataStatus>(['LIVE', 'PARTIAL'], wire.status) ?? 'PARTIAL',
    metrics,
    series,
    // Served as `[]` by the server and kept as `[]` here. See the doc comment:
    // the emptiness is a statement about what this deployment computes, and the
    // screen renders an absent section rather than a zeroed one.
    breakdowns: [],
    funnels: [],
    retention: null,
    leaderboards: [],
    insights: [],
    freshness,
    unavailableMetrics: unavailable.keys,
    // Not a gap. Nothing on this dataset is simulated and no register entry
    // should be offered beside it.
    gapKey: null,
  };
}

function toFreshness(wire: FreshnessWire | undefined): DataFreshness {
  return {
    computedAt: wire?.computedAt ?? new Date().toISOString(),
    sourceName: wire?.sourceName || 'Diaspora analytics',
    methodology: wire?.methodology ?? undefined,
    limitations: wire?.limitations?.length ? wire.limitations : undefined,
  };
}

/**
 * One served metric.
 *
 * The key is the **dotted catalogue key** on this route, unlike `/access`, and a
 * key this build has no definition for is dropped rather than rendered: a metric
 * card reads its label, format and privacy class out of `ANALYTICS_DEFINITIONS`
 * and a missing entry is a crash rather than a blank.
 */
function toMetric(wire: DatasetMetricWire, dropped: string[]): AnalyticsMetric | null {
  const key = wire.key;

  if (typeof key !== 'string' || !isCatalogueKey(key)) {
    dropped.push(String(key));
    return null;
  }

  const definition = ANALYTICS_DEFINITIONS[key];

  return {
    key,
    label: definition.label,
    value: {
      value: typeof wire.value?.value === 'number' ? wire.value.value : 0,
      // Always `backend` from this platform. There is no simulated arm on the
      // server, and marking a real figure simulated is the inverse of §38 —
      // a marker on a real number teaches a reviewer that the marker is noise.
      source: wire.value?.source === 'simulated' ? 'simulated' : 'backend',
    },
    format: oneOf(METRIC_FORMATS, wire.format) ?? definition.format,
    computation: wire.computation === 'estimated' ? 'estimated' : 'server-aggregate',
    money: null,
    higherIsBetter: definition.higherIsBetter,
    comparison: toComparison(wire.comparison),
    freshness: toFreshness(wire.freshness),
    privacyClass: oneOf(PRIVACY_CLASSES, wire.privacyClass) ?? definition.privacyClass,
    isSuppressed: wire.isSuppressed === true,
  };
}

/**
 * A comparison, with the conversion that is deliberately **not** applied.
 *
 * `changePercent` on the Phase 15 dataset is already a ratio: the server divides
 * its own `ChangePercentage` by a hundred in `AnalyticsDatasetBuilder`, once, in
 * one method, with the reason written beside it. `lib/analytics/adapters.ts`
 * does the same division for the Phase 7 creator summary, which sends a
 * percentage. Doing it twice for this route would report an eighteen percent
 * rise as `0.18%`; not doing it there would report it as `1800%`. Both look
 * plausible, which is exactly why neither conversion may be copied into the
 * other file.
 */
function toComparison(wire: ComparisonWire | null | undefined): AnalyticsComparison | null {
  if (!wire) return null;

  const basis = oneOf(COMPARISON_BASES, wire.basis) ?? 'previousPeriod';
  const reason = oneOf(COMPARISON_REASONS, wire.unavailableReason ?? undefined);

  const changePercent =
    typeof wire.changePercent === 'number' && Number.isFinite(wire.changePercent)
      ? wire.changePercent
      : null;

  // A comparison with neither a figure nor a reason says nothing, and rendering
  // an empty chip beside a number is worse than rendering no chip.
  if (changePercent === null && reason === null && wire.baselineValue == null) return null;

  return {
    basis,
    changePercent,
    changeAbsolute:
      typeof wire.changeAbsolute === 'number' && Number.isFinite(wire.changeAbsolute)
        ? wire.changeAbsolute
        : null,
    baselineValue:
      typeof wire.baselineValue === 'number' && Number.isFinite(wire.baselineValue)
        ? wire.baselineValue
        : null,
    baselineFrom: wire.baselineFrom ?? null,
    baselineTo: wire.baselineTo ?? null,
    unavailableReason: reason,
  };
}

function toSeries(wire: DatasetSeriesWire, dropped: string[]): AnalyticsSeries | null {
  const key = wire.key;

  if (typeof key !== 'string' || !isCatalogueKey(key)) {
    dropped.push(String(key));
    return null;
  }

  const definition = ANALYTICS_DEFINITIONS[key];

  return {
    key,
    label: definition.label,
    // The server cuts the buckets and the client never regroups them: a device
    // that regrouped dates would group them in its own calendar, which is a
    // different calendar from the one the figures were counted in.
    granularity: oneOf(GRANULARITIES, wire.granularity) ?? 'day',
    format: oneOf(METRIC_FORMATS, wire.format) ?? definition.format,
    points: (wire.points ?? []).map((point) => ({
      at: point.at,
      value: typeof point.value === 'number' ? point.value : 0,
      baselineValue: typeof point.baselineValue === 'number' ? point.baselineValue : null,
      isPartialBucket: point.isPartialBucket === true,
    })),
    source: wire.source === 'simulated' ? 'simulated' : 'backend',
  };
}
