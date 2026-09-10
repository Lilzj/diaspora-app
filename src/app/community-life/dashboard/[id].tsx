// ─────────────────────────────────────────────────────────────────────────────
// Organisation dashboard (§27–§32)
//
// §47: **one call on first paint.** `useOrganizationDashboard` returns the
// metrics and the section counts; every deeper dataset is fetched by the screen
// that shows it. The counts are what let a section be skipped rather than
// fetched to discover it is empty — which on an organization that only runs
// events is the difference between one request and nine.
//
// §19: every section is gated by `capabilities`, which is **fetched** and then
// intersected with the platform ladder. The intersection can only remove. A
// Treasurer sees the fundraising section; a Member sees none of it; a Restricted
// Owner can read the dashboard but not act on it.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design-system';
import {
  Card,
  CommunityScreen,
  EmptyState,
  InlineRefusal,
  Section,
  Stat,
} from '@/components/community';
import {
  useOrganizationCapabilities,
  useOrganizationDashboard,
} from '@/hooks/community-life';
import { trackCommunityEvent } from '@/lib/community-analytics';

interface DashboardLink {
  key: string;
  label: string;
  hint: string;
  icon: string;
  route: string;
  badge?: number;
  allowed: boolean;
}

export default function OrganizationDashboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tokens } = useTheme();

  const { dashboard, isLoading, isError, error, refetch } = useOrganizationDashboard(id);
  const { capabilities } = useOrganizationCapabilities(id);

  useEffect(() => {
    if (dashboard) {
      trackCommunityEvent('community.organization_dashboard.viewed', {
        organizationId: dashboard.organizationId,
        state: capabilities.role ?? 'none',
      });
    }
  }, [dashboard?.organizationId, capabilities.role]);

  const counts = dashboard?.counts;

  const links: DashboardLink[] = [
    {
      // **The dashboard had no way out to the organisation's own page.**
      //
      // An owner could manage members, events, campaigns and polls for an
      // organisation still saved as a draft — one nobody else can see — and
      // nothing here said so or offered a route to change it. The first
      // organisation registered on this platform sat in exactly that state.
      //
      // The public page is where the draft banner and the Publish control
      // live, so this is the link that ends that.
      key: 'profile',
      label: 'Public page',
      hint: 'What everybody else sees, and where you publish it',
      icon: 'globe-outline',
      route: `/community-life/org/${id}`,
      // Anybody who can open this dashboard can look at the page it is for.
      allowed: true,
    },
    {
      key: 'members',
      label: 'Members',
      hint: 'Approve, suspend and assign roles',
      icon: 'people-outline',
      route: `/community-life/dashboard/members?organizationId=${id}`,
      badge: counts?.pendingMemberApplications ?? undefined,
      allowed: capabilities.canManageMembers,
    },
    {
      key: 'events',
      label: 'Events',
      hint: 'Series, occurrences and attendees',
      icon: 'calendar-outline',
      route: `/community-life/series?organizationId=${id}`,
      // Null where the dashboard route does not count it — B18's dashboard
      // counts nothing about events, which are B12's. `?? undefined` hides the
      // badge rather than showing a zero that would read as "no events".
      badge: counts?.upcomingEvents ?? undefined,
      allowed: capabilities.canManageEvents,
    },
    {
      key: 'campaigns',
      label: 'Fundraising',
      hint: 'Campaigns, donations and updates',
      icon: 'heart-outline',
      route: `/community-life/campaign?organizationId=${id}`,
      // Both halves are null against B18 — campaigns are B15's aggregate — and
      // adding two absences would produce a confident zero. The badge is hidden
      // unless at least one of them was actually counted.
      badge:
        counts?.activeCampaigns === null && counts?.draftCampaigns === null
          ? undefined
          : (counts?.activeCampaigns ?? 0) + (counts?.draftCampaigns ?? 0),
      allowed: capabilities.canManageCampaigns,
    },
    {
      key: 'volunteers',
      label: 'Volunteers',
      hint: 'Opportunities, applicants and shifts',
      icon: 'hand-left-outline',
      route: `/community-life/volunteer?organizationId=${id}`,
      badge: counts?.pendingVolunteerApplications ?? undefined,
      allowed: capabilities.canManageVolunteers,
    },
    {
      key: 'polls',
      label: 'Polls',
      hint: 'Ask your members something',
      icon: 'bar-chart-outline',
      route: `/community-life/poll?organizationId=${id}`,
      badge: counts?.openPolls ?? undefined,
      allowed: capabilities.canManagePolls,
    },
    {
      key: 'announcements',
      label: 'Announcements',
      hint: 'Tell your members what is happening',
      icon: 'megaphone-outline',
      route: `/community-life/announcements?scope=Organization&scopeId=${id}`,
      badge: counts?.unreadAnnouncements ?? undefined,
      allowed: capabilities.canPublishAnnouncements,
    },
    {
      key: 'analytics',
      label: 'Analytics',
      hint: 'Members, attendance, giving and participation',
      icon: 'analytics-outline',
      route: `/community-life/dashboard/analytics?organizationId=${id}`,
      allowed: capabilities.canViewAnalytics,
    },
    {
      key: 'impact',
      label: 'Impact',
      hint: 'What your community has done',
      icon: 'sparkles-outline',
      route: `/community-life/impact?scope=organization&scopeId=${id}`,
      allowed: true,
    },
  ];

  const permitted = links.filter((link) => link.allowed);

  return (
    <CommunityScreen
      title={dashboard?.organizationName ?? 'Dashboard'}
      subtitle={capabilities.role ? `You are ${capabilities.role}` : undefined}
      gapDetail="Organisation roles, dashboards and analytics are simulated. Diaspora's backend has no membership edge between a person and an organisation, so it cannot yet say who is allowed to approve a member."
      isLoading={isLoading}
      error={isError ? error : null}
      onRetry={refetch}
      onRefresh={refetch}
      headerRight={
        <Ionicons
          name="settings-outline"
          size={22}
          color={tokens.color.text.primary}
          accessibilityRole="button"
          accessibilityLabel="Organisation profile"
          style={{ marginRight: 12 }}
          onPress={() => router.push(`/community-life/org/${id}` as never)}
        />
      }
    >
      {!dashboard ? (
        <EmptyState
          icon="business-outline"
          title="Dashboard not available"
          body="You may not have a role in this organisation."
        />
      ) : (
        <View>
          {/* Overview — the first paint, and only the first paint */}
          <Section title="Overview" subtitle="Updated periodically, not live">
            <View className="px-5 flex-row flex-wrap" style={{ gap: 10 }}>
              {dashboard.metrics.map((metric) => (
                <View key={metric.key} style={{ width: '47%' }}>
                  <Stat
                    label={metric.label}
                    value={metric.value}
                    money={metric.money ?? undefined}
                    icon={metric.icon ?? undefined}
                    showVerified
                  />
                </View>
              ))}
            </View>
          </Section>

          {/* Quick actions, permission-gated */}
          <Section title="Manage">
            <View className="px-5">
              {permitted.length === 0 ? (
                <InlineRefusal
                  icon="lock-closed-outline"
                  reason="Your role in this organisation does not include any management permissions. You can still see the overview above."
                />
              ) : (
                permitted.map((link) => (
                  <View key={link.key} className="mb-2.5">
                    <Card
                      onPress={() => {
                        trackCommunityEvent('community.organization.section.viewed', {
                          organizationId: id as string,
                          section: link.key,
                        });
                        router.push(link.route as never);
                      }}
                      accessibilityLabel={
                        link.badge
                          ? `${link.label}, ${link.badge}. ${link.hint}.`
                          : `${link.label}. ${link.hint}.`
                      }
                      accessibilityHint={`Opens ${link.label.toLowerCase()}`}
                    >
                      <View className="flex-row items-center">
                        <View
                          style={{ backgroundColor: tokens.color.primary[50] }}
                          className="w-10 h-10 rounded-xl items-center justify-center"
                        >
                          <Ionicons
                            name={link.icon as never}
                            size={18}
                            color={tokens.color.primary[600]}
                          />
                        </View>

                        <View className="flex-1 ml-3">
                          <Text
                            style={{ color: tokens.color.text.primary }}
                            className="text-sm font-black tracking-tight"
                          >
                            {link.label}
                          </Text>
                          <Text
                            style={{ color: tokens.color.text.placeholder }}
                            className="text-[11px] font-semibold mt-0.5"
                          >
                            {link.hint}
                          </Text>
                        </View>

                        {link.badge ? (
                          <View
                            style={{ backgroundColor: tokens.color.primary[500] }}
                            className="rounded-full min-w-[22px] h-5.5 px-1.5 items-center justify-center mr-2"
                          >
                            <Text className="text-white text-[10px] font-black">{link.badge}</Text>
                          </View>
                        ) : null}

                        <Ionicons
                          name="chevron-forward"
                          size={16}
                          color={tokens.color.text.placeholder}
                        />
                      </View>
                    </Card>
                  </View>
                ))
              )}
            </View>
          </Section>

          {/* What the counts say, so a member knows the state without tapping */}
          <Section title="At a glance">
            <View className="px-5">
              <Card>
                {/*
                  An em dash where the server did not count it, and a number
                  where it did. A count this route does not compute — events,
                  series and campaigns all belong to other modules — must not be
                  rendered as `0`, because "0 upcoming events" is a statement
                  about the organization and "—" is a statement about the call.
                */}
                {(
                  [
                    ['Members waiting for a decision', counts?.pendingMemberApplications ?? null],
                    ['Active members', counts?.activeMembers ?? null],
                    ['Upcoming events', counts?.upcomingEvents ?? null],
                    ['Active campaigns', counts?.activeCampaigns ?? null],
                    ['Draft campaigns', counts?.draftCampaigns ?? null],
                    ['Open volunteer opportunities', counts?.openOpportunities ?? null],
                    ['Volunteers waiting for a decision', counts?.pendingVolunteerApplications ?? null],
                    ['Open polls', counts?.openPolls ?? null],
                  ] as const
                ).map(([label, count]) => {
                  const value = count === null ? '—' : String(count);
                  return (
                  <View
                    key={label}
                    className="flex-row items-center justify-between py-2"
                    accessible
                    accessibilityRole="text"
                    accessibilityLabel={`${label}: ${value}`}
                  >
                    <Text
                      style={{ color: tokens.color.text.secondary }}
                      className="text-xs font-semibold flex-1 pr-3"
                    >
                      {label}
                    </Text>
                    <Text
                      style={{ color: tokens.color.text.primary }}
                      className="text-sm font-black tracking-tight"
                    >
                      {value}
                    </Text>
                  </View>
                  );
                })}
              </Card>
            </View>
          </Section>

          {!capabilities.canViewFinancials ? (
            <View className="px-5 mt-4">
              <InlineRefusal
                icon="lock-closed-outline"
                reason="Financial figures are limited to Owners and Treasurers. Ask an administrator if you need them."
              />
            </View>
          ) : null}
        </View>
      )}
    </CommunityScreen>
  );
}
