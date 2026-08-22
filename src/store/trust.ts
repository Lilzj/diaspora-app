// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Trust store
//
// ── What this store is, after Wave D-4 ───────────────────────────────────────
//
// **The server is authoritative for verification state, reputation, badges and
// eligibility.** `lib/trust-api.ts` and `hooks/trust.ts` are how a screen reads
// them, and every screen that renders any of those now does.
//
// This store survives for two reasons, and only two:
//
//   1. **Concerns Trust does not serve.** `privacySettings`, `blockedUsers`,
//      `mutedUsers`, `trustedDevices`, `auditLogs` and `notifications` have no
//      route anywhere under `/api/v1/trust` — the ones the old dev handler
//      served (`/trust/audit`, `/trust/privacy`) were invented. They are local
//      state because there is nowhere else for them to be, and
//      `profile/audit-log.tsx` and `profile/privacy-settings.tsx` still read
//      them. Naming that here rather than leaving it implied: those two screens
//      show local data and no backend has ever seen it.
//
//   2. **A synchronous mirror for `lib/trustEngine.ts`.** The engine is called
//      from `evaluateAction` inside a submit handler and from a render body; it
//      reads `getState()` synchronously and cannot become a hook without
//      rewriting five create screens. The backend explicitly endorses keeping
//      it — *"the client keeps its local copy for instant UI feedback; this is
//      the answer that decides"* — so it stays, and the fields it reads stay
//      with it.
//
// ── What changed, and why it had to ──────────────────────────────────────────
//
// Those mirror fields used to be **seeded with a fictional member**: an
// approved country verification, 1,450 reputation points in Mauritius, 300 in
// the United Kingdom, two years of verified UK residence and a four-entry trust
// journey. Every gate the engine computed from them opened for every member, on
// every device, before any request was made.
//
// They are empty now, and `hydrateFromTrustProfile` fills them from
// `GET /trust/profile`. So there is still one copy of this data on the device,
// but it is a **cache of the server's answer** rather than a second opinion
// about it. An un-hydrated store reports nothing verified, which is the honest
// answer before the profile has loaded and the safe one if it never does.
//
// ── The eight trust-decision actions, removed in Wave N ──────────────────────
//
// Wave D-4 rewired their callers to `/api/v1/trust` and left the actions here,
// on the stated reasoning that deleting a store's surface while its replacement
// is one release old makes a reversible wave irreversible. That reasoning had a
// shelf life, and it has expired: the replacement now has 60-odd assertions
// against it in `lib/__tests__/trust-api.integration.test.ts`, covering
// submission, the 201-with-an-auto-rejection-inside, duplicate conflicts,
// appeal eligibility and the appeal state machine. Rule 6 of this remediation
// is *do not delete until the replacement has passing tests*, and it does.
//
// Gone, and what answers instead:
//
//   `submitVerification`, `updateVerificationStatus`
//       → `POST /trust/verifications` and the server's own status transitions.
//   `submitDiasporaVerification`, `updateDiasporaVerificationStatus`
//       → the same route with `type: 'Diaspora'`; the status is the server's.
//   `submitVerificationAppeal`, `submitAppeal`
//       → `POST /trust/appeals`, via `useSubmitAppeal` in `hooks/trust.ts`.
//   `resetVerificationState`
//       → nothing. There is no local verification state left to reset.
//   `verifyCommunityUpdate`
//       → Community's confirmation route, which refuses a duplicate and a
//         self-confirmation. The local one wrote an audit line and a
//         congratulatory notification and recorded no vote anywhere.
//
// **Why deleting these is a safety improvement and not just tidiness.** Every
// one of them wrote a *trust decision* into local state, and four wrote outcomes
// no server had produced: `country.tsx` flipped `Country → Approved` on a
// two-second timer, `updateDiasporaVerificationStatus('Approved')` was reachable
// from a button on the access gateway, and `submitVerificationAppeal` set a
// member's own appeal to "under review". While they existed, one import could
// reinstate any of that. `integration-boundary.test.ts` asserts screens do not
// call `updateVerificationStatus`; a function that does not exist is a stronger
// guarantee than a test that looks for its name in source text.
//
// ── What was deliberately NOT removed ────────────────────────────────────────
//
//   `revokeDevice` and `trustedDevices` — a ninth orphan, and verified to have
//   no reader anywhere since `TrustEngine.calculateRiskScore()` (its last one)
//   was deleted in this same wave. Left because `profile/account-security.tsx`
//   is being edited concurrently and because removing a device list is a
//   decision about a security surface, not a cleanup. Flagged, not taken.
//
//   `diasporaVerification`, `appeals`, `trustJourney`, `riskScore` — state whose
//   writers are now all gone, so they are permanently at their initial value.
//   They stay declared for the reason the fields below already record: an empty
//   array is a visibly absent journey rather than a fictional one, and several
//   screens still import this store's type.
//
// `hydrateFromTrustProfile` is the only writer of the four server-owned fields.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import type {
  AccountHealthStatus,
  CountryReputationScore,
  CountryExperienceInterval,
  TrustedDevice,
  UserPrivacySettings,
  AuditLogEvent,
  AppealRequest,
  TrustTimelineEvent,
  TrustNotification,
  VerificationType,
  VerificationStatus,
} from '@/types/trust';
import type {
  SubmitVerificationRequest,
  VerificationResponse,
  AppealSubmissionRequest,
} from '@/types/verification';

