// Expo Router's hook for links arriving from the system (App Links, deep links).
// Maps the API host's https links onto real screens; see `lib/app-links.ts`.
//
// It must never throw: a crash here happens before any screen exists to show an
// error, so a link the rewrite cannot read goes through unchanged.

import { rewriteAppLink } from '@/lib/app-links';

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return rewriteAppLink(path);
  } catch {
    return path;
  }
}
