// ─────────────────────────────────────────────────────────────────────────────
// Remediation Wave D-5 — one diplomatic mission.
//
// **`emergencyTelephone` is its own control, at the top, and that is the
// contract's own instruction:** "Somebody who needs it is not going to read a
// paragraph to find it, and a client renders it as its own control for exactly
// that reason. It is the single most consequential field this module serves."
//
// Everything on this screen is a `Linking` call the OS handles — a dial, a mail,
// a browser. Nothing is written back: there is no member-facing write on the
// embassy resource, and every editorial route on it sits behind
// `IntelligencePolicies.ManageDirectory`, which is staff-only.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';

import { ScreenHeader } from '@/components/ScreenHeader';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useEmbassy } from '@/hooks/country-intelligence';
import { PLATFORM_ATTRIBUTION } from '@/components/intelligence/PostedBy';
import { useMediaAsset } from '@/hooks/media';
import { backOr } from '@/lib/navigation';

export default function EmbassyDetailScreen() {
  const bottomInset = useBottomInset();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { embassy, isLoading, error } = useEmbassy(id);
  // `mediaId` is a Media reference, never a URL (ADR-005).
  const photo = useMediaAsset(embassy?.mediaId ?? null);

  if (isLoading) {
    return (
      <SafeAreaView
        edges={['top']}
        className="flex-1 bg-surface-background items-center justify-center"
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Loading mission"
      >
        <ActivityIndicator color="#F59300" />
      </SafeAreaView>
    );
  }

  if (!embassy) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-background items-center justify-center p-6">
        <Text className="text-4xl mb-3">🏛️</Text>
        <Text className="text-base font-black text-content-primary text-center">
          This mission is not available
        </Text>
        <Text className="text-xs text-content-muted text-center mt-2 leading-relaxed max-w-[280px]">
          {error ?? 'It may have been removed from the directory.'}
        </Text>
        <TouchableOpacity onPress={() => backOr()} className="mt-6 bg-surface-muted px-4 py-2.5 rounded-xl">
          <Text className="text-xs font-black text-content-secondary uppercase">Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader title={embassy.name} showBack />

      <ScrollEndScrollView className="flex-1" contentContainerStyle={{ paddingBottom: bottomInset }}>
        {photo.url ? (
          <Image
            source={{ uri: photo.url }}
            style={{ width: '100%', height: 180 }}
            contentFit="cover"
            transition={200}
          />
        ) : null}

        <View className="p-6">
          {/* ── The emergency line, first ─────────────────────────────────── */}
          {embassy.emergencyTelephone ? (
            <TouchableOpacity
              onPress={() => void Linking.openURL(`tel:${embassy.emergencyTelephone}`)}
              accessibilityRole="button"
              accessibilityLabel={`Call the emergency line, ${embassy.emergencyTelephone}`}
              className="bg-[#FEF2F2] border border-[#FECACA] rounded-2xl p-4 mb-5 flex-row items-center justify-between"
            >
              <View className="flex-1 mr-3">
                <Text className="text-[10px] font-black text-error-default uppercase tracking-widest mb-1">
                  Emergency line · out of hours
                </Text>
                <Text className="text-lg font-black text-content-primary">
                  {embassy.emergencyTelephone}
                </Text>
              </View>
              <Text className="text-2xl">📞</Text>
            </TouchableOpacity>
          ) : null}

          {/* Every mission is recorded by a Diaspora platform admin (decided
              7 Oct 2026). Members are told who wrote this, not left to assume
              the mission did. */}
          <Text className="text-[11px] font-bold text-content-faint mb-1">
            {PLATFORM_ATTRIBUTION}
          </Text>
          <View className="flex-row items-center flex-wrap mb-4">
            <Text className="text-[11px] font-bold text-content-faint">
              In {embassy.countryCode}
              {embassy.city ? ` · ${embassy.city}` : ''} · Serving {embassy.servesCountryCode}
            </Text>
            {embassy.isVerified ? (
              <Text className="text-[10px] font-black text-success-default ml-2">🛡️ VERIFIED</Text>
            ) : null}
          </View>

          {embassy.description ? (
            <Text className="text-sm text-content-secondary leading-relaxed mb-5">
              {embassy.description}
            </Text>
          ) : null}

          {/* ── Contact ──────────────────────────────────────────────────── */}
          <Section title="Contact">
            {embassy.address ? <Row label="Address" value={embassy.address} /> : null}
            {embassy.telephone ? (
              <ActionRow
                label="Telephone"
                value={embassy.telephone}
                onPress={() => void Linking.openURL(`tel:${embassy.telephone}`)}
              />
            ) : null}
            {embassy.email ? (
              <ActionRow
                label="Email"
                value={embassy.email}
                onPress={() => void Linking.openURL(`mailto:${embassy.email}`)}
              />
            ) : null}
            {embassy.website ? (
              <ActionRow
                label="Website"
                value={embassy.website}
                onPress={() => void Linking.openURL(embassy.website as string)}
              />
            ) : null}
            {embassy.appointmentUrl ? (
              <ActionRow
                label="Book an appointment"
                value={embassy.appointmentUrl}
                onPress={() => void Linking.openURL(embassy.appointmentUrl as string)}
              />
            ) : null}
            {embassy.requiresAppointment ? (
              <Text className="text-[11px] font-bold text-content-muted mt-2">
                This mission sees people by appointment only.
              </Text>
            ) : null}
          </Section>

          {/* ── Opening hours ────────────────────────────────────────────── */}
          {embassy.officeHours.length > 0 ? (
            <Section title="Opening hours">
              {embassy.officeHours.map((day) => (
                <View key={day.day} className="flex-row justify-between py-1.5">
                  <Text className="text-xs font-bold text-content-secondary">{day.day}</Text>
                  {/* `isClosed` is the one structured part, because it is the
                      one thing a client renders as a state rather than as a
                      sentence. The hours themselves are free text because real
                      missions publish sentences. */}
                  <Text
                    className={`text-xs font-semibold ${
                      day.isClosed ? 'text-error-default' : 'text-content-tertiary'
                    }`}
                  >
                    {day.isClosed ? 'Closed' : (day.hours ?? '—')}
                  </Text>
                </View>
              ))}
            </Section>
          ) : null}

          {/* ── Services ─────────────────────────────────────────────────── */}
          <Section title="Services">
            <View className="flex-row flex-wrap mb-2">
              {embassy.offersPassportServices ? <Chip label="Passports" /> : null}
              {embassy.offersVisaServices ? <Chip label="Visas" /> : null}
              {embassy.offersConsularServices ? <Chip label="Consular services" /> : null}
              {embassy.offersEmergencyAssistance ? <Chip label="Emergency assistance" /> : null}
            </View>

            {embassy.services.map((service) => (
              <View key={service.key} className="border-t border-faint pt-2 mt-2">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-bold text-content-secondary flex-1 mr-2">
                    {service.name}
                  </Text>
                  {/* Per service, because a mission that takes walk-ins for one
                      and not another is normal. */}
                  {service.requiresAppointment ? (
                    <Text className="text-[10px] font-black text-content-muted uppercase">
                      Appointment
                    </Text>
                  ) : null}
                </View>
                {service.description ? (
                  <Text className="text-[11px] text-content-muted mt-1">{service.description}</Text>
                ) : null}
              </View>
            ))}
          </Section>

          <TouchableOpacity
            onPress={() =>
              router.push(`/intelligence/visas?country=${embassy.countryCode}`)
            }
            className="bg-surface-card border border-subtle rounded-2xl p-4 flex-row items-center justify-between"
            accessibilityRole="button"
          >
            <Text className="text-xs font-black text-content-secondary">
              Entry rules for {embassy.countryCode}
            </Text>
            <Text className="text-content-faint text-lg">›</Text>
          </TouchableOpacity>
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
    <View className="py-1.5">
      <Text className="text-[10px] font-bold text-content-faint uppercase">{label}</Text>
      <Text className="text-xs text-content-secondary mt-0.5">{value}</Text>
    </View>
  );
}

function ActionRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} className="py-1.5">
      <Text className="text-[10px] font-bold text-content-faint uppercase">{label}</Text>
      <Text className="text-xs font-bold text-primary-500 mt-0.5" numberOfLines={1}>
        {value}
      </Text>
    </TouchableOpacity>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <View className="bg-surface-muted rounded-md px-2 py-1 mr-1.5 mb-1.5">
      <Text className="text-[10px] font-bold text-content-tertiary">{label}</Text>
    </View>
  );
}
