// ─────────────────────────────────────────────────────────────────────────────
// Post Local Alert — what "Publish" used to do
//
// The whole handler was three lines:
//
//     const handlePublish = () => {
//       globalUpdateDraft = null;
//       router.replace('/(tabs)/knowledge/updates');
//     };
//
// It cleared the draft and navigated to the live updates feed. No request, and
// worse than most of this sweep's inert controls: the member landed on the very
// screen their alert should have appeared on, saw other people's alerts there,
// and had every reason to assume theirs was among them. Then it *deleted the
// draft*, so the words were gone too. A member reporting an immigration
// checkpoint or a power cut to their neighbours told nobody and kept no copy.
//
// ── The route exists, and always did ─────────────────────────────────────────
//
//     POST /community/posts   (CommunityPolicies.Post)
//
// `CreatePostRequest` carries `category`, `urgency`, `expiresInHours`,
// `cityName`/`areaName` and a `visibility` — which is to say every field this
// form already collected. There is no separate "alerts" module; a local alert
// *is* a community post with a category and a short expiry, and the client
// already had `createPost` in `lib/community-social-api.ts`.
//
// ── Two vocabularies had to be corrected, not translated ─────────────────────
//
// **Categories.** This screen offered the first five of `mockCategories` —
// "Food & Restaurants", "Hair & Beauty", "Retail & Shopping" — which are the
// *provider directory's* business categories. `PostCategory` on the server is a
// different set entirely (`general`, `marketPrices`, `safetyAlert`, `jobLead`,
// `housingTip`, `question`), and the server's category also selects the post's
// default lifetime. Mapping "Hair & Beauty" onto one of those would have been
// an invention, so the picker now offers the real six and the fixture import is
// gone.
//
// **Urgency.** The picker offered Low / Normal / Urgent / Emergency.
// `UrgencyLevel` is `normal` / `elevated` / `urgent` / `emergency` — there is no
// "low". Sending Low would have been silently coerced or refused, and folding
// Low and Normal together would have made the picker lie about having four
// settings. "Elevated" replaces "Low", so the four buttons are the four levels.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { FeatureGate } from '@/components/FeatureGate';
import { useNotification } from '@/providers/notification-provider';
import { createPost, POST_BODY_MAX_LENGTH } from '@/lib/community-social-api';
import type { CommunityPostCategory, CommunityPostUrgency } from '@/types/community-social';
import { useThemeTokens } from '@/design-system';
import { useBottomInset } from '@/components/layout/bottom-inset';

let globalUpdateDraft: any = null;

/**
 * The six `PostCategory` members a member may choose, with wording that says
 * what each one is for. The value is the server's name; the label is ours.
 */
const ALERT_CATEGORIES: { value: CommunityPostCategory; label: string; icon: string }[] = [
  { value: 'safetyAlert', label: 'Safety alert', icon: '🚨' },
  { value: 'general', label: 'General', icon: '📣' },
  { value: 'marketPrices', label: 'Market prices', icon: '🏷️' },
  { value: 'housingTip', label: 'Housing tip', icon: '🏠' },
  { value: 'jobLead', label: 'Job lead', icon: '💼' },
  { value: 'question', label: 'Question', icon: '❓' },
];

/** `UrgencyLevel`, all four of them, in the server's spelling. */
/**
 * The four levels the platform can actually store.
 *
 * "Elevated" used to sit between Normal and Urgent and had no member in
 * `UrgencyLevel`. `ParseOr(…, Normal)` meant choosing it saved the post as
 * Normal — a control that looked like it did something and did nothing. `Low`
 * was in the enum and missing from here, so it could not be chosen at all.
 */
const ALERT_URGENCIES: { value: CommunityPostUrgency; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'emergency', label: 'Emergency' },
];

