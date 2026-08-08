// ─────────────────────────────────────────────────────────────────────────────
// Membership programme (§6, §7, §8)
//
// The tier picker, the benefits, the eligibility requirements and the entry
// point into the application. `id` is an **organization** identifier — a
// membership programme belongs to a real B12 organization, and this screen links
// to that organization's real profile rather than restating it.
//
// Every "can I?" on this screen is the server's answer:
//
//   `tier.isFull` and `requirement.isMet` arrive decided (§19), and the tier
//   card renders them rather than comparing counts or checking documents.
//
//   `programme.myStatus` decides which action is drawn, through
//   `canApplyForMembership` / `canPayForMembership` in `community-state.ts` —
//   which are display rules, and the server refuses independently.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  Card,
  CommunityScreen,
  CommunityStatusPanel,
  DetailRow,
  EmptyState,
  InlineRefusal,
  MembershipTierCard,
  PrimaryButton,
  SecondaryButton,
  Section,
} from '@/components/community';
import { useCommunityAccess, useMembershipProgramme } from '@/hooks/community-life';
import {
  canApplyForMembership,
  canPayForMembership,
  describeMembership,
} from '@/lib/community-state';
import { checkCommunityAccess, CommunityCapabilities } from '@/lib/community-access';
import { moneyProps, trackCommunityEvent } from '@/lib/community-analytics';
import { useAuthStore } from '@/store/auth';

