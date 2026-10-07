// Expo reads this file in preference to app.json and hands it app.json's contents
// as `config`, so app.json stays the single source for everything static.
//
// It exists for one reason: the Google Maps Android key has to reach the native
// manifest at build time, and app.json cannot read the environment. The key comes
// from EXPO_PUBLIC_MAP_ANDROID_KEY (an EAS environment variable, or .env locally),
// the same variable `src/config/map-config.ts` reads to decide whether the native
// map may be selected. One variable means the manifest and the selector cannot
// disagree: no key, no plugin entry, and the app keeps the schematic canvas map.
//
// The key is not secret — it ships in the APK — and is protected by restricting it
// in Google Cloud to package `com.diaspora.app` plus the signing SHA-1, and to the
// Maps SDK for Android only.

// It also finds google-services.json. The file is gitignored, so EAS never
// uploads it; on the build server it arrives as the GOOGLE_SERVICES_JSON file
// variable (a path), and locally the file beside this one is used. Without it
// the APK has no Firebase project and push never registers.

module.exports = ({ config: base }) => {
  const androidKey = process.env.EXPO_PUBLIC_MAP_ANDROID_KEY;
  const iosKey = process.env.EXPO_PUBLIC_MAP_IOS_KEY;

  const config = process.env.GOOGLE_SERVICES_JSON
    ? { ...base, android: { ...base.android, googleServicesFile: process.env.GOOGLE_SERVICES_JSON } }
    : base;

  if (!androidKey && !iosKey) return config;

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      [
        'react-native-maps',
        {
          ...(androidKey ? { androidGoogleMapsApiKey: androidKey } : {}),
          ...(iosKey ? { iosGoogleMapsApiKey: iosKey } : {}),
        },
      ],
    ],
  };
};
