// TypeScript 6 reports TS2882 for a side-effect import of a file it has no
// declaration for, which is what `import '../../global.css'` in the root layout
// is. NativeWind's own `nativewind-env.d.ts` is generated and marked not to be
// edited, so the declaration lives here instead.
declare module '*.css';
