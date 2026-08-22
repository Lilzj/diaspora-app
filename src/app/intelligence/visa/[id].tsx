// ─────────────────────────────────────────────────────────────────────────────
// Remediation Wave D-5 — one visa advisory.
//
// The whole rule: who it applies to, what it requires, what to bring, how long
// it takes, and where the authority takes applications.
//
// **`appliesToCountryCode: null` means everybody**, and the banner at the top
// says which of the two this is before anything else on the screen. Getting that
// wrong is how somebody reads "visa-free for 90 days" that was never about them.
//
// **Nothing here submits anything.** Application processing is explicitly out of
// the module's scope — there is no case, no status and no fee on the contract —
// so the only action is opening the authority's own link.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { useLocalSearchParams, router } from 'expo-router';

import { ScreenHeader } from '@/components/ScreenHeader';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useVisaAdvisory } from '@/hooks/country-intelligence';

export default function VisaAdvisoryScreen() {
  const bottomInset = useBottomInset();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { advisory, isLoading, error } = useVisaAdvisory(id);

  if (isLoading) {
    return (
      <SafeAreaView
        edges={['top']}
        className="flex-1 bg-surface-background items-center justify-center"
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Loading entry rules"
      >
        <ActivityIndicator color="#F59300" />
      </SafeAreaView>
    );
  }

  if (!advisory) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background items-center justify-center p-6">
        <Text className="text-4xl mb-3">🛂</Text>
        <Text className="text-base font-black text-content-primary text-center">
          This advisory is not available
        </Text>
        <Text className="text-xs text-content-muted text-center mt-2 leading-relaxed max-w-[280px]">
          {error ?? 'It may have been withdrawn or replaced.'}
        </Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-6 bg-surface-muted px-4 py-2.5 rounded-xl">
          <Text className="text-xs font-black text-content-secondary uppercase">Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title={`Entering ${advisory.countryCode}`} showBack />

      <ScrollEndScrollView className="flex-1" contentContainerStyle={{ paddingBottom: bottomInset }}>
        <View className="p-6">
          {/* Who this is about — first, and unmissable. */}
          <View
            className={`rounded-2xl p-4 mb-5 border ${
              advisory.appliesToCountryCode
                ? 'bg-primary-50 border-primary-100'
                : 'bg-surface-card border-subtle'
            }`}
          >
            <Text className="text-[10px] font-black text-content-faint uppercase tracking-widest mb-1">
              Who these rules apply to
            </Text>
            <Text className="text-sm font-black text-content-primary">
              {advisory.appliesToCountryCode
                ? `Nationals of ${advisory.appliesToCountryCode}`
                : 'Everybody, whatever your nationality'}
            </Text>
          </View>

          <Text className="text-2xl font-black text-content-primary leading-snug mb-2">
            {advisory.title}
          </Text>
          <Text className="text-sm font-semibold text-content-muted leading-relaxed mb-4">
            {advisory.summary}
          </Text>

          <View className="flex-row items-center flex-wrap mb-5">
            <Text className="text-[11px] font-bold text-content-faint mr-2">
              {advisory.authorityName}
            </Text>
            {advisory.isOfficial ? (
              <Text className="text-[10px] font-black text-success-default mr-2">🛡️ OFFICIAL</Text>
            ) : null}
            {!advisory.isActive ? (
              <Text className="text-[10px] font-black text-error-default uppercase">
                Not in force
              </Text>
            ) : null}
          </View>

          {advisory.content ? (
            <Text className="text-sm text-content-secondary leading-relaxed mb-5">
              {advisory.content}
            </Text>
          ) : null}

          {/* Prose in the order an editor put them, not structure. Rendering
              them as a checklist would imply the platform is tracking them. */}
          {advisory.requirements.length > 0 ? (
            <Section title="What you must satisfy">
              {advisory.requirements.map((requirement, index) => (
                <View key={`${index}-${requirement}`} className="flex-row items-start mb-1.5">
                  <Text className="text-xs text-content-faint mr-2">•</Text>
                  <Text className="text-sm text-content-secondary flex-1">{requirement}</Text>
                </View>
              ))}
            </Section>
          ) : null}

          {advisory.documents.length > 0 ? (
            <Section title="What to bring">
              {advisory.documents.map((document, index) => (
                <View key={`${index}-${document}`} className="flex-row items-start mb-1.5">
                  <Text className="text-xs text-content-faint mr-2">•</Text>
                  <Text className="text-sm text-content-secondary flex-1">{document}</Text>
                </View>
              ))}
            </Section>
          ) : null}

          <Section title="Timing and provenance">
            {advisory.processingTime ? (
              <Row label="Processing time" value={advisory.processingTime} />
            ) : null}
            {advisory.effectiveFrom ? (
              <Row
                label="In force from"
                value={new Date(advisory.effectiveFrom).toLocaleDateString()}
              />
            ) : null}
            {advisory.expiresAt ? (
              <Row label="Until" value={new Date(advisory.expiresAt).toLocaleDateString()} />
            ) : null}
            {advisory.lastReviewedAt ? (
              <Row
                label="Last checked against the source"
                value={new Date(advisory.lastReviewedAt).toLocaleDateString()}
              />
            ) : (
              // The ageing signal, and its absence is worth saying: a rule
              // nobody has re-checked is not the same as a rule confirmed today.
              <Text className="text-[11px] text-content-faint font-semibold mt-1">
                Nobody has re-checked this against the authority’s own publication.
              </Text>
            )}
            {advisory.officialReference ? (
              <Row label="Official reference" value={advisory.officialReference} />
            ) : null}
          </Section>

          {advisory.applicationUrl ? (
            <TouchableOpacity
              onPress={() => void Linking.openURL(advisory.applicationUrl as string)}
              accessibilityRole="button"
              className="bg-primary-500 rounded-2xl p-4 mb-3 items-center"
            >
              <Text className="text-xs font-black text-white uppercase tracking-widest">
                Apply on the authority’s site
              </Text>
            </TouchableOpacity>
          ) : null}

          {advisory.sourceUrl ? (
            <TouchableOpacity
              onPress={() => void Linking.openURL(advisory.sourceUrl as string)}
              accessibilityRole="button"
              className="bg-surface-card border border-subtle rounded-2xl p-4 items-center"
            >
              <Text className="text-xs font-black text-content-secondary uppercase tracking-widest">
                Read the original notice
              </Text>
            </TouchableOpacity>
          ) : null}

          {/* Guides that explain how to actually do it. Identifiers only — the
              client resolves them, and here it simply links. */}
          {advisory.relatedGuideIds.length > 0 ? (
            <View className="mt-5">
              <Text className="text-[10px] font-black text-content-faint uppercase tracking-widest mb-2">
                Community guides on this
              </Text>
              {advisory.relatedGuideIds.map((guideId) => (
                <TouchableOpacity
                  key={guideId}
                  onPress={() => router.push(`/guide/${guideId}`)}
                  accessibilityRole="button"
                  className="bg-surface-card border border-faint rounded-2xl p-4 mb-2 flex-row items-center justify-between"
                >
                  <Text className="text-xs font-bold text-content-secondary flex-1 mr-2">
                    Read a member’s guide to this process
                  </Text>
                  <Text className="text-content-faint text-lg">›</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollEndScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="bg-surface-card border border-faint rounded-2xl p-4 mb-4">
      <Text className="text-[10px] font-black text-content-faint uppercase tracking-widest mb-3">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between py-1.5">
      <Text className="text-[11px] font-bold text-content-faint flex-1 mr-3">{label}</Text>
      <Text className="text-xs font-semibold text-content-secondary">{value}</Text>
    </View>
  );
}
