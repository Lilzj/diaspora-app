const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const { stubFor, maySimulate } = require("./scripts/production-stubs");

const config = withNativeWind(getDefaultConfig(__dirname), {
  input: "./global.css",
});

// ─────────────────────────────────────────────────────────────────────────────
// FSEC-004 — development-only modules are resolved away in a production bundle.
//
// `src/mocks/index.ts` refuses to install its adapter in a release build and
// always has; what it could not do is stop being *in* the build. A static
// import from `app/_layout.tsx` carried the whole mock tree — handlers,
// fixtures and `axios-mock-adapter` — into the shipped bytecode, and so did
// `src/store/auth.ts`'s guarded `require`, because Metro collects dependencies
// from the AST before any guard is evaluated.
//
// Resolution is the one layer where "absent" can be said. The register of what
// is swapped, and why a guard cannot substitute, is in
// `scripts/production-stubs.js`.
//
// Chained rather than assigned: NativeWind sets its own `resolveRequest`, and
// replacing it would quietly turn off Tailwind's CSS interop.
// ─────────────────────────────────────────────────────────────────────────────
const inner = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolved = (inner ?? context.resolveRequest)(
    context,
    moduleName,
    platform
  );

  if (maySimulate(context)) return resolved;

  const stub = stubFor(resolved && resolved.filePath, __dirname);
  return stub ? { type: "sourceFile", filePath: stub } : resolved;
};

module.exports = config;
