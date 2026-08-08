/* eslint-env jest */

/**
 * Diaspora Platform — test setup (Frontend Phase 5)
 *
 * Only the modules that cannot run under Jest are replaced. Everything else —
 * the money library, the error mapping, the API client, the mock handlers —
 * runs the same code the app runs, because a test against a re-implementation
 * of the thing being tested proves nothing.
 */

// `__DEV__` gates the simulated gap features. Tests run with it true so those
// flows are reachable; the release-build behaviour is asserted separately by
// toggling it inside the test that cares.
global.__DEV__ = true;

// Reanimated's native module has no Jest counterpart.
//
// Hand-written rather than `react-native-reanimated/mock`: since Reanimated 4
// that entry point pulls in `react-native-worklets`, whose native initializer
// throws under Jest. This stub covers the surface the financial skeletons
// actually use — a shared value, an animated style, and the timing helpers —
// and returns static values, which is right for a test that asserts structure
// rather than motion.
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
    Easing: {
      linear: identity,
      ease: identity,
      inOut: () => identity,
      in: () => identity,
      out: () => identity,
    },
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

// `expo-network` is an optional native module; connectivity falls back to
// observed request outcomes when it is absent, which is what tests exercise.
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
