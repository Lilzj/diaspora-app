// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation, certified arm (Frontend Phase 18)
//
// Real routes only. Every endpoint reached from this file exists in the
// certified backend and is called by the application today.
//
// ── What this file used to say, and what changed ─────────────────────────────
//
// It opened: *"**There is no certified automation contract.** Not a partial one.
// The audit searched for automation, rule, workflow, trigger, scheduler, job,
// queue and outbox across the whole surface and found nothing an automation
// could be built on."* That was true when it was written and is not true now —
// `Diaspora.Modules.Automation` serves 24 routes, and `lib/automation/certified-client.ts`
// is the client for them.
//
// This file still exports no `createAutomation`, no `listAutomations` and no
// `runAutomation`: those belong to the certified client, and keeping the routes
// and the composition in separate files is deliberate so the two do not have to
// be reviewed together.
//
// What it owns is the part of automation that answers *"what can this
// deployment actually do"* — the member's own B13 notification settings, which
// every automation action has to respect (§53), and, since the correction
// recorded on `fetchCertifiedAutomationSupport` below, the live capability and
// catalogue documents. Those read `notifications-api.ts` rather than
// re-wrapping B13, because §28 forbids a second notification system and
// re-wrapping is how one starts.
//
// ── The one thing this file is for ───────────────────────────────────────────
//
// `fetchCertifiedAutomationSupport()`. Every screen in this phase needs to know
// what the platform can actually do, and the honest answer has three parts —
// what B13 will deliver, what the device can do locally, and what does not
// exist. Answering that from one place means no screen has to assemble its own
// picture and get a different one.
// ─────────────────────────────────────────────────────────────────────────────

import {
  fetchNotificationCategories,
  fetchNotificationPreferences,
} from './notifications-api';
import { toAutomationError } from './automation/errors';
import {
  fetchAccess,
  fetchCatalog,
  isCatalogEntryAvailable,
  type AutomationCatalog,
} from './automation/certified-client';
import type { AutomationAccess } from '@/types/automation';
import type {
  NotificationCategoryDefinition,
  NotificationPreferences,
} from '@/types/notification-preferences';

// ═════════════════════════════════════════════════════════════════════════════
// NOTIFICATION SETTINGS — B13, real, and the input to §53
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The channels this member has switched on.
 *
 * Read from B13's real preference contract, so the builder can say "this would
 * email you and you have email switched off" before they activate rather than
 * after they wonder why nothing arrived.
 *
 * `InApp` is always present. B13's own model says the inbox cannot be switched
 * off — `NotificationPreferences.inApp` is documented as always true and
 * rendered disabled — so an automation that notifies in-app always reaches
 * somewhere, which is why the builder can offer `notify.self` unconditionally.
 */
export function enabledChannelsFrom(preferences: NotificationPreferences | null): string[] {
  if (!preferences) {
    // Not "assume nothing works". A missing preference record means the read
    // failed, and the in-app inbox is on regardless — claiming otherwise would
    // make the builder refuse an action that would in fact be delivered.
    return ['InApp'];
  }

  const channels: string[] = ['InApp'];
  if (preferences.push) channels.push('Push');
  if (preferences.email) channels.push('Email');
  return channels;
}

/**
 * Whether quiet hours would delay something sent now.
 *
 * Advisory only. **The server decides at dispatch** — §53, and it decides in
 * the recipient's own timezone, which for a community automation is not the
 * sender's. This exists so the preview can say "your quiet hours are 22:00 to
 * 07:00, so this may arrive later", which is a true statement about a setting
 * rather than a prediction about a delivery.
 */
export function quietHoursSummary(preferences: NotificationPreferences | null): string | null {
  if (!preferences?.communication.quietHoursEnabled) return null;

  const { quietHoursStart, quietHoursEnd, timeZoneId } = preferences.communication;
  const pad = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

  return `Your quiet hours are ${pad(quietHoursStart)} to ${pad(quietHoursEnd)} (${timeZoneId}). Notifications may arrive after they end.`;
}

/**
 * Whether an automation's category can be switched off by the member.
 *
 * B13 marks some categories mandatory — security and moderation. An automation
 * must never be able to *use* a mandatory category to reach somebody who has
 * opted out of everything else: that would be §53's forbidden bypass wearing
 * B13's own clothes. So this exists to let the builder refuse a mandatory
 * category rather than to let it choose one.
 */
