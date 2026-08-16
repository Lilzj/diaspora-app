// ─────────────────────────────────────────────────────────────────────────────
// Timeline — §8, §9
//
// ── There is no organisation activity feed, and this does not pretend there is ─
//
// §8 says to use the existing activity model where available and to give a
// proper empty state rather than invent activity where there is none. There is
// no `/organizations/{id}/activity` contract and nothing that answers one.
//
// What there is: announcements with a `publishedAt`, event series with a
// `createdAt` and a next occurrence, and members with a `joinedAt`. Three real
// timestamped facts about this organisation, from three endpoints this sheet
// already calls for its other tabs.
//
// So the timeline is **derived**, and says so. Every row traces to a record
// that exists; none of it is fabricated; and the note at the bottom names what
// a first-class feed would add that this cannot — moderation actions, settings
// changes, role changes, and anything that happened to a record that has since
// been deleted.
//
// The alternative — a plausible-looking hard-coded feed — is what was here
// before: "🎉 Created Annual Gala Event · Published by Joshua · 2 hours ago",
// identical for every organisation, true of none of them.
//
// ── Cost ─────────────────────────────────────────────────────────────────────
//
// Nothing extra is fetched. All three queries are the ones Posts, Events and
// Members use, under the same keys, so opening Timeline first warms them and
// opening it after them is free.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { Text, View } from 'react-native';

import { Card, EmptyState, readableDate } from '@/components/community';
import { useTheme } from '@/design-system';
import { useAnnouncements, useOrganizationMembers, useSeriesList } from '@/hooks/community-life';

import { TabError, TabHeading, TabLoading, TabUnavailable } from './OrganizationTabShared';

type ActivityKind = 'post' | 'event' | 'member';

interface ActivityRow {
  id: string;
  kind: ActivityKind;
  icon: string;
  title: string;
  detail: string;
  at: string;
  route?: string;
}

const KIND_LABEL: Record<ActivityKind, string> = {
  post: 'Posted',
  event: 'Event',
  member: 'Joined',
};

interface TimelineTabProps {
  organizationId: string;
  organizationName: string;
  onOpenRoute: (route: string) => void;
}

export function TimelineTab({ organizationId, organizationName, onOpenRoute }: TimelineTabProps) {
  const { tokens } = useTheme();

  const posts = useAnnouncements({ scope: 'Organization', scopeId: organizationId });
  const events = useSeriesList({ organizationId });
  const members = useOrganizationMembers(organizationId);

  const isLoading = posts.isLoading || events.isLoading || members.isLoading;
  const isEnabled = posts.isEnabled || events.isEnabled || members.isEnabled;

  // One failing source should not blank the tab — a timeline missing its events
  // is still a timeline. Only a total failure is an error state.
  const allFailed = posts.isError && events.isError && members.isError;

  const rows = useMemo<ActivityRow[]>(() => {
    const collected: ActivityRow[] = [];

    for (const post of posts.announcements) {
      collected.push({
        id: `post-${post.announcementId}`,
        kind: 'post',
        icon: '📣',
        title: post.title,
        detail: `Published by ${post.authorName}`,
        at: post.publishedAt,
        route: post.actionRoute ?? undefined,
      });
    }

    for (const series of events.series) {
      const next = series.nextOccurrence;
      collected.push({
        id: `event-${series.seriesId}`,
        kind: 'event',
        icon: '📅',
        title: series.title,
        detail: next
          ? `Next on ${readableDate(next.date)} at ${next.time} · ${series.occurrenceCount} in the series`
          : `${series.occurrenceCount} in the series · nothing scheduled`,
        at: next?.date ?? '',
        route: `/community-life/series/${series.seriesId}`,
      });
    }

    for (const member of members.members) {
      if (!member.joinedAt) continue;
      collected.push({
        id: `member-${member.membershipId}`,
        kind: 'member',
        icon: '👋',
        title: member.displayName,
        detail: `Joined as ${member.role}`,
        at: member.joinedAt,
      });
    }

    // Newest first. Rows with no usable timestamp sort last rather than being
    // dropped — a series with nothing scheduled is still worth seeing.
    return collected
      .sort((a, b) => {
        if (!a.at) return 1;
        if (!b.at) return -1;
        return b.at.localeCompare(a.at);
      })
      .slice(0, 25);
  }, [posts.announcements, events.series, members.members]);

  if (!isEnabled) return <TabUnavailable label="Activity" />;
  if (isLoading) return <TabLoading label="activity" />;

  if (allFailed) {
    return (
      <TabError
        label="Activity"
        kind={posts.error?.kind ?? events.error?.kind}
        subject="seeing what it has been doing"
        onRetry={() => {
          void posts.refetch();
          void events.refetch();
          void members.refetch();
        }}
      />
    );
  }

  return (
    <View>
      <TabHeading title="Recent activity" count={rows.length} />

      {rows.length === 0 ? (
        <EmptyState
          icon="pulse-outline"
          title="No activity yet"
          body={`Posts, events and people joining ${organizationName} will appear here as they happen.`}
        />
      ) : null}

      {rows.map((row) => (
        <Card
          key={row.id}
          onPress={row.route ? () => onOpenRoute(row.route as string) : undefined}
          accessibilityLabel={`${KIND_LABEL[row.kind]}. ${row.title}. ${row.detail}.${
            row.at ? ` ${readableDate(row.at)}.` : ''
          }`}
          style={{ marginBottom: 8 }}
        >
          <View className="flex-row items-start">
            <View
              style={{
                backgroundColor: tokens.color.primary[50],
                borderColor: tokens.color.primary[500],
              }}
              className="w-8 h-8 rounded-full border items-center justify-center mr-3"
            >
              <Text className="text-[13px]">{row.icon}</Text>
            </View>

            <View className="flex-1">
              <Text
                style={{ color: tokens.color.text.primary }}
                className="text-[11.5px] font-black"
                numberOfLines={2}
              >
                {row.title}
              </Text>
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-[9.5px] font-semibold mt-0.5"
                numberOfLines={1}
              >
                {row.detail}
                {row.at ? ` · ${readableDate(row.at)}` : ''}
              </Text>
            </View>
          </View>
        </Card>
      ))}

      <Text
        style={{ color: tokens.color.text.placeholder }}
        className="text-[10px] font-medium leading-relaxed mt-2 px-1"
      >
        This is assembled from posts, events and membership rather than fetched as an activity
        feed — the organisation service does not expose one. Role changes, moderation and settings
        updates are therefore not shown.
      </Text>
    </View>
  );
}
