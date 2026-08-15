// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Integration Connection Centre (Frontend Phase 16, §5 · §50)
//
// The central integration management experience §5 asks for, at
// `/settings/integrations`.
//
// ── Why every integration is listed, including the ones that do nothing ──────
//
// The obvious design lists only the integrations a member can connect. It is
// wrong for the same reason the domain model separates the catalogue from the
// connection: an integration missing from the list is indistinguishable from an
// integration Diaspora does not support. A member wondering "can I use Google
// Calendar?" needs an answer, and the answer today is "yes, and not yet" —
// which is a row, not an absence.
//
// So the list is the whole catalogue, grouped, each row in its own honest
// state. The ones that need nothing from the member — maps, payments, SMS —
// are grouped separately under a heading that says so, so the list does not
// read as nine things to configure.
//
// ── The two counts at the top ────────────────────────────────────────────────
//
// "Connected" and "needs attention" rather than a single progress figure. A
// progress bar implies a target, and there is no number of connected
// integrations a member is supposed to reach — connecting none is a legitimate
// way to use this application.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import { useIntegrations } from '@/hooks/integrations';
import { IntegrationRow, IntegrationErrorNotice } from '@/components/integrations';
import { isActionable, isUsable } from '@/lib/integrations/status';
import { trackIntegrationEvent } from '@/lib/integrations/events';
import { getIntegrationProviderStatus } from '@/lib/integrations/registry';
import type { IntegrationListItem } from '@/types/integrations';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function IntegrationsScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { tokens } = useTheme();
  const { items, isLoading, error, refetch } = useIntegrations();

  useEffect(() => {
    trackIntegrationEvent('integration.hub.viewed', {
      itemCount: items.length,
    });
    // Deliberately once per mount rather than on every change to `items`: the
    // list re-resolves whenever connectivity flips, and an event per flip would
    // make "how many people opened this screen" uncountable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { connectable, platform, connectedCount, attentionCount } = useMemo(() => {
    const connectableItems = items.filter((item) => item.descriptor.isMemberConnectable);
    const platformItems = items.filter((item) => !item.descriptor.isMemberConnectable);

    return {
      connectable: connectableItems,
      platform: platformItems,
      connectedCount: items.filter((item) => isUsable(item.connection.status)).length,
      // Only the ones a member can actually do something about. Counting a
      // backend gap as "needs attention" would put a number on the screen that
      // no member action can reduce.
      attentionCount: items.filter(
        (item) =>
          isActionable(item.connection.status) &&
          item.connection.status !== 'NOT_CONNECTED' &&
          item.descriptor.isMemberConnectable
      ).length,
    };
  }, [items]);

  const providerStatus = getIntegrationProviderStatus();

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: tokens.color.surface.background }}>
      <ScreenHeader title="Integrations" showBack />

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: bottomInset }}>
        {isLoading ? (
          <View className="py-12 items-center">
            <ActivityIndicator color={tokens.color.primary[500]} />
          </View>
        ) : (
          <>
            {error ? (
              <View className="mb-4">
                <IntegrationErrorNotice message={error.message} hint={error.hint} />
              </View>
            ) : null}

            <Summary connected={connectedCount} attention={attentionCount} />

            <SectionHeading
              title="Things you can connect"
              subtitle="Accounts and services you choose to link."
            />
            {connectable.map((item) => (
              <IntegrationRow
                key={item.descriptor.provider}
                item={item}
                onPress={() => openDetail(item)}
              />
            ))}

            <SectionHeading
              title="Built in"
              subtitle="These work as part of Diaspora. There is nothing to connect."
            />
            {platform.map((item) => (
              <IntegrationRow
                key={item.descriptor.provider}
                item={item}
                onPress={() => openDetail(item)}
              />
            ))}

            {/* §67's diagnostics, deliberately at the bottom and deliberately
                credential-free — `getIntegrationProviderStatus` promises to
                carry no client id, no prefix and no URL, so this line is safe to
                screenshot into a bug report. */}
            <Text
              style={{ color: tokens.color.text.placeholder }}
              className="text-[10px] font-bold mt-6 text-center"
              selectable
            >
              {providerStatus.environment} · push:{providerStatus.push.transport} ·{' '}
              {providerStatus.simulationEnabled ? 'simulation on' : 'simulation off'}
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Where a row leads.
 *
 * Each domain has its own screen because §50 warns against one enormous
 * settings screen and because the surfaces genuinely differ — a calendar needs
 * a picker and a conflict rule, notifications need a category list, government
 * needs a country. A single parameterised detail screen would be a switch
 * statement pretending to be a route.
 */
function openDetail(item: IntegrationListItem): void {
  const routes: Record<string, string> = {
    calendar: '/settings/integrations/calendar',
    push: '/settings/integrations/push',
    identity: '/settings/integrations/identity',
    email: '/settings/integrations/email',
    sms: '/settings/integrations/identity',
    government: '/settings/integrations/government',
    payments: '/settings/integrations/payments',
    maps: '/settings/integrations/maps',
  };

  const route = routes[item.descriptor.domain];
  if (route) router.push(route as never);
}

function Summary({ connected, attention }: { connected: number; attention: number }) {
  const { tokens } = useTheme();

  return (
    <View className="flex-row mb-6">
      <View
        style={{ borderColor: tokens.color.border.default }}
        className="flex-1 border rounded-2xl p-3.5 mr-2"
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${connected} ${connected === 1 ? 'integration' : 'integrations'} working`}
      >
        <Text style={{ color: tokens.color.text.primary }} className="text-2xl font-black">
          {connected}
        </Text>
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[10px] font-black uppercase tracking-widest mt-0.5"
        >
          Working
        </Text>
      </View>

      <View
        style={{
          borderColor:
            attention > 0 ? `${tokens.color.warning.default}44` : tokens.color.border.default,
        }}
        className="flex-1 border rounded-2xl p-3.5 ml-2"
        accessible
        accessibilityRole="text"
        accessibilityLabel={
          attention === 0
            ? 'Nothing needs your attention'
            : `${attention} ${attention === 1 ? 'integration needs' : 'integrations need'} your attention`
        }
      >
        <Text
          style={{
            color: attention > 0 ? tokens.color.warning.default : tokens.color.text.primary,
          }}
          className="text-2xl font-black"
        >
          {attention}
        </Text>
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-[10px] font-black uppercase tracking-widest mt-0.5"
        >
          Need attention
        </Text>
      </View>
    </View>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  const { tokens } = useTheme();

  return (
    <View className="mb-2.5 mt-2">
      <Text
        style={{ color: tokens.color.text.primary }}
        className="text-xs font-black uppercase tracking-widest"
        accessibilityRole="header"
      >
        {title}
      </Text>
      <Text
        style={{ color: tokens.color.text.secondary }}
        className="text-xs font-semibold leading-relaxed mt-0.5"
      >
        {subtitle}
      </Text>
    </View>
  );
}
