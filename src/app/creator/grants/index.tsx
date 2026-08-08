// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Community grants (Frontend Phase 7, §24 · §25)
//
// Two tabs: what is open, and what you have applied for. §25 asks for both on
// one surface, and they genuinely belong together — a member checking whether
// their application moved is the same member deciding whether to apply for
// something else.
//
// No decision logic anywhere. Eligibility arrives resolved on each grant, the
// application states are served, and submitting is refused server-side when it
// should be. §24: "Do not implement grant decision logic in frontend."
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/design-system';
import { useAuthStore } from '@/store/auth';
import {
  CreatorCardSkeleton,
  CreatorEmptyState,
  CreatorScreen,
  CreatorSection,
  GrantApplicationCard,
  GrantCard,
} from '@/components/creator-economy';
import {
  useCommunityGrants,
  useCreatorAccess,
  useGrantApplications,
} from '@/hooks/creator-economy';
import { checkCreatorAccess, CreatorCapabilities } from '@/lib/creator-access';
import { trackCreatorEvent } from '@/lib/creator-analytics';
import type { CommunityGrant, GrantApplication } from '@/types/creator-economy';

type Tab = 'open' | 'mine';

export default function CommunityGrantsScreen() {
  const { tokens } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountState = useAuthStore((state) => state.user?.accountState);

  const [tab, setTab] = useState<Tab>('open');
  const [category, setCategory] = useState<string>('all');
  const [isRefreshing, setRefreshing] = useState(false);

  const grants = useCommunityGrants({ category: category === 'all' ? undefined : category });
  const applications = useGrantApplications();
  const access = useCreatorAccess();

  useEffect(() => {
    trackCreatorEvent('creator.grants.viewed');
  }, []);

  const refusal = checkCreatorAccess(CreatorCapabilities.ViewDashboard, {
    accountState,
    isAuthenticated,
    creatorStatus: access.creatorStatus,
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const grant of grants.grants) set.add(grant.category);
    return ['all', ...Array.from(set)];
  }, [grants.grants]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([grants.refetch(), applications.refetch()]);
    setRefreshing(false);
  }, [applications, grants]);

  const openGrant = useCallback((grant: CommunityGrant) => {
    trackCreatorEvent('creator.grant.viewed', { grantId: grant.grantId, category: grant.category });
    router.push(`/creator/grants/${grant.grantId}` as never);
  }, []);

  const openApplication = useCallback((application: GrantApplication) => {
    router.push(`/creator/grants/${application.grantId}` as never);
  }, []);

  const needsResponse = useMemo(
    () =>
      applications.applications.filter(
        (application) => application.state === 'MoreInformationRequested'
      ),
    [applications.applications]
  );

  return (
    <CreatorScreen
      title="Community grants"
      subtitle="Funding for work that helps the community"
      gapKey="grants"
      isEnabled={grants.isEnabled}
      refusal={refusal}
      error={grants.error}
      onRetry={grants.refetch}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
      sticky={
        <View
          style={{
            backgroundColor: tokens.color.surface.card,
            borderBottomColor: tokens.color.border.default,
          }}
          className="border-b px-5 py-3"
        >
          <View
            style={{ backgroundColor: tokens.color.surface.background }}
            className="flex-row rounded-2xl p-1"
            accessibilityRole="tablist"
          >
            {(
              [
                { key: 'open', label: 'Open' },
                {
                  key: 'mine',
                  label: applications.applications.length
                    ? `Mine (${applications.applications.length})`
                    : 'Mine',
                },
              ] as { key: Tab; label: string }[]
            ).map((item) => {
              const isActive = tab === item.key;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={
                    item.key === 'open' ? 'Open grants' : 'Your grant applications'
                  }
                  onPress={() => setTab(item.key)}
                  style={{ backgroundColor: isActive ? tokens.color.primary[500] : 'transparent' }}
                  className="flex-1 rounded-xl py-2.5 items-center"
                >
                  <Text
                    style={{ color: isActive ? '#FFFFFF' : tokens.color.text.secondary }}
                    className="text-[11px] font-black"
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      }
    >
      <View className="px-5 pt-5">
        {/* Something needs a response. Shown on both tabs — a deadline that is
            only visible on the tab somebody is not looking at is a deadline
            they will miss. */}
        {needsResponse.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${needsResponse.length} ${needsResponse.length === 1 ? 'application needs' : 'applications need'} more information from you.`}
            onPress={() => setTab('mine')}
            style={{ backgroundColor: tokens.color.warning.surface }}
            className="rounded-2xl p-4 mb-5"
          >
            <Text
              style={{ color: tokens.color.warning.default }}
              className="text-[13px] font-black"
            >
              ⏳ {needsResponse.length}{' '}
              {needsResponse.length === 1 ? 'application needs' : 'applications need'} something
              from you
            </Text>
            <Text
              style={{ color: tokens.color.text.primary }}
              className="text-[11px] font-semibold mt-1 leading-relaxed"
            >
              A reviewer has asked a question. Tap to see what they need.
            </Text>
          </Pressable>
        ) : null}

        {tab === 'open' ? (
          <>
            {categories.length > 2 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingRight: 16, paddingBottom: 14 }}
              >
                {categories.map((item) => {
                  const isActive = category === item;
                  return (
                    <Pressable
                      key={item}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={item === 'all' ? 'All categories' : `${item} grants`}
                      onPress={() => setCategory(item)}
                      style={{
                        backgroundColor: isActive
                          ? tokens.color.primary[500]
                          : tokens.color.surface.card,
                        borderColor: isActive
                          ? tokens.color.primary[500]
                          : tokens.color.border.default,
                      }}
                      className="rounded-full border px-3.5 py-2 mr-2"
                    >
                      <Text
                        style={{ color: isActive ? '#FFFFFF' : tokens.color.text.secondary }}
                        className="text-[11px] font-black"
                      >
                        {item === 'all' ? 'All' : item}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            {grants.isLoading ? (
              <CreatorCardSkeleton rows={3} />
            ) : grants.grants.length === 0 ? (
              <CreatorEmptyState
                icon="cash-outline"
                title="No grants open"
                body={
                  category === 'all'
                    ? 'Diaspora opens grant rounds through the year. Check back, or turn on notifications.'
                    : 'Nothing open in this category.'
                }
                actionLabel={category === 'all' ? undefined : 'Show all'}
                onAction={category === 'all' ? undefined : () => setCategory('all')}
              />
            ) : (
              grants.grants.map((grant) => (
                <GrantCard key={grant.grantId} grant={grant} onPress={openGrant} />
              ))
            )}
          </>
        ) : null}

        {tab === 'mine' ? (
          applications.isLoading ? (
            <CreatorCardSkeleton rows={2} />
          ) : applications.applications.length === 0 ? (
            <CreatorEmptyState
              icon="document-text-outline"
              title="No applications yet"
              body="Grants you apply for will be listed here with where each one has got to."
              actionLabel="See what is open"
              onAction={() => setTab('open')}
            />
          ) : (
            <CreatorSection title="Your applications">
              {applications.applications.map((application) => (
                <GrantApplicationCard
                  key={application.applicationId}
                  application={application}
                  onPress={openApplication}
                />
              ))}
            </CreatorSection>
          )
        ) : null}

        <Text
          style={{ color: tokens.color.text.disabled }}
          className="text-[10px] font-semibold text-center mt-2 mb-4 leading-relaxed"
        >
          A panel at Diaspora decides every grant. Nothing about eligibility or a decision is worked
          out on your phone.
        </Text>
      </View>
    </CreatorScreen>
  );
}
