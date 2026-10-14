// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — the capability gate, decided by the server
//
// ── DEFECT-014 ───────────────────────────────────────────────────────────────
//
// Four create screens rendered a "Requirements Checklist" from
// `TrustEngine.getFeatureUnlockRequirements`, which computes the checklist on the
// device from `GOVERNANCE_CONFIG`. The backend computes the same four
// requirements in `EligibilityEvaluator`, and the two disagreed.
//
// Observed on a device, on one account, at one moment. The member held a GB
// standing with 400 points, `IsVerified = true`, arrived 2023.
//
//   GET /trust/feature-requirements?targetCountry=GB   the server
//       MET   Verified Residency in GB                 Verified
//
//   the housing create screen                          the client
//       ❌    Verified Residency in GB                 Unverified
//
// The server reads the standing's `IsVerified`; the client read
// `trustStore.verifications.Country === 'Approved'`, which is a
// verification-*request* status and a different thing. Two sources, one
// question, two answers.
//
// **And the client showed four requirements where the server returned five.**
// `RequiresIdentity` — "Government ID Verification" — has no row in the client's
// list for guides or jobs. So a member could satisfy every line the app showed
// them and stay locked, with nothing on screen explaining why. That is the harm:
// not the lock, which is legitimate, but a remediation list that cannot
// remediate.
//
// ── Why this is a hook and not a correction to TrustEngine ───────────────────
//
// `useFeatureRequirements` already existed, and its own comment already said
// what should happen:
//
//   > The server-side replacement for `TrustEngine.getFeatureUnlockRequirements`
//   > … That code is still there for instant feedback; this is the answer that
//   > decides.
//
// The architecture was right and the screens simply never called the deciding
// half. So nothing here corrects the client's arithmetic — the client should not
// hold this rule at all. `GOVERNANCE_CONFIG`'s thresholds are shipped to every
// phone and editable by anyone with a debugger; the server's are not.
//
// The local computation is kept as the **first paint**, because a checklist that
// flashes empty for a round trip is worse than one that is briefly approximate.
// The moment the server answers, the server wins.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';

import { useFeatureRequirements } from './trust';
import { TrustEngine } from '@/lib/trustEngine';
import { useAuthStore } from '@/store/auth';
import type { FeatureRequirementItem, TrustCapabilityKey } from '@/types/trust';

export interface CapabilityGate {
  /**
   * Whether the capability is unlocked.
   *
   * `null` until the server has answered. A screen must not read this as "locked"
   * — see `isResolved`. Rendering a lock on a null is how the mirror image of
   * this defect happens.
   */
  isUnlocked: boolean | null;
  /** The checklist to render. The server's once it arrives, the local one before. */
  requirements: FeatureRequirementItem[];
  /** True once the answer is the server's rather than the device's. */
  isResolved: boolean;
  isLoading: boolean;
  /** Non-null where the server could not be asked. The local list is showing. */
  error: string | null;
  refresh: () => void;
}

/**
 * The requirements for one capability, from the server.
 *
 * ```tsx
 * const gate = useCapabilityGate('housing', countryCode);
 *
 * if (gate.isUnlocked === false) {
 *   return <RequirementsChecklist items={gate.requirements} />;
 * }
 * ```
 *
 * Note the `=== false`. `isUnlocked` is `null` while the answer is unknown, and
 * a screen that treats unknown as locked shows a wall to a member who is not
 * locked out — which is DEFECT-015's shape in a different place.
 */
export function useCapabilityGate(
  capability: TrustCapabilityKey,
  targetCountry?: string | null
): CapabilityGate {
  // The country asked about, else the member's residence. It defaulted to 'GB'.
  const residence = useAuthStore((state) => state.user?.residenceCountry ?? null);
  const country = targetCountry?.trim() || residence?.trim() || '';
  const { requirementFor, isLoading, error, refresh } = useFeatureRequirements(country || undefined);

  const fromServer = requirementFor(capability);

  // The device's own reading, for the first paint only. Recomputed when the
  // country changes because the thresholds are per-country.
  const fromDevice = useMemo(
    () => TrustEngine.getFeatureUnlockRequirements(country).find((f) => f.featureId === capability),
    [capability, country]
  );

  return {
    isUnlocked: fromServer ? fromServer.isUnlocked : null,
    // The server's list wins outright rather than being merged with the local
    // one. Merging would reintroduce the defect: the client's list is missing a
    // requirement, and a union of "what we think" and "what they said" is
    // neither answer.
    requirements: fromServer?.requirements ?? fromDevice?.requirements ?? [],
    isResolved: fromServer !== null,
    isLoading,
    error,
    refresh,
  };
}
