/* eslint-env jest */

/**
 * Diaspora Platform — test setup (Frontend Phase 5)
 *
 * Only the modules that cannot run under Jest are replaced. Everything else —
 * the money library, the error mapping, the API client, the mock handlers —
 * runs the same code the app runs, because a test against a re-implementation
 * of the thing being tested proves nothing.
 */

// `waitFor` waits for a machine under load, not for a fast one.
//
// The library's default is one second. That is generous on an idle machine and
// not always enough on this suite's fifteenth parallel worker, where a query
// that settles in 20ms alone can take longer to be scheduled at all — which
// surfaced as a handful of tests that fail in a full run and pass on their own
// (17 Sep 2026). A longer ceiling costs nothing when the wait succeeds, and the
// tests that really hang fail on Jest's own timeout instead.
const { configure: configureAsyncUtils } = require('@testing-library/react-native');

configureAsyncUtils({ asyncUtilTimeout: 5000 });

// `__DEV__` gates the simulated gap features. Tests run with it true so those
// flows are reachable; the release-build behaviour is asserted separately by
// toggling it inside the test that cares.
global.__DEV__ = true;

// Gesture-handler's own Jest setup, which mocks its native module and the
// components that reach for it.
//
// Needed from the moment anything renders a `GestureDetector` — which
// `ReanimatedSwipeable` does, so the notification inbox does. Without it the
// render dies on
// `RNGestureHandlerModule.installUIRuntimeBindings is not a function`.
//
// **One line, both versions.** The package root exports `jestSetup.js` in
// 2.32.0 and in 3.5.0 alike, so this works either side of the pending major.
// The other remedy the library offers — adding
// `jest-setup/disableRootViewCheck.js` to `setupFiles` — exists only in 3.x
// and would break the current version, so the root-view requirement is met by
// wrapping the tree instead, where production already wraps it.
//
// Small blast radius: this project imports exactly two things from the library,
// `GestureHandlerRootView` in `app-provider` and the swipeable in
// `NotificationItem`, and none of the touchables or buttons this setup mocks.
require('react-native-gesture-handler/jestSetup');

// Reanimated's native module has no Jest counterpart.
//
// Hand-written rather than `react-native-reanimated/mock`: since Reanimated 4
// that entry point pulls in `react-native-worklets`, whose native initializer
// throws under Jest. This stub covers the surface the financial skeletons
// actually use — a shared value, an animated style, and the timing helpers —
// and returns static values, which is right for a test that asserts structure
// rather than motion.
//
// **Extended 16 Nov 2026 for `ReanimatedSwipeable`**, which the notification
// inbox renders. The entries after the timing helpers are used by none of our
// own code: they are what `react-native-gesture-handler` requires, and they
// are here because of *how it looks for Reanimated*.
//
// `reanimatedWrapper.ts` probes `Reanimated?.useSharedValue` and, when it is
// absent, resets the module to `undefined` and falls back to an
// implementation that does not need Reanimated at all. So a mock defining
// `useSharedValue` and nothing else is **detected as Reanimated** and then
// asked for `useEvent` — which is how this surfaced:
// `TypeError: Reanimated.useEvent is not a function` raised inside
// `GestureDetector`, failing four tests in `notifications-inbox.test.tsx`.
//
// The rule that follows: anything added here must satisfy the library
// completely or not be recognisable to it at all. A partial mock is worse than
// no mock, because it disables the fallback written for no mock.
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');

  const identity = (value) => value;
  const noop = () => {};

  return {
    __esModule: true,
    default: { View, call: noop, createAnimatedComponent: identity },
    View,
    useSharedValue: (initial) => ({ value: initial }),
    useAnimatedStyle: (factory) => {
      try {
        return factory();
      } catch {
        return {};
      }
    },
    useAnimatedRef: () => ({ current: null }),
    withTiming: identity,
    withSpring: identity,
    withRepeat: identity,
    withDelay: (_delay, value) => value,
    withSequence: (...values) => values[values.length - 1],
    runOnJS: (fn) => fn,
    runOnUI: (fn) => fn,
    cancelAnimation: noop,
    interpolate: () => 0,
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    // `false`, and truthfully: `useSharedValue` above returns a plain object,
    // not a Reanimated shared value. Saying otherwise is what broke this —
    // gesture-handler 3 calls `sharedValue.addListener(...)` on every config
    // entry `isSharedValue` claims, and a plain object has no listeners. The
    // honest answer makes the library skip that binding, which is the same
    // "nothing animates" contract as the rest of this mock.
    isSharedValue: () => false,
    measure: () => ({ width: 0, height: 0, x: 0, y: 0, pageX: 0, pageY: 0 }),
    ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
    // Required by gesture-handler's `GestureDetector`, not by anything we write.
    // `useEvent`'s result is only stored on the prepared gesture, so an inert
    // object is enough; `setGestureState` is otherwise stubbed by the library
    // itself with a console warning.
    useEvent: () => ({}),
    setGestureState: noop,
    Easing: {
      linear: identity,
      ease: identity,
      inOut: () => identity,
      in: () => identity,
      out: () => identity,
    },
  };
});

// `react-native-worklets` has no Jest counterpart either, and for a sharper
// version of Reanimated's reason: its native initializer runs at *import* time
// (`NativeWorklets.native.ts` -> `loadUnpackers`) and throws. From
// gesture-handler 3, `ReanimatedSwipeable` imports the package directly, so the
// inbox suite does not fail a test without this — it fails to load at all.
//
// `scheduleOnRN` and `scheduleOnUI` invoke synchronously rather than queueing.
// That is deliberate: these suites assert what a tree contains once rendered,
// and work deferred to a runtime that does not exist here would never run.
jest.mock('react-native-worklets', () => {
  const invoke = (fn, ...args) => (typeof fn === 'function' ? fn(...args) : undefined);
  return {
    __esModule: true,
    isWorkletRuntime: () => false,
    scheduleOnRN: invoke,
    scheduleOnUI: invoke,
    getUIRuntimeHolder: () => ({}),
    UIRuntimeId: 0,
    createShareable: (_hostRuntimeId, initial) => ({ value: initial }),
  };
});

