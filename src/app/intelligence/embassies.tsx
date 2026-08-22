// ─────────────────────────────────────────────────────────────────────────────
// Remediation Wave D-5 — the embassy directory.
//
// **A new screen, not a rewired one.** The brief described embassies as
// rendering from fixtures; they did not render at all. `Diaspora.Modules.Guides`
// has served `GET /api/v1/intelligence/embassies` the whole time and no client
// had ever called it.
//
// ── The design decision this screen exists to express ───────────────────────
//
// `locatedIn` and `serving` are **two different questions and neither defaults
// to the other**. "Missions in the United Kingdom" and "missions serving British
// nationals" are lists with almost no overlap, and a single country filter would
// have answered whichever the last caller had in mind. So the screen asks the
// member which question they are asking, and sends the parameter that matches.
//
// A member abroad almost always wants **"serving"** — their own country's
// mission, wherever they are. A member helping somebody else, or planning a
// trip, wants **"in"**. The toggle defaults to "serving" for that reason.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { ScreenHeader } from '@/components/ScreenHeader';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useEmbassies } from '@/hooks/country-intelligence';
import { useThemeTokens } from '@/design-system';
import type { EmbassyResponse } from '@/types/country-intelligence';

type Lens = 'serving' | 'locatedIn';

export default function EmbassyDirectoryScreen() {
  const tokens = useThemeTokens();
  const bottomInset = useBottomInset();

  // `country` is the code the caller arrived with — from a country page, or a
  // deep link. It means different things under the two lenses, which is exactly
  // why the lens is visible rather than implied.
  const { country } = useLocalSearchParams<{ country?: string }>();

  const [lens, setLens] = useState<Lens>('serving');
  const [text, setText] = useState('');

  const results = useEmbassies({
    // Only ever one of the two, and never both from one control.
    locatedIn: lens === 'locatedIn' ? (country ?? undefined) : undefined,
    serving: lens === 'serving' ? (country ?? undefined) : undefined,
    q: text.trim() || undefined,
  });

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title="Embassies & consulates" showBack />

      <View className="px-6 pt-3 pb-2 bg-surface-card border-b border-faint">
        <View className="flex-row items-center h-11 bg-surface-background border border-subtle rounded-2xl px-4 mb-3">
          <Text className="text-base mr-2 text-content-faint">🔍</Text>
          <TextInput
            placeholder="Search by mission name or city"
            value={text}
            onChangeText={setText}
            className="flex-1 text-xs font-semibold text-content-strong h-full"
            placeholderTextColor={tokens.color.text.placeholder}
            accessibilityLabel="Search the embassy directory"
          />
        </View>

        {country ? (
          <View className="flex-row">
            {/* The two questions, side by side and named. This is the control
                that stops a single `country` filter from silently answering the
                wrong one. */}
            <LensChip
              label={`Serving ${country} nationals`}
              isSelected={lens === 'serving'}
              onPress={() => setLens('serving')}
            />
            <LensChip
              label={`Located in ${country}`}
              isSelected={lens === 'locatedIn'}
              onPress={() => setLens('locatedIn')}
            />
          </View>
        ) : (
          <Text className="text-[11px] text-content-faint font-semibold pb-1">
            Every mission in the directory. Open a country page to narrow it.
          </Text>
        )}
      </View>

      {results.isLoading ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Loading missions"
          className="flex-1 items-center justify-center"
        >
          <ActivityIndicator color="#F59300" />
        </View>
      ) : (
        <FlatList
          data={results.embassies}
          keyExtractor={(item) => item.embassyId}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomInset }}
          onEndReachedThreshold={0.4}
          onEndReached={results.loadMore}
          renderItem={({ item }) => <EmbassyRow embassy={item} />}
          ListFooterComponent={
            results.isFetchingMore ? (
              <View className="py-4 items-center">
                <ActivityIndicator color="#F59300" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View className="items-center justify-center py-16 px-6">
              <Text className="text-4xl mb-2">🏛️</Text>
              <Text className="text-sm font-bold text-content-strong text-center">
                {results.error ? 'The directory is unavailable' : 'No missions listed'}
              </Text>
              <Text className="text-xs text-content-faint text-center mt-1 leading-relaxed max-w-[280px]">
                {results.error ??
                  (lens === 'serving'
                    ? 'No mission in the directory serves that country’s nationals yet.'
                    : 'No mission is listed in that country yet.')}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function LensChip({
  label,
  isSelected,
  onPress,
}: {
  label: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      className={`px-3 py-1.5 rounded-full border mr-2 mb-1 ${
        isSelected ? 'bg-primary-500 border-primary-500' : 'bg-surface-background border-subtle'
      }`}
    >
      <Text
        className={`text-[11px] font-bold ${isSelected ? 'text-white' : 'text-content-tertiary'}`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function EmbassyRow({ embassy }: { embassy: EmbassyResponse }) {
  return (
    <TouchableOpacity
      onPress={() => router.push(`/intelligence/embassy/${embassy.embassyId}`)}
      accessibilityRole="button"
      accessibilityLabel={embassy.name}
      className="bg-surface-card border border-faint rounded-2xl p-4 mb-3"
    >
      <View className="flex-row items-start justify-between mb-1">
        <Text className="text-base font-extrabold text-content-primary flex-1 mr-2" numberOfLines={2}>
          {embassy.name}
        </Text>
        {embassy.isVerified ? (
          <Text className="text-[10px] font-black text-success-default">🛡️ VERIFIED</Text>
        ) : null}
      </View>

      {/* Both codes, always. Neither is derivable from the other and a member
          reading one mission needs to know which question it answers. */}
      <Text className="text-[11px] font-bold text-content-faint mb-2">
        In {embassy.countryCode}
        {embassy.city ? ` · ${embassy.city}` : ''} · Serving {embassy.servesCountryCode}
      </Text>

      {/* The emergency line is rendered as its own row on the detail screen —
          "the single most consequential field this module serves". The card
          flags that there is one. */}
      <View className="flex-row flex-wrap">
        {embassy.emergencyTelephone ? (
          <Badge tone="urgent" label="24h emergency line" />
        ) : null}
        {embassy.offersPassportServices ? <Badge label="Passports" /> : null}
        {embassy.offersVisaServices ? <Badge label="Visas" /> : null}
        {embassy.offersConsularServices ? <Badge label="Consular" /> : null}
        {embassy.requiresAppointment ? <Badge label="By appointment" /> : null}
      </View>
    </TouchableOpacity>
  );
}

function Badge({ label, tone }: { label: string; tone?: 'urgent' }) {
  return (
    <View
      className={`rounded-md px-2 py-0.5 mr-1.5 mb-1 ${
        tone === 'urgent' ? 'bg-[#FEF2F2]' : 'bg-surface-muted'
      }`}
    >
      <Text
        className={`text-[10px] font-bold ${
          tone === 'urgent' ? 'text-error-default' : 'text-content-tertiary'
        }`}
      >
        {label}
      </Text>
    </View>
  );
}
