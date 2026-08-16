// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Metric catalogue (Frontend Phase 15, §35 · §63)
//
// Every figure Diaspora reports, with what it counts, how it is worked out, who
// owns it and whether a real contract answers it today.
//
// §63 asks for a centralized documentation artifact so that different dashboards
// cannot interpret the same metric differently. This is that artifact rendered in
// the app, from the same `ANALYTICS_DEFINITIONS` record the metric cards read —
// so the document and the product cannot disagree, because they are the same
// data.
//
// The `status` column is unusual to put in front of a member and is deliberate:
// somebody looking at a development build is entitled to know that "Views" has no
// backend behind it, and burying that in a markdown file nobody opens is how a
// simulated figure ends up quoted in a meeting.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { useTheme } from '@/design-system';
import { allAnalyticsDefinitions } from '@/lib/analytics/definitions';
import { trackAnalyticsEvent } from '@/lib/analytics/events';
import { AnalyticsHeader, AnalyticsSection } from '@/components/analytics';
import type { AnalyticsDefinition } from '@/types/analytics';

const STATUS_COPY: Record<AnalyticsDefinition['status'], { label: string; tone: 'ok' | 'partial' | 'gap' }> =
  {
    CONNECTED: { label: 'Real measurement', tone: 'ok' },
    PARTIAL: { label: 'Partly real', tone: 'partial' },
    DEVELOPMENT_ADAPTER: { label: 'Development data', tone: 'gap' },
    BACKEND_GAP: { label: 'Not measured yet', tone: 'gap' },
  };

