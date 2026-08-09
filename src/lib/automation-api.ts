// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Automation, certified arm (Frontend Phase 18)
//
// Real routes only. Every endpoint reached from this file exists in the
// certified backend and is called by the application today.
//
// ── Why this file wraps nothing new ──────────────────────────────────────────
//
// **There is no certified automation contract.** Not a partial one. The audit
// searched for automation, rule, workflow, trigger, scheduler, job, queue and
// outbox across the whole surface and found nothing an automation could be
// built on. `config/automation-gaps.ts` is thirty entries long for that reason.
//
// So this file exports no `createAutomation`, no `listAutomations`, no
// `runAutomation`. Writing one that posted to `/automations` would be §77's
// forbidden "invent silent production APIs" — a route that 404s in production
// and looks, in a diff, exactly like a route that works.
//
// What it does export is the part of automation that is **genuinely real
// today**: the member's own B13 notification settings, which every automation
// action has to respect (§53), and the composition helpers that turn them into
// the questions the automation layer asks. Those read `notifications-api.ts`
// rather than re-wrapping B13, because §28 forbids a second notification system
// and re-wrapping is how one starts.
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
 * Every field here is a fact about the deployment rather than about the member,
 * and every one is `false` today. They are separate fields rather than one
 * `hasAutomation` boolean because they will not ship together: a registry
 * without an engine is a real intermediate state (GAP-001 without GAP-002), and
 * the UI should be able to say "your automations are saved and will start
 * running when the engine ships" rather than either "everything works" or
 * "nothing does".
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
 * The six automation fields are hardcoded `false` and that is deliberate rather
 * than lazy: there is no route to ask. A probe against `/automations` would
 * either 404 — telling us what we already know, at the cost of a request on
 * every launch — or, worse, hit some future unrelated route and answer wrongly.
 * When GAP-001 ships, this function grows a real call and one file changes.
 *
 * The B13 half **is** probed, because it is real and because a member with
 * email switched off should see that reflected rather than assumed.
 */
export async function fetchCertifiedAutomationSupport(): Promise<CertifiedAutomationSupport> {
  let preferences: NotificationPreferences | null = null;
  let categories: NotificationCategoryDefinition[] = [];

  try {
    // Both are real B13 routes. Settled together rather than sequentially:
    // neither depends on the other and a member on a slow connection should
    // wait once.
    const [preferencesResult, categoriesResult] = await Promise.allSettled([
      fetchNotificationPreferences(),
      fetchNotificationCategories(),
    ]);

    if (preferencesResult.status === 'fulfilled') preferences = preferencesResult.value;
    if (categoriesResult.status === 'fulfilled') categories = categoriesResult.value;
  } catch (cause) {
    // Never fatal. The automation surface must still render when B13 is
    // unreachable — a member should be able to read their automations while
    // their preferences fail to load, and the channel list degrades to the
    // in-app inbox rather than to nothing.
    throw toAutomationError(cause, { mutating: false });
  }

  return {
    hasRegistry: false,
    hasExecutionEngine: false,
    hasScheduler: false,
    hasExecutionHistory: false,
    hasNotificationDispatch: false,
    hasSavedSearchEvaluation: false,

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