export function isCategoryMandatory(
  categories: NotificationCategoryDefinition[],
  categoryKey: string | null
): boolean {
  if (!categoryKey) return false;
  return categories.some((category) => category.key === categoryKey && category.isMandatory);
}

// ═════════════════════════════════════════════════════════════════════════════
// WHAT THE PLATFORM CAN ACTUALLY DO
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The certified automation surface, as it really is.
 *
 * Every field here is a fact about the deployment rather than about the member.
 * They are separate fields rather than one `hasAutomation` boolean because they
 * do not arrive together: a registry without an engine is a real intermediate
 * state (GAP-001 without GAP-002), and the UI should be able to say "your
 * automations are saved and will start running when the engine ships" rather
 * than either "everything works" or "nothing does".
 *
 * They were all `false` for as long as the deployment served no automation
 * routes. They are now read from the served capability and catalogue documents —
 * see `fetchCertifiedAutomationSupport`.
 */
export interface CertifiedAutomationSupport {
  /** GAP-001: can an automation be stored server-side? */
  hasRegistry: boolean;
  /** GAP-002: is there anything that would run one? */
  hasExecutionEngine: boolean;
  /** GAP-003: can anything happen on a schedule? */
  hasScheduler: boolean;
  /** GAP-004: is there a run history? */
  hasExecutionHistory: boolean;
  /** GAP-024: can an automation ask B13 to deliver? */
  hasNotificationDispatch: boolean;
  /** GAP-009: is a saved search evaluated against new content? */
  hasSavedSearchEvaluation: boolean;

  // ── What *is* real, and is used ──────────────────────────────────────────
  /** B13. Read live, and every automation action respects it. */
  hasNotificationPreferences: boolean;
  /** B13. The inbox an automation's notification would land in. */
  hasNotificationInbox: boolean;
  /** Phase 16. The device calendar, where the native module is present. */
  hasDeviceCalendar: boolean;
  /** Phase 5. Deep links from a notification to the right screen. */
  hasDeepLinkRouting: boolean;

  /** The member's channels, so the caller does not fetch preferences twice. */
  enabledChannels: string[];
  quietHours: string | null;
  categories: NotificationCategoryDefinition[];
}

/**
 * What this deployment can do.
 *
 * ── The correction ───────────────────────────────────────────────────────────
 *
 * The six automation fields used to be hardcoded `false`, with a comment saying
 * "there is no route to ask. A probe against `/automations` would either 404 …
 * When GAP-001 ships, this function grows a real call and one file changes."
 *
 * GAP-001 shipped. `Diaspora.Modules.Automation` serves 24 routes;
 * `GET /automations/capabilities` and `GET /automations/catalog` both answer
 * 200; `POST /automations` stores a definition that comes back with a
 * `nextRunAt`; and `AutomationSchedulerWorker` is a registered
 * `BackgroundService` that sweeps due occurrences, reminders and dated subjects
 * every cycle. Nobody re-read this function, so every automation screen went on
 * telling members *"Diaspora cannot store automations yet"* and *"Diaspora
 * cannot run automations automatically yet"* over a platform doing both.
 *
 * This is that call, and it is the one file that changed.
 *
 * ── Why the flags are derived rather than declared ───────────────────────────
 *
 * The deployment publishes no `hasExecutionEngine` boolean, and inventing one
 * server-side would only move the drift. What it publishes is the **whole
 * vocabulary annotated with what it cannot do** — until 21 Oct 2026
 * `location.enteredArea` was in the catalogue carrying `isAvailable: false` and
 * the sentence "Background location is not implemented". So each flag below is read off that annotation,
 * which means a capability that is switched off tomorrow turns the flag off
 * without anybody editing this file. That is the property the hardcoded version
 * lacked in the other direction.
 *
 * ── What stays false, and why that is not this function's doing ──────────────
 *
 * `canCreatePlatformWide` is `false` in the served capability document. Since
 * 21 Oct 2026 `canUseLocationTriggers` is true and both location triggers are
 * available — read from the same document as everything else, so nothing here
 * changed when they were switched on.
 */