export default function AnalyticsDefinitionsScreen() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    trackAnalyticsEvent('analytics.definitions.viewed');
  }, []);

  const definitions = useMemo(() => {
    const all = allAnalyticsDefinitions();
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (entry) =>
        entry.label.toLowerCase().includes(needle) ||
        entry.definition.toLowerCase().includes(needle) ||
        entry.key.toLowerCase().includes(needle)
    );
  }, [query]);

  // Grouped by the domain prefix of the key, so the list reads as an account of
  // what the platform measures rather than as an alphabetical index.
  const groups = useMemo(() => {
    const byDomain = new Map<string, AnalyticsDefinition[]>();
    for (const entry of definitions) {
      const domain = entry.key.split('.')[0];
      byDomain.set(domain, [...(byDomain.get(domain) ?? []), entry]);
    }
    return [...byDomain.entries()];
  }, [definitions]);

  const counts = useMemo(() => {
    const all = allAnalyticsDefinitions();
    return {
      total: all.length,
      connected: all.filter((entry) => entry.status === 'CONNECTED').length,
      partial: all.filter((entry) => entry.status === 'PARTIAL').length,
    };
  }, []);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface.background }}
      edges={['top', 'left', 'right']}
    >
      <AnalyticsHeader title="What the figures mean" subtitle={`${counts.total} definitions`} />

      <View className="px-5 pt-4">
        <View
          style={{
            backgroundColor: tokens.color.surface.card,
            borderColor: tokens.color.border.default,
          }}
          className="flex-row items-center rounded-full border px-3.5 py-2.5"
        >
          <Ionicons name="search" size={16} color={tokens.color.text.placeholder} />
          <TextInput
            accessibilityLabel="Search definitions"
            placeholder="Search figures"
            placeholderTextColor={tokens.color.text.placeholder}
            value={query}
            onChangeText={setQuery}
            style={{ color: tokens.color.text.primary }}
            className="flex-1 ml-2 text-[13px] font-semibold"
          />
          {query.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setQuery('')}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={16} color={tokens.color.text.placeholder} />
            </Pressable>
          ) : null}
        </View>

        <Text
          accessible
          accessibilityRole="text"
          style={{ color: tokens.color.text.placeholder }}
          className="text-[11px] font-semibold mt-3 leading-relaxed"
        >
          {counts.connected + counts.partial} of {counts.total} figures have something real behind
          them today. The rest are what Diaspora would measure once it records the events they
          need — the definitions are the ones a real implementation would have to honour.
        </Text>
      </View>

      <ScrollEndScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
      >
        {groups.map(([domain, entries]) => (
          <AnalyticsSection key={domain} title={domainLabel(domain)}>
            <View
              style={{
                backgroundColor: tokens.color.surface.card,
                borderColor: tokens.color.border.default,
              }}
              className="rounded-2xl border overflow-hidden"
            >
              {entries.map((entry, index) => {
                const isOpen = expanded === entry.key;
                const status = STATUS_COPY[entry.status];

                return (
                  <Pressable
                    key={entry.key}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isOpen }}
                    accessibilityLabel={`${entry.label}. ${status.label}. ${
                      isOpen ? entry.definition : 'Double tap to read the definition.'
                    }`}
                    onPress={() => setExpanded(isOpen ? null : entry.key)}
                    style={{
                      borderTopColor: tokens.color.border.default,
                      borderTopWidth: index === 0 ? 0 : 1,
                    }}
                    className="px-4 py-3.5"
                  >
                    <View className="flex-row items-center">
                      <View className="flex-1 mr-2">
                        <Text
                          style={{ color: tokens.color.text.primary }}
                          className="text-[13px] font-bold"
                        >
                          {entry.label}
                        </Text>
                        <Text
                          style={{
                            color:
                              status.tone === 'ok'
                                ? tokens.color.success.default
                                : status.tone === 'partial'
                                  ? tokens.color.info.default
                                  : tokens.color.warning.default,
                          }}
                          className="text-[9px] font-black uppercase tracking-widest mt-0.5"
                        >
                          {status.label}
                        </Text>
                      </View>
                      <Ionicons
                        name={isOpen ? 'chevron-up' : 'chevron-down'}
                        size={15}
                        color={tokens.color.text.placeholder}
                      />
                    </View>

                    {isOpen ? (
                      <View className="mt-2.5">
                        <Text
                          style={{ color: tokens.color.text.secondary }}
                          className="text-[12px] font-semibold leading-relaxed"
                        >
                          {entry.definition}
                        </Text>

                        {entry.formula ? (
                          <View
                            style={{ backgroundColor: tokens.color.surface.background }}
                            className="rounded-lg px-2.5 py-2 mt-2"
                          >
                            <Text
                              style={{ color: tokens.color.text.placeholder }}
                              className="text-[11px] font-semibold"
                            >
                              {entry.formula}
                            </Text>
                          </View>
                        ) : null}

                        <Text
                          style={{ color: tokens.color.text.disabled }}
                          className="text-[10px] font-semibold mt-2 leading-relaxed"
                        >
                          {entry.freshnessPolicy} · Owned by {entry.owner} ·{' '}
                          {entry.higherIsBetter ? 'Higher is better' : 'Lower is better'}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </AnalyticsSection>
        ))}

        {groups.length === 0 ? (
          <Text
            style={{ color: tokens.color.text.placeholder }}
            className="text-[12px] font-semibold text-center py-10"
          >
            Nothing matches “{query}”.
          </Text>
        ) : null}
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}

function domainLabel(domain: string): string {
  switch (domain) {
    case 'audience':
      return 'Audience and engagement';
    case 'growth':
      return 'Growth';
    case 'retention':
      return 'Retention';
    case 'content':
      return 'Content';
    case 'search':
      return 'Search';
    case 'recommendation':
      return 'Recommendations';
    case 'map':
      return 'Maps';
    case 'reach':
      return 'Reach';
    case 'listing':
      return 'Marketplace';
    case 'job':
      return 'Jobs';
    case 'housing':
      return 'Housing';
    case 'provider':
      return 'Providers';
    case 'event':
      return 'Events';
    case 'organization':
      return 'Organizations';
    case 'conversion':
    case 'funnel':
      return 'Conversion';
    case 'revenue':
    case 'spend':
      return 'Money';
    case 'wallet':
      return 'Wallet';
    case 'rewards':
      return 'Rewards';
    case 'monetization':
      return 'Promotions';
    case 'notification':
      return 'Notifications';
    case 'messaging':
      return 'Messages';
    case 'inventory':
      return 'What exists';
    default:
      return domain;
  }
}
