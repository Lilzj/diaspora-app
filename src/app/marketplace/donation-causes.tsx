import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Linking, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollEndScrollView } from '@/components/ScrollEndNavigationMenu';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ConversationHub } from '@/lib/conversation-hub';

// B15 — `GET /donations/causes` replaces this screen's `MOCK_CAUSES`.
import { useDonationCauses } from '@/hooks/financial';
import { FinancialErrorInline } from '@/components/financial';
import { useLocationStore } from '@/store/location';
import type { DonationCause } from '@/types/financial';
import type { FinancialError } from '@/lib/financial-errors';
import { useThemeTokens } from '@/design-system';

const SUPPORT_TYPES = ['Monetary', 'Goods / Items', 'Volunteer Service', 'Professional Skills', 'Food & Supplies'];

/**
 * B15 serves this screen now.
 *
 * The backend's own alignment report put it plainly: *"GET /donations/causes
 * replaces MOCK_CAUSES. The mock's shape was the specification, so the swap is
 * a data-source change rather than a redesign."* Every field this screen
 * renders has a counterpart on `DonationCauseResponse`, because the backend
 * took them from here.
 *
 * The one field with no backend counterpart is `icon`. B15 serves a
 * `mediaReference` — a Media handle, never a URL — and an emoji is a display
 * decision the platform correctly refused to make. It is derived from the
 * urgency and the kinds of support a cause accepts, so it stays stable per
 * cause without the backend having to hold a picture for it.
 */
function iconForCause(cause: DonationCause): string {
  if (cause.acceptedKinds.includes('Supplies')) return '🥗';
  if (cause.acceptedKinds.includes('ProfessionalSkills')) return '⚖️';
  if (cause.acceptedKinds.includes('Goods')) return '🧥';
  if (cause.acceptedKinds.includes('VolunteerService')) return '🤝';
  if (cause.urgency === 'Urgent') return '🚨';
  return '🎓';
}

/** `ContributionKind` → the five support types this screen has always shown. */
const KIND_TO_SUPPORT_TYPE: Record<string, string> = {
  Monetary: 'Monetary',
  Goods: 'Goods / Items',
  VolunteerService: 'Volunteer Service',
  ProfessionalSkills: 'Professional Skills',
  Supplies: 'Food & Supplies',
};

/** The backend's cause, in the shape this screen already renders. */
interface CauseView {
  id: string;
  code: string;
  title: string;
  description: string;
  organizer: string;
  organizerType: string;
  supportTypes: string[];
  acceptsMoney: boolean;
  location: string;
  contactPhone: string | null;
  contactWhatsapp: string | null;
  isVerified: boolean;
  urgency: string;
  icon: string;
  supportersCount: number;
}

function toCauseView(cause: DonationCause): CauseView {
  return {
    id: cause.causeId,
    code: cause.code,
    title: cause.title,
    description: cause.description,
    organizer: cause.organizerName,
    // `BeneficiaryType.Organization` / `.Member`, mapped back to the words this
    // screen has always used — which is where the backend got them from.
    organizerType: cause.beneficiaryType === 'Organization' ? 'Organisation' : 'Individual',
    supportTypes: cause.acceptedKinds.map((kind) => KIND_TO_SUPPORT_TYPE[kind] ?? kind),
    acceptsMoney: cause.acceptedKinds.includes('Monetary'),
    location: cause.locationLabel ?? '',
    contactPhone: cause.contactPhone ?? null,
    contactWhatsapp: cause.contactWhatsapp ?? null,
    isVerified: cause.isVerified,
    urgency: cause.urgency,
    icon: iconForCause(cause),
    supportersCount: cause.supporterCount,
  };
}

const URGENCY_COLORS: Record<string, string> = {
  'Urgent': 'bg-red-100 text-red-600 border-red-200',
  'High': 'bg-orange-100 text-orange-600 border-orange-200',
  'Moderate': 'bg-amber-100 text-amber-600 border-amber-200',
  'Ongoing': 'bg-emerald-100 text-emerald-600 border-emerald-200',
};

