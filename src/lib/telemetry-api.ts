// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — telemetry delivery (Remediation Wave C-03, CREATOR-GAP-016)
//
// `lib/creator-analytics.ts` has buffered events since Phase 7 behind a function
// whose whole documentation was an absence:
//
//   > **This is CREATOR-GAP-016.** There is no ingestion endpoint, so a record
//   > is buffered in memory and dropped when the buffer fills. […] When
//   > `POST /api/v1/telemetry/events` exists, this function batches from the
//   > buffer and posts. Nothing else in the app changes.
//
// It exists. `Diaspora.Modules.Analytics` maps it under its own prefix — not
// beside the analytics *reads*, because everything under `/api/v1/analytics` is
// a read the caller must already be entitled to and this is the one write, open
// to every authenticated member and treated as untrusted from the first line of
// the handler. This file is the batching transport that entry promised, and
// nothing else in the app did change: the emitter, the allow-list and the
// sanitiser are untouched.
//
// ── Four things worth knowing before editing this ────────────────────────────
//
// **1. It answers 202, not 200.** The batch is accepted for processing and the
// per-event verdicts are in the body. Nothing here treats a 202 as "the figures
// have moved" — analytics is eventually consistent and the status code is the
// first place the platform says so.
//
// **2. The response's rows are named `results`.** Not `items`. It is not a page
// and is never handed to `readPage`, so this is a note rather than a defect.
//
// **3. The server restates the client's own property allow-list and refuses per
// event rather than per batch.** An event carrying a key the platform did not
// ask for comes back `rejected` with a reason and the rest of the batch is
// accepted. That is why a refusal is counted and dropped here rather than
// retried: a re-send of a malformed event is malformed the second time too.
//
// **4. Delivery must never break the flow that produced the event.** Every path
// below swallows its failure. A dropped measurement is a worse outcome than no
// measurement only to the person reading the dashboard; a thrown one is a worse
// outcome to the member whose grant submission it interrupted.
//
// ═════════════════════════════════════════════════════════════════════════════
// WHAT THIS FILE LEARNED WHEN THE SERVER WAS READ FROM SOURCE
// ═════════════════════════════════════════════════════════════════════════════
//
// Two defects, and the second is the larger one.
//
// **Nothing inspected `results[].status`.** The transport posted a batch, parsed
// the envelope and discarded it. Every per-event verdict the endpoint exists to
// produce — the whole of FRONTEND-PHASE15-GAP-029's "reject visibly rather than
// store quietly" — went into a variable nobody read. A client that cannot tell an
// accepted event from a refused one is in exactly the position the schema
// registry was built to get it out of.
//
// **Almost every event this client emits is refused, by design, and always was.**
// The server's registry is closed and short. Reading `AnalyticsEventTypes` and
// `AnalyticsSchemaSeeder` together, a *client* may submit seven names:
//
//     content.viewed                    content.impression
//     profile.viewed
//     automation.tested                 automation.builder.started
//     automation.builder.abandoned      automation.gap.encountered
//
// and nothing else. Every other name in the app's five vocabularies —
// `creator.*` (Phase 7), `community.*` (Phase 12/13), `maps.*` (Phase 8),
// `analytics.*` (Phase 15) and the twenty-two other `automation.*` names
// (Phase 18) — comes back `rejected` with `analytics.ingest.event-unknown`.
// That is the registry working: §41's rule is that a business metric originates
// from a trusted domain event, and a client that could post `content.saved`
// would be incrementing one.
//
// So this file now **filters before it posts**. Not to hide the refusals — they
// are counted and reported — but because a batch a client already knows will be
// refused is bandwidth spent on a round trip whose only product is a log line.
// The counts are surfaced through the same development console path
// `trackPlatformEvent` uses for a dropped property, and the filter is written as
// a transcription of the server's registry with the reason codes the server
// itself would have returned, so a developer reading the warning sees the same
// vocabulary they would see in a server log.
//
// **What this file must never do** is register an event name on the server or
// invent a route to do it with. The list below is a mirror of somebody else's
// decision, and the correct response to wanting a new name on it is a backend
// change, not an edit here.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from './apiClient';
import { drainCreatorEvents, type CreatorAnalyticsRecord } from './creator-analytics';