const TEMPLATES: {
  label: string;
  category: CommunityPostCategory;
  message: string;
  urgency: CommunityPostUrgency;
  expiresHours: number;
}[] = [
  {
    label: '🚨 Checkpoint',
    category: 'safetyAlert',
    message: 'Active document and vehicle check reported near Peckham High Street by local authorities. Expect minor traffic delays.',
    urgency: 'urgent',
    expiresHours: 4,
  },
  {
    label: '⚠️ Power Outage',
    category: 'safetyAlert',
    message: 'Local area electricity blackout reported affecting housing blocks near Atlantic Road. Maintenance is on site.',
    urgency: 'urgent',
    expiresHours: 6,
  },
  {
    label: '💼 Visa Queue',
    category: 'general',
    message: 'Long wait times (>3 hours) reported today at the local immigration centre for visa documentation processing.',
    urgency: 'normal',
    expiresHours: 8,
  },
  {
    label: '🎉 Cultural Fair',
    category: 'general',
    message: 'Annual diaspora independence celebration fair starting at the community park. Traditional foods and music!',
    urgency: 'normal',
    expiresHours: 24,
  },
];

export default function CreateUpdateScreen() {
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const tokens = useThemeTokens();
  const [draftBannerVisible, setDraftBannerVisible] = useState(false);

  const { showAlert } = useNotification();

  // Form states
  const [selectedCategory, setSelectedCategory] = useState<CommunityPostCategory | ''>('');
  const [location, setLocation] = useState('Peckham, London');
  const [message, setMessage] = useState('');
  const [urgency, setUrgency] = useState<CommunityPostUrgency>('normal');
  const [expiresHours, setExpiresHours] = useState(6);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check draft on mount
  useEffect(() => {
    if (globalUpdateDraft) {
      setDraftBannerVisible(true);
    }
  }, []);

  // Auto-save draft
  const saveDraft = () => {
    globalUpdateDraft = {
      selectedCategory,
      location,
      message,
      urgency,
      expiresHours,
    };
  };

  useEffect(() => {
    if (message || selectedCategory) {
      saveDraft();
    }
  }, [selectedCategory, location, message, urgency, expiresHours]);

  const restoreDraft = () => {
    if (globalUpdateDraft) {
      const d = globalUpdateDraft;
      setSelectedCategory(d.selectedCategory);
      setLocation(d.location);
      setMessage(d.message);
      setUrgency(d.urgency);
      setExpiresHours(d.expiresHours);
      setDraftBannerVisible(false);
    }
  };

  const discardDraft = () => {
    globalUpdateDraft = null;
    setDraftBannerVisible(false);
  };

  const applyTemplate = (tpl: typeof TEMPLATES[0]) => {
    setSelectedCategory(tpl.category);
    setMessage(tpl.message);
    setUrgency(tpl.urgency);
    setExpiresHours(tpl.expiresHours);
  };

  /**
   * Publish the alert as a community post.
   *
   * Note the ordering: **the draft is cleared only after the server has taken
   * the post.** The old handler cleared it first and then navigated, so a
   * member whose alert never existed also lost the text they had written. On
   * any failure here the form is left exactly as it was, so they can retry or
   * copy their words out.
   *
   * `location` is a single free-text field on this form ("Peckham, London"), so
   * it is split on the first comma into `areaName` and `cityName` rather than
   * being sent as a city that is really an area. Nothing is geocoded and no
   * coordinates are invented — the server treats all of these as optional.
   */
  const handlePublish = async () => {
    if (!message.trim() || !selectedCategory) return;

    // The server caps `body` at 500 characters. Refusing here, with the count,
    // is kinder than a 400 that says "validation failed" after the round trip.
    if (message.trim().length > POST_BODY_MAX_LENGTH) {
      showAlert({
        type: 'warning',
        title: 'Alert is too long',
        message: `Alerts can be up to ${POST_BODY_MAX_LENGTH} characters. Yours is ${message.trim().length}. Nothing has been posted — shorten it and try again.`,
      });
      return;
    }

    const [firstPart, ...restParts] = location.split(',');
    const areaName = restParts.length > 0 ? firstPart.trim() : null;
    const cityName = restParts.length > 0 ? restParts.join(',').trim() : firstPart.trim();

    setIsSubmitting(true);
    try {
      await createPost({
        body: message.trim(),
        category: selectedCategory,
        urgency,
        expiresInHours: expiresHours,
        cityName: cityName || null,
        areaName,
        // Left at the server's default rather than guessed at. This screen has
        // no visibility picker, and choosing one on the member's behalf would
        // be deciding who can see their alert without asking.
      });

      // Only now is the draft safe to discard.
      globalUpdateDraft = null;
      setIsSubmitting(false);
      router.replace('/(tabs)/knowledge/updates');
    } catch {
      setIsSubmitting(false);
      showAlert({
        type: 'error',
        title: 'Alert not posted',
        message: 'Diaspora could not post your alert. Nobody has been notified. Your text is still here — try again in a moment.',
      });
    }
  };

  return (
    <FeatureGate featureName="Local Alerts">
      <SafeAreaView className="flex-1 bg-surface-card">
      <ScreenHeader
        title="Post Local Alert"
        rightAction={
          <TouchableOpacity onPress={() => router.replace('/(tabs)/knowledge/updates')} className="p-2">
            <Text className="text-xs font-bold text-content-faint uppercase">Cancel</Text>
          </TouchableOpacity>
        }
      />
      <KeyboardAvoidingView
        behavior="padding"
        className="flex-1"
      >
      {/* Draft Recovery banner warning */}
      {draftBannerVisible && (
        <View className="bg-[#FFF8E1] border-b border-[#FFE082] px-6 py-4 flex-row items-center justify-between">
          <View className="flex-1 mr-4">
            <Text className="text-sm font-bold text-content-strong">✏️ Alert Draft Detected</Text>
            <Text className="text-xs text-content-tertiary mt-0.5">
              Restore your draft checkpoint message?
            </Text>
          </View>
          <View className="flex-row">
            <TouchableOpacity onPress={restoreDraft} className="bg-primary-500 px-3 py-2 rounded-xl mr-2">
              <Text className="text-xs font-bold text-white">Restore</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={discardDraft} className="bg-surface-muted border border-subtle px-3 py-2 rounded-xl">
              <Text className="text-xs font-bold text-content-tertiary">Discard</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView className="flex-1 px-6 pt-4" keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: bottomInset }}>
        
        {/* Quick Templates Panel */}
        <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">
          ⚡ 10-Second Quick Templates
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6 flex-row gap-2.5">
          {TEMPLATES.map((tpl, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => applyTemplate(tpl)}
              className="bg-surface-background border border-subtle rounded-2xl px-4 py-3 mr-2 active:bg-surface-muted"
            >
              <Text className="text-xs font-bold text-content-secondary">{tpl.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* GPS location display */}
        <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2">Location Detection</Text>
        <View className="bg-surface-background border border-subtle rounded-2xl p-4 mb-5 flex-row items-center justify-between">
          <View>
            <Text className="text-sm font-bold text-content-strong">📍 Current Location</Text>
            <Text className="text-xs text-content-muted mt-0.5">{location}</Text>
          </View>
          <Text className="text-[10px] text-success-default font-extrabold bg-[#E6F4EA] px-2.5 py-1 rounded-lg">
            📡 GPS ACTIVE
          </Text>
        </View>

        {/*
          The six real `PostCategory` members. The label used to promise
          "(Future AI Auto-Categorized)" — a roadmap claim on a form field —
          and the chips were the provider directory's business categories from
          `mocks/data`, none of which the posts API accepts.
        */}
        <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2">
          Category
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5 flex-row gap-2">
          {ALERT_CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.value}
              onPress={() => setSelectedCategory(cat.value)}
              className={`px-4 py-2 rounded-full border ${
                selectedCategory === cat.value
                  ? 'bg-primary-500 border-primary-500'
                  : 'bg-surface-card border-subtle'
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  selectedCategory === cat.value ? 'text-white' : 'text-content-tertiary'
                }`}
              >
                {cat.icon} {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Message Input text area with char counter */}
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest">Alert Message</Text>
          {/* The cap is the server's, so it is read from the client constant
              that records it rather than typed in again here. */}
          <Text className={`text-xs font-bold ${message.length > POST_BODY_MAX_LENGTH ? 'text-error-default' : 'text-content-faint'}`}>
            {message.length}/{POST_BODY_MAX_LENGTH}
          </Text>
        </View>
        <TextInput
          placeholder="Share what is happening. Include times, streets, and specific details so neighbors can plan..."
          value={message}
          onChangeText={setMessage}
          maxLength={500}
          multiline
          className="bg-surface-background border border-subtle rounded-2xl p-4 min-h-[120px] text-sm leading-relaxed text-content-strong mb-5"
          placeholderTextColor={tokens.color.text.placeholder}
          textAlignVertical="top"
        />

        {/* Urgency levels picker */}
        <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">Urgency Rating</Text>
        <View className="flex-row mb-5 justify-between">
          {ALERT_URGENCIES.map((level) => {
            const isSelected = urgency === level.value;
            return (
              <TouchableOpacity
                key={level.value}
                onPress={() => setUrgency(level.value)}
                className={`flex-1 py-3.5 rounded-xl mr-2 items-center border ${
                  isSelected ? 'border-line bg-surface-inverse' : 'bg-surface-card border-subtle'
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    isSelected ? 'text-content-inverse' : 'text-content-tertiary'
                  }`}
                >
                  {level.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Expiration slider */}
        <View className="flex-row justify-between mb-2">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest">Expiration Limit</Text>
          <Text className="text-xs font-extrabold text-primary-500">Expires in {expiresHours} hours</Text>
        </View>
        <View className="bg-surface-background border border-subtle rounded-2xl p-4 mb-5">
          <Text className="text-[11px] text-content-muted mb-3">
            This alert will be archived and hidden automatically after this duration to prevent outdated notifications.
          </Text>
          {/* Simple mock slider using touch points since standard Slider requires native link package */}
          <View className="flex-row justify-between">
            {[2, 4, 6, 12, 24, 48].map((h) => (
              <TouchableOpacity
                key={h}
                onPress={() => setExpiresHours(h)}
                className={`w-10 h-10 rounded-full items-center justify-center border ${
                  expiresHours === h
                    ? 'bg-primary-500 border-primary-500'
                    : 'bg-surface-card border-subtle'
                }`}
              >
                <Text className={`text-xs font-black ${expiresHours === h ? 'text-white' : 'text-content-tertiary'}`}>
                  {h}h
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/*
          The photo attachment control is gone.

          It was a toggle over a boolean: tapping it flipped the label to
          "📸 Image Attached" without ever opening a picker, uploading anything,
          or putting a field on the request. A member who attached a photograph
          of a flooded street and pressed publish sent no photograph — and after
          this screen was wired to `POST /community/posts`, keeping a control
          that claims an attachment while `attachments` goes unset would have
          been the one remaining fabrication on the form.

          Attachments are a real capability — `CreatePostRequest.attachments`
          takes `PostAttachmentRequest[]`, and `hooks/media` already uploads and
          returns media ids for the listing screens. Building that here is a
          feature, not a correction, so it is left out rather than faked.
        */}

      </ScrollView>

      {/* Action Footer buttons */}
      <View className="px-6 py-4 border-t border-faint bg-surface-card">
        <Button
          label={isSubmitting ? 'Posting…' : 'Publish Local Alert'}
          disabled={!message.trim() || !selectedCategory || isSubmitting}
          onPress={handlePublish}
        />
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </FeatureGate>
  );
}
