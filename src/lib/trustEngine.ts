import { useTrustStore } from '@/store/trust';
import { useAuthStore } from '@/store/auth';
import { useReputationStore } from '@/store/reputation';
import type { FeatureUnlockRequirement } from '@/types/trust';

// Configurable threshold values
export const GOVERNANCE_CONFIG = {
  GUIDE_PUBLISHING: {
    MIN_REPUTATION: 150,
    MIN_RESIDENCE_YEARS: 2,
    REQUIRE_IDENTITY: true,
    REQUIRE_PHONE: true,
    REQUIRE_COUNTRY: true,
    MIN_PROFILE_COMPLETE: 75,
  },
  JOB_POSTING: {
    MIN_REPUTATION: 300,
    MIN_RESIDENCE_YEARS: 1,
    REQUIRE_IDENTITY: true,
    REQUIRE_PHONE: true,
    REQUIRE_COUNTRY: true,
    MIN_PROFILE_COMPLETE: 80,
  },
  HOUSING_POSTING: {
    MIN_REPUTATION: 100,
    MIN_RESIDENCE_YEARS: 1,
    REQUIRE_IDENTITY: false,
    REQUIRE_PHONE: true,
    REQUIRE_COUNTRY: true,
    MIN_PROFILE_COMPLETE: 70,
  },
  MARKETPLACE_SELLING: {
    MIN_REPUTATION: 20,
    MIN_RESIDENCE_YEARS: 0,
    REQUIRE_IDENTITY: false,
    REQUIRE_PHONE: true,
    REQUIRE_COUNTRY: false,
    MIN_PROFILE_COMPLETE: 50,
  },
  COMMENTING: {
    MIN_REPUTATION: 10,
    MIN_RESIDENCE_YEARS: 0,
    REQUIRE_IDENTITY: false,
    REQUIRE_PHONE: true,
    REQUIRE_COUNTRY: false,
    MIN_PROFILE_COMPLETE: 40,
  },
};

// Simulated store for uploaded cover photo URIs to prevent fraud/image reuse
const uploadedImagesHistory: Record<string, number> = {};

