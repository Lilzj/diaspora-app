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
//
// ── A pin, an area, and who may raise an Emergency — 16 Sep 2026 ────────────
//
// This form never sent a position, and the "GPS ACTIVE" badge said it did. The
// platform placed every alert at the centre of the town it named, so every
// London alert sat on one spot. A member whose phone has a real fix can now pin
// the alert where they are — off by default, because a public alert pinned to
// your position says where you are — and, once pinned, say how far it reaches.
// No pin, no area: the server refuses a radius around a town's centre.
//
// Emergency is offered only when `GET /community/alerts/capabilities` says this
// member may choose it. Hidden rather than disabled: a control the server will
// refuse is worse than no control.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useLocationStore, getActiveLocation, locationLabel, hasCoordinate } from '@/store/location';
import { View, Text, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { FeatureGate } from '@/components/FeatureGate';
import { useNotification } from '@/providers/notification-provider';
import { createPost, POST_BODY_MAX_LENGTH } from '@/lib/community-social-api';
import { useAlertCapabilities } from '@/hooks/community-social';
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

/**
 * How far an alert reaches, offered as the distances people actually describe
 * — "just this street", "the estate", "this side of town". Null is a point.
 */
const AFFECTED_AREAS: { metres: number | null; label: string }[] = [
  { metres: null, label: 'Just here' },
  { metres: 250, label: '250 m' },
  { metres: 1_000, label: '1 km' },
  { metres: 5_000, label: '5 km' },
  { metres: 20_000, label: '20 km' },
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
    // Was 'near Peckham High Street'. A template is text the member sends as
    // their own; naming a south London road put a place they have never been
    // into a Mauritian member's safety alert. The place goes in the location
    // field, which is where the form asks for it.
    message: 'Active document and vehicle check reported by local authorities. Expect minor traffic delays.',
    urgency: 'urgent',
    expiresHours: 4,
  },
  {
    label: '⚠️ Power Outage',
    category: 'safetyAlert',
    // Was 'near Atlantic Road' — Brixton. Same reason as above.
    message: 'Local area electricity blackout reported affecting nearby housing blocks. Maintenance is on site.',
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
  // ── Empty, not "Peckham, London" ─────────────────────────────────────────
  //
  // This field is the *place the alert is about*, and it opened pre-filled with
  // a south London neighbourhood. A member in Port Louis posting a road-closure
  // warning submitted it against Peckham unless they noticed and retyped it.
  // `locationLabel` gives the member's own active location, or nothing.
  const activeLocation = useLocationStore(getActiveLocation);
  const [location, setLocation] = useState('');

  useEffect(() => {
    setLocation((prev) => prev || (hasCoordinate(activeLocation) || activeLocation.countryCode ? locationLabel(activeLocation) : ''));
  }, [activeLocation]);
  const [message, setMessage] = useState('');
  const [urgency, setUrgency] = useState<CommunityPostUrgency>('normal');

  // Only a device fix is a spot. A chosen area or a country is a centroid, and
  // pinning an alert there would be claiming a place nobody stood in.
  const canPin = hasCoordinate(activeLocation) && activeLocation.precision === 'device';
  const [pinned, setPinned] = useState(false);
  const [affectedRadiusMetres, setAffectedRadiusMetres] = useState<number | null>(null);

  const { capabilities } = useAlertCapabilities();
  const urgencies = ALERT_URGENCIES.filter(
    (level) => level.value !== 'emergency' || capabilities?.canPublishEmergency === true
  );

  // A draft or a template can carry an urgency this member may not choose.
  useEffect(() => {
    if (urgency === 'emergency' && capabilities && !capabilities.canPublishEmergency) {
      setUrgency('urgent');
    }
  }, [capabilities, urgency]);
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
      const pin = pinned && canPin;

      await createPost({
        body: message.trim(),
        category: selectedCategory,
        urgency,
        expiresInHours: expiresHours,
        cityName: cityName || null,
        areaName,
        // The member's own position, only when they asked for the pin.
        latitude: pin ? activeLocation.latitude : null,
        longitude: pin ? activeLocation.longitude : null,
        affectedRadiusMetres: pin ? affectedRadiusMetres : null,
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

        {/* Where the alert is about, and whether it is pinned */}
        <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2">Location</Text>
        <View className="bg-surface-background border border-subtle rounded-2xl p-4 mb-5">
          <Text className="text-sm font-bold text-content-strong">📍 {location || 'No place set'}</Text>

          {canPin ? (
            <TouchableOpacity
              accessible
              accessibilityRole="switch"
              accessibilityState={{ checked: pinned }}
              accessibilityLabel="Pin this alert where I am"
              testID="alert-pin-toggle"
              onPress={() => {
                setPinned((value) => !value);
                if (pinned) setAffectedRadiusMetres(null);
              }}
              className="flex-row items-center justify-between mt-3"
            >
              <View className="flex-1 mr-3">
                <Text className="text-xs font-bold text-content-secondary">Pin this alert where I am</Text>
                <Text className="text-[11px] text-content-muted mt-0.5">
                  Anyone who sees the alert sees this spot. Leave it off to place the alert at the centre of{' '}
                  {location || 'the place you named'}.
                </Text>
              </View>
              <View
                className={`w-11 h-6 rounded-full justify-center px-0.5 ${
                  pinned ? 'bg-primary-500 items-end' : 'bg-surface-muted items-start'
                }`}
              >
                <View className="w-5 h-5 rounded-full bg-white" />
              </View>
            </TouchableOpacity>
          ) : (
            <Text className="text-[11px] text-content-muted mt-2" testID="alert-pin-unavailable">
              Your phone has not shared an exact position, so the alert will be placed at the centre of{' '}
              {location || 'the place you name'} and shown as approximate.
            </Text>
          )}

          {pinned && canPin ? (
            <View className="mt-4" testID="alert-area-picker">
              <Text className="text-xs font-bold text-content-secondary mb-2">How far does it reach?</Text>
              <View className="flex-row flex-wrap gap-2">
                {AFFECTED_AREAS.filter(
                  (area) =>
                    area.metres === null ||
                    !capabilities ||
                    (area.metres >= capabilities.minAffectedRadiusMetres &&
                      area.metres <= capabilities.maxAffectedRadiusMetres)
                ).map((area) => {
                  const isSelected = affectedRadiusMetres === area.metres;
                  return (
                    <TouchableOpacity
                      key={area.label}
                      accessible
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={area.metres === null ? 'Just here, no wider area' : `Reaches about ${area.label}`}
                      onPress={() => setAffectedRadiusMetres(area.metres)}
                      className={`px-3 py-2 rounded-full border ${
                        isSelected ? 'bg-primary-500 border-primary-500' : 'bg-surface-card border-subtle'
                      }`}
                    >
                      <Text className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-content-tertiary'}`}>
                        {area.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}
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
          {urgencies.map((level) => {
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