/**
 * The server's cap on one batch.
 *
 * `AnalyticsOptions.MaximumBatchSize`, and exceeding it fails the **whole**
 * batch with `analytics.ingest.batch-invalid` rather than truncating it — so the
 * drain is chunked here rather than posted in one request and hoped for. A
 * conservative floor: the client's own buffer holds more than this, and a member
 * who has been offline is exactly the case that would otherwise lose everything.
 */
const MAX_BATCH = 50;

/**
 * The seven names `AnalyticsEventSchema.AllowsClientSubmission` is true for.
 *
 * Three engagement events and four automation ones. Two facts about this list
 * are worth stating because they change what a reader expects:
 *
 *   **This client currently emits four of the seven.**
 *   `automation.builder.started`, `automation.builder.abandoned`,
 *   `automation.tested` and `automation.gap.encountered` are emitted by
 *   `lib/automation/events.ts`. `content.viewed`, `profile.viewed` and
 *   `content.impression` are registered, aggregated and **emitted by nothing** —
 *   which is why `content.views` and `content.uniqueViewers` are served as
 *   `AWAITING_SOURCE` on `/analytics/definitions`: the contract is there, the
 *   pipeline is there, and no device has ever reported one. Those three are the
 *   highest-value instrumentation this app is missing, and they are missing at
 *   the *emitter*, not here.
 *
 *   **The three engagement events require a content reference.**
 *   `RequiresContent: true` on their schemas, so a submission without a
 *   `contentId` that parses as a GUID is refused `event-malformed` rather than
 *   stored. Enforced below so the day somebody wires the emitter, the failure is
 *   a warning in development rather than a silent zero on a dashboard.
 */
const CLIENT_SUBMITTABLE = new Set<string>([
  'content.viewed',
  'profile.viewed',
  'content.impression',
  'automation.tested',
  'automation.builder.started',
  'automation.builder.abandoned',
  'automation.gap.encountered',
]);

/** Of those, the ones whose schema sets `RequiresContent`. */
const REQUIRES_CONTENT = new Set<string>([
  'content.viewed',
  'profile.viewed',
  'content.impression',
]);

/**
 * Registered, and server-produced.
 *
 * Separated from "not registered at all" only so the reason reported matches the
 * one the server would have given. The distinction is real and useful: an
 * unregistered name is a client release that invented something, while a
 * server-produced name is a client trying to report a fact the platform already
 * commits and publishes — §41 — and the two want completely different fixes.
 */
const SERVER_PRODUCED = new Set<string>([
  'content.published',
  'content.saved',
  'content.shared',
  'content.commented',
  'content.reacted',
  'content.converted',
  'audience.followed',
  'audience.unfollowed',
  'automation.created',
  'automation.activated',
  'automation.paused',
  'automation.disabled',
  'automation.deleted',
  'automation.executed',
  'automation.failed',
  'automation.template.used',
]);

/**
 * `RecordTelemetryCommandHandler.AllowedProperties`, all twenty-four of them.
 *
 * **Narrower than the client's own allow-list, and deliberately so.** The
 * emitter's list has grown with every phase — `courseId`, `challengeId`,
 * `grantId`, `metricKey`, `rangePreset`, `refusalReason` and thirty more — while
 * the server's is the subset the *accepted* events actually carry. A key that is
 * legal at emit and illegal at ingest is not a contradiction: the emitter's list
 * governs what may leave a screen, and this one governs what may be stored on
 * the platform.
 *
 * One disallowed key refuses the **whole event**, not just the key, so a filter
 * here is worth more than it looks: an `automation.gap.encountered` carrying a
 * `surface` alongside its `gapId` would be thrown away entire.
 */