export interface DiasporaVerificationData {
  verificationId?: string;
  request?: SubmitVerificationRequest;
  response?: VerificationResponse;
  appealRequest?: AppealSubmissionRequest;
  appealStatus?: 'None' | 'Pending' | 'Approved' | 'Rejected';
}

interface TrustState {
  // Verifications
  verifications: Record<VerificationType, VerificationStatus>;
  
  // Diaspora Verification Data
  diasporaVerification: DiasporaVerificationData | null;

  // Account Health & Risk
  healthStatus: AccountHealthStatus;
  riskScore: number; // 0-100 (internal)
  
  // Timelines & Country Info
  countryReputations: CountryReputationScore[];
  experienceTimeline: CountryExperienceInterval[];
  trustJourney: TrustTimelineEvent[];
  
  // Settings & Lists
  privacySettings: UserPrivacySettings;
  blockedUsers: string[];
  mutedUsers: string[];
  trustedDevices: TrustedDevice[];
  
  // Audit Logs & Appeals
  auditLogs: AuditLogEvent[];
  appeals: AppealRequest[];
  
  // Rate Limits & Cooldown counters (actions timestamps)
  activityTimestamps: Record<string, number[]>; // Key = action name (e.g. "Comment", "Like", "PostMarketplace")
  
  // Notifications
  notifications: TrustNotification[];

  // ── Actions ────────────────────────────────────────────────────────────────
  //
  // The eight verification- and appeal-writing actions this interface used to
  // declare are **gone** (Remediation Wave N). See the block at the end of the
  // implementation for what they were and what replaced each.
  revokeDevice: (deviceId: string) => void;
  updatePrivacySettings: (settings: Partial<UserPrivacySettings>) => void;
  blockUser: (userId: string) => void;
  unblockUser: (userId: string) => void;
  muteUser: (userId: string) => void;
  unmuteUser: (userId: string) => void;
  addAuditLog: (action: string, details: string) => void;
  checkAndRecordActionRateLimit: (actionKey: string, limitCount: number, windowMs: number, cooldownMs: number, dryRun?: boolean) => { allowed: boolean; waitTimeSec?: number };
  addNotification: (title: string, description: string, type: TrustNotification['type']) => void;
  clearNotification: (id: string) => void;

  /**
   * Fills the synchronous mirror from `GET /trust/profile`.
   *
   * Called by `hooks/trust.ts` consumers once the profile resolves. This is the
   * only way the four server-owned fields below acquire a value — there are no
   * seeded defaults any more, because a seeded default is a claim about a
   * member that nothing verified.
   */
  hydrateFromTrustProfile: (profile: TrustProfileMirror) => void;
}

/**
 * The subset of `WireTrustProfile` the synchronous mirror needs.
 *
 * Deliberately a structural type rather than an import of `WireTrustProfile`:
 * the store must not acquire a dependency on the API layer, and this way the
 * shape it accepts is visible here rather than three files away.
 */
export interface TrustProfileMirror {
  verifications: Partial<Record<VerificationType, VerificationStatus>> & Record<string, string>;
  healthStatus: AccountHealthStatus;
  countryReputations: CountryReputationScore[];
  experienceTimeline: CountryExperienceInterval[];
}

