// ─────────────────────────────────────────────────────────────────────────────
// Organisation picker (§27)
//
// The organizations the *server* says the caller has a role in. Not the
// organizations they follow, and not the ones they are a member of — a role is
// a different thing, and the list comes from `/communities/organizations/me`
// rather than being derived from anything on the device. §19.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import { Card, CommunityScreen, EmptyState, PrimaryButton } from '@/components/community';
import { useMyOrganizations } from '@/hooks/community-life';

export default function OrganizationPickerScreen() {
  const { tokens } = useTheme();
  const { data: organizations, isLoading, isError, error, refetch } = useMyOrganizations();

  if (organizations.length === 1 && !isLoading) {
    // One organization is the common case, and a picker with one row is a tap
    // nobody needs. Redirecting rather than rendering it.
    router.replace(`/community-life/dashboard/${organizations[0].organizationId}` as never);
  }

  return (
    <CommunityScreen
      title="Your organisations"
      isLoading={isLoading}
      error={isError ? error : null}
      onRetry={refetch}
      onRefresh={refetch}
    >
      <View className="px-5 pt-4">
        {organizations.length === 0 && !isLoading ? (
          <EmptyState
            icon="business-outline"
            title="You do not run an organisation"
            body="Organisation dashboards are for the people who run a community — its administrators, organisers and treasurers. If you help run one, ask an administrator to add you."
            action="Register an organisation"
            onAction={() => router.push('/community-life/org/create')}
          />
        ) : (
          organizations.map((organization) => (
            <View key={organization.organizationId} className="mb-2.5">
              <Card
                onPress={() =>
                  router.push(`/community-life/dashboard/${organization.organizationId}` as never)
                }
                accessibilityLabel={`${organization.name}. Your role: ${organization.role}.`}
                accessibilityHint="Opens the dashboard"
              >
                <View className="flex-row items-center">
                  <View
                    style={{ backgroundColor: tokens.color.secondary[50] }}
                    className="w-11 h-11 rounded-xl items-center justify-center"
                  >
                    <Ionicons name="business-outline" size={19} color={tokens.color.secondary[500]} />
                  </View>
                  <View className="flex-1 ml-3">
                    <Text
                      style={{ color: tokens.color.text.primary }}
                      className="text-sm font-black tracking-tight"
                      numberOfLines={1}
                    >
                      {organization.name}
                    </Text>
                    <Text
                      style={{ color: tokens.color.text.placeholder }}
                      className="text-[11px] font-bold mt-0.5"
                    >
                      {organization.role}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={tokens.color.text.placeholder} />
                </View>
              </Card>
            </View>
          ))
        )}

        {organizations.length > 0 ? (
          <View className="mt-6">
            <PrimaryButton
              label="Register another organisation"
              icon="add"
              onPress={() => router.push('/community-life/org/create')}
            />
          </View>
        ) : null}
      </View>
    </CommunityScreen>
  );
}
