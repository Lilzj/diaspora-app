// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Paid-placement disclosure (Frontend Phase 5)
//
// Labels a listing whose position was paid for.
//
// This closes **DEBT-071**, recorded in PSR-1.1's frontend readiness report:
// *"a platform that takes money for placement and does not label it is a
// decision somebody should make on purpose rather than by omission."*
//
// The data has been on the wire since B15: `GET /placements/{subjectType}/
// {subjectId}` answers "is this paid for, and until when" without the asking
// surface knowing that money exists, and the recommendation engine carries a
// `Promoted` reason code distinct from `HighlyRated` — precisely so that *"did
// this rank because it is good or because it was paid for"* stays answerable.
//
// The badge says "Promoted" rather than "Featured" on purpose. `isFeatured`
// already exists on four client types and means something else entirely: a
// moderator's editorial decision, or a reputation level's earned benefit.
// Reusing the word would merge two things the whole placement design keeps
// apart.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { useSubjectPlacements } from '@/hooks/financial';
import type { MonetizationSubjectType } from '@/types/financial';

interface PromotedBadgeProps {
  subjectType: MonetizationSubjectType;
  subjectId: string;
  size?: 'sm' | 'md';
}

/**
 * Renders nothing unless the subject genuinely has an active paid placement.
 *
 * The query is cached for five minutes and shared across every card showing
 * the same subject, so a list of twenty listings does not make twenty requests
 * for the same answer.
 */
export function PromotedBadge({ subjectType, subjectId, size = 'sm' }: PromotedBadgeProps) {
  const { tokens } = useTheme();
  const { data } = useSubjectPlacements(subjectType, subjectId);

  const active = data?.find((placement) => placement.isActive);
  if (!active) return null;

  return (
    <View
      accessible
      accessibilityRole="text"
      // Spelled out for a screen reader: "Promoted" alone is a word somebody
      // could read as praise rather than as a disclosure.
      accessibilityLabel="Promoted. The owner paid for this to appear higher."
      style={{ backgroundColor: tokens.color.neutral[100], borderColor: tokens.color.border.default }}
      className={`flex-row items-center self-start rounded-full border ${
        size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1'
      }`}
    >
      <Ionicons
        name="megaphone-outline"
        size={size === 'sm' ? 10 : 12}
        color={tokens.color.text.secondary}
        style={{ marginRight: 3 }}
      />
      <Text
        style={{ color: tokens.color.text.secondary }}
        className={`font-bold uppercase tracking-wider ${size === 'sm' ? 'text-[9px]' : 'text-[10px]'}`}
      >
        Promoted
      </Text>
    </View>
  );
}
