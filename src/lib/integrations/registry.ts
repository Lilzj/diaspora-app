// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — integration provider registry (Frontend Phase 16, §3 · §4 · §15)
//
// The single place that decides which implementation answers. Every consumer
// asks the registry; **no screen imports a concrete provider**, which is what
// makes §4's "providers must be changeable without rewriting product screens" a
// structural property rather than a convention.
//
// This is deliberately the same shape as `lib/maps/providers/registry.ts`,
// which Phase 8 built and which works. Two registries with different selection
// rules would be two things to reason about; two registries with the same rule
// are one idea applied twice.
//
// ── The selection rule, and why it is in this order ──────────────────────────
//
// For every capability:
//
//   1. A **real** provider, if the module is present and configured.
//   2. A **development adapter**, if the build is allowed to simulate.
//   3. An **unavailable** provider that fails cleanly in the §32 vocabulary.
//
// Step 3 is the one that is easy to leave out and the reason a production build
// behaves. Without it, a production build with no calendar provider would need
// every call site to check a flag first, and the first one that forgot would
// throw inside a render. With it, the answer is a typed `IntegrationError`, the
// screen renders its "not available" state, and nothing crashes.
//
// ── Why these are functions and not constants ────────────────────────────────
//
// Resolution reads environment configuration and the simulation switch, both of
// which a test needs to vary. Module constants would capture the first answer
// and every subsequent test would inherit it. Resolution is a handful of
// property reads; `getIntegrationStatus()` deliberately re-resolves so the
// diagnostics surface shows the live answer.
//
// ── Maps are absent from this file, on purpose ───────────────────────────────
//
// There is no `resolveMapProvider` here. Phase 8's registry already owns that,
// and `lib/integrations/maps.ts` is a read-only bridge onto it. A second map
// registry would be the duplicate implementation §12 forbids — "do not build
// isolated map implementations per feature" applies to this phase as much as to
// a product screen.
// ─────────────────────────────────────────────────────────────────────────────

import { Platform } from 'react-native';
import {
  getIntegrationConfig,
  isAppleIdentityConfigured,
  isGoogleOAuthConfigured,
  isPushConfigured,
} from '@/config/integration-config';
import { areIntegrationGapsEnabled } from '@/config/integration-gaps';
import type { IntegrationMode, IntegrationProviderId } from '@/types/integrations';
import { deviceCalendarProvider, hasDeviceCalendar } from './providers/device-calendar';
import { remoteCalendarProvider, unavailableCalendarProvider } from './providers/remote-calendar';
import {
  adapterPushProvider,
  devicePushProvider,
  hasPushModule,
  unavailablePushProvider,
} from './providers/push';
import {
  adapterOAuthProvider,
  deviceOAuthProvider,
  hasOAuthModule,
  unconfiguredOAuthProvider,
} from './providers/oauth';
import type { CalendarProvider, OAuthProvider, PushProvider } from './providers/types';

// ═════════════════════════════════════════════════════════════════════════════
// CALENDAR — §6, §9
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The device calendar.
 *
 * The only integration in this phase that can be genuinely real today, because
 * it needs no backend at all — installing `expo-calendar` and making a
 * development build is sufficient. That is why `deviceCalendarProvider` is
 * returned whenever the module loads, with no gap check: there is no gap.
 *
 * With no module there is no simulation either. A simulated device calendar
 * that "wrote" an event nobody can find in their calendar app would be a worse
 * outcome than an honest refusal — the member goes looking for the event and it
 * is not there. The adapter arm exists for the *remote* providers, where the
 * absence is invisible either way.
 */
export function resolveDeviceCalendarProvider(): CalendarProvider {
  if (hasDeviceCalendar()) return deviceCalendarProvider;
  return unavailableCalendarProvider('calendar.device', 'googleCalendarWrite');
}

/**
 * A remote calendar — Google today, iCloud if it is ever added.
 *
 * There is no "real" arm here at all, and its absence is the honest reflection
 * of FRONTEND-PHASE16-GAP-002: without the backend exchange endpoint there is
 * no connection to read a calendar with, so a real provider would have nothing
 * to authenticate as. The day GAP-002 lands, the real arm is added here and
 * nothing above this line changes.
 */
export function resolveRemoteCalendarProvider(
  provider: IntegrationProviderId = 'calendar.google'
): CalendarProvider {
  if (areIntegrationGapsEnabled()) return remoteCalendarProvider(provider);
  return unavailableCalendarProvider(provider, 'googleCalendarList');
}

/**
 * Every calendar provider a member could plausibly use, in the order to offer them.
 *
 * The device first, because it is the one that can actually work and needs no
 * account. Offering Google first would put the unavailable option at the top of
 * the sheet, which reads as the recommended choice.
 *
 * Apple's remote calendar (iCloud) is deliberately absent rather than listed as
 * unavailable: iCloud has no third-party calendar API, so it is not a gap
 * waiting to be filled — on iOS the device provider *is* Apple Calendar, which
 * is why §9 warns against assuming it has Google's OAuth architecture.
 */
export function resolveCalendarProviders(): CalendarProvider[] {
  return [resolveDeviceCalendarProvider(), resolveRemoteCalendarProvider('calendar.google')];
}