export async function fetchCertifiedAutomationSupport(): Promise<CertifiedAutomationSupport> {
  let preferences: NotificationPreferences | null = null;
  let categories: NotificationCategoryDefinition[] = [];
  let access: AutomationAccess | null = null;
  let catalog: AutomationCatalog | null = null;

  try {
    // Four independent reads, settled together rather than sequentially: none
    // depends on another and a member on a slow connection should wait once.
    const [preferencesResult, categoriesResult, accessResult, catalogResult] =
      await Promise.allSettled([
        fetchNotificationPreferences(),
        fetchNotificationCategories(),
        // No owner id: `bindableOwnerId` drops anything that is not a Guid, and
        // every one of these routes defaults an absent owner to the token's own
        // subject — which is exactly the question being asked here.
        fetchAccess({
          ownerKind: 'user',
          ownerId: '',
          ownerLabel: 'You',
          communityIds: [],
          isCrossCommunity: false,
          countryCodes: [],
          neighbourhoodIds: [],
        }),
        fetchCatalog(),
      ]);

    if (preferencesResult.status === 'fulfilled') preferences = preferencesResult.value;
    if (categoriesResult.status === 'fulfilled') categories = categoriesResult.value;
    if (accessResult.status === 'fulfilled') access = accessResult.value;
    if (catalogResult.status === 'fulfilled') catalog = catalogResult.value;
  } catch (cause) {
    // Never fatal. The automation surface must still render when B13 is
    // unreachable — a member should be able to read their automations while
    // their preferences fail to load, and the channel list degrades to the
    // in-app inbox rather than to nothing.
    throw toAutomationError(cause, { mutating: false });
  }

  // A failed capability read is not evidence that the capability is absent, but
  // it is not evidence that it is present either — and a screen that assumed
  // present would offer controls the server may refuse. Absent stays the safe
  // default, exactly as `noAutomationAccess()` decided for the access set.
  const registryAnswered = access !== null && access.provenance === 'server';
  const triggers = catalog?.triggers ?? [];
  const actions = catalog?.actions ?? [];

  const hasRunnableTrigger = triggers.some((entry) => entry.isAvailable);
  const hasRunnableAction = actions.some((entry) => entry.isAvailable);

  return {
    // The registry is the capability document itself: it answers with a
    // ceiling and a live count of what this member has stored.
    hasRegistry: registryAnswered && access!.canViewAutomations,

    // An engine needs something to fire on and something to do. Either half
    // missing means a stored automation would sit there, which is the state
    // the old hardcoded `false` was describing.
    hasExecutionEngine: registryAnswered && hasRunnableTrigger && hasRunnableAction,

    // `reminder.schedule` is the action that puts something on a clock, and
    // `AutomationSchedulerWorker` is what comes back round for it. If the
    // deployment withdraws the action, nothing is sweeping and this is false.
    hasScheduler: registryAnswered && isCatalogEntryAvailable(actions, 'reminder.schedule'),

    // Run history is served to the owner unconditionally; `canViewOthersRuns`
    // is about *other people's*, and reading it as this flag would say "no
    // history" to every member who is not a moderator.
    hasExecutionHistory: registryAnswered,

    // Delivery to the member's own inbox is the floor. `notify.self` is the
    // action that reaches it, and B13 carries it from there.
    hasNotificationDispatch: registryAnswered && isCatalogEntryAvailable(actions, 'notify.self'),

    hasSavedSearchEvaluation:
      registryAnswered && isCatalogEntryAvailable(triggers, 'savedSearch.newMatch'),

    hasNotificationPreferences: preferences !== null,
    hasNotificationInbox: true,
    hasDeviceCalendar: true,
    hasDeepLinkRouting: true,

    enabledChannels: enabledChannelsFrom(preferences),
    quietHours: quietHoursSummary(preferences),
    categories,
  };
}

/**
 * Whether anything an automation configures could actually run today.
 *
 * Used by the Automation Center to decide between "here are your automations"
 * and "here are your automations, and none of them can run yet" — which is a
 * different screen and should be, because the second one has to explain itself.
 */
export function canExecuteAnything(support: CertifiedAutomationSupport): boolean {
  return support.hasExecutionEngine && support.hasRegistry;
}
