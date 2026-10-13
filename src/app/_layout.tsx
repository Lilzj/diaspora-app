import '../../global.css';

import { useEffect } from 'react';
import { recordSighting } from '@/lib/location/relocation-hint';
import { AppState } from 'react-native';
import { registerPushToken } from '@/lib/integrations/push-lifecycle';
import { View } from 'react-native';
import { Stack, router, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { keepSessionAlive, useAuthStore } from '@/store/auth';
import { isAwaitingDecision } from '@/lib/access-state';
import { hasExpired, lastActivity, persistActivity, recordActivity } from '@/lib/inactivity';
import { startTelemetryDelivery } from '@/lib/telemetry-api';
import { AppProvider } from '@/providers/app-provider';
import { StatusBar } from 'expo-status-bar';
import { initMocks } from '@/mocks';

import { TourProvider } from '@/components/explore/TourProvider';
import { StartupLocationPrompt } from '@/components/StartupLocationPrompt';
import { useLocationStore } from '@/store/location';

// Initialize the development API adapter.
//
// **Unconditional on purpose, and safe on purpose.** This line used to be the
// defect: it ran at module scope in every build, and the core handlers it
// reached — auth, housing, marketplace, jobs, community life — had no build
// guard, so a production binary answered `POST /auth/register` and sign-in from
// fixtures before the request ever reached the backend.
//
// The fix is not an `if` here. It could not be: `import { initMocks } from
// '@/mocks'` above is a static import whose side effects run whatever this line
// does, and the side effect *is* the hijack — `new MockAdapter(apiClient)`
// reassigns `apiClient.defaults.adapter` in its constructor. A guard at the
// call site would have looked like a fix and prevented nothing.
//
// So the gate lives at module scope inside `src/mocks/index.ts`, on the adapter
// itself, and this call is a no-op that says so in the log. See that file's
// header for what each kind of build does.
initMocks();

export default function RootLayout() {



  const { status, isAuthenticated, user, isExploringLimited, restore } = useAuthStore();
  const accountState = user?.accountState;
  const segments = useSegments();

  // Remediation Wave A. The session is read out of the keystore once, at mount.
  // Nothing below may act on `isAuthenticated` until that resolves.
  useEffect(() => {
    void restore();
  }, [restore]);

  /**
   * Telemetry delivery — CREATOR-GAP-016, closed in Remediation Wave C-03.
   *
   * The emitter has buffered events since Phase 7 into a transport that was a
   * documented no-op because no ingestion route existed. `POST /telemetry/events`
   * now does, and this is the one place that empties the buffer.
   *
   * **Gated on a signed-in session**, because the route requires one and every
   * fact it stores is attributed to the authenticated caller. Events emitted
   * before sign-in stay in the ring buffer and go out with the first flush after
   * it — which is the honest ordering: each record kept the time it happened,
   * not the time it was delivered.
   */
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    return startTelemetryDelivery();
  }, [isAuthenticated]);

  /**
   * The sign-in redirect.
   *
   * **`status` is checked, not `isAuthenticated`, and that is the fix.** A
   * restored session takes a tick to read, and for that tick `isAuthenticated`
   * was `false` — indistinguishable from "signed out". So this effect ran on
   * every cold start and sent a signed-in member to the login screen, often
   * winning the race against the restore that would have kept them where they
   * were. `unknown` and `restoring` mean *not yet known*, and the correct
   * behaviour for not-yet-known is to do nothing.
   */
  useEffect(() => {
    if (status === 'unknown' || status === 'restoring' || status === 'refreshing') return;

    const inAuthGroup = segments[0] === '(auth)' || !segments[0];
    if (!isAuthenticated && !isExploringLimited && !inAuthGroup) {
      router.replace('/(auth)/login');
      return;
    }

    // ── DEFECT-015: the redirect only ever pointed one way ──────────────────
    //
    // The rule above sends a signed-out member *into* `(auth)`. Nothing sent a
    // signed-in one back *out* — and the app's initial route is `(auth)/index`,
    // the marketing page. So on every cold start a member with a perfectly good
    // session landed on "Join Your Community · Already have an account? Sign in"
    // and had to sign in again.
    //
    // The session was never the problem, which is what made this hard to see
    // from the client alone. Observed on a device: in the same launch window the
    // app issued four authenticated requests and refreshed its own token —
    //
    //     GET  /financial/capabilities   401
    //     GET  /financial/wallets/me     200
    //     POST /auth/refresh             200
    //     GET  /financial/capabilities   200
    //
    // — while rendering the signed-out page. It was authenticated and acting as
    // the member the whole time; only the routing disagreed.
    //
    // `isExploringLimited` is excluded because that is a deliberate signed-out
    // browse, and a member who chose it has not asked to be moved.
    if (isAuthenticated && inAuthGroup && !isExploringLimited) {
      router.replace('/(tabs)');
    }
  }, [status, isAuthenticated, segments, isExploringLimited]);

  // One country reading per launch, for the relocation hint.
  //
  // It is a no-op unless `EXPO_PUBLIC_ENABLE_RELOCATION_HINT=1` — §55 wants the
  // product's explicit authorization before location is used to infer where
  // somebody lives — and it never raises a permission dialogue: `detectCountry`
  // reads the grant that already exists and asks for nothing. A member who has
  // denied location contributes no sightings and sees no hint, for ever.
  useEffect(() => {
    if (!isAuthenticated) return;

    void recordSighting();
  }, [isAuthenticated]);

  // Push registration, on every signed-in start and every return to the
  // foreground. Added 7 Oct 2026: it ran only after phone verification at
  // registration and from a Settings button, so a member who signed in with a
  // password (the only sign-in since 5 Oct) was never registered and no push
  // reached them. `registerPushToken` makes no call when the token and member
  // are unchanged, and it never prompts: without permission it does nothing.
  const memberId = user?.userId ?? null;
  useEffect(() => {
    if (!isAuthenticated || !memberId) return undefined;

    const register = () => {
      void registerPushToken(memberId).catch(() => {});
    };
    register();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') register();
    });
    return () => subscription.remove();
  }, [isAuthenticated, memberId]);

  // The device's location permission, read at start and on every return —
  // granted or revoked in Android settings while the app was away included.
  useEffect(() => {
    const sync = () => void useLocationStore.getState().syncPermissionStatus();
    sync();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => subscription.remove();
  }, []);

  // Thirty minutes without a touch signs the member out (13 Oct 2026). Checked on
  // every return to the foreground — the time spent away counts — and once a
  // minute while the app sits open. A cold start is checked in `restore()`.
  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const endIfIdle = () => {
      if (hasExpired(lastActivity())) {
        void useAuthStore.getState().signOut({ reason: 'inactivity' });
        return;
      }

      // Touched in the last two minutes: keep the server's idle window open
      // too, which only a token refresh does.
      if (Date.now() - lastActivity() < 2 * 60 * 1000) void keepSessionAlive();
    };

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        endIfIdle();
      } else {
        // Leaving the foreground: write the time down, in case the app is
        // killed before it comes back.
        void persistActivity();
      }
    });
    const timer = setInterval(endIfIdle, 60 * 1000);

    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [isAuthenticated]);

  // A member waiting on a verification decision learns of it on returning to
  // the app, not only at their next sign-in. Only while waiting: a refresh
  // rotates the token pair, which is not worth doing on every foreground.
  useEffect(() => {
    if (!isAuthenticated || !isAwaitingDecision(accountState)) return undefined;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void useAuthStore.getState().syncAccess();
    });
    return () => subscription.remove();
  }, [isAuthenticated, accountState]);

  useEffect(() => {
    if (isAuthenticated && accountState && !isExploringLimited) {
      if (
        accountState === 'DiasporaVerificationPending' ||
        accountState === 'VerificationUnderReview' ||
        accountState === 'VerificationRejected' ||
        accountState === 'RequiresMoreInformation' ||
        accountState === 'Suspended' ||
        accountState === 'Restricted' ||
        accountState === 'AppealPending'
      ) {
        // Intercept navigation and direct to gateway dashboard
        router.replace('/access-gateway');
      }
    }
  }, [isAuthenticated, accountState, isExploringLimited]);

  return (
    <AppProvider>
      <StatusBar style="auto" />
      {/* Inside AppProvider on purpose: it needs the NotificationProvider that
          provider mounts, so the permission prompt is the app's own alert modal
          rather than Android's system dialog (F-035). */}
      <StartupLocationPrompt />
      <TourProvider>
        <AppContainer>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="access-gateway" options={{ headerShown: false }} />
            <Stack.Screen name="conversation" options={{ headerShown: false }} />
            {/* Frontend Phase 8 — Maps & Navigation. A spatial presentation
                layer over the existing discovery surfaces, not a second one. */}
            <Stack.Screen name="map" options={{ headerShown: false }} />
            {/* Frontend Phase 13 — Multi-Community Expansion. §53's deep links
                live here: /community, /community/[slug] and the per-community
                content, statistics and governance routes beneath it. The
                `[slug]` layout restores the community context, so a link opened
                from outside the app lands with the right scope already applied. */}
            <Stack.Screen name="community" options={{ headerShown: false }} />
            {/* Frontend Phase 18 — Automation. §6 asks for one Automation
                Center rather than a management screen per module, so this is
                the only automation tree in the application: the centre, the
                builder, templates, history, run detail and saved searches all
                live beneath it. Contextual entry points on an event, a job or a
                listing create an automation and then bring the member here to
                manage it — an entry point, not a second management surface. */}
            <Stack.Screen name="automation" options={{ headerShown: false }} />
          </Stack>
        </AppContainer>
      </TourProvider>
    </AppProvider>
  );
}

function AppContainer({ children }: { children: React.ReactNode }) {
  return (
    // The root background. Hard-coded `bg-surface-card` here would sit behind every
    // screen in dark mode; `bg-surface-background` follows the colour scheme
    // through the CSS variables in global.css.
    <View
      style={{ flex: 1 }}
      className="bg-surface-background"
      // Every touch anywhere is activity for the 30-minute rule. Capture phase,
      // returning false: this notices the touch and never takes it from the
      // screen it was meant for.
      onStartShouldSetResponderCapture={() => {
        recordActivity();
        return false;
      }}
      onMoveShouldSetResponderCapture={() => {
        recordActivity();
        return false;
      }}
    >
      {children}
    </View>
  );
}

