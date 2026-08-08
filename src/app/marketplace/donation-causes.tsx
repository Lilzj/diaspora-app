import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, Linking, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useNotification } from '@/providers/notification-provider';
import { ConversationHub } from '@/lib/conversation-hub';

// B15 — `GET /donations/causes` replaces this screen's `MOCK_CAUSES`.
import { useDonationCauses } from '@/hooks/financial';
import { FinancialErrorInline } from '@/components/financial';
import { useLocationStore } from '@/store/location';
import type { DonationCause } from '@/types/financial';
import type { FinancialError } from '@/lib/financial-errors';

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
  const insets = useSafeAreaInsets();
  const { showAlert } = useNotification();
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [postCauseVisible, setPostCauseVisible] = useState(false);
  const [selectedCause, setSelectedCause] = useState<any>(null);

  // Post a Cause form state
  const [causeTitle, setCauseTitle] = useState('');
  const [causeDesc, setCauseDesc] = useState('');
  const [causePhone, setCausePhone] = useState('');
  const [causeSupportType, setCauseSupportType] = useState('Monetary');
  const [isPosting, setIsPosting] = useState(false);
  const isFormInvalid = !causeTitle.trim() || !causeDesc.trim() || !causePhone.trim();

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

  const handlePostCause = () => {
    if (!causeTitle.trim() || !causeDesc.trim() || !causePhone.trim()) {
      Alert.alert('Required Fields', 'Please fill in the cause title, description, and contact number.');
      return;
    }
    setIsPosting(true);
    setTimeout(() => {
      setIsPosting(false);
      setPostCauseVisible(false);
      setCauseTitle('');
      setCauseDesc('');
      setCausePhone('');
      showAlert({
        type: 'success',
        title: 'Cause Submitted! 🤝',
        message: 'Your charitable cause has been submitted for community review and will be listed shortly.',
      });
    }, 1200);
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50">
      <ScreenHeader
        title="Charitable Causes"
        showBack
        rightAction={
          <TouchableOpacity
            onPress={() => setPostCauseVisible(true)}
            className="bg-primary-500 px-3 py-1.5 rounded-xl"
          >
            <Text className="text-xs font-black text-white">+ Post a Cause</Text>
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
          placeholderTextColor="#9CA3AF"
          className="bg-white border border-neutral-200 rounded-2xl px-4 py-3 text-sm text-neutral-900"
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
          className={`px-4 py-2 rounded-full border ${!activeFilter ? 'bg-primary-500 border-primary-500' : 'bg-white border-neutral-200'}`}
        >
          <Text className={`text-xs font-bold ${!activeFilter ? 'text-white' : 'text-neutral-600'}`}>All Causes</Text>
        </TouchableOpacity>
        {SUPPORT_TYPES.map((type) => (
          <TouchableOpacity
            key={type}
            onPress={() => setActiveFilter(activeFilter === type ? null : type)}
            className={`px-4 py-2 rounded-full border ${activeFilter === type ? 'bg-primary-500 border-primary-500' : 'bg-white border-neutral-200'}`}
          >
            <Text className={`text-xs font-bold ${activeFilter === type ? 'text-white' : 'text-neutral-600'}`}>{type}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Causes list */}
      <ScrollView
        className="flex-1 px-4 pt-2"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {causesQuery.isLoading ? (
          <View className="items-center py-16">
            <Text className="text-sm font-bold text-neutral-500">Loading causes…</Text>
          </View>
        ) : causesQuery.isError && causesQuery.error ? (
          <FinancialErrorInline
            error={causesQuery.error as FinancialError}
            onRetry={causesQuery.refetch}
          />
        ) : filtered.length === 0 ? (
          <View className="items-center py-16">
            <Text className="text-4xl mb-3">🔍</Text>
            <Text className="text-sm font-bold text-neutral-700">No causes found</Text>
            <Text className="text-xs text-neutral-400 mt-1 text-center">
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
              className="bg-white border border-neutral-200 rounded-3xl p-5 mb-4 shadow-sm"
            >
              {/* Header */}
              <View className="flex-row items-start justify-between mb-3">
                <View className="flex-row items-center flex-1 mr-3">
                  <Text className="text-2xl mr-3">{cause.icon}</Text>
                  <View className="flex-1">
                    <Text className="text-sm font-extrabold text-neutral-900 leading-snug">{cause.title}</Text>
                    <View className="flex-row items-center mt-1 flex-wrap gap-1">
                      <Text className="text-[10px] font-bold text-neutral-400">{cause.organizer}</Text>
                      {cause.isVerified && (
                        <View className="bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                          <Text className="text-[9px] font-black text-emerald-600">✓ VERIFIED</Text>
                        </View>
                      )}
                      <View className="bg-neutral-100 border border-neutral-200 px-1.5 py-0.5 rounded-md">
                        <Text className="text-[9px] font-bold text-neutral-500">{cause.organizerType}</Text>
                      </View>
                    </View>
                  </View>
                </View>
                <View className={`px-2 py-1 rounded-lg border ${URGENCY_COLORS[cause.urgency] || 'bg-neutral-100 text-neutral-500 border-neutral-200'}`}>
                  <Text className={`text-[9px] font-black ${URGENCY_COLORS[cause.urgency]?.split(' ')[1] || ''}`}>{cause.urgency.toUpperCase()}</Text>
                </View>
              </View>

              {/* Description */}
              <Text className="text-xs text-neutral-600 leading-relaxed mb-3">{cause.description}</Text>

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
              <View className="flex-row items-center justify-between border-t border-neutral-100 pt-3 mb-3">
                <Text className="text-[10px] text-neutral-400">📍 {cause.location || '—'}</Text>
                <Text className="text-[10px] text-neutral-400">🤝 {cause.supportersCount} supporters</Text>
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
                    className="flex-1 border border-neutral-200 bg-neutral-50 py-3 rounded-2xl items-center justify-center"
                    activeOpacity={0.8}
                  >
                    <Text className="text-neutral-700 font-bold text-xs">📞 Call</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Post a Cause Modal */}
      <Modal visible={postCauseVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView className="flex-1 bg-white">
          <View className="px-6 py-4 border-b border-neutral-100 flex-row items-center justify-between">
            <Text className="text-base font-black text-neutral-900">Post a Cause</Text>
            <TouchableOpacity onPress={() => setPostCauseVisible(false)} className="p-2">
              <Text className="text-neutral-500 text-sm font-bold">✕ Close</Text>
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1"
          >
            <ScrollView
              className="flex-1 px-6 pt-4"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 60 }}
            >
              <Text className="text-xs text-neutral-500 leading-relaxed mb-6">
                Share a charitable cause with the Diaspora community. Both organisations and individuals can post. Your cause will be reviewed by moderators before going live.
              </Text>

              <View className="mb-4">
                <Text className="text-xs font-extrabold text-neutral-700 mb-2 uppercase tracking-wider">Cause Title *</Text>
                <TextInput
                  value={causeTitle}
                  onChangeText={setCauseTitle}
                  placeholder="e.g. Winter Clothing Drive for Refugees"
                  placeholderTextColor="#9CA3AF"
                  className="border border-neutral-200 rounded-2xl px-4 py-3.5 text-sm text-neutral-900 bg-neutral-50"
                />
              </View>

              <View className="mb-4">
                <Text className="text-xs font-extrabold text-neutral-700 mb-2 uppercase tracking-wider">Description *</Text>
                <TextInput
                  value={causeDesc}
                  onChangeText={setCauseDesc}
                  placeholder="Describe what the cause is about and what kind of support is needed..."
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  className="border border-neutral-200 rounded-2xl px-4 py-3.5 text-sm text-neutral-900 bg-neutral-50"
                  style={{ minHeight: 100 }}
                />
              </View>

              <View className="mb-4">
                <Text className="text-xs font-extrabold text-neutral-700 mb-2 uppercase tracking-wider">Support Type *</Text>
                <View className="flex-row flex-wrap gap-2">
                  {SUPPORT_TYPES.map((t) => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setCauseSupportType(t)}
                      className={`px-3.5 py-2 rounded-xl border ${causeSupportType === t ? 'bg-primary-500 border-primary-500' : 'bg-white border-neutral-200'}`}
                    >
                      <Text className={`text-xs font-bold ${causeSupportType === t ? 'text-white' : 'text-neutral-600'}`}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View className="mb-6">
                <Text className="text-xs font-extrabold text-neutral-700 mb-2 uppercase tracking-wider">Contact Number *</Text>
                <TextInput
                  value={causePhone}
                  onChangeText={setCausePhone}
                  placeholder="+44 7900 000000"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                  className="border border-neutral-200 rounded-2xl px-4 py-3.5 text-sm text-neutral-900 bg-neutral-50"
                />
              </View>

              <TouchableOpacity
                onPress={handlePostCause}
                disabled={isFormInvalid || isPosting}
                className={`py-4 rounded-2xl items-center justify-center ${
                  isFormInvalid || isPosting ? 'bg-neutral-200 border border-neutral-300' : 'bg-primary-500'
                }`}
              >
                <Text className={`font-black text-sm ${isFormInvalid || isPosting ? 'text-neutral-450' : 'text-white'}`}>
                  {isPosting ? 'Submitting...' : '🤝 Submit Cause for Review'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Cause Details Modal */}
      <Modal visible={!!selectedCause} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView className="flex-1 bg-white">
          <View className="px-6 py-4 border-b border-neutral-100 flex-row items-center justify-between">
            <Text className="text-base font-black text-neutral-900">Cause Details</Text>
            <TouchableOpacity onPress={() => setSelectedCause(null)} className="p-2">
              <Text className="text-neutral-500 text-sm font-bold">✕ Close</Text>
            </TouchableOpacity>
          </View>

          {selectedCause && (
            <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
              <View className="items-center mb-6">
                <Text className="text-6xl mb-4">{selectedCause.icon}</Text>
                <Text className="text-xl font-black text-neutral-900 text-center mb-2 px-4 leading-tight">{selectedCause.title}</Text>
                <View className="flex-row items-center gap-2">
                  <Text className="text-xs text-neutral-400 font-bold">Posted by {selectedCause.organizer}</Text>
                  {selectedCause.isVerified && (
                    <View className="bg-emerald-50 border border-emerald-250 px-1.5 py-0.5 rounded">
                      <Text className="text-[9px] font-black text-emerald-600">✓ VERIFIED</Text>
                    </View>
                  )}
                </View>
              </View>

              <View className="bg-neutral-50 border border-neutral-200 rounded-3xl p-5 mb-6">
                <Text className="text-xs font-extrabold text-neutral-400 uppercase tracking-widest mb-2.5">About this cause</Text>
                <Text className="text-sm text-neutral-700 leading-relaxed">{selectedCause.description}</Text>
              </View>

              <View className="bg-neutral-50 border border-neutral-200 rounded-3xl p-5 mb-6">
                <Text className="text-xs font-extrabold text-neutral-400 uppercase tracking-widest mb-3">Support Types Needed</Text>
                <View className="flex-row flex-wrap gap-2">
                  {selectedCause.supportTypes.map((t: string) => (
                    <View key={t} className="bg-primary-50 border border-primary-100 px-3.5 py-1.5 rounded-2xl">
                      <Text className="text-xs font-bold text-primary-600">{t}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View className="bg-neutral-50 border border-neutral-200 rounded-3xl p-5 mb-8">
                <Text className="text-xs font-extrabold text-neutral-400 uppercase tracking-widest mb-3">Location & Status</Text>
                <View className="gap-2.5">
                  <View className="flex-row justify-between border-b border-neutral-200/50 pb-2">
                    <Text className="text-xs text-neutral-500 font-semibold">📍 Location</Text>
                    <Text className="text-xs text-neutral-800 font-bold">{selectedCause.location}</Text>
                  </View>
                  <View className="flex-row justify-between border-b border-neutral-200/50 pb-2">
                    <Text className="text-xs text-neutral-500 font-semibold">⚡ Urgency Level</Text>
                    <Text className="text-xs text-neutral-800 font-bold">{selectedCause.urgency}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-neutral-500 font-semibold">📅 Posted</Text>
                    <Text className="text-xs text-neutral-800 font-bold">{selectedCause.postedAt}</Text>
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
                  <View className="w-full bg-neutral-100 border border-neutral-200 py-3.5 rounded-2xl px-4">
                    <Text className="text-[11px] font-bold text-neutral-600 text-center leading-relaxed">
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
                    className="w-full border border-neutral-200 bg-neutral-50 py-4 rounded-2xl items-center justify-center"
                    activeOpacity={0.8}
                  >
                    <Text className="text-neutral-700 font-black text-sm">📞 Call Organizer</Text>
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
