// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — OAuth providers (Frontend Phase 16, §21 · §22 · §23 · §38)
//
// The device half of the authorization code flow with PKCE. The backend holds
// the client secret and every refresh token; this layer produces an
// authorization code and hands it over — see FRONTEND-PHASE16-GAP-002 for why
// that architecture was chosen and what it costs.
//
// Three implementations:
//
//   `deviceOAuthProvider(provider)`      — `expo-auth-session` over the system
//                                          browser. Not active today; neither
//                                          the package nor a client id is
//                                          present (INTEGRATION-PROVIDER-GAP-003/4).
//   `adapterOAuthProvider(provider)`     — completes the flow locally so every
//                                          state is reachable. Nothing leaves
//                                          the device.
//   `unconfiguredOAuthProvider(provider)`— the production answer, which refuses
//                                          *before* opening a browser.
//
// ── Why the unconfigured provider refuses before opening anything ────────────
//
// This is the one design decision in this file worth arguing about, so it is
// written down. A member who completes a Google consent screen has given real
// permission to a real account. If the exchange endpoint then 404s, they have
// paid a genuine privacy cost for nothing, and Diaspora is left with a grant it
// cannot revoke because it never learned the account. Refusing at the start
// costs them a tap; refusing at the end costs them a live OAuth grant.
//
// ── Scopes are per-capability, never per-provider ────────────────────────────
//
// §22 warns that "Google Calendar connection" and "Google identity
// authentication" are not the same thing, and `scopesFor` is where that stops
// being a warning. Connecting a calendar asks for `calendar.events`; signing in
// asks for `openid email profile`. A member who wants to sign in with Google is
// never asked for their calendar, which is §36's rule about requesting only
// what the selected capability needs.
// ─────────────────────────────────────────────────────────────────────────────

import {
  buildRedirectUri,
  getIntegrationConfig,
  isAppleIdentityConfigured,
  isGoogleOAuthConfigured,
} from '@/config/integration-config';
import { INTEGRATION_GAPS } from '@/config/integration-gaps';
import { INTEGRATION_PROVIDER_GAPS } from '@/config/integration-provider-gaps';
import { backendGapError, integrationError } from '../errors';
import type { IntegrationCapability, IntegrationProviderId } from '@/types/integrations';
import type { OAuthOutcome, OAuthProvider } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Scopes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The narrowest scope that satisfies each capability.
 *
 * `calendar.events` rather than `calendar`: the wide scope grants read access
 * to every event a member has ever had, and this application writes events and
 * lists calendars. Asking for the wide one because it is simpler is exactly
 * what §36 forbids, and it also triggers a stricter Google verification review
 * — so the narrow scope is both the correct choice and the cheaper one.
 */
const GOOGLE_SCOPES: Partial<Record<IntegrationCapability, string[]>> = {
  'identity.signIn': ['openid', 'email', 'profile'],
  'identity.link': ['openid', 'email', 'profile'],
  'calendar.list': ['https://www.googleapis.com/auth/calendar.readonly'],
  'calendar.event.create': ['https://www.googleapis.com/auth/calendar.events'],
  'calendar.event.update': ['https://www.googleapis.com/auth/calendar.events'],
  'calendar.event.delete': ['https://www.googleapis.com/auth/calendar.events'],
  'calendar.sync.twoWay': ['https://www.googleapis.com/auth/calendar'],
};

const APPLE_SCOPES: Partial<Record<IntegrationCapability, string[]>> = {
  'identity.signIn': ['name', 'email'],
  'identity.link': ['name', 'email'],
};

function scopesFor(provider: IntegrationProviderId, capability: IntegrationCapability): string[] {
  const table = provider.startsWith('identity.apple') || provider === 'calendar.apple'
    ? APPLE_SCOPES
    : GOOGLE_SCOPES;
  return table[capability] ?? [];
}

const LABELS: Partial<Record<IntegrationProviderId, string>> = {
  'identity.google': 'Google',
  'identity.apple': 'Apple',
  'calendar.google': 'Google Calendar',
  'calendar.apple': 'Apple Calendar (iCloud)',
};