const SERVER_PROPERTY_KEYS = new Set<string>([
  'contentId',
  'contentType',
  'category',
  'section',
  'kind',
  'source',
  'surface',
  'scope',
  'period',
  'state',
  'status',
  'result',
  'reason',
  'method',
  'contentDomain',
  'communityId',
  'countryCode',
  'position',
  'isSimulated',
  'triggerKey',
  'templateId',
  'gapId',
  'actionCount',
  'wasSimulated',
]);

/** `MaximumValueLength`. The client's own sanitiser caps strings at the same width. */
const MAX_PROPERTY_VALUE_LENGTH = 64;

/** `MaximumClientEventAgeHours`. Older than this is refused, not clamped. */
const MAX_EVENT_AGE_MS = 48 * 60 * 60 * 1000;

/**
 * `MaximumClientEventSkewMinutes`.
 *
 * Asymmetric on the server and mirrored asymmetrically here: a timestamp inside
 * the skew window is *clamped* to now, and one beyond it is refused. A device
 * whose clock is a few minutes fast is ordinary, and dropping its telemetry
 * would under-count exactly the members whose devices are least well looked
 * after.
 */
const MAX_FUTURE_SKEW_MS = 15 * 60 * 1000;

/** One event as the ingestion route binds it. */
interface TelemetryEventPayload {
  event: string;
  properties: Record<string, unknown>;
  occurredAt: string;
}

/** One event's verdict. `accepted`, `duplicate` or `rejected` — lower case. */
export interface TelemetryEventResult {
  index: number;
  event: string;
  status: string;
  reason?: string | null;
}

export interface TelemetryIngestionResult {
  accepted: number;
  duplicate: number;
  rejected: number;
  /** Named `results`, not `items`. See the header. */
  results: TelemetryEventResult[];
}

/**
 * What one drain actually did.
 *
 * Returned rather than logged only, so a caller — a test, a diagnostics screen —
 * can assert on it. Every count is a count of *events*, never of batches, except
 * `failedBatches`, which is the one thing that is genuinely about transport.
 */
export interface TelemetryFlushSummary {
  /** Events taken out of the buffer. */
  drained: number;
  /** Events posted, after filtering. */
  submitted: number;
  /** Events the client refused before posting, by the server's own reason code. */
  refusedLocally: Record<string, number>;
  /** Events the server stored. */
  accepted: number;
  /** Events the server had already stored under the same identity. */
  duplicate: number;
  /** Events the server refused, by reason code. `unknown` where it gave none. */
  rejected: Record<string, number>;
  /** Batches whose request failed outright. Their events are not retried. */
  failedBatches: number;
}

interface Envelope<T> {
  data: T;
}

function emptySummary(): TelemetryFlushSummary {
  return {
    drained: 0,
    submitted: 0,
    refusedLocally: {},
    accepted: 0,
    duplicate: 0,
    rejected: {},
    failedBatches: 0,
  };
}

function count(into: Record<string, number>, reason: string): void {
  into[reason] = (into[reason] ?? 0) + 1;
}

function toPayload(record: CreatorAnalyticsRecord, occurredAt: string): TelemetryEventPayload {
  return {
    event: record.event,
    // Already sanitised at emit against the client's allow-list. Nothing is
    // added here: a transport that enriched a payload would be a second place
    // properties are decided, and the sanitiser would stop being the answer to
    // "what can this app send about a member".
    properties: record.properties,
    occurredAt,
  };
}

/**
 * The reason this record would be refused, or `null` where it would be accepted.
 *
 * Every branch returns one of `AnalyticsErrorCodes`' ingest codes, spelled
 * exactly as the server spells it, so a development warning and a server log
 * read in the same vocabulary. The checks are in the server's own order, because
 * an event that is both unregistered and malformed should be reported the way
 * the server would have reported it.
 *
 * It does **not** re-implement deduplication or self-exclusion. Those are
 * decisions about platform state — has this identity been stored, does the
 * caller own the thing they looked at — and a client that guessed at them would
 * be inventing an answer only the server can give.
 */