export default function DonationCausesScreen() {
  const tokens = useThemeTokens();
  const insets = useSafeAreaInsets();
  // No `showAlert` on this screen any more. The only thing it announced was the
  // fabricated "Cause Submitted!", and there is now nothing here that completes
  // a server action worth confirming.
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [postCauseVisible, setPostCauseVisible] = useState(false);
  const [selectedCause, setSelectedCause] = useState<any>(null);

  // The "Post a Cause" draft state is gone with the form it fed. It held a
  // title, a description, a phone number and a support type, none of which any
  // route in either repository accepts — keeping the state would have kept the
  // shape of a submission that cannot be made.

  const country = useLocationStore((state) => state.currentLocation?.countryCode);
  const causesQuery = useDonationCauses(country ?? undefined);

  const causes = React.useMemo(
    () => (causesQuery.data ?? []).map(toCauseView),
    [causesQuery.data]
  );

  const filtered = causes.filter((c) => {
    if (activeFilter && !c.supportTypes.includes(activeFilter)) return false;
    if (search.trim() && !c.title.toLowerCase().includes(search.toLowerCase()) && !c.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleCall = (phone: string) => Linking.openURL(`tel:${phone}`);
  const handleMessage = async (causeId: string, organizer: string) => {
    await ConversationHub.openOrCreateConversation({
      recipientId: causeId,
      recipientName: organizer,
      contextType: 'CommunityEvent',
      entityId: causeId,
      entityTitle: organizer,
      entitySubtitle: 'Charitable Cause',
      entityStatus: 'Active',
      deepLink: `/marketplace/donation-causes`,
      campaignSource: 'donation_cause',
    });
  };

  // ── Posting a cause — Remediation Wave B′ ──────────────────────────────────
  //
  // This form collected a title, a description, a contact number and a support
  // type, ran a 1.2-second `setTimeout`, cleared itself and said:
  //
  //     Cause Submitted! 🤝
  //     Your charitable cause has been submitted for community review and will
  //     be listed shortly.
  //
  // Nothing was submitted and nothing was reviewed. A member raising money for a
  // funeral or a medical bill was told their appeal was in a moderation queue.
  //
  // ── Why it could not simply be wired ─────────────────────────────────────────
  //
  // **There is no `POST /donations/causes`.** `Diaspora.Modules.Financial`'s
  // giving surface is `GET /donations/causes`, `POST /donations`,
  // `GET /giving/me`, the receipt read, the contribution funds and
  // `POST /contributions` — and that is all of it. The module has a complete
  // `DonationCause` aggregate, an `IDonationCauseRepository`, EF configuration
  // and a `DonationCauseId`, with **no write endpoint of any kind**. That
  // combination is the exact shape this remediation keeps finding, and a route
  // name is not evidence a route exists.
  //
  // ── What does exist, and why the member is sent there ────────────────────────
  //
  // A cause is not something a member posts directly. It is **created by
  // publishing a campaign** — `CampaignCommandHandlers.PublishAsync` calls
  // `DonationCause.Open(...)`, derives the cause code from the campaign, and
  // copies the campaign's title, summary, urgency, currency, beneficiary and
  // accepted kinds onto it. The cause then stops and starts collecting with its
  // campaign.
  //
  // So the capability is real, the entry point is `POST /communities/campaigns`,
  // and Diaspora already has a screen for it: `community-life/campaign/create`,
  // which collects the target, the currency, the category, the beneficiary and
  // the terms acceptance that a campaign genuinely requires — none of which this
  // four-field form asked for. Replacing this form with a hand-off is therefore
  // not a downgrade; it is the difference between a control that lies and a
  // control that arrives somewhere.
  //
  // ── The part that is still missing, stated rather than hidden ───────────────
  //
  // A campaign raises **money**. Three of the five support types this screen
  // offers — goods, volunteer service, professional skills — are not fundraising,
  // and there is no route anywhere in either repository that lists a
  // non-monetary appeal. The sheet says so in as many words instead of taking
  // the details and dropping them.
  const handleStartCampaign = () => {
    setPostCauseVisible(false);
    router.push('/community-life/campaign/create');
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-background">
      <ScreenHeader
        title="Charitable Causes"
        showBack
        rightAction={
          <TouchableOpacity
            onPress={() => setPostCauseVisible(true)}
            className="bg-primary-500 px-3 py-1.5 rounded-xl"
          >
            {/* "Post a Cause" described a submission this screen could not
                make. "Raise a cause" describes what the sheet behind it now
                does: explains where causes come from, and opens the campaign
                flow that creates one. */}
            <Text className="text-xs font-black text-white">+ Raise a Cause</Text>
          </TouchableOpacity>
        }
      />

      {/* Hero Banner */}
      <View className="bg-primary-500 px-6 py-4 mx-4 mt-3 rounded-3xl mb-4">
        <Text className="text-white font-black text-base mb-0.5">Support a Community Cause 🤝</Text>
        <Text className="text-white/80 text-xs leading-relaxed">
          Browse charitable causes posted by organisations and individuals in your diaspora community. Donate, volunteer, or offer goods & skills.
        </Text>
      </View>

      {/* Search bar */}
      <View className="px-4 mb-3">
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search causes..."
          placeholderTextColor={tokens.color.text.placeholder}
          className="bg-surface-card border border-subtle rounded-2xl px-4 py-3 text-sm text-content-primary"
        />
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}
        className="py-2.5 flex-grow-0"
      >
        <TouchableOpacity
          onPress={() => setActiveFilter(null)}
          className={`px-4 py-2 rounded-full border ${!activeFilter ? 'bg-primary-500 border-primary-500' : 'bg-surface-card border-subtle'}`}
        >
          <Text className={`text-xs font-bold ${!activeFilter ? 'text-white' : 'text-content-tertiary'}`}>All Causes</Text>
        </TouchableOpacity>
        {SUPPORT_TYPES.map((type) => (
          <TouchableOpacity
            key={type}
            onPress={() => setActiveFilter(activeFilter === type ? null : type)}
            className={`px-4 py-2 rounded-full border ${activeFilter === type ? 'bg-primary-500 border-primary-500' : 'bg-surface-card border-subtle'}`}
          >
            <Text className={`text-xs font-bold ${activeFilter === type ? 'text-white' : 'text-content-tertiary'}`}>{type}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Causes list */}
      <ScrollEndScrollView
        className="flex-1 px-4 pt-2"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {causesQuery.isLoading ? (
          <View className="items-center py-16">
            <Text className="text-sm font-bold text-content-muted">Loading causes…</Text>
          </View>
        ) : causesQuery.isError && causesQuery.error ? (
          <FinancialErrorInline
            error={causesQuery.error as FinancialError}
            onRetry={causesQuery.refetch}
          />
        ) : filtered.length === 0 ? (
          <View className="items-center py-16">
            <Text className="text-4xl mb-3">🔍</Text>
            <Text className="text-sm font-bold text-content-secondary">No causes found</Text>
            <Text className="text-xs text-content-faint mt-1 text-center">
              {causes.length === 0
                ? 'There are no causes listed near you at the moment.'
                : 'Try adjusting your search or filter'}
            </Text>
          </View>
        ) : (
          filtered.map((cause) => (
            <TouchableOpacity
              key={cause.id}
              onPress={() => setSelectedCause(cause)}
              activeOpacity={0.95}
              className="bg-surface-card border border-subtle rounded-3xl p-5 mb-4 shadow-sm"
            >
              {/* Header */}
              <View className="flex-row items-start justify-between mb-3">
                <View className="flex-row items-center flex-1 mr-3">
                  <Text className="text-2xl mr-3">{cause.icon}</Text>
                  <View className="flex-1">
                    <Text className="text-sm font-extrabold text-content-primary leading-snug">{cause.title}</Text>
                    <View className="flex-row items-center mt-1 flex-wrap gap-1">
                      <Text className="text-[10px] font-bold text-content-faint">{cause.organizer}</Text>
                      {cause.isVerified && (
                        <View className="bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                          <Text className="text-[9px] font-black text-emerald-600">✓ VERIFIED</Text>
                        </View>
                      )}
                      <View className="bg-surface-muted border border-subtle px-1.5 py-0.5 rounded-md">
                        <Text className="text-[9px] font-bold text-content-muted">{cause.organizerType}</Text>
                      </View>
                    </View>
                  </View>
                </View>
                <View className={`px-2 py-1 rounded-lg border ${URGENCY_COLORS[cause.urgency] || 'bg-surface-muted text-content-muted border-subtle'}`}>
                  <Text className={`text-[9px] font-black ${URGENCY_COLORS[cause.urgency]?.split(' ')[1] || ''}`}>{cause.urgency.toUpperCase()}</Text>
                </View>
              </View>

              {/* Description */}
              <Text className="text-xs text-content-tertiary leading-relaxed mb-3">{cause.description}</Text>

              {/* Support types */}
              <View className="flex-row flex-wrap gap-1.5 mb-3">
                {cause.supportTypes.map((t) => (
                  <View key={t} className="bg-primary-50 border border-primary-100 px-2.5 py-1 rounded-xl">
                    <Text className="text-[10px] font-bold text-primary-600">{t}</Text>
                  </View>
                ))}
              </View>

              {/* Meta. `postedAt` is gone: the mock carried a display string
                  ("2 days ago") and `DonationCauseResponse` has no created
                  timestamp at all, so there is nothing honest to render in its
                  place. GAP-11. */}
              <View className="flex-row items-center justify-between border-t border-faint pt-3 mb-3">
                <Text className="text-[10px] text-content-faint">📍 {cause.location || '—'}</Text>
                <Text className="text-[10px] text-content-faint">🤝 {cause.supportersCount} supporters</Text>
              </View>

              {/* Action buttons */}
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation(); handleMessage(cause.id, cause.organizer); }}
                  className="flex-1 py-3 rounded-2xl items-center justify-center"
                  style={{ backgroundColor: '#F59300' }}
                  activeOpacity={0.8}
                >
                  <Text className="text-white font-black text-xs">💬 Message</Text>
                </TouchableOpacity>
                {cause.contactPhone ? (
                  <TouchableOpacity
                    onPress={(e) => { e.stopPropagation(); handleCall(cause.contactPhone!); }}
                    className="flex-1 border border-subtle bg-surface-background py-3 rounded-2xl items-center justify-center"
                    activeOpacity={0.8}
                  >
                    <Text className="text-content-secondary font-bold text-xs">📞 Call</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollEndScrollView>

      {/* Raise a Cause sheet */}
      {/* `presentationStyle` is iOS-only, so on Android this is a full-screen
          modal with no dismissal at all until `onRequestClose` handles back. */}
      <Modal
        visible={postCauseVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPostCauseVisible(false)}
      
        statusBarTranslucent
        navigationBarTranslucent>
        <SafeAreaView className="flex-1 bg-surface-card">
          <View className="px-6 py-4 border-b border-faint flex-row items-center justify-between">
            <Text className="text-base font-black text-content-primary">Raise a cause</Text>
            <TouchableOpacity
              onPress={() => setPostCauseVisible(false)}
              className="p-2"
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text className="text-content-muted text-sm font-bold">✕ Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            className="flex-1 px-6 pt-5"
            contentContainerStyle={{ paddingBottom: 60 }}
          >
            {/*
              What replaced the four-field form.

              The form is gone rather than disabled. A form that a member can
              still fill in is a form that still promises something at the end
              of it, and the promise is what was wrong here — not the styling.
            */}
            <Text className="text-sm text-content-secondary leading-relaxed mb-5">
              Causes on this page are the giving side of a{' '}
              <Text className="font-black text-content-primary">Diaspora campaign</Text>. When a
              campaign is reviewed and published, Diaspora opens a cause for it and it appears here
              — so raising a cause means starting a campaign.
            </Text>

            <View className="bg-surface-background border border-subtle rounded-3xl p-5 mb-5">
              <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3">
                Raising money
              </Text>
              <Text className="text-sm text-content-secondary leading-relaxed mb-4">
                Start a campaign and set out what you are raising for, how much you need and who
                receives it. It is created as a draft — nothing is public and nothing can be given
                until it has been reviewed.
              </Text>
              <TouchableOpacity
                onPress={handleStartCampaign}
                className="py-4 rounded-2xl items-center justify-center bg-primary-500"
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Start a campaign"
                accessibilityHint="Opens the campaign form. Your campaign is created as a draft for review."
              >
                <Text className="font-black text-sm text-white">🤝 Start a campaign</Text>
              </TouchableOpacity>
            </View>

            {/*
              The honest half. Naming the gap is the point: a member who needs
              winter coats collected should find out here, not after filling in a
              form that goes nowhere.
            */}
            <View className="bg-surface-background border border-subtle rounded-3xl p-5">
              <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3">
                Asking for goods, time or skills
              </Text>
              <Text className="text-sm text-content-secondary leading-relaxed">
                Diaspora cannot list an appeal for donated goods, volunteers or professional help
                yet. Campaigns raise money only, and there is nowhere on the platform to post a
                non-monetary appeal — so rather than take your details and do nothing with them, we
                would rather say so.
              </Text>
              <Text className="text-sm text-content-secondary leading-relaxed mt-3">
                In the meantime, the causes listed here that need goods or volunteers each show a
                way to contact the organiser directly.
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Cause Details Modal */}
      <Modal
        visible={!!selectedCause}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedCause(null)}
      
        statusBarTranslucent
        navigationBarTranslucent>
        <SafeAreaView className="flex-1 bg-surface-card">
          <View className="px-6 py-4 border-b border-faint flex-row items-center justify-between">
            <Text className="text-base font-black text-content-primary">Cause Details</Text>
            <TouchableOpacity onPress={() => setSelectedCause(null)} className="p-2">
              <Text className="text-content-muted text-sm font-bold">✕ Close</Text>
            </TouchableOpacity>
          </View>

          {selectedCause && (
            <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
              <View className="items-center mb-6">
                <Text className="text-6xl mb-4">{selectedCause.icon}</Text>
                <Text className="text-xl font-black text-content-primary text-center mb-2 px-4 leading-tight">{selectedCause.title}</Text>
                <View className="flex-row items-center gap-2">
                  <Text className="text-xs text-content-faint font-bold">Posted by {selectedCause.organizer}</Text>
                  {selectedCause.isVerified && (
                    <View className="bg-emerald-50 border border-emerald-250 px-1.5 py-0.5 rounded">
                      <Text className="text-[9px] font-black text-emerald-600">✓ VERIFIED</Text>
                    </View>
                  )}
                </View>
              </View>

              <View className="bg-surface-background border border-subtle rounded-3xl p-5 mb-6">
                <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-2.5">About this cause</Text>
                <Text className="text-sm text-content-secondary leading-relaxed">{selectedCause.description}</Text>
              </View>

              <View className="bg-surface-background border border-subtle rounded-3xl p-5 mb-6">
                <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3">Support Types Needed</Text>
                <View className="flex-row flex-wrap gap-2">
                  {selectedCause.supportTypes.map((t: string) => (
                    <View key={t} className="bg-primary-50 border border-primary-100 px-3.5 py-1.5 rounded-2xl">
                      <Text className="text-xs font-bold text-primary-600">{t}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View className="bg-surface-background border border-subtle rounded-3xl p-5 mb-8">
                <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3">Location & Status</Text>
                <View className="gap-2.5">
                  <View className="flex-row justify-between border-b border-subtle/50 pb-2">
                    <Text className="text-xs text-content-muted font-semibold">📍 Location</Text>
                    <Text className="text-xs text-content-strong font-bold">{selectedCause.location}</Text>
                  </View>
                  <View className="flex-row justify-between border-b border-subtle/50 pb-2">
                    <Text className="text-xs text-content-muted font-semibold">⚡ Urgency Level</Text>
                    <Text className="text-xs text-content-strong font-bold">{selectedCause.urgency}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-content-muted font-semibold">📅 Posted</Text>
                    <Text className="text-xs text-content-strong font-bold">{selectedCause.postedAt}</Text>
                  </View>
                </View>
              </View>

              <View className="flex-col gap-3 mb-10">
                {/*
                  Giving money, where the cause takes it.

                  Three of the five support types are not money, and B15's
                  giving model is built around that — so a cause that needs
                  winter coats gets no donate button, and the two contact
                  actions below stay the whole of what it offers.
                */}
                {selectedCause.acceptsMoney ? (
                  <TouchableOpacity
                    onPress={() => {
                      const code = selectedCause.code;
                      setSelectedCause(null);
                      router.push({ pathname: '/wallet/donate', params: { cause: code } });
                    }}
                    className="w-full py-4 rounded-2xl items-center justify-center"
                    style={{ backgroundColor: '#0D7C66' }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Give money to ${selectedCause.title}`}
                  >
                    <Text className="text-white font-black text-sm">💚 Give with Diaspora</Text>
                  </TouchableOpacity>
                ) : (
                  <View className="w-full bg-surface-muted border border-subtle py-3.5 rounded-2xl px-4">
                    <Text className="text-[11px] font-bold text-content-tertiary text-center leading-relaxed">
                      This cause needs {selectedCause.supportTypes.join(', ').toLowerCase()} rather than
                      money. Get in touch to arrange it.
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  onPress={() => handleMessage(selectedCause.id, selectedCause.organizer)}
                  className="w-full py-4 rounded-2xl items-center justify-center"
                  style={{ backgroundColor: '#F59300' }}
                  activeOpacity={0.8}
                >
                  <Text className="text-white font-black text-sm">💬 Message Organizer</Text>
                </TouchableOpacity>
                {selectedCause.contactPhone ? (
                  <TouchableOpacity
                    onPress={() => handleCall(selectedCause.contactPhone!)}
                    className="w-full border border-subtle bg-surface-background py-4 rounded-2xl items-center justify-center"
                    activeOpacity={0.8}
                  >
                    <Text className="text-content-secondary font-black text-sm">📞 Call Organizer</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
