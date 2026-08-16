// ─────────────────────────────────────────────────────────────────────────────
// Diaspora Platform — Country information (Frontend Phase 16, §19 · §20 · §60)
//
// §60's requirement made structural rather than reviewed: **this screen cannot
// render a notice without a country.** There is no "all countries" view, no
// default, and no inference from the member's location. A country is chosen and
// the list follows; before that, the list is a chooser.
//
// That matters more here than the mechanism suggests. Inferring a country from
// a member's location would mean somebody in London browsing Nigerian
// immigration notices had that inferred about them, and §60's closing line
// forbids inferring sensitive identity attributes from location. The chooser is
// the whole of the fix.
//
// ── The disclaimer is above the content, not below it ────────────────────────
//
// §20: "Do not imply that Diaspora itself is the government authority."
// A disclaimer under a list is a disclaimer most people never reach. This one is
// the first thing on the screen, before any notice is drawn.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/design-system';
import { useGovernmentCountries, useGovernmentNotices } from '@/hooks/integrations';
import {
  GovernmentNoticeCard,
  IntegrationGapNotice,
  IntegrationErrorNotice,
  SimulationMarker,
} from '@/components/integrations';
import { trackIntegrationEvent } from '@/lib/integrations/events';
// The country name lookup. `mocks/countries.ts` is a static reference list
// rather than fixture data — `choose-country`, `settings/location` and Phase
// 15's country dashboard all read it in production, and this follows that.
import { allCountries } from '@/mocks/countries';
import { useBottomInset } from '@/components/layout/bottom-inset';

export default function GovernmentIntegrationScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const { tokens } = useTheme();
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const countries = useGovernmentCountries();
  const { notices, isLoading, error, mode } = useGovernmentNotices(countryCode);

  const supported = countries.data ?? [];

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: tokens.color.surface.background }}>
      <ScreenHeader title="Country information" showBack />

      <ScrollEndScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: bottomInset }}>
        {/* §20, first thing on the screen. */}
        <View
          style={{
            backgroundColor: tokens.color.info.surface,
            borderColor: `${tokens.color.info.default}44`,
          }}
          className="rounded-2xl border p-4 mb-4"
          accessible
          accessibilityRole="text"
        >
          <Text
            style={{ color: tokens.color.text.primary }}
            className="text-xs font-semibold leading-relaxed"
          >
            Diaspora is not a government and does not speak for one. Everything here shows who
            published it and when it was last checked. Always confirm anything important with the
            official source before you act on it.
          </Text>
          <View className="mt-2">
            <SimulationMarker mode={mode} />
          </View>
        </View>

        <Heading title="Choose a country" subtitle="Information is shown for one country at a time." />

        {countries.isLoading ? (
          <ActivityIndicator color={tokens.color.primary[500]} />
        ) : supported.length === 0 ? (
          <View className="mb-4">
            <IntegrationGapNotice
              gapKey="governmentNotices"
              detail="No country information source is set up for this deployment. When one is, countries will appear here to choose from."
            />
          </View>
        ) : (
          <View className="flex-row flex-wrap mb-4">
            {supported.map((code) => (
              <CountryChip
                key={code}
                code={code}
                isSelected={code === countryCode}
                onPress={() => {
                  setCountryCode(code);
                  trackIntegrationEvent('government.notices.viewed', { domain: 'government' });
                }}
              />
            ))}
          </View>
        )}

        {countryCode ? (
          <>
            <Heading title={`${countryName(countryCode)}`} />

            {isLoading ? (
              <ActivityIndicator color={tokens.color.primary[500]} />
            ) : error ? (
              // The distinction that matters most on this surface: "we cannot
              // reach the source" and "there are no advisories" are opposite
              // claims, and showing an empty list for the first would be the
              // single most dangerous wrong answer here.
              <IntegrationErrorNotice
                message="Diaspora could not reach the source for this country."
                hint="This does not mean there is nothing to report. Check the official source directly."
              />
            ) : notices.length === 0 ? (
              <Text
                style={{ color: tokens.color.text.secondary }}
                className="text-xs font-semibold leading-relaxed"
              >
                Nothing has been published here for this country.
              </Text>
            ) : (
              notices.map((notice) => <GovernmentNoticeCard key={notice.id} notice={notice} />)
            )}
          </>
        ) : null}
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}

function countryName(code: string): string {
  return allCountries.find((country) => country.code === code)?.name ?? code;
}

function CountryChip({
  code,
  isSelected,
  onPress,
}: {
  code: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  const { tokens } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={countryName(code)}
      style={{
        backgroundColor: isSelected ? tokens.color.primary[500] : 'transparent',
        borderColor: isSelected ? tokens.color.primary[500] : tokens.color.border.default,
      }}
      className="border rounded-full px-3.5 py-2 mr-2 mb-2 active:opacity-70"
    >
      <Text
        style={{ color: isSelected ? '#FFFFFF' : tokens.color.text.primary }}
        className="text-xs font-black"
      >
        {countryName(code)}
      </Text>
    </Pressable>
  );
}

function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
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
      {subtitle ? (
        <Text
          style={{ color: tokens.color.text.secondary }}
          className="text-xs font-semibold leading-relaxed mt-1"
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