function refusalFor(record: CreatorAnalyticsRecord, now: number): string | null {
  const name = record.event;

  if (typeof name !== 'string' || name.trim().length === 0) {
    return 'analytics.ingest.event-malformed';
  }

  if (!CLIENT_SUBMITTABLE.has(name)) {
    return SERVER_PRODUCED.has(name)
      ? 'analytics.ingest.event-not-submittable'
      : 'analytics.ingest.event-unknown';
  }

  const properties = record.properties ?? {};

  for (const [key, value] of Object.entries(properties)) {
    if (!SERVER_PROPERTY_KEYS.has(key)) return 'analytics.ingest.property-not-allowed';
    // The server stores every value as its text — a number arrives as a JSON
    // number and is kept as its raw text — so the cap is measured the same way
    // here rather than only on strings.
    if (String(value).length > MAX_PROPERTY_VALUE_LENGTH) {
      return 'analytics.ingest.event-malformed';
    }
  }

  if (REQUIRES_CONTENT.has(name)) {
    const contentId = properties.contentId;
    if (typeof contentId !== 'string' || contentId.trim().length === 0) {
      return 'analytics.ingest.event-malformed';
    }
  }

  const occurredAt = Date.parse(record.occurredAt);

  if (!Number.isFinite(occurredAt)) return 'analytics.ingest.event-malformed';
  if (occurredAt > now + MAX_FUTURE_SKEW_MS) return 'analytics.ingest.occurred-at-out-of-range';
  if (occurredAt < now - MAX_EVENT_AGE_MS) return 'analytics.ingest.occurred-at-out-of-range';

  return null;
}

/**
 * Splits a drain into what will be posted and what will not.
 *
 * Exported so the rule is testable without a network, and because "which of the
 * app's event names actually reach the platform" is a question worth being able
 * to answer from a test rather than from a comment.
 */
export function partitionForDelivery(
  records: readonly CreatorAnalyticsRecord[],
  now: number = Date.now()
): { deliverable: CreatorAnalyticsRecord[]; refusedLocally: Record<string, number> } {
  const deliverable: CreatorAnalyticsRecord[] = [];
  const refusedLocally: Record<string, number> = {};

  for (const record of records) {
    const refusal = refusalFor(record, now);
    if (refusal === null) {
      deliverable.push(record);
      continue;
    }
    count(refusedLocally, refusal);
  }

  return { deliverable, refusedLocally };
}

/**
 * Brings a record's occurrence time inside the window the server accepts.
 *
 * Only the forward half — a slightly fast device clock is clamped to now,
 * exactly as `ClampClientTime` does, so an event that would otherwise be refused
 * for being four minutes in the future is stored with a defensible timestamp.
 * The backward half is a refusal rather than a clamp and is handled in
 * `refusalFor`: a timestamp days old writes into a period that has already been
 * reported on, and moving it to now would be worse than dropping it.
 */
function clampOccurredAt(record: CreatorAnalyticsRecord, now: number): string {
  const occurredAt = Date.parse(record.occurredAt);
  return Number.isFinite(occurredAt) && occurredAt > now
    ? new Date(now).toISOString()
    : record.occurredAt;
}

/**
 * Posts one batch.
 *
 * Returns the server's verdicts, or `null` when the request failed. A `null` is
 * a delivery failure and the events are **not** put back: the buffer is a
 * fixed-size ring that the app is still writing into, and re-queueing a failed
 * batch would evict newer events to retry older ones for ever.
 */
async function deliverBatch(
  batch: CreatorAnalyticsRecord[],
  now: number
): Promise<TelemetryIngestionResult | null> {
  try {
    const response = await apiClient.post<Envelope<TelemetryIngestionResult>>(
      '/telemetry/events',
      { events: batch.map((record) => toPayload(record, clampOccurredAt(record, now))) }
    );
    return response.data.data;
  } catch {
    // Deliberately silent at the network layer. See the header: measurement never
    // breaks a flow, and a console warning on every offline tick is its own kind
    // of noise. The *count* of failed batches is still reported by `flush`.
    return null;
  }
}