/** The provider for a specific id, for a screen acting on a stored selection. */
export function resolveCalendarProviderById(
  provider: IntegrationProviderId
): CalendarProvider {
  if (provider === 'calendar.device' || provider === 'calendar.apple') {
    // On iOS, `calendar.apple` *is* the device calendar. The two ids resolve to
    // one provider rather than one of them being unavailable, because a member
    // who picked "Apple Calendar" on iOS picked the thing this returns.
    if (provider === 'calendar.apple' && Platform.OS !== 'ios') {
      return unavailableCalendarProvider('calendar.apple', 'googleCalendarList');
    }
    return resolveDeviceCalendarProvider();
  }
  return resolveRemoteCalendarProvider(provider);
}

// ═════════════════════════════════════════════════════════════════════════════
// PUSH — §14, §15, §16
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The push transport.
 *
 * Both conditions are required for the real provider: the native module must
 * have loaded *and* the build must be configured for a transport. A module with
 * no configuration mints no usable token — `getExpoPushTokenAsync` without a
 * project id fails, and a device token with no FCM configuration routes
 * nowhere — so accepting one without the other would produce a provider that
 * reports itself real and cannot deliver.
 *
 * That is the same rule `getMapProviderConfig()` applies for tiles, for the
 * same reason: a half-configured build should fall back to something that
 * works, not to a grey rectangle.
 */
export function resolvePushProvider(): PushProvider {
  if (hasPushModule() && isPushConfigured()) return devicePushProvider;
  if (areIntegrationGapsEnabled()) return adapterPushProvider;
  return unavailablePushProvider;
}

// ═════════════════════════════════════════════════════════════════════════════
// IDENTITY — §21, §22, §23
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A third-party identity provider.
 *
 * The real arm needs the module *and* a client id, and even then it only gets
 * as far as producing an authorization code — the exchange is GAP-002. So a
 * fully-configured device build still cannot complete a link, and
 * `unconfiguredOAuthProvider` reports `BACKEND_GAP` rather than
 * `NOT_CONFIGURED` in exactly that case, which is a more useful thing for a
 * release engineer to read than "not configured" when they have just configured
 * it.
 */
export function resolveOAuthProvider(provider: IntegrationProviderId): OAuthProvider {
  const configured =
    provider === 'identity.apple' ? isAppleIdentityConfigured() : isGoogleOAuthConfigured();

  // Apple's native path needs no Services ID on iOS — the capability comes from
  // the provisioning profile — so `configured` is not the whole test there.
  const appleNative = provider === 'identity.apple' && Platform.OS === 'ios';

  if (hasOAuthModule() && (configured || appleNative)) return deviceOAuthProvider(provider);
  if (areIntegrationGapsEnabled()) return adapterOAuthProvider(provider);
  return unconfiguredOAuthProvider(provider);
}

/** Which identity providers this build offers at all. Drives what the linking screen lists. */
export function resolveIdentityProviders(): OAuthProvider[] {
  const providers: IntegrationProviderId[] = ['identity.google'];

  // §23 and App Store Guideline 4.8: Sign in with Apple is required wherever
  // another third-party sign-in is offered, on Apple platforms. Listing it only
  // on iOS is not a policy dodge — on Android it needs the web flow and a
  // Services ID, and offering it without one produces a dead entry.
  if (Platform.OS === 'ios' || isAppleIdentityConfigured()) {
    providers.push('identity.apple');
  }

  return providers.map(resolveOAuthProvider);
}

// ═════════════════════════════════════════════════════════════════════════════
// DIAGNOSTICS — §67, §69
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A snapshot for the diagnostics surface and the readiness report.
 *
 * Contains **no credential, no credential prefix and no URL that could carry
 * one** — booleans and mode names only. Phase 8's `getProviderStatus()` makes
 * the same promise for the same reason: this is designed to be safe to
 * screenshot into a bug report, and a truncated client id in a log is still a
 * client id in a log.
 */
export interface IntegrationProviderStatus {
  calendar: { device: ProviderLine; remote: ProviderLine };
  push: ProviderLine & { transport: string };
  identity: ProviderLine[];
  environment: string;
  /** True when this build may reach any simulated surface at all. */
  simulationEnabled: boolean;
}

interface ProviderLine {
  id: IntegrationProviderId;
  label: string;
  mode: IntegrationMode;
  gapId?: string;
}

function line(descriptor: {
  id: IntegrationProviderId;
  label: string;
  mode: IntegrationMode;
  gapId?: string;
}): ProviderLine {
  return {
    id: descriptor.id,
    label: descriptor.label,
    mode: descriptor.mode,
    gapId: descriptor.gapId,
  };
}

export function getIntegrationProviderStatus(): IntegrationProviderStatus {
  const config = getIntegrationConfig();

  return {
    calendar: {
      device: line(resolveDeviceCalendarProvider().descriptor),
      remote: line(resolveRemoteCalendarProvider().descriptor),
    },
    push: {
      ...line(resolvePushProvider().descriptor),
      transport: config.pushProvider,
    },
    identity: resolveIdentityProviders().map((provider) => line(provider.descriptor)),
    environment: config.environment,
    simulationEnabled: areIntegrationGapsEnabled(),
  };
}
