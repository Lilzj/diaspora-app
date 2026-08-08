// ─────────────────────────────────────────────────────────────────────────────
// My memberships (§6)
//
// Every membership the caller holds, in any state — including the expired and
// cancelled ones, because §6 lists them as states the UI must show and because
// "I know I was a member of that" is the most common reason to open this screen.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import {
  CommunityScreen,
  EmptyState,
  MembershipCard,
  PrimaryButton,
  Section,
} from '@/components/community';
import { useMyMemberships } from '@/hooks/community-life';
import { membershipGrantsBenefits } from '@/lib/community-state';

export default function MyMembershipsScreen() {
  const { tokens } = useTheme();
  const { data: memberships, isLoading, isError, error, refetch, isEnabled } = useMyMemberships();

  const groups = useMemo(() => {
    const active = memberships.filter((m) => membershipGrantsBenefits(m.status));
    const pending = memberships.filter(
      (m) =>
        m.status === 'Pending' ||
        m.status === 'Approved' ||
        m.status === 'PaymentPending' ||
        m.status === 'PaymentFailed' ||
        m.status === 'Draft'
    );
    const past = memberships.filter(
      (m) =>
        m.status === 'Expired' ||
        m.status === 'Cancelled' ||
        m.status === 'Rejected' ||
        m.status === 'Suspended'
    );
    return { active, pending, past };
  }, [memberships]);

  const open = (membershipId: string) =>
    router.push(`/community-life/membership/manage?membershipId=${membershipId}` as never);

  return (
    <CommunityScreen
      title="My memberships"
      gapKey="membershipLifecycle"
      isEnabled={isEnabled}
      isLoading={isLoading}
      error={isError ? error : null}
      onRetry={refetch}
      onRefresh={refetch}
    >
      {memberships.length === 0 && !isLoading ? (
        <EmptyState
          icon="card-outline"
          title="No memberships yet"
          body="Associations, churches, professional networks and neighbourhood groups all take members through Diaspora."
          action="Find a community"
          onAction={() => router.push('/community-life/membership')}
        />
      ) : (
        <>
          {groups.active.length > 0 ? (
            <Section title="Active" subtitle="Your benefits are live">
              <View className="px-5">
                {groups.active.map((membership) => (
                  <View key={membership.membershipId} className="mb-2.5">
                    <MembershipCard membership={membership} onPress={() => open(membership.membershipId)} />
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          {groups.pending.length > 0 ? (
            <Section title="In progress" subtitle="Waiting on a decision or a payment">
              <View className="px-5">
                {groups.pending.map((membership) => (
                  <View key={membership.membershipId} className="mb-2.5">
                    <MembershipCard membership={membership} onPress={() => open(membership.membershipId)} />
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          {groups.past.length > 0 ? (
            <Section title="Past">
              <View className="px-5">
                {groups.past.map((membership) => (
                  <View key={membership.membershipId} className="mb-2.5">
                    <MembershipCard membership={membership} onPress={() => open(membership.membershipId)} />
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          <View className="px-5 mt-8">
            <PrimaryButton
              label="Find another community"
              icon="search-outline"
              onPress={() => router.push('/community-life/membership')}
            />
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[11px] font-semibold text-center mt-3 leading-relaxed"
            >
              Membership payments and receipts live in your Diaspora wallet, alongside everything
              else you have paid for.
            </Text>
          </View>
        </>
      )}
    </CommunityScreen>
  );
}
