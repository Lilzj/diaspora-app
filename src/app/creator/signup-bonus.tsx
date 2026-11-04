// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Sign-up point bonus (Frontend Phase 7, §19)
//
// The smallest screen in the phase and the one with the sharpest rule attached:
//
//   §19  "Do not award points locally. Frontend can present the state. Backend
//        must award the actual points."
//
// The tempting implementation of this feature is the wrong one — tap "claim",
// show the balance going up, reconcile later. That version is wrong on a second
// device, wrong when the risk engine refuses, and wrong when the network drops
// between the optimistic update and the request.
//
// What happens instead: acknowledging posts, the server decides, and the points
// balance is *invalidated* rather than incremented. Whatever number appears
// afterwards is a number Diaspora produced.
//
// The `Blocked` state is deliberately vague about why. A fraud refusal that
// explains which check it tripped is a set of instructions for getting round it.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import {
  CreatorCard,
  CreatorScreen,
  CreatorSection,
  CreatorStatusChip,
  RequirementList,
} from '@/components/creator-economy';
import { FinancialErrorInline } from '@/components/financial';
import { useAcknowledgeSignupBonus, useSignupBonus } from '@/hooks/creator-economy';
import { formatPoints, presentSignupBonusState } from '@/lib/creator-economy';
import { trackCreatorEvent } from '@/lib/creator-analytics';
import { formatRelativeTime } from '@/utils/format';
import type { FinancialError } from '@/lib/financial-errors';
import type { CreatorRequirement } from '@/types/creator-economy';
import { appRouteFor } from '@/lib/server-route';

