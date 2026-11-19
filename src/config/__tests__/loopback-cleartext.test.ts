// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the cleartext exception is opt-in, not shipped (FSEC-009)
//
// ── What was wrong ──────────────────────────────────────────────────────────
//
// `plugins/with-loopback-cleartext` points the Android manifest at a
// `network_security_config.xml` permitting cleartext HTTP to `10.0.2.2`,
// `127.0.0.1` and `localhost`. The plugin is narrow and well argued: it writes
// no `base-config`, so Android's default of refusing cleartext still applies to
// every other host, and it was chosen over `usesCleartextTraffic: true`
// precisely because that permits cleartext everywhere.
//
// It was listed in `app.json`, which has no way to read the environment, so
// **every profile got it — production included**. The plugin exists for a
// release build that can reach a `Diaspora.Api` running on the machine the
// device is attached to; a store build has no such server and no reason to
// carry the exception.
//
// The realised risk was small. The base URL is an `https://` constant inlined at
// build time, so no shipped code path starts a cleartext request to loopback.
// What it was is a deviation from secure-by-default in an artefact handed to
// members, and a channel left open for any future code path that accepts a
// server- or link-supplied URL.
//
// ── The deviation from the audit's remediation, stated ──────────────────────
//
// The row says to make the plugin conditional "and set that variable on
// `preview` only". This sets it on **no** profile, for the reason `preview`
// itself stopped setting `EXPO_PUBLIC_ENABLE_GAP_PREVIEW` on 20 Oct 2026: a
// build handed to testers should have the same posture as the one handed to
// members. A tester APK with a cleartext exception is the same finding, one
// profile down. The last test here is what holds that.
// ─────────────────────────────────────────────────────────────────────────────

declare const __dirname: string;

const { readFileSync, existsSync }: {
  readFileSync(path: string, encoding: string): string;
  existsSync(path: string): boolean;
} = require('fs');
const { join }: { join(...parts: string[]): string } = require('path');

/** The repository root, from `src/config/__tests__`. */
const ROOT = join(__dirname, '..', '..', '..');

interface ExpoConfig {
  plugins?: (string | [string, unknown])[];
  android?: Record<string, unknown>;
}

type ConfigFactory = ((input: { config: ExpoConfig }) => ExpoConfig) & {
  LOOPBACK_CLEARTEXT_VAR: string;
  LOOPBACK_CLEARTEXT_PLUGIN: string;
};

const appConfig: ConfigFactory = require(join(ROOT, 'app.config.js'));
const appJson: { expo: ExpoConfig } = require(join(ROOT, 'app.json'));
const easJson: { build: Record<string, { env?: Record<string, string> }> } = require(
  join(ROOT, 'eas.json')
);

const VAR = appConfig.LOOPBACK_CLEARTEXT_VAR;
const PLUGIN = appConfig.LOOPBACK_CLEARTEXT_PLUGIN;

/** Plugin names, however each entry is spelled. */
function pluginNames(config: ExpoConfig): string[] {
  return (config.plugins ?? []).map((entry) => (Array.isArray(entry) ? entry[0] : entry));
}

/**
 * Resolve the config with the variable set to `value`, or unset when undefined.
 *
 * Written as a static member access rather than `process.env[VAR]`, which
 * `expo/no-dynamic-env-var` refuses: a computed lookup is not inlined by Babel
 * and reads as `undefined` in a bundle. It would not matter here — this is a
 * test, and `app.config.js` runs in Node — but the rule is right about the
 * habit, and `gap-preview.ts` documents the same trap. The literal and the
 * exported constant are pinned to each other by the first test below.
 */
function resolve(value?: string): string[] {
  const before = process.env.DIASPORA_ALLOW_LOOPBACK_CLEARTEXT;
  if (value === undefined) delete process.env.DIASPORA_ALLOW_LOOPBACK_CLEARTEXT;
  else process.env.DIASPORA_ALLOW_LOOPBACK_CLEARTEXT = value;

  try {
    return pluginNames(appConfig({ config: appJson.expo }));
  } finally {
    if (before === undefined) delete process.env.DIASPORA_ALLOW_LOOPBACK_CLEARTEXT;
    else process.env.DIASPORA_ALLOW_LOOPBACK_CLEARTEXT = before;
  }
}

describe('the loopback cleartext exception', () => {
  it('is the variable this file sets, spelled the same way', () => {
    // `resolve()` below writes the name as a literal, because a computed
    // `process.env[VAR]` is what `expo/no-dynamic-env-var` exists to stop. This
    // is what keeps the literal and `app.config.js`'s constant from drifting,
    // which would make every assertion below test a variable nothing reads.
    expect(VAR).toBe('DIASPORA_ALLOW_LOOPBACK_CLEARTEXT');
  });

  it('resolves a plugin list at all — the canary', () => {
    // Every assertion below is about one name being absent from this list, and
    // an empty list satisfies all of them. So the list is checked for something
    // that must be there first: a broken resolution is a failure, not a pass.
    const resolved = resolve();

    expect(resolved.length).toBeGreaterThan(5);
    expect(resolved).toContain('expo-router');
  });

  it('is not in app.json, which cannot be conditional', () => {
    // The finding itself. `app.json` is static and has no way to read the
    // environment, so anything listed there is in every build.
    expect(pluginNames(appJson.expo)).not.toContain(PLUGIN);
  });

  it('is absent from a build that did not ask for it', () => {
    expect(resolve()).not.toContain(PLUGIN);
  });

  it('is present when a build asks for it by name', () => {
    expect(resolve('1')).toContain(PLUGIN);
  });

  it.each(['', '0', 'true', 'TRUE', 'yes', 'false'])(
    'stays off for %p, because the comparison is against the exact string',
    (value) => {
      // The same discipline as `areSimulatedFeaturesEnabled`: an accidentally
      // empty variable is `''` and a mistyped boolean is `"false"`, both truthy
      // in the wrong hands. One value means on; everything else means off.
      expect(resolve(value)).not.toContain(PLUGIN);
    }
  );

  it('names a plugin that exists', () => {
    // A conditional reference to a file that has been moved or renamed fails at
    // prebuild time, on the one build that needs it, which is the worst moment.
    expect(existsSync(join(ROOT, `${PLUGIN}.js`))).toBe(true);
  });

  it('still refuses cleartext everywhere else when it is on', () => {
    // What makes the exception narrow is the absence of a `base-config`: with
    // one, the plugin would permit cleartext to every host and the opt-in would
    // be the only thing standing between a member and plaintext traffic.
    const plugin = readFileSync(join(ROOT, `${PLUGIN}.js`), 'utf8');

    expect(plugin).toContain('cleartextTrafficPermitted="true"');
    expect(plugin).not.toContain('base-config');
    for (const host of ['10.0.2.2', '127.0.0.1', 'localhost']) {
      expect(plugin).toContain(host);
    }
  });

  it('is set by no build profile, which is the whole of the fix', () => {
    // If a profile sets it, every artefact from that profile carries the
    // exception and this row is open again. Deliberately stricter than the
    // audit's "on preview only" — see the header.
    const setting = Object.entries(easJson.build)
      .filter(([, profile]) => profile.env && VAR in profile.env)
      .map(([name]) => name);

    expect(setting).toEqual([]);
  });
});
