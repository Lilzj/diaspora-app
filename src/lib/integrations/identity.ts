// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — identity linking (Frontend Phase 16, §21 · §22 · §23 · §24)
//
// §24's rule, and the reason it needs a module rather than a component:
//
//   "Never allow a user to accidentally lock themselves out by unlinking their
//    only authentication method."
//
// That is a statement about the *set* of links, not about any one of them. A
// row cannot answer "am I the last one" by looking at itself, so a per-row
// computation is structurally incapable of enforcing the rule — it would have
// to be evaluated in the list component, and the first screen that rendered a
// single link outside that list would offer an unlink that locks somebody out.
//
// So `canUnlink` is computed here, over the whole set, once.
//
// ── The rule is a client courtesy, not a control ─────────────────────────────
//
// The disabled button stops an accident. It stops nothing else: anybody can
// call the endpoint. FRONTEND-PHASE16-GAP-007 states that the server must
// refuse to remove the last method with a 409 regardless of what the client
// sent, and that is the actual control. This module makes the UI correct; it
// does not make the account safe, and conflating the two is how a client-side
// guard ends up being the only guard.
//
// ── §22, and the distinction that is easy to lose ────────────────────────────
//
// "Google Calendar connection" and "Google identity authentication" are
// different integrations that share a vendor. A member can have a Google
// calendar connected and no Google sign-in, or the reverse. They have separate
// provider ids (`calendar.google`, `identity.google`), separate scopes and
// separate connection records — and disconnecting one must not disconnect the
// other. `identityProviders()` below returns only `identity.*`, which is what
// keeps the two from being merged by a screen that iterates "Google".
// ─────────────────────────────────────────────────────────────────────────────

import type { IdentityLink, IntegrationProviderId } from '@/types/integrations';
import { integrationError, type IntegrationError } from './errors';

/**
 * Applies §24's lock-out rule across a set of links.
 *
 * The rule is not simply "more than one link". A link that cannot currently be
 * used to sign in — an expired grant, a provider the build can no longer reach
 * — is not a way back in, and counting it would let a member remove their
 * working method because a broken one exists beside it.
 *
 * So the count is of *usable* methods, and a member with one working Google
 * link and one expired Apple link is correctly told they cannot remove the
 * Google one.
 */
export function applyUnlinkRules(links: IdentityLink[]): IdentityLink[] {
  const usable = links.filter(isUsableForSignIn);

  return links.map((link) => {
    if (!isUsableForSignIn(link)) {
      // An unusable link may always be removed — removing a broken method
      // cannot lock anybody out, and leaving it there with a disabled control
      // and no explanation is how somebody concludes the screen is broken.
      return { ...link, canUnlink: true, cannotUnlinkReason: null };
    }

    if (usable.length <= 1) {
      return {
        ...link,
        canUnlink: false,
        cannotUnlinkReason:
          'This is the only way you can sign in. Add another way to sign in before removing it.',
      };
    }

    return { ...link, canUnlink: true, cannotUnlinkReason: null };
  });
}

/**
 * Whether a link could actually be used to sign in today.
 *
 * `PARTIALLY_CONNECTED` counts as usable: a partially-connected identity can
 * still authenticate even if some capability beyond sign-in is degraded.
 * `DEVELOPMENT` does not, and that is the important exclusion — a simulated
 * link cannot sign anybody in, so it must never be the reason a real one is
 * removable.
 */
function isUsableForSignIn(link: IdentityLink): boolean {
  if (link.mode === 'DEVELOPMENT_PROVIDER') return false;
  return link.status === 'CONNECTED' || link.status === 'PARTIALLY_CONNECTED';
}

/**
 * The refusal, as an error, for the path that goes through anyway.
 *
 * Used when a caller reaches the unlink operation for a link the rules forbid —
 * a stale render, a race between two devices. Producing the same message the
 * disabled control shows means the member reads one explanation rather than two
 * different ones.
 */
export function unlinkRefusal(): IntegrationError {
  return integrationError('Conflict', {
    message: 'This is the only way you can sign in.',
    hint: 'Add another way to sign in before removing this one.',
    needsMemberAction: true,
  });
}

/** The identity providers, never the calendar ones that share a vendor — §22. */
export function identityProviders(links: IdentityLink[]): IdentityLink[] {
  return links.filter((link) => link.provider.startsWith('identity.'));
}

/**
 * How a member's account label should be rendered — §23.
 *
 * Apple's private relay addresses are real and deliverable and are *not* the
 * member's own address. Showing `x7k2m@privaterelay.appleid.com` as "your
 * email" is wrong twice: it is not an address they recognise, and it implies
 * Diaspora knows an email they deliberately withheld. The relay is named for
 * what it is.
 */
export function describeAccount(link: IdentityLink): { primary: string; caveat: string | null } {
  if (!link.account) {
    return { primary: 'Not connected', caveat: null };
  }

  if (link.account.isPrivateRelay) {
    return {
      primary: link.account.accountLabel,
      caveat: 'Apple hides your real address and forwards mail to it.',
    };
  }

  return { primary: link.account.accountLabel, caveat: null };
}

/**
 * Whether adding this provider would conflict with an existing link.
 *
 * The client-side half of the 409 the contract requires. Catching it here means
 * a member who taps "Connect Google" while Google is already linked gets an
 * immediate, clear answer instead of completing an OAuth consent that ends in
 * an error — which costs them a real grant for nothing, the same reasoning as
 * `unconfiguredOAuthProvider` refusing before it opens a browser.
 */
export function alreadyLinked(
  links: IdentityLink[],
  provider: IntegrationProviderId
): IdentityLink | null {
  return links.find((link) => link.provider === provider && link.status === 'CONNECTED') ?? null;
}

/**
 * Whether removing this link needs a fresh reauthentication.
 *
 * Always true, and the function exists to say so in one place rather than to
 * compute anything. Unlinking is a security-sensitive change — an attacker with
 * a borrowed unlocked phone detaching the owner's recovery method is the attack
 * — and a rule with an exception is a rule somebody finds the exception to.
 */
export function requiresReauthentication(): boolean {
  return true;
}