export const TrustEngine = {
  /**
   * 1. Onboarding Eligibility Check
   * Check if Country of Origin !== Current Country of Residence
   */
  evaluateEligibility(originCountryCode: string, residenceCountryCode: string) {
    if (!originCountryCode || !residenceCountryCode) {
      return { eligible: false, reason: 'Missing country values.' };
    }
    if (originCountryCode.toUpperCase() === residenceCountryCode.toUpperCase()) {
      return {
        eligible: false,
        reason: 'Diaspora is intended strictly for diaspora communities living outside their country of origin. You cannot join if you live in your origin country.',
      };
    }
    return { eligible: true };
  },

  /**
   * Onboarding / Login GPS Location Check
   * Matches Current Country of Residence with Detected Geolocation Country
   */
  evaluateLocationMatch(residenceCountryName: string, gpsCountryName: string) {
    if (!residenceCountryName || !gpsCountryName) {
      return { verified: false, detected: gpsCountryName, expected: residenceCountryName };
    }
    const match = residenceCountryName.trim().toLowerCase() === gpsCountryName.trim().toLowerCase();
    return {
      verified: match,
      detected: gpsCountryName,
      expected: residenceCountryName,
    };
  },

  /**
   * Central Authorization Check
   * Determines if a user action is allowed under governance constraints.
   */
  evaluateAction(
    action:
      | 'ViewGuide'
      | 'PublishGuide'
      | 'CreateJob'
      | 'PostHousing'
      | 'SellItem'
      | 'CreateEvent'
      | 'PublishUpdate'
      | 'Comment'
      | 'Report'
      | 'Follow'
      | 'Save'
      | 'Like'
      | 'Share',
    targetCountryCode?: string,
    dryRun: boolean = true
  ): {
    allowed: boolean;
    code: 'ALLOW' | 'DENIED' | 'RATE_LIMITED' | 'COOLDOWN' | 'HEALTH_RESTRICTED';
    reason?: string;
    waitTimeSec?: number;
    unmetRequirements?: string[];
  } {
    const authStore = useAuthStore.getState();
    const trustStore = useTrustStore.getState();
    const repStore = useReputationStore.getState();

    // Central check: Account must be verified for community actions
    const accountState = authStore.user?.accountState || 'LimitedAccess';
    if (accountState !== 'DiasporaVerified' && accountState !== 'FullCommunityAccess') {
      return {
        allowed: false,
        code: 'DENIED',
        reason: 'Community access is restricted. Please complete Diaspora Verification to unlock this action.',
        unmetRequirements: ['Diaspora Verification'],
      };
    }

    // 1. Check account suspension or restricted status
    if (trustStore.healthStatus.health === 'Suspended') {
      return {
        allowed: false,
        code: 'HEALTH_RESTRICTED',
        reason: 'Your account has been suspended due to violations of our Community Guidelines.',
      };
    }

    if (trustStore.healthStatus.health === 'Restricted') {
      // Restricted health allows reading and liking but blocks all publishing operations
      if (
        [
          'PublishGuide',
          'CreateJob',
          'PostHousing',
          'SellItem',
          'CreateEvent',
          'PublishUpdate',
          'Comment',
        ].includes(action)
      ) {
        return {
          allowed: false,
          code: 'HEALTH_RESTRICTED',
          reason: 'Your account is under posting restrictions. Please contact support or resolve active appeals.',
        };
      }
    }

    // 2. Evaluate Rate Limits & Cooldowns
    let limitCount = 50;
    let windowMs = 24 * 60 * 60 * 1000; // 1 day
    let cooldownMs = 2000; // 2 seconds between likes/comments

    if (action === 'Comment') {
      limitCount = 30; // Max 30 comments per day
      cooldownMs = 5000; // 5 seconds cooldown
    } else if (action === 'Like') {
      limitCount = 100;
      cooldownMs = 1000;
    } else if (action === 'PublishUpdate') {
      limitCount = 10;
      cooldownMs = 30000; // 30 seconds
    } else if (action === 'PublishGuide') {
      limitCount = 3; // Max 3 guides per day
      cooldownMs = 60000; // 1 min
    } else if (action === 'CreateJob' || action === 'PostHousing' || action === 'SellItem') {
      limitCount = 5;
      cooldownMs = 10000; // 10 seconds
    }

    const rateResult = trustStore.checkAndRecordActionRateLimit(
      action,
      limitCount,
      windowMs,
      cooldownMs,
      dryRun
    );
    if (!rateResult.allowed) {
      return {
        allowed: false,
        code: rateResult.waitTimeSec && rateResult.waitTimeSec <= 5 ? 'COOLDOWN' : 'RATE_LIMITED',
        reason: `Please wait. Rate limit active.`,
        waitTimeSec: rateResult.waitTimeSec,
      };
    }

    // 3. Evaluate Publishing Capability Criteria
    const userRep = repStore.reputation;
    const isPhoneVerified = trustStore.verifications.Phone === 'Approved';
    // ── The biometric check is gone ──────────────────────────────────────────
    //
    // `verifications.Identity` was the Stripe biometric face match, shown in the
    // Trust Centre as "Stripe Biometric Match" and gating publishing, feature
    // unlocks and the risk score.
    //
    // It is removed, and **Diaspora Verification takes over everything it
    // gated**. That check — nationality and residence documents, reviewed by
    // Diaspora — already establishes the same thing for the same member, so
    // requiring both meant a second identity hurdle for no additional
    // assurance, and left members verified-but-locked with nothing useful to do
    // about it.
    //
    // `REQUIRE_IDENTITY` is read against the country verification now rather
    // than deleted, so a deployment that wants the requirement still has the
    // switch — it simply points at the check that survived.
    const isCountryVerified = trustStore.verifications.Country === 'Approved';
    const isIdVerified = isCountryVerified;

    // Find country-specific reputation points
    const countryRep = trustStore.countryReputations.find(
      (c) => c.countryCode.toUpperCase() === (targetCountryCode || 'GB').toUpperCase()
    );
    const countryPoints = countryRep ? countryRep.points : 0;
    
    // Simulating residency years based on UK timeline or first item
    const currentCountryInterval = trustStore.experienceTimeline.find(
      (i) => i.countryCode.toUpperCase() === (targetCountryCode || 'GB').toUpperCase()
    );
    const residencyYears = currentCountryInterval ? (currentCountryInterval.endYear ? (currentCountryInterval.endYear - currentCountryInterval.startYear) : (2026 - currentCountryInterval.startYear)) : 0;

    const unmet: string[] = [];

    if (action === 'PublishGuide') {
      const cfg = GOVERNANCE_CONFIG.GUIDE_PUBLISHING;
      if (cfg.REQUIRE_PHONE && !isPhoneVerified) unmet.push('Phone Verification');
      if (cfg.REQUIRE_IDENTITY && !isIdVerified) unmet.push('Diaspora Verification');
      if (cfg.REQUIRE_COUNTRY && !isCountryVerified) unmet.push('Country Residency Verification');
      if (countryPoints < cfg.MIN_REPUTATION) {
        unmet.push(`Requires ${cfg.MIN_REPUTATION} reputation in target country (you have ${countryPoints})`);
      }
      if (residencyYears < cfg.MIN_RESIDENCE_YEARS) {
        unmet.push(`Requires ${cfg.MIN_RESIDENCE_YEARS} years residence (you have ${residencyYears} yrs)`);
      }

      if (unmet.length > 0) {
        return {
          allowed: false,
          code: 'DENIED',
          reason: 'You do not meet the governance prerequisites to publish guides in this country.',
          unmetRequirements: unmet,
        };
      }
    }

    if (action === 'CreateJob') {
      const cfg = GOVERNANCE_CONFIG.JOB_POSTING;
      if (cfg.REQUIRE_PHONE && !isPhoneVerified) unmet.push('Phone Verification');
      if (cfg.REQUIRE_IDENTITY && !isIdVerified) unmet.push('Diaspora Verification');
      if (cfg.REQUIRE_COUNTRY && !isCountryVerified) unmet.push('Country Residency Verification');
      if (countryPoints < cfg.MIN_REPUTATION) {
        unmet.push(`Requires ${cfg.MIN_REPUTATION} reputation (you have ${countryPoints})`);
      }

      if (unmet.length > 0) {
        return {
          allowed: false,
          code: 'DENIED',
          reason: 'Job listing publishing requires higher identity and country verified levels.',
          unmetRequirements: unmet,
        };
      }
    }

    if (action === 'PostHousing') {
      const cfg = GOVERNANCE_CONFIG.HOUSING_POSTING;
      if (cfg.REQUIRE_PHONE && !isPhoneVerified) unmet.push('Phone Verification');
      if (cfg.REQUIRE_COUNTRY && !isCountryVerified) unmet.push('Country Verification');
      if (countryPoints < cfg.MIN_REPUTATION) {
        unmet.push(`Requires ${cfg.MIN_REPUTATION} reputation (you have ${countryPoints})`);
      }

      if (unmet.length > 0) {
        return {
          allowed: false,
          code: 'DENIED',
          reason: 'Housing listings require verified residence status.',
          unmetRequirements: unmet,
        };
      }
    }

    return { allowed: true, code: 'ALLOW' };
  },

  /**
   * Generates requirements data checklists for visual Feature Unlock progress meters
   */
  getFeatureUnlockRequirements(targetCountryCode: string = 'GB'): FeatureUnlockRequirement[] {
    const trustStore = useTrustStore.getState();
    const repStore = useReputationStore.getState();

    const isPhoneVerified = trustStore.verifications.Phone === 'Approved';
    // See the note in `canPublishGuide` — Diaspora Verification now carries
    // what the biometric check used to.
    const isCountryVerified = trustStore.verifications.Country === 'Approved';
    const isIdVerified = isCountryVerified;

    const countryRep = trustStore.countryReputations.find(
      (c) => c.countryCode.toUpperCase() === targetCountryCode.toUpperCase()
    );
    const countryPoints = countryRep ? countryRep.points : 0;

    const currentCountryInterval = trustStore.experienceTimeline.find(
      (i) => i.countryCode.toUpperCase() === targetCountryCode.toUpperCase()
    );
    const residencyYears = currentCountryInterval ? (currentCountryInterval.endYear ? (currentCountryInterval.endYear - currentCountryInterval.startYear) : (2026 - currentCountryInterval.startYear)) : 0;

    // Helper to evaluate unlocks
    const evaluate = (
      reqPhone: boolean,
      reqId: boolean,
      reqCountry: boolean,
      minRep: number,
      minResidence: number
    ) => {
      const requirements = [
        {
          description: 'Verified Phone Number',
          isMet: isPhoneVerified,
          currentProgress: isPhoneVerified ? 'Verified' : 'Pending binding',
        },
        {
          description: `Verified Residency in ${targetCountryCode}`,
          isMet: isCountryVerified,
          currentProgress: isCountryVerified ? 'Verified' : 'Unverified',
        },
        {
          description: `Country Reputation Points (Requires ${minRep})`,
          isMet: countryPoints >= minRep,
          currentProgress: `${countryPoints} / ${minRep} pts`,
        },
        {
          description: `Residence Duration (Requires ${minResidence} year${minResidence > 1 ? 's' : ''})`,
          isMet: residencyYears >= minResidence,
          currentProgress: `${residencyYears} / ${minResidence} yr${residencyYears > 1 ? 's' : ''}`,
        },
      ];

      // Remove requirements that are set to 0 or false for cleaner view
      const activeReqs = requirements.filter((r) => {
        if (r.description.includes('Stripe') && !reqId) return false;
        if (r.description.includes('Residency in') && !reqCountry) return false;
        if (r.description.includes('Reputation') && minRep === 0) return false;
        if (r.description.includes('Duration') && minResidence === 0) return false;
        return true;
      });

      const isUnlocked = activeReqs.every((r) => r.isMet);

      return { isUnlocked, requirements: activeReqs };
    };

    const gPub = evaluate(
      GOVERNANCE_CONFIG.GUIDE_PUBLISHING.REQUIRE_PHONE,
      GOVERNANCE_CONFIG.GUIDE_PUBLISHING.REQUIRE_IDENTITY,
      GOVERNANCE_CONFIG.GUIDE_PUBLISHING.REQUIRE_COUNTRY,
      GOVERNANCE_CONFIG.GUIDE_PUBLISHING.MIN_REPUTATION,
      GOVERNANCE_CONFIG.GUIDE_PUBLISHING.MIN_RESIDENCE_YEARS
    );

    const jPub = evaluate(
      GOVERNANCE_CONFIG.JOB_POSTING.REQUIRE_PHONE,
      GOVERNANCE_CONFIG.JOB_POSTING.REQUIRE_IDENTITY,
      GOVERNANCE_CONFIG.JOB_POSTING.REQUIRE_COUNTRY,
      GOVERNANCE_CONFIG.JOB_POSTING.MIN_REPUTATION,
      GOVERNANCE_CONFIG.JOB_POSTING.MIN_RESIDENCE_YEARS
    );

    const hPub = evaluate(
      GOVERNANCE_CONFIG.HOUSING_POSTING.REQUIRE_PHONE,
      GOVERNANCE_CONFIG.HOUSING_POSTING.REQUIRE_IDENTITY,
      GOVERNANCE_CONFIG.HOUSING_POSTING.REQUIRE_COUNTRY,
      GOVERNANCE_CONFIG.HOUSING_POSTING.MIN_REPUTATION,
      GOVERNANCE_CONFIG.HOUSING_POSTING.MIN_RESIDENCE_YEARS
    );

    const mPub = evaluate(
      GOVERNANCE_CONFIG.MARKETPLACE_SELLING.REQUIRE_PHONE,
      GOVERNANCE_CONFIG.MARKETPLACE_SELLING.REQUIRE_IDENTITY,
      GOVERNANCE_CONFIG.MARKETPLACE_SELLING.REQUIRE_COUNTRY,
      GOVERNANCE_CONFIG.MARKETPLACE_SELLING.MIN_REPUTATION,
      GOVERNANCE_CONFIG.MARKETPLACE_SELLING.MIN_RESIDENCE_YEARS
    );

    return [
      {
        featureId: 'guides',
        name: 'Guide Publishing',
        isUnlocked: gPub.isUnlocked,
        requirements: gPub.requirements,
      },
      {
        featureId: 'jobs',
        name: 'Job Posting',
        isUnlocked: jPub.isUnlocked,
        requirements: jPub.requirements,
      },
      {
        featureId: 'housing',
        name: 'Housing Listing',
        isUnlocked: hPub.isUnlocked,
        requirements: hPub.requirements,
      },
      {
        featureId: 'marketplace',
        name: 'Marketplace Directory Selling',
        isUnlocked: mPub.isUnlocked,
        requirements: mPub.requirements,
      },
    ];
  },

  /**
   * 8. Fraud Prevention - Anti Image Reuse Control
   * Flags uploads referencing already repeated image hashes.
   */
  detectImageReuse(imageUrl: string): { fraudTriggered: boolean; count: number } {
    if (!imageUrl) return { fraudTriggered: false, count: 0 };
    
    // Normalize or strip query parameters
    const cleanUrl = imageUrl.split('?')[0];
    
    const count = (uploadedImagesHistory[cleanUrl] || 0) + 1;
    uploadedImagesHistory[cleanUrl] = count;

    if (count > 3) {
      // Re-use of same photo reference > 3 times triggers verification alerts
      useTrustStore.getState().addAuditLog('Fraud Triggered', `Anti-Spam flagged rapid reuse of image URL: ${cleanUrl}`);
      return { fraudTriggered: true, count };
    }

    return { fraudTriggered: false, count };
  },

  // ── `calculateRiskScore()` was here (removed, Remediation Wave N) ───────────
  //
  // It read four fields off the local store, added weights it made up — 25 for
  // an unapproved country verification, 15 for a second device, 30 for any spam
  // report, 20 if an audit line happened to contain the string "VPN" — capped
  // the sum at 100 and returned it as `RiskFactors`. `profile/trust-center.tsx`
  // rendered that number to the member under an "Admin view" label.
  //
  // **Its replacement is not another client computation; it is the server
  // declining to answer.** `ProfileQueries.cs:73` omits `riskScore` and
  // `riskLevel` from the trust profile unless the caller holds
  // `trust:verification:review`, on the stated grounds that a number the client
  // receives is a number the member can read. `hooks/trust.ts` surfaces both as
  // nullable and `trust-center.tsx` renders the risk panel only when they are
  // present — so a member now sees nothing where they used to see a fabricated
  // 12/100, and staff see the figure the platform actually holds.
  //
  // Wave D-4 rewired the screen and left the method behind with no caller. It is
  // deleted rather than kept, because a scoring function sitting in a shipped
  // bundle is one import away from a second, disagreeing risk number — and the
  // one thing worse than a made-up score is two of them.
  //
  // `RiskLevel` and `RiskFactors` stay in `types/trust.ts`: they are the shape
  // the *server's* figures arrive in, and `hooks/trust.ts` reads them.
};