export default function MembershipProgrammeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tokens } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const { programme, isLoading, isError, error, refetch, isEnabled } = useMembershipProgramme(id);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);

  useEffect(() => {
    if (programme) {
      trackCommunityEvent('community.membership.viewed', {
        organizationId: programme.organizationId,
        tierCount: programme.tiers.length,
        requiresApproval: programme.requiresApproval,
      });
    }
  }, [programme]);

  // Default to the recommended tier, or the first one the member could join.
  useEffect(() => {
    if (!programme || selectedTierId) return;
    const joinable = programme.tiers.filter((tier) => !tier.isFull && tier.requirements.every((r) => r.isMet));
    const preferred = joinable.find((tier) => tier.isRecommended) ?? joinable[0] ?? programme.tiers[0];
    if (preferred) setSelectedTierId(preferred.tierId);
  }, [programme, selectedTierId]);

  const selectedTier = useMemo(
    () => programme?.tiers.find((tier) => tier.tierId === selectedTierId) ?? null,
    [programme, selectedTierId]
  );

  const state = describeMembership(programme?.myStatus ?? 'NotAMember');
  const applyRefusal = checkCommunityAccess(
    CommunityCapabilities.ApplyMembership,
    accountState,
    isAuthenticated
  );

  const canApply = canApplyForMembership(programme?.myStatus ?? 'NotAMember');
  const canPay = canPayForMembership(programme?.myStatus ?? 'NotAMember');

  const unmet = selectedTier?.requirements.filter((requirement) => !requirement.isMet) ?? [];

  return (
    <CommunityScreen
      title={programme?.organizationName ?? 'Membership'}
      subtitle={programme ? `${programme.memberCount.toLocaleString()} members` : undefined}
      gapKey="membershipCatalogue"
      isEnabled={isEnabled}
      isLoading={isLoading}
      error={isError ? error : null}
      onRetry={refetch}
      footer={
        programme && programme.isOpen ? (
          canApply ? (
            <PrimaryButton
              label={selectedTier?.price ? 'Continue to join' : 'Join this community'}
              icon="arrow-forward"
              disabled={!selectedTier || unmet.length > 0 || selectedTier.isFull || !applyRefusal.allowed}
              accessibilityHint={
                !applyRefusal.allowed
                  ? applyRefusal.message
                  : unmet.length > 0
                    ? 'Some requirements are outstanding'
                    : 'Opens the application form'
              }
              onPress={() => {
                if (!programme || !selectedTier) return;
                trackCommunityEvent('community.membership.application.started', {
                  organizationId: programme.organizationId,
                  tierId: selectedTier.tierId,
                  billingPeriod: selectedTier.billingPeriod,
                  isFree: !selectedTier.price,
                  ...moneyProps(selectedTier.price),
                });
                router.push(
                  `/community-life/membership/apply?organizationId=${programme.organizationId}&tierId=${selectedTier.tierId}` as never
                );
              }}
            />
          ) : canPay && programme.myMembershipId ? (
            <PrimaryButton
              label="Complete your payment"
              icon="card-outline"
              onPress={() =>
                router.push(
                  `/community-life/membership/manage?membershipId=${programme.myMembershipId}` as never
                )
              }
            />
          ) : programme.myMembershipId ? (
            <SecondaryButton
              label="View your membership"
              onPress={() =>
                router.push(
                  `/community-life/membership/manage?membershipId=${programme.myMembershipId}` as never
                )
              }
            />
          ) : null
        ) : null
      }
    >
      {!programme ? (
        <EmptyState
          icon="card-outline"
          title="No membership programme"
          body="This community does not take members through Diaspora yet."
        />
      ) : (
        <View className="px-5 pt-4">
          {/* Identity */}
          <View className="flex-row items-center mb-4">
            <Image
              source={{ uri: programme.organizationLogo ?? undefined }}
              style={{ width: 56, height: 56, borderRadius: 16 }}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
            <View className="flex-1 ml-3">
              <View className="flex-row items-center">
                <Text
                  style={{ color: tokens.color.text.primary }}
                  className="text-base font-black tracking-tight flex-1"
                >
                  {programme.organizationName}
                </Text>
                {programme.isVerified ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={17}
                    color={tokens.color.info.default}
                    accessibilityLabel="Verified organisation"
                  />
                ) : null}
              </View>
              <Text
                style={{ color: tokens.color.text.placeholder }}
                className="text-[11px] font-bold mt-0.5"
              >
                {programme.category}
                {programme.location ? ` · ${programme.location.areaName}, ${programme.location.cityName}` : ''}
              </Text>
            </View>
          </View>

          {/* Current state, whenever the member has one */}
          {programme.myStatus !== 'NotAMember' && programme.myStatus !== 'Eligible' ? (
            <View className="mb-4">
              <CommunityStatusPanel state={state} />
            </View>
          ) : null}

          {!programme.isOpen ? (
            <View className="mb-4">
              <InlineRefusal
                icon="lock-closed-outline"
                reason="This community has closed applications for now. Follow the organisation to hear when it reopens."
              />
            </View>
          ) : null}

          <Text
            style={{ color: tokens.color.text.secondary }}
            className="text-sm font-semibold leading-relaxed"
          >
            {programme.summary}
          </Text>

          <View className="mt-4">
            <SecondaryButton
              label="About this organisation"
              icon="business-outline"
              onPress={() => router.push(`/community-life/org/${programme.organizationId}` as never)}
            />
          </View>

          {/* Tiers */}
          <Section
            title="Membership options"
            subtitle={
              programme.requiresApproval
                ? 'Applications are reviewed by the organisation'
                : 'You can join straight away'
            }
            style={{ marginHorizontal: -20 }}
          >
            <View className="px-5">
              {programme.tiers.length === 0 ? (
                <EmptyState
                  icon="pricetags-outline"
                  title="No tiers published"
                  body="This community has a membership programme but has not published its tiers yet."
                />
              ) : (
                programme.tiers
                  .slice()
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((tier) => (
                    <View key={tier.tierId} className="mb-3">
                      <MembershipTierCard
                        tier={tier}
                        isSelected={tier.tierId === selectedTierId}
                        onSelect={() => setSelectedTierId(tier.tierId)}
                      />
                    </View>
                  ))
              )}
            </View>
          </Section>

          {/* Requirements for the chosen tier */}
          {selectedTier && selectedTier.requirements.length > 0 ? (
            <Section title="What you need" style={{ marginHorizontal: -20 }}>
              <View className="px-5">
                <Card>
                  {selectedTier.requirements.map((requirement) => (
                    <View
                      key={requirement.id}
                      className="flex-row items-start py-2"
                      accessible
                      accessibilityRole="text"
                      accessibilityLabel={`${requirement.label}. ${requirement.isMet ? 'Complete.' : 'Outstanding.'}`}
                    >
                      <Ionicons
                        name={requirement.isMet ? 'checkmark-circle' : 'alert-circle-outline'}
                        size={16}
                        color={
                          requirement.isMet
                            ? tokens.color.success.default
                            : tokens.color.warning.default
                        }
                        style={{ marginTop: 1 }}
                      />
                      <View className="flex-1 ml-2">
                        <Text
                          style={{ color: tokens.color.text.primary }}
                          className="text-xs font-bold"
                        >
                          {requirement.label}
                        </Text>
                        {requirement.description ? (
                          <Text
                            style={{ color: tokens.color.text.placeholder }}
                            className="text-[11px] font-semibold mt-0.5 leading-relaxed"
                          >
                            {requirement.description}
                          </Text>
                        ) : null}
                        {!requirement.isMet && requirement.actionRoute ? (
                          <Text
                            accessibilityRole="button"
                            accessibilityLabel={`Sort out: ${requirement.label}`}
                            onPress={() => router.push(requirement.actionRoute as never)}
                            style={{ color: tokens.color.primary[500] }}
                            className="text-[11px] font-black uppercase tracking-wider mt-1.5"
                          >
                            Sort this out
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </Card>
              </View>
            </Section>
          ) : null}

          {/* Programme facts */}
          <Section title="Membership details" style={{ marginHorizontal: -20 }}>
            <View className="px-5">
              <Card>
                <DetailRow
                  label="Approval"
                  icon="shield-outline"
                  value={
                    programme.requiresApproval
                      ? 'The organisation reviews each application'
                      : 'Join immediately'
                  }
                />
                <DetailRow
                  label="Members"
                  icon="people-outline"
                  value={programme.memberCount.toLocaleString()}
                />
                <DetailRow
                  label="Visibility"
                  icon="eye-outline"
                  value={
                    programme.visibility === 'Public'
                      ? 'Anyone can find this community'
                      : programme.visibility === 'Unlisted'
                        ? 'Not listed in search'
                        : programme.visibility === 'InviteOnly'
                          ? 'Invitation only'
                          : 'Private'
                  }
                />
                {programme.location ? (
                  <DetailRow
                    label="Where"
                    icon="location-outline"
                    value={`${programme.location.addressLine}, ${programme.location.areaName}, ${programme.location.cityName}`}
                  />
                ) : null}
              </Card>
            </View>
          </Section>

          {!applyRefusal.allowed ? (
            <View className="mt-4">
              <InlineRefusal icon="lock-closed-outline" reason={applyRefusal.message} />
            </View>
          ) : null}
        </View>
      )}
    </CommunityScreen>
  );
}
