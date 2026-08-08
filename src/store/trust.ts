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
  ContentTrustLevel,
  DiasporaVerificationStatus,
  AccountState,
} from '@/types/trust';
import type {
  DiasporaDocumentType,
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

  // Actions
  submitVerification: (type: VerificationType, details: any) => void;
  updateVerificationStatus: (type: VerificationType, status: VerificationStatus) => void;
  revokeDevice: (deviceId: string) => void;
  updatePrivacySettings: (settings: Partial<UserPrivacySettings>) => void;
  submitAppeal: (type: AppealRequest['type'], targetId: string, reason: string) => void;
  blockUser: (userId: string) => void;
  unblockUser: (userId: string) => void;
  muteUser: (userId: string) => void;
  unmuteUser: (userId: string) => void;
  addAuditLog: (action: string, details: string) => void;
  checkAndRecordActionRateLimit: (actionKey: string, limitCount: number, windowMs: number, cooldownMs: number, dryRun?: boolean) => { allowed: boolean; waitTimeSec?: number };
  verifyCommunityUpdate: (updateId: string) => void;
  addNotification: (title: string, description: string, type: TrustNotification['type']) => void;
  clearNotification: (id: string) => void;

  // Diaspora Verification actions
  submitDiasporaVerification: (details: SubmitVerificationRequest) => Promise<void>;
  updateDiasporaVerificationStatus: (status: DiasporaVerificationStatus, reasons?: { code: string; details: string }) => void;
  submitVerificationAppeal: (appeal: AppealSubmissionRequest) => Promise<void>;
  resetVerificationState: () => void;
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

const DEFAULT_EXPERIENCE: CountryExperienceInterval[] = [
  { countryCode: 'MU', countryName: 'Mauritius', flag: '🇲🇺', startYear: 2019, endYear: 2026, isVerified: true, role: 'Community Expert' },
  { countryCode: 'GB', countryName: 'United Kingdom', flag: '🇬🇧', startYear: 2026, endYear: null, isVerified: true, role: 'Verified Resident' },
];

const DEFAULT_REPUTATION: CountryReputationScore[] = [
  { countryCode: 'MU', countryName: 'Mauritius', flag: '🇲🇺', points: 1450, level: 'CommunityExpert', stars: 5 },
  { countryCode: 'GB', countryName: 'United Kingdom', flag: '🇬🇧', points: 300, level: 'VerifiedResident', stars: 3 },
];

const DEFAULT_JOURNEY: TrustTimelineEvent[] = [
  { eventId: 'je-1', type: 'Join', label: 'Joined Diaspora', timestamp: '2026-01-15', icon: '👋', description: 'Created an account from United Kingdom.' },
  { eventId: 'je-2', type: 'Phone', label: 'Phone Verified', timestamp: '2026-01-15', icon: '📱', description: 'Linked and validated mobile phone line +44 7700 900123.' },
  { eventId: 'je-3', type: 'Country', label: 'Residency Verified in UK', timestamp: '2026-02-10', icon: '🇬🇧', description: 'Uploaded Work Permit document, approved by compliance team.' },
  { eventId: 'je-4', type: 'Expert', label: 'Achieved Mauritius Expert Level', timestamp: '2026-05-01', icon: '⭐', description: 'Reached 1,000+ reputation points in the Mauritius community segment.' },
];

const DEFAULT_AUDIT: AuditLogEvent[] = [
  { eventId: 'al-1', timestamp: '2026-07-14T02:30:00Z', action: 'Device Login', details: 'Successful login from iPhone 15 Pro (London, UK)', ipAddress: '82.165.97.12', deviceFingerprint: 'ios-fp-1234' },
  { eventId: 'al-2', timestamp: '2026-07-13T18:15:00Z', action: 'Update Saved Settings', details: 'Modified phone number visibility to Private', ipAddress: '82.165.97.12', deviceFingerprint: 'ios-fp-1234' },
  { eventId: 'al-3', timestamp: '2026-07-12T09:45:00Z', action: 'Verification Submitted', details: 'Passport upload sent for Country Verification', ipAddress: '82.165.97.12', deviceFingerprint: 'ios-fp-1234' },
];

export const useTrustStore = create<TrustState>((set, get) => ({
  verifications: {
    Phone: 'Approved',
    Email: 'Pending',
    Identity: 'Pending',
    Country: 'Approved',
    Professional: 'Pending',
    Business: 'Pending',
    Organization: 'Pending',
    Embassy: 'Pending',
  },
  
  diasporaVerification: null,
  
  healthStatus: {
    health: 'Good',
    violationsCount: 0,
    warningsCount: 0,
    activeAppealsCount: 0,
    spamReportsCount: 0,
    reasons: [],
  },

  riskScore: 12, // Low Risk initially

  countryReputations: DEFAULT_REPUTATION,
  experienceTimeline: DEFAULT_EXPERIENCE,
  trustJourney: DEFAULT_JOURNEY,

  privacySettings: DEFAULT_PRIVACY,
  blockedUsers: [],
  mutedUsers: [],
  trustedDevices: DEFAULT_DEVICES,

  auditLogs: DEFAULT_AUDIT,
  appeals: [
    { appealId: 'app-1', type: 'Verification', targetId: 'country-gb', reason: 'Verification rejected initially due to blurred photograph.', status: 'Approved', explanation: 'Documents re-uploaded and verified successfully.', createdAt: '2026-02-09' }
  ],

  activityTimestamps: {},

  notifications: [
    { id: 'notif-1', title: 'Country Residency Approved', description: 'Congratulations! Your residency in the UK has been verified by the safety team.', type: 'Verification', timestamp: '2026-02-10T10:00:00Z', read: false },
    { id: 'notif-2', title: 'Unlocked: Guide Publishing', description: 'You now satisfy the criteria to publish guides in the United Kingdom community.', type: 'Unlock', timestamp: '2026-02-10T10:05:00Z', read: false },
  ],

  submitVerification: (type, details) => {
    set((state) => ({
      verifications: {
        ...state.verifications,
        [type]: 'Pending',
      },
    }));
    get().addAuditLog('Verification Submitted', `${type} verification uploaded for processing.`);
  },

  updateVerificationStatus: (type, status) => {
    set((state) => ({
      verifications: {
        ...state.verifications,
        [type]: status,
      },
    }));
  },

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

  submitAppeal: (type, targetId, reason) => {
    const newAppeal: AppealRequest = {
      appealId: `app-${Date.now()}`,
      type,
      targetId,
      reason,
      status: 'Pending',
      explanation: 'Our governance team is reviewing your appeal request.',
      createdAt: new Date().toISOString().split('T')[0],
    };
    set((state) => ({
      appeals: [newAppeal, ...state.appeals],
    }));
    get().addAuditLog('Appeal Filed', `Filed a governance appeal for ${type} id: ${targetId}`);
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

  verifyCommunityUpdate: (updateId) => {
    // Add verification audit and notify
    get().addAuditLog('Community Verification Submitted', `User verified correctness of update ID ${updateId}`);
    get().addNotification(
      'Verification Cast',
      `Your support vote for community update #${updateId} was successfully recorded.`,
      'Verification'
    );
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

  submitDiasporaVerification: async (details) => {
    const vId = `diaspora-verify-${Date.now()}`;
    const newVerification: DiasporaVerificationData = {
      verificationId: vId,
      request: details,
      response: {
        verificationId: vId,
        userId: 'user-123',
        status: 'Pending',
        submittedAt: new Date().toISOString(),
      },
      appealStatus: 'None',
    };
    
    set((state) => ({
      diasporaVerification: newVerification,
    }));
    
    get().addAuditLog('Diaspora Verification Submitted', `Submitted document type ${details.documentType} issued by ${details.issueCountry}`);
    get().addNotification(
      'Verification Submitted',
      'Your Diaspora verification files have been sent for manual compliance check.',
      'Verification'
    );
  },

  updateDiasporaVerificationStatus: (status, reasons) => {
    set((state) => {
      if (!state.diasporaVerification) return {};
      
      const response = {
        ...state.diasporaVerification.response!,
        status,
        reviewedAt: new Date().toISOString(),
        rejectionReasonCode: reasons?.code as any,
        rejectionReasonDetails: reasons?.details,
      };

      // Sync experience timeline start year for UK to 2024 (yielding 2 years residency) if approved
      const updatedTimeline = status === 'Approved'
        ? state.experienceTimeline.map((item) => 
            item.countryCode === 'GB' ? { ...item, startYear: 2024 } : item
          )
        : state.experienceTimeline;

      return {
        diasporaVerification: {
          ...state.diasporaVerification,
          response,
        },
        experienceTimeline: updatedTimeline,
      };
    });

    if (status === 'Approved') {
      get().addAuditLog('Diaspora Verification Approved', 'Manual compliance check passed.');
      get().addNotification(
        'Verification Approved',
        '🎉 Welcome to your diaspora community! Your account is verified.',
        'Verification'
      );
    } else if (status === 'Rejected') {
      get().addAuditLog('Diaspora Verification Rejected', `Reason: ${reasons?.details || 'Document check failed'}`);
      get().addNotification(
        'Verification Rejected',
        `Verification rejected. ${reasons?.details || 'Document details do not match profile details.'}`,
        'Verification'
      );
    } else if (status === 'RequiresAdditionalDocuments') {
      get().addAuditLog('Verification Paused', 'Additional documents required.');
      get().addNotification(
        'Additional Documents Required',
        'Verification paused. Please check details and re-upload your document photo.',
        'Verification'
      );
    }
  },

  submitVerificationAppeal: async (appeal) => {
    set((state) => {
      if (!state.diasporaVerification) return {};

      // Add to appeals array
      const newAppeal: AppealRequest = {
        appealId: `appeal-${Date.now()}`,
        type: 'Verification',
        targetId: state.diasporaVerification.verificationId || 'diaspora-verify',
        reason: appeal.explanation,
        status: 'Pending',
        explanation: 'Our governance team is reviewing your verification appeal.',
        createdAt: new Date().toISOString().split('T')[0],
      };

      return {
        appeals: [newAppeal, ...state.appeals],
        diasporaVerification: {
          ...state.diasporaVerification,
          appealRequest: appeal,
          appealStatus: 'Pending',
        },
      };
    });

    get().addAuditLog('Verification Appeal Filed', `Filed appeal for verification ${appeal.verificationId}`);
    get().addNotification(
      'Appeal Submitted',
      'Your appeal request has been logged and queued for priority review.',
      'Appeal'
    );
  },

  resetVerificationState: () => {
    set({ diasporaVerification: null });
  },
}));
export type { TrustState };
