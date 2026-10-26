// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Registration draft (Remediation Wave A)
//
// A password in flight, held for the four screens between where it is typed and
// where it is sent.
//
// ── Why this exists rather than a route param ────────────────────────────────
//
// The registration flow spans `register` → `choose-origin` → `choose-country` →
// `enable-location`, and each screen forwards `...params` to the next. Adding
// the password to that chain would put it in expo-router's navigation state,
// which is serialisable, survives in the router's history, appears in
// navigation-state logging and can be reconstructed from a deep link. None of
// those are places a credential belongs.
//
// So the password travels here instead: module scope, never serialised, never
// written to disk, and cleared the moment `POST /auth/register` returns.
//
// ── What it deliberately is not ──────────────────────────────────────────────
//
// Not a Zustand store — nothing should subscribe to it and no screen should
// re-render because it changed. Not persisted — a half-finished registration is
// not worth resuming across a restart, and a password left in storage for that
// convenience is a bad trade. Not exported as an object — the accessors are
// what make `clearRegistrationDraft()` the only way it leaves memory.
// ─────────────────────────────────────────────────────────────────────────────

export interface RegistrationDraft {
  fullName: string;
  email?: string;
  password: string;
  /** The inviter's code, when the member joined through an invitation. */
  referralCode?: string;
}

let draft: RegistrationDraft | null = null;

export function setRegistrationDraft(next: RegistrationDraft): void {
  draft = next;
}

export function getRegistrationDraft(): RegistrationDraft | null {
  return draft;
}

/**
 * Forgets the draft.
 *
 * Called after a successful registration, and on sign-out. An abandoned
 * registration also clears it by the app being closed, which is the only
 * guarantee worth relying on.
 */
export function clearRegistrationDraft(): void {
  draft = null;
}