const DEFAULT_PRIVACY: UserPrivacySettings = {
  profileVisibility: 'Members',
  phoneVisibility: 'Private',
  locationPrecision: 'Approximate',
  activityVisibility: true,
  followersAllowed: true,
  verificationVisibility: true,
};

const DEFAULT_DEVICES: TrustedDevice[] = [
  { deviceId: 'dev-1', deviceName: 'iPhone 15 Pro', location: 'London, UK', lastActive: 'Active now', isCurrent: true },
  { deviceId: 'dev-2', deviceName: 'Samsung Galaxy S23', location: 'Port Louis, Mauritius', lastActive: '2 days ago', isCurrent: false },
];

/**
 * The verification checklist before the server has answered.
 *
 * Every supported type at `Pending`, which is the same thing
 * `GET /trust/profile` says about a type never attempted. Nothing starts
 * `Approved`: this store used to declare `Phone` and `Country` approved for
 * every member on every device, and `trustEngine.ts` opened four publishing
 * gates on the strength of it.
 */
const UNKNOWN_VERIFICATIONS: Record<VerificationType, VerificationStatus> = {
  Phone: 'Pending',
  Email: 'Pending',
  Identity: 'Pending',
  Country: 'Pending',
  Professional: 'Pending',
  Business: 'Pending',
  Organization: 'Pending',
  Embassy: 'Pending',
  Diaspora: 'Pending',
  Residence: 'Pending',
  Employment: 'Pending',
  CommunityGuide: 'Pending',
  Contributor: 'Pending',
};

const DEFAULT_AUDIT: AuditLogEvent[] = [
  { eventId: 'al-1', timestamp: '2026-07-14T02:30:00Z', action: 'Device Login', details: 'Successful login from iPhone 15 Pro (London, UK)', ipAddress: '82.165.97.12', deviceFingerprint: 'ios-fp-1234' },
  { eventId: 'al-2', timestamp: '2026-07-13T18:15:00Z', action: 'Update Saved Settings', details: 'Modified phone number visibility to Private', ipAddress: '82.165.97.12', deviceFingerprint: 'ios-fp-1234' },
  { eventId: 'al-3', timestamp: '2026-07-12T09:45:00Z', action: 'Verification Submitted', details: 'Passport upload sent for Country Verification', ipAddress: '82.165.97.12', deviceFingerprint: 'ios-fp-1234' },
];