/**
 * Folds one batch's verdicts into the summary.
 *
 * **This is the half that did not exist.** `results` is a row per submitted
 * event carrying `accepted`, `duplicate` or `rejected` and, for a rejection, one
 * of `AnalyticsErrorCodes`' ingest codes. A transport that discarded it left the
 * app unable to tell a stored event from one the registry has never heard of,
 * which is the silent drop the registry was built to prevent moved one layer up.
 */
function foldResults(summary: TelemetryFlushSummary, outcome: TelemetryIngestionResult): void {
  for (const result of outcome.results ?? []) {
    switch (result.status) {
      case 'accepted':
        summary.accepted += 1;
        break;
      case 'duplicate':
        summary.duplicate += 1;
        break;
      default:
        count(summary.rejected, result.reason || 'unknown');
        break;
    }
  }
}

/**
 * Says what happened, where a developer will see it.
 *
 * The same path and the same rule as the dropped-property warning in
 * `trackPlatformEvent`: loud in development, silent in a release binary. A
 * rejection nobody ever sees is indistinguishable from an acceptance, and this
 * is the whole reason `results` is a per-event array rather than a status code.
 *
 * A drain in which everything was accepted says nothing. Warning on the healthy
 * path is how a warning stops being read.
 */
function report(summary: TelemetryFlushSummary): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;

  const problems = [
    ...Object.entries(summary.refusedLocally).map(
      ([reason, n]) => `${n}×${reason} (not sent)`
    ),
    ...Object.entries(summary.rejected).map(([reason, n]) => `${n}×${reason} (server)`),
  ];

  if (summary.failedBatches > 0) {
    problems.push(`${summary.failedBatches} batch(es) failed to deliver`);
  }

  if (problems.length === 0) return;

  // eslint-disable-next-line no-console
  console.warn(
    `[telemetry] ${summary.accepted} accepted, ${summary.duplicate} duplicate, ` +
      `${summary.drained - summary.accepted - summary.duplicate} not stored — ` +
      `${problems.join('; ')}. Only seven event names are client-submittable; see ` +
      'CLIENT_SUBMITTABLE in lib/telemetry-api.ts. Registering another one is a ' +
      'backend change, not a client one.'
  );
}

/**
 * Drains the buffer and posts it.
 *
 * Safe to call at any time and from anywhere: it takes whatever has
 * accumulated, filters it to what the platform's registry will accept, sends the
 * rest in server-sized chunks, and resolves with what happened to all of it.
 * Nothing awaits it that a member is waiting on.
 *
 * **Not called on every emit, and that is the point.** `trackCreatorEvent` is
 * synchronous, non-blocking and used inside interaction handlers; giving it a
 * network call would put a request in the path of a button press. The buffer is
 * the seam that keeps emission cheap, and this is the only thing that empties
 * it.
 */
export async function flushTelemetry(): Promise<TelemetryFlushSummary> {
  const summary = emptySummary();
  const drained = drainCreatorEvents();

  summary.drained = drained.length;
  if (drained.length === 0) return summary;

  const now = Date.now();
  const { deliverable, refusedLocally } = partitionForDelivery(drained, now);

  summary.refusedLocally = refusedLocally;
  summary.submitted = deliverable.length;

  for (let offset = 0; offset < deliverable.length; offset += MAX_BATCH) {
    const outcome = await deliverBatch(deliverable.slice(offset, offset + MAX_BATCH), now);

    if (outcome === null) {
      summary.failedBatches += 1;
      continue;
    }

    foldResults(summary, outcome);
  }

  report(summary);
  return summary;
}

/**
 * Starts the periodic flush and returns the stop function.
 *
 * Called once from the app root. An interval rather than a flush-per-event for
 * the reason above, and a *long* interval because nothing downstream is
 * real-time: the rollups this feeds are computed on a schedule, so delivering
 * within a minute and delivering within a second are the same answer to
 * everybody who reads them.
 */
export function startTelemetryDelivery(intervalMs = 60_000): () => void {
  const timer = setInterval(() => {
    void flushTelemetry();
  }, intervalMs);

  return () => {
    clearInterval(timer);
    // One last drain on the way out, so a session that ends cleanly does not
    // lose the interval's worth of events it was holding.
    void flushTelemetry();
  };
}
