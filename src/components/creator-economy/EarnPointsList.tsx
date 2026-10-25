// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — How reward points are earned (rewards step 3c, CS-C4)
//
// The Earn tab listed Creator's per-action rules as "Earns 50 points" for a
// guide, "+30" for an event, and so on. Nothing ever paid those numbers: they
// are weights toward leaderboards, milestones and challenges (RWD-02). What
// does pay reward points is a confirmed outcome, priced by Trust (D-2, D-12),
// and the programme's milestones and challenges, which each say what they pay.
// This list shows exactly those, from the platform's own rules.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import { formatPoints } from '@/lib/creator-economy';
import type { WireReputationRule } from '@/types/trust';
import { CreatorCard, CreatorEmptyState, CreatorSection } from './CreatorPrimitives';

/** What a confirmed outcome's points are, and when they can be used (D-9). */
export const CONFIRMED_OUTCOME_NOTE = 'Paid once it is confirmed, and ready to use a week later.';

const PROGRAMMES: { key: string; label: string; description: string; route: string }[] = [
  {
    key: 'milestones',
    label: 'Milestones',
    description: 'Each one says what it pays when you reach it and claim it.',
    route: '/creator/milestones',
  },
  {
    key: 'challenges',
    label: 'Challenges',
    description: 'Each one says what it pays when you finish it.',
    route: '/creator/challenges',
  },
];

export function EarnPointsList({ rules }: { rules: WireReputationRule[] }) {
  const { tokens } = useTheme();
  const paying = rules.filter((rule) => (rule.creditPoints ?? 0) > 0);

  return (
    <View>
      <CreatorSection title="Confirmed outcomes">
        {paying.length === 0 ? (
          <CreatorEmptyState
            icon="checkmark-done-outline"
            title="Nothing pays points yet"
            body="Diaspora has not published what confirmed outcomes pay."
          />
        ) : (
          <CreatorCard padded={false}>
            {paying.map((rule, index) => (
              <View
                key={rule.actionType}
                accessible
                accessibilityLabel={`${rule.label}. Earns ${formatPoints(rule.creditPoints ?? 0)}. ${CONFIRMED_OUTCOME_NOTE}`}
                style={{
                  borderBottomColor: tokens.color.border.default,
                  borderBottomWidth: index === paying.length - 1 ? 0 : 1,
                }}
                className="flex-row items-center px-4 py-3.5"
              >
                <View className="flex-1 mr-3">
                  <Text style={{ color: tokens.color.text.primary }} className="text-[13px] font-bold">
                    {rule.label}
                  </Text>
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[11px] font-medium mt-0.5 leading-relaxed"
                  >
                    {CONFIRMED_OUTCOME_NOTE}
                  </Text>
                </View>
                <Text
                  style={{ color: tokens.color.primary[500], fontVariant: ['tabular-nums'] }}
                  className="text-[13px] font-black"
                >
                  +{rule.creditPoints}
                </Text>
              </View>
            ))}
          </CreatorCard>
        )}
      </CreatorSection>

      <CreatorSection title="Milestones and challenges">
        <CreatorCard padded={false}>
          {PROGRAMMES.map((programme, index) => (
            <Pressable
              key={programme.key}
              accessibilityRole="button"
              accessibilityLabel={`${programme.label}. ${programme.description}`}
              onPress={() => router.push(programme.route as never)}
              style={{
                borderBottomColor: tokens.color.border.default,
                borderBottomWidth: index === PROGRAMMES.length - 1 ? 0 : 1,
              }}
              className="flex-row items-center px-4 py-3.5"
            >
              <View className="flex-1 mr-3">
                <Text style={{ color: tokens.color.text.primary }} className="text-[13px] font-bold">
                  {programme.label}
                </Text>
                <Text
                  style={{ color: tokens.color.text.placeholder }}
                  className="text-[11px] font-medium mt-0.5 leading-relaxed"
                >
                  {programme.description}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={tokens.color.text.placeholder} />
            </Pressable>
          ))}
        </CreatorCard>
      </CreatorSection>
    </View>
  );
}