function labelFor(provider: IntegrationProviderId): string {
  return LABELS[provider] ?? provider;
}

// ─────────────────────────────────────────────────────────────────────────────
// Optional native modules
// ─────────────────────────────────────────────────────────────────────────────

interface AuthSessionModule {
  makeRedirectUri(options?: Record<string, unknown>): string;
  loadAsync(config: Record<string, unknown>, discovery: unknown): Promise<AuthRequestHandle>;
  fetchDiscoveryAsync?(issuer: string): Promise<unknown>;
}

interface AuthRequestHandle {
  codeVerifier?: string;
  promptAsync(discovery: unknown): Promise<AuthSessionResult>;
}

interface AuthSessionResult {
  type: 'success' | 'cancel' | 'dismiss' | 'error';
  params?: Record<string, string>;
  error?: { code?: string; message?: string } | null;
}

function loadAuthSession(): AuthSessionModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const mod = require('expo-auth-session');
    return mod?.loadAsync ? (mod as AuthSessionModule) : null;
  } catch {
    return null;
  }
}

const authSession = loadAuthSession();

export function hasOAuthModule(): boolean {
  return authSession !== null;
}

/** Google's discovery document, hardcoded because it does not change and a fetch on it is a needless failure mode. */
const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

// ─────────────────────────────────────────────────────────────────────────────
// The device provider
// ─────────────────────────────────────────────────────────────────────────────