export const useTrustStore = create<TrustState>((set, get) => ({
  // ── Server-owned, mirrored ─────────────────────────────────────────────────
  //
  // Empty until `hydrateFromTrustProfile` runs. `GET /trust/profile` is the
  // source; these four exist only so `lib/trustEngine.ts` can read them
  // synchronously.

  verifications: UNKNOWN_VERIFICATIONS,

  healthStatus: {
    health: 'Good',
    violationsCount: 0,
    warningsCount: 0,
    activeAppealsCount: 0,
    spamReportsCount: 0,
    reasons: [],
  },

  countryReputations: [],
  experienceTimeline: [],

  // ── Server-owned, no longer mirrored ───────────────────────────────────────
  //
  // `trustJourney` is `GET /trust/timeline` and `appeals` is
  // `GET /trust/appeals`; both are read through `hooks/trust.ts` now. They stay
  // declared, and empty, because removing the fields would be a breaking change
  // to a store several screens still import — and because an empty array is a
  // visibly absent journey rather than a fictional one.
  trustJourney: [],
  appeals: [],

  diasporaVerification: null,

  /**
   * Never populated any more.
   *
   * The server sends `riskScore` only to a caller holding
   * `trust:verification:review`. A member's own risk number is not theirs to
   * read, and this field's seeded `12` was shown to every member behind an
   * "Admin view" label.
   */
  riskScore: 0,

  // ── Genuinely local: no Trust route exists for any of these ────────────────

  privacySettings: DEFAULT_PRIVACY,
  blockedUsers: [],
  mutedUsers: [],
  trustedDevices: DEFAULT_DEVICES,

  auditLogs: DEFAULT_AUDIT,

  activityTimestamps: {},

  notifications: [],

  revokeDevice: (deviceId) => {
    set((state) => {
      const revoked = state.trustedDevices.find(d => d.deviceId === deviceId);
      const name = revoked ? revoked.deviceName : 'Device';
      
      return {
        trustedDevices: state.trustedDevices.filter((d) => d.deviceId !== deviceId),
        auditLogs: [
          {
            eventId: `al-${Date.now()}`,
            timestamp: new Date().toISOString(),
            action: 'Revoked Device Session',
            details: `Successfully terminated session for ${name}`,
            ipAddress: '127.0.0.1',
            deviceFingerprint: deviceId,
          },
          ...state.auditLogs,
        ],
      };
    });
  },

  updatePrivacySettings: (settings) => {
    set((state) => ({
      privacySettings: {
        ...state.privacySettings,
        ...settings,
      },
    }));
    get().addAuditLog('Privacy Settings Changed', 'User modified trust center privacy values.');
  },

  blockUser: (userId) => {
    set((state) => ({
      blockedUsers: [...state.blockedUsers.filter((u) => u !== userId), userId],
    }));
    get().addAuditLog('User Blocked', `Blocked communications with user ${userId}`);
  },

  unblockUser: (userId) => {
    set((state) => ({
      blockedUsers: state.blockedUsers.filter((u) => u !== userId),
    }));
    get().addAuditLog('User Unblocked', `Restored access for user ${userId}`);
  },

  muteUser: (userId) => {
    set((state) => ({
      mutedUsers: [...state.mutedUsers.filter((u) => u !== userId), userId],
    }));
    get().addAuditLog('User Muted', `Muted feed content from user ${userId}`);
  },

  unmuteUser: (userId) => {
    set((state) => ({
      mutedUsers: state.mutedUsers.filter((u) => u !== userId),
    }));
    get().addAuditLog('User Unmuted', `Unmuted content feed from user ${userId}`);
  },

  addAuditLog: (action, details) => {
    const log: AuditLogEvent = {
      eventId: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action,
      details,
      ipAddress: '82.165.97.12',
      deviceFingerprint: 'ios-fp-1234',
    };
    set((state) => ({
      auditLogs: [log, ...state.auditLogs].slice(0, 50), // keep latest 50 logs
    }));
  },

  checkAndRecordActionRateLimit: (actionKey, limitCount, windowMs, cooldownMs, dryRun) => {
    const now = Date.now();
    const timestamps = get().activityTimestamps[actionKey] || [];
    
    // Check general cooldown since the last action
    if (timestamps.length > 0) {
      const lastAction = timestamps[timestamps.length - 1];
      const elapsed = now - lastAction;
      if (elapsed < cooldownMs) {
        return {
          allowed: false,
          waitTimeSec: Math.ceil((cooldownMs - elapsed) / 1000),
        };
      }
    }

    // Filter events in the sliding window
    const windowStart = now - windowMs;
    const activeEvents = timestamps.filter((t) => t > windowStart);

    if (activeEvents.length >= limitCount) {
      // Find oldest active event to calculate wait time
      const oldestActive = activeEvents[0];
      const waitTimeSec = Math.ceil((oldestActive + windowMs - now) / 1000);
      return {
        allowed: false,
        waitTimeSec,
      };
    }

    // If it's a dry run, do not record/persist the action timestamp
    if (dryRun) {
      return { allowed: true };
    }

    // Record action
    set((state) => ({
      activityTimestamps: {
        ...state.activityTimestamps,
        [actionKey]: [...activeEvents, now],
      },
    }));

    return { allowed: true };
  },

  addNotification: (title, description, type) => {
    const newNotif: TrustNotification = {
      id: `notif-${Date.now()}`,
      title,
      description,
      type,
      timestamp: new Date().toISOString(),
      read: false,
    };
    set((state) => ({
      notifications: [newNotif, ...state.notifications],
    }));
  },

  clearNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },


  hydrateFromTrustProfile: (profile) => {
    set({
      // Spread over the full checklist rather than replacing it: the server
      // sends one key per type *it* supports, and a deployment carrying fewer
      // than this client knows about would otherwise leave holes that read as
      // `undefined` rather than `Pending`.
      verifications: {
        ...UNKNOWN_VERIFICATIONS,
        ...(profile.verifications as Partial<Record<VerificationType, VerificationStatus>>),
      },
      healthStatus: profile.healthStatus,
      countryReputations: profile.countryReputations,
      experienceTimeline: profile.experienceTimeline,
    });
  },
}));
export type { TrustState };