export default function SignupBonusScreen() {
  const { tokens } = useTheme();

  const query = useSignupBonus();
  const acknowledge = useAcknowledgeSignupBonus();

  useEffect(() => {
    trackCreatorEvent('creator.signup_bonus.viewed', {
      state: String(query.bonus?.state ?? 'unknown'),
    });
  }, [query.bonus?.state]);

  const openRequirement = useCallback((requirement: CreatorRequirement) => {
    if (requirement.actionRoute) router.push(appRouteFor(requirement.actionRoute) as never);
  }, []);

  const accept = useCallback(() => {
    acknowledge.mutate(undefined, {
      onSuccess: (bonus) =>
        trackCreatorEvent('creator.signup_bonus.acknowledged', { state: String(bonus.state) }),
    });
  }, [acknowledge]);

  const bonus = query.bonus;
  const presentation = bonus ? presentSignupBonusState(bonus.state) : null;

  const outstanding = (bonus?.requirements ?? []).filter((requirement) => !requirement.isMet);
  const canAccept = bonus?.state === 'Eligible' && outstanding.length === 0;
  const isAwarded = bonus?.state === 'Awarded' || bonus?.state === 'AlreadyClaimed';

  return (
    <CreatorScreen
      title="Welcome bonus"
      subtitle="Points for getting set up"
      gapKey="signupBonus"
      gapDetail="The bonus state and its requirements are simulated. Diaspora has no sign-up bonus yet — and when it does, the points will be awarded by Diaspora, never by this app."
      isEnabled={query.isEnabled}
      isLoading={query.isLoading}
      error={query.error}
      onRetry={query.refetch}
      footer={
        canAccept ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Accept your welcome bonus of ${formatPoints(bonus?.points ?? 0)}`}
              accessibilityState={{ busy: acknowledge.isPending }}
              disabled={acknowledge.isPending}
              onPress={accept}
              style={{ backgroundColor: tokens.color.primary[500] }}
              className="rounded-full py-4 items-center"
            >
              <Text className="text-white text-xs font-black uppercase tracking-wider">
                {acknowledge.isPending ? 'Just a moment…' : 'Accept bonus'}
              </Text>
            </Pressable>

            {acknowledge.isError ? (
              <View className="mt-2.5">
                <FinancialErrorInline error={acknowledge.error as FinancialError} />
              </View>
            ) : null}
          </>
        ) : undefined
      }
    >
      {bonus && presentation ? (
        <View className="px-5 pt-5">
          {/* ── The offer ────────────────────────────────────────────────── */}
          <View
            style={{
              backgroundColor: isAwarded ? tokens.color.success.default : tokens.color.secondary[500],
            }}
            className="rounded-3xl p-6 items-center"
            accessible
            accessibilityLabel={`${formatPoints(bonus.points)} welcome bonus. ${presentation.description}`}
          >
            <Text className="text-4xl mb-3">{isAwarded ? '🎉' : '🎁'}</Text>

            <Text
              className="text-white text-4xl font-black tracking-tight"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {bonus.points.toLocaleString()}
            </Text>
            <Text className="text-white/75 text-[11px] font-black uppercase tracking-widest mt-1">
              points
            </Text>

            <Text className="text-white/85 text-[13px] font-semibold text-center mt-4 leading-relaxed">
              {presentation.description}
            </Text>
          </View>

          <View className="items-center mt-4">
            <CreatorStatusChip presentation={presentation} />
          </View>

          {/* ── What is left ─────────────────────────────────────────────── */}
          {bonus.requirements.length > 0 && !isAwarded ? (
            <CreatorSection
              title="Before it lands"
              subtitle={
                outstanding.length === 0
                  ? 'All done — accept it below'
                  : `${outstanding.length} left to do`
              }
            >
              <CreatorCard>
                <RequirementList requirements={bonus.requirements} onAction={openRequirement} />
              </CreatorCard>
            </CreatorSection>
          ) : null}

          {/* ── Awarded ──────────────────────────────────────────────────── */}
          {isAwarded ? (
            <CreatorSection title="Where it went">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open your rewards balance"
                onPress={() => router.push('/creator/rewards')}
                style={{
                  backgroundColor: tokens.color.surface.card,
                  borderColor: tokens.color.border.default,
                }}
                className="flex-row items-center rounded-2xl border p-4"
              >
                <Ionicons name="sparkles-outline" size={17} color={tokens.color.text.secondary} />
                <View className="flex-1 mx-3">
                  <Text
                    style={{ color: tokens.color.text.primary }}
                    className="text-[13px] font-bold"
                  >
                    Your points balance
                  </Text>
                  <Text
                    style={{ color: tokens.color.text.placeholder }}
                    className="text-[11px] font-semibold mt-0.5"
                  >
                    {bonus.awardedAt
                      ? `Awarded ${formatRelativeTime(bonus.awardedAt)}`
                      : 'Already in your balance'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={tokens.color.text.placeholder} />
              </Pressable>
            </CreatorSection>
          ) : null}

          {/* ── Refused ──────────────────────────────────────────────────── */}
          {bonus.state === 'Blocked' || bonus.state === 'NotEligible' ? (
            <View
              style={{ backgroundColor: tokens.color.warning.surface }}
              className="rounded-2xl p-4 mt-5 flex-row items-start"
            >
              <Ionicons
                name="shield-outline"
                size={16}
                color={tokens.color.warning.default}
                style={{ marginTop: 1 }}
              />
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-[12px] font-semibold ml-2 flex-1 leading-relaxed"
              >
                {bonus.ineligibleReason ?? presentation.description} If you think this is wrong,
                support can look into it.
              </Text>
            </View>
          ) : null}

          {/* ── Expiry ───────────────────────────────────────────────────── */}
          {bonus.expiresAt && !isAwarded ? (
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[11px] font-semibold text-center mt-5 leading-relaxed"
            >
              This offer runs out {formatRelativeTime(bonus.expiresAt)}.
            </Text>
          ) : null}

          <Text
            style={{ color: tokens.color.text.disabled }}
            className="text-[10px] font-semibold text-center mt-6 mb-4 leading-relaxed"
          >
            Diaspora awards the points, not this app. Accepting tells Diaspora you want the bonus;
            your balance updates when Diaspora says so.
          </Text>
        </View>
      ) : null}
    </CreatorScreen>
  );
}