export function deviceOAuthProvider(provider: IntegrationProviderId): OAuthProvider {
  return {
    descriptor: {
      id: provider,
      label: labelFor(provider),
      mode: 'REAL_PROVIDER',
    },
    capabilities: ['identity.signIn', 'identity.link', 'identity.reauthenticate'],
    scopesFor: (capability) => scopesFor(provider, capability),

    async authorize(scopes: string[]): Promise<OAuthOutcome> {
      const module = authSession;
      const config = getIntegrationConfig();

      if (!module) {
        throw integrationError('ConfigurationMissing', {
          provider,
          message: `Signing in with ${labelFor(provider)} is not available in this version.`,
          hint: INTEGRATION_PROVIDER_GAPS.googleOAuth.id,
        });
      }

      const clientId = config.googleOAuthClientId || config.googleOAuthIosClientId;
      if (!clientId) {
        throw integrationError('ConfigurationMissing', {
          provider,
          message: `${labelFor(provider)} is not set up in this version of the app.`,
        });
      }

      const redirectUri = buildRedirectUri('oauth');

      try {
        const request = await module.loadAsync(
          {
            clientId,
            scopes,
            redirectUri,
            // PKCE is not optional. This is a public client — it cannot
            // authenticate itself and there is no secret on the device — so the
            // code verifier is the only thing that stops an intercepted code
            // being redeemed by whoever intercepted it. A custom scheme can be
            // claimed by any app on the device (INTEGRATION-PROVIDER-GAP-007),
            // which makes interception a real risk rather than a theoretical one.
            usePKCE: true,
            // `select_account` rather than the default. Without it a member with
            // two Google accounts silently connects whichever one the browser is
            // already signed into, which is unrecoverable confusion when it is
            // the wrong one.
            extraParams: { access_type: 'offline', prompt: 'select_account' },
          },
          GOOGLE_DISCOVERY
        );

        const result = await request.promptAsync(GOOGLE_DISCOVERY);

        if (result.type === 'cancel' || result.type === 'dismiss') {
          return { kind: 'cancelled' };
        }

        if (result.type === 'error' || result.params?.error) {
          const code = result.params?.error ?? result.error?.code;
          if (code === 'access_denied') {
            return { kind: 'denied', deniedScopes: scopes };
          }
          throw integrationError('ProviderUnavailable', {
            provider,
            message: `${labelFor(provider)} could not complete the request.`,
          });
        }

        const code = result.params?.code;
        if (!code || !request.codeVerifier) {
          // A success with no code, or a PKCE flow with no verifier, is a
          // contract violation. Treating it as success would send an empty code
          // to the exchange and produce a confusing backend error.
          throw integrationError('UnknownError', {
            provider,
            message: 'The sign-in did not complete.',
          });
        }

        return {
          kind: 'authorized',
          authorization: {
            code,
            codeVerifier: request.codeVerifier,
            redirectUri,
            scopes,
          },
        };
      } catch (cause) {
        if (cause && typeof cause === 'object' && 'kind' in cause) throw cause;
        throw integrationError('ProviderUnavailable', {
          provider,
          // The module's message is not passed through — it can contain the
          // client id and the full authorization URL (§56).
          message: `Could not reach ${labelFor(provider)}.`,
          hint: 'Check your connection and try again.',
        });
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The development adapter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simulated outcome, so a developer can exercise denial and cancellation.
 *
 * §68 asks for realistic states including failure, permission denied and
 * expired, and an adapter that only ever succeeds means the denial branch of
 * every screen is untested. Defaults to success because that is the path a
 * developer needs working; the others are one call away.
 */
let adapterOutcome: 'authorized' | 'cancelled' | 'denied' = 'authorized';

/** Test seam. */
export function __setAdapterOAuthOutcome(outcome: typeof adapterOutcome): void {
  adapterOutcome = outcome;
}

export function adapterOAuthProvider(provider: IntegrationProviderId): OAuthProvider {
  return {
    descriptor: {
      id: provider,
      label: labelFor(provider),
      mode: 'DEVELOPMENT_PROVIDER',
      gapId: INTEGRATION_GAPS.oauthExchange.id,
    },
    capabilities: ['identity.link', 'identity.reauthenticate'],
    scopesFor: (capability) => scopesFor(provider, capability),

    async authorize(scopes: string[]): Promise<OAuthOutcome> {
      if (adapterOutcome === 'cancelled') return { kind: 'cancelled' };
      if (adapterOutcome === 'denied') return { kind: 'denied', deniedScopes: scopes };

      // Deterministic and visibly synthetic. The code is not a credential — it
      // is a string the simulated exchange recognises — and it could not be
      // redeemed anywhere, which is what makes putting it in source acceptable
      // where a real one would not be.
      return {
        kind: 'authorized',
        authorization: {
          code: `simulated-authorization-code:${provider}`,
          codeVerifier: 'simulated-code-verifier',
          redirectUri: buildRedirectUri('oauth'),
          scopes,
          suggestedAccount: {
            externalId: `simulated-${provider}`,
            accountLabel: 'development@example.com',
            // Apple's private relay is modelled here rather than only in the
            // real provider, so the UI branch that explains it is reachable in
            // development — §23's consideration is easy to forget precisely
            // because it never shows up until a real Apple sign-in.
            isPrivateRelay: provider === 'identity.apple',
          },
        },
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The production answer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Refuses before opening anything. See the file header for why that ordering
 * matters more here than anywhere else in this phase.
 */
export function unconfiguredOAuthProvider(provider: IntegrationProviderId): OAuthProvider {
  const configured =
    provider === 'identity.apple' ? isAppleIdentityConfigured() : isGoogleOAuthConfigured();

  return {
    descriptor: {
      id: provider,
      label: labelFor(provider),
      mode: configured ? 'BACKEND_GAP' : 'NOT_CONFIGURED',
      gapId: INTEGRATION_GAPS.oauthExchange.id,
    },
    capabilities: [],
    scopesFor: (capability) => scopesFor(provider, capability),

    async authorize(): Promise<OAuthOutcome> {
      if (!configured) {
        throw integrationError('ConfigurationMissing', {
          provider,
          message: `${labelFor(provider)} is not set up in this version of the app.`,
          hint: `This needs a release with credentials configured (${INTEGRATION_PROVIDER_GAPS.googleOAuth.id}).`,
        });
      }

      // Configured on the device but with nowhere to send the code. This is the
      // case the header is about: the credentials are present, the browser
      // would open, and the exchange would 404.
      throw backendGapError(
        INTEGRATION_GAPS.oauthExchange.id,
        `Connecting ${labelFor(provider)}`,
        provider
      );
    },
  };
}