// AsyncStorage: an in-memory implementation rather than a stub that returns
// undefined, because the idempotency tests depend on values actually persisting
// between calls — that persistence *is* the behaviour under test.
jest.mock('@react-native-async-storage/async-storage', () => {
  // The backing store lives on `globalThis` rather than in module scope so it
  // survives `jest.resetModules()`. That is not a convenience: the idempotency
  // tests simulate an app restart by resetting modules, and the whole property
  // under test is that storage outlives module state.
  globalThis.__asyncStorageStore = globalThis.__asyncStorageStore ?? {};
  const store = globalThis.__asyncStorageStore;

  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key) => Promise.resolve(key in store ? store[key] : null)),
      setItem: jest.fn((key, value) => {
        store[key] = value;
        return Promise.resolve();
      }),
      removeItem: jest.fn((key) => {
        delete store[key];
        return Promise.resolve();
      }),
      getAllKeys: jest.fn(() => Promise.resolve(Object.keys(store))),
      clear: jest.fn(() => {
        for (const key of Object.keys(store)) delete store[key];
        return Promise.resolve();
      }),
    },
  };
});

// `expo-secure-store` wraps Keychain / EncryptedSharedPreferences and has no
// Jest counterpart. In-memory rather than a stub returning undefined, for the
// same reason AsyncStorage is: the session tests restore a persisted token pair,
// and that persistence *is* the behaviour under test. Backed on `globalThis` so
// it survives `jest.resetModules()` — restoring across a simulated app restart
// is exactly what Wave A's restore test does.
jest.mock('expo-secure-store', () => {
  globalThis.__secureStore = globalThis.__secureStore ?? {};
  const store = globalThis.__secureStore;

  return {
    __esModule: true,
    getItemAsync: jest.fn((key) => Promise.resolve(key in store ? store[key] : null)),
    setItemAsync: jest.fn((key, value) => {
      store[key] = value;
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key) => {
      delete store[key];
      return Promise.resolve();
    }),
  };
});

// `expo-network` is an optional native module; connectivity falls back to
// observed request outcomes when it is absent, which is what tests exercise.
// ── expo-location is absent under Jest, and that is the truth ────────────────
//
// The package is a real dependency — `store/location.ts` needs it to answer
// which country a device is in, and `maps/providers/device-location.ts` has
// always been written to use it the moment it appears.
//
// There is no native runtime here, so its functions cannot work. Making the
// require throw is what the wrapper already expects from a build without the
// package: `resolveDeviceLocationProvider()` falls through to the simulated
// provider, which is what every existing maps test is actually about.
//
// Installing the package made five suites fail without a line of their own
// changing, because they reached for the resolver and silently depended on the
// module being missing. This states that dependency instead of leaving it to
// what happens to be in node_modules.
//
// A test that wants the real shape mocks `expo-location` itself — see
// `lib/__tests__/detect-country.test.ts`, whose own factory wins over this one.
jest.mock('expo-location', () => {
  throw new Error('expo-location is unavailable under Jest');
});

// ── expo-calendar, for the same reason (installed 5 Oct 2026) ──────────────
//
// `lib/integrations/providers/device-calendar.ts` loads `expo-calendar/legacy`
// with a guarded require, and the calendar tests are about the simulated and
// refusing providers. Both entry points throw here, so installing the package does
// not change which provider those tests resolve. A test that wants the real shape
// mocks the module itself.
jest.mock('expo-calendar', () => {
  throw new Error('expo-calendar is unavailable under Jest');
});
jest.mock('expo-calendar/legacy', () => {
  throw new Error('expo-calendar is unavailable under Jest');
});

jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(() =>
    Promise.resolve({ isConnected: true, isInternetReachable: true })
  ),
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
}));

// `@expo/vector-icons` pulls in `expo-font` → `expo-asset`, which is not a
// dependency of this app. Icons are decorative on every financial surface —
// their meaning is carried by the parent's `accessibilityLabel`, which is what
// the tests assert — so a name-only stand-in is a faithful substitute.
jest.mock('@expo/vector-icons', () => {
  // Renders nothing at all, deliberately. Creating a real element here would
  // go through NativeWind's Babel transform, which rewrites the call to a
  // helper that `jest.mock` refuses to close over. Nothing is lost: every
  // financial component states its meaning on the wrapping element's
  // `accessibilityLabel`, which is exactly what the tests assert — an icon that
  // carried meaning on its own would be the bug.
  const Icon = () => null;

  return {
    Ionicons: Icon,
    MaterialIcons: Icon,
    MaterialCommunityIcons: Icon,
    FontAwesome: Icon,
    Feather: Icon,
    AntDesign: Icon,
  };
});

// expo-router: navigation is asserted by call rather than by rendering a stack.
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    // True by default: most screens are reached by navigating, not from a link.
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: jest.fn(() => ({})),
  useSegments: jest.fn(() => []),
  Stack: { Screen: () => null },
  Link: () => null,
}));

// Silence the two deliberate console.warn calls the app makes in development:
// the gap mock registrar, and the analytics allow-list telling a call site it
// tried to send a disallowed property. Both are behaviour under test elsewhere;
// letting them through here would bury a real warning in noise.
const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('[MOCK][BACKEND GAP]')) return;
  if (typeof args[0] === 'string' && args[0].startsWith('[analytics]')) return;
  originalWarn(...args);
};
