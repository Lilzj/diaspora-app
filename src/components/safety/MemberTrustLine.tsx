// Another member's trust level, where you are about to deal with them (Phase 11).
//
// The platform publishes every member's trust level (`GET /trust/profiles/{id}`),
// but no screen showed another member's, so "check their trust level before you
// pay" had nothing to check. A low level is named, not hidden.

import React from 'react';
import { Text, View } from 'react-native';

import { usePublicTrustProfile } from '@/hooks/trust';
import { TRUST_TIER_LABEL, isLowTrust } from '@/lib/trading-safety';

function sinceYear(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const year = new Date(iso).getFullYear();
  return Number.isNaN(year) ? null : String(year);
}

export function MemberTrustLine({ userId }: { userId: string | null | undefined }) {
  const { profile } = usePublicTrustProfile(userId ?? null);
  if (!profile) return null;

  const low = isLowTrust(profile.trustLevel);
  const since = sinceYear(profile.memberSince);
  const label = TRUST_TIER_LABEL[profile.trustLevel] ?? profile.trustLevel;

  return (
    <View
      className={`rounded-xl px-3 py-2 mt-3 border ${
        low ? 'bg-surface-muted border-warning-default' : 'bg-surface-background border-faint'
      }`}
      accessible
      accessibilityLabel={`Trust level: ${label}.${since ? ` Member since ${since}.` : ''}`}
      testID="member-trust-line"
    >
      <Text className="text-[11px] font-extrabold text-content-primary">
        Trust level: {label}
        {profile.isVerifiedMember ? ' · Verified' : ''}
        {since ? ` · Member since ${since}` : ''}
      </Text>
      {low ? (
        <Text className="text-[10px] font-semibold text-content-secondary mt-0.5 leading-relaxed">
          This member is still building trust. Meet in public and avoid paying in advance.
        </Text>
      ) : null}
    </View>
  );
}
