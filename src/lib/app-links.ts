// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Android App Links (Phase 9, 5 Oct 2026)
//
// The API's host vouches for this app (`/.well-known/assetlinks.json`), so
// Android opens two kinds of its links here instead of in a browser:
//
//   https://diaspora-api.fly.dev/payments/checkout/complete   (Stripe return)
//   https://diaspora-api.fly.dev/payments/checkout/cancelled
//   https://diaspora-api.fly.dev/email/confirm?token=…        (verification email)
//
// Expo Router has no screens at those paths, so `app/+native-intent.tsx` hands
// every incoming URL to `rewriteAppLink`, which maps these onto real routes and
// passes everything else through untouched.
//
// ── Parsed by hand ───────────────────────────────────────────────────────────
//
// `URL` is only partly implemented in Hermes (see `lib/integrations/deep-links.ts`),
// and Expo Router may hand over a full URL or only a path. So the host is
// stripped and the query read with plain string operations, which behave the same
// for both shapes and cannot throw on a malformed link.
// ─────────────────────────────────────────────────────────────────────────────

/** The host whose links this app may open. Must match `android.intentFilters` in app.json. */
export const APP_LINK_HOST = 'diaspora-api.fly.dev';

/** `scheme` in app.json. */
const APP_SCHEME = 'diaspora';

/** Where an incoming link should land. Unknown links come back unchanged. */
export function rewriteAppLink(incoming: string): string {
  if (typeof incoming !== 'string' || incoming.length === 0) return incoming;

  const path = stripHost(incoming);
  if (path === null) return incoming;

  const queryStart = path.indexOf('?');
  const pathname = (queryStart === -1 ? path : path.slice(0, queryStart)).replace(/\/+$/, '').toLowerCase();
  const query = queryStart === -1 ? '' : path.slice(queryStart + 1);

  switch (pathname) {
    case '/payments/checkout/complete':
      return '/wallet?checkout=complete';
    case '/payments/checkout/cancelled':
      return '/wallet?checkout=cancelled';
    case '/email/confirm': {
      const token = readParam(query, 'token');
      // A token is passed on as-is and checked by the server. Without one, the email
      // screen still opens, so the member can ask for a new link.
      return token
        ? `/settings/integrations/email?confirmToken=${encodeURIComponent(token)}`
        : '/settings/integrations/email';
    }
    default:
      // An invitation: `/join/CODE`, the path the referral programme shares,
      // opens sign-up with the code filled in (CS-C3).
      if (pathname === '/join' || pathname.startsWith('/join/')) {
        const code = path.slice('/join/'.length, queryStart === -1 ? undefined : queryStart).split('/')[0];
        return code ? `/register?ref=${encodeURIComponent(code)}` : '/register';
      }
      return incoming;
  }
}

/**
 * The path and query of a link on our host, or null when it is not one.
 * Accepts `https://host/path?q`, `host/path?q`, a bare `/path?q`, and the app
 * scheme form `diaspora://path?q`.
 *
 * The last is what Expo Router actually passes for a verified https link: it
 * rewrites the URL to the app's own scheme and drops the host before this runs
 * (seen on the emulator, 5 Oct 2026, as "Unmatched Route
 * diaspora://payments/checkout/complete"). Every test written from the
 * documentation passed while the device showed that screen.
 */
function stripHost(incoming: string): string | null {
  const lower = incoming.toLowerCase();

  if (lower.startsWith(`${APP_SCHEME}://`)) {
    const rest = incoming.slice(APP_SCHEME.length + 3);
    return rest.startsWith('/') ? rest : `/${rest}`;
  }

  for (const prefix of [`https://${APP_LINK_HOST}`, `http://${APP_LINK_HOST}`, APP_LINK_HOST]) {
    if (lower.startsWith(prefix)) {
      const rest = incoming.slice(prefix.length);
      return rest.startsWith('/') || rest.startsWith('?') || rest === '' ? rest || '/' : null;
    }
  }

  return incoming.startsWith('/') ? incoming : null;
}

function readParam(query: string, name: string): string | null {
  for (const pair of query.split('&')) {
    const equals = pair.indexOf('=');
    const key = equals === -1 ? pair : pair.slice(0, equals);
    if (key !== name) continue;

    const raw = equals === -1 ? '' : pair.slice(equals + 1);
    try {
      const value = decodeURIComponent(raw.replace(/\+/g, ' '));
      return value.length > 0 ? value : null;
    } catch {
      return null;
    }
  }

  return null;
}
