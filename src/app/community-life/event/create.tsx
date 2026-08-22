import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal, TouchableWithoutFeedback, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FeatureGate } from '@/components/FeatureGate';
import { apiClient } from '@/lib/apiClient';
import type { EventCategory, EventFormState } from '@/types/community-life';
import { useAuthStore } from '@/store/auth';
import { toEventCategoryKey } from '@/lib/community-life-catalogue';
import { convertToInstant } from '@/lib/integrations/calendar';
import { ImagePickerInput } from '@/components/ImagePickerInput';
import { DatePickerInput } from '@/components/DatePickerInput';
import { PhoneInputWithCode } from '@/components/PhoneInputWithCode';
import { Button } from '@/components/Button';
import { useNotification } from '@/providers/notification-provider';
import { useThemeTokens } from '@/design-system';
import { defaultScheduleDate } from '@/utils/calendar-date';

const EVENT_CATEGORIES: EventCategory[] = [
  'Wedding', 'Naming Ceremony', 'Birthday', 'Graduation', 'Football Match',
  'Basketball', 'Concert', 'Comedy Show', 'Networking', 'Career Fair', 'Job Fair',
  'Business Seminar', 'Conference', 'Training', 'Workshop', 'Church Program',
  'Mosque Event', 'Bible Study', 'Prayer Meeting', 'Youth Program', 'Cultural Festival',
  'Independence Celebration', 'Food Festival', 'Picnic', 'Volunteer Activity',
  'Charity Event', 'Embassy Event', 'Student Orientation', 'Other'
];

export default function CreateEventScreen() {
  const tokens = useThemeTokens();
  const { showAlert } = useNotification();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDraftSaving, setIsDraftSaving] = useState(false);

  // Wizard state
  const residenceCountry = useAuthStore((state) => state.user?.residenceCountry);

  const [formData, setFormData] = useState<EventFormState>({
    category: 'Networking',
    title: '',
    summary: '',
    description: '',
    // Remediation Wave E. This was an Unsplash URL, so an event created without
    // a photograph shipped with a stock one that looked like a choice somebody
    // had made. It now holds a `mediaId` or nothing, and nothing renders as
    // nothing.
    coverImage: '',
    gallery: [],
    // ── DEFECT-012 ──────────────────────────────────────────────────────────
    //
    // This was the literal `'2026-07-15'`. A hardcoded date is a future date
    // exactly once — for as long as it takes the calendar to reach it — and
    // afterwards it is a date the platform refuses. `CreateEventCommand` checks
    // the end time against now and answers
    //
    //     400 — "That event would already be over."
    //
    // which the member met **at the final Publish tap, after six steps**, having
    // never touched the date field because it looked already filled in.
    //
    // Found by driving this screen on a device: the form offered 15 July and the
    // day was 20 August. A default has to be computed, or it is a countdown.
    date: defaultScheduleDate(),
    time: '18:00',
    endTime: '20:00',
    // IANA, not an abbreviation. `TimeZoneId` cannot parse 'BST', and 'BST' is
    // British Summer Time for half the year and Bangladesh Standard Time all of
    // it. `startsAt`/`endsAt` are computed in this zone.
    timezone: 'Europe/London',
    // Defaulted from the member's residence, editable, never silently assumed.
    countryCode: '',
    cityName: 'London',
    areaName: 'Peckham',
    addressLine: '',
    landmark: '',
    organizerName: '',
    phone: '',
    whatsapp: '',
    website: '',
    email: '',
    // The server has no price field — a flag, not an amount. See EventFormState.
    isFree: true,
    isRecurring: false,
    recurrencePattern: 'Weekly',
    neighborhood: ''
  });

  /**
   * Prefill the country from the member's residence, once.
   *
   * An effect rather than a `useState` initialiser because the session is
   * restored asynchronously — `store/auth.ts` reads the keystore on mount, so at
   * first render `user` is null and an initialiser would capture the empty
   * string permanently. Guarded on the field being untouched so it can never
   * overwrite a country the member chose themselves.
   */
  useEffect(() => {
    if (!residenceCountry) return;
    setFormData((prev) => (prev.countryCode ? prev : { ...prev, countryCode: residenceCountry }));
  }, [residenceCountry]);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCategories = EVENT_CATEGORIES.filter(cat =>
    cat.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const updateField = (key: keyof EventFormState, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleNext = () => {
    if (step === 2) {
      if (!formData.title.trim()) {
        showAlert({ type: 'error', title: 'Validation Error', message: 'Event title is required.' });
        return;
      }
      if (!formData.summary.trim()) {
        showAlert({
          type: 'error',
          title: 'Validation Error',
          message: 'A one-line summary is required — it is what people see in a list.',
        });
        return;
      }
      if (!formData.description.trim()) {
        showAlert({ type: 'error', title: 'Validation Error', message: 'Event description is required.' });
        return;
      }
    }
    if (step === 4) {
      if (!formData.addressLine.trim()) {
        showAlert({ type: 'error', title: 'Validation Error', message: 'Address Line is required.' });
        return;
      }
    }
    setStep(prev => prev + 1);
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(prev => prev - 1);
    } else {
      router.back();
    }
  };

  /**
   * `YYYY-MM-DD` + `HH:MM` in the event's own zone, as an instant.
   *
   * `StartsAt`/`EndsAt` are `DateTimeOffset` and required. The form holds a wall
   * clock and a zone, so the conversion has to happen somewhere — and it happens
   * through `convertToInstant`, which is the platform's only wall-clock-to-instant
   * conversion and is DST-aware in two passes.
   *
   * Deliberately the same function `event/[id].tsx` uses to resolve a reminder's
   * `subjectMoment`, so a created event and a reminder set on it cannot disagree
   * across a daylight-saving boundary. A second `new Date(...)` here would be a
   * second set of DST bugs, found separately, twice a year.
   *
   * An end earlier than the start is treated as running past midnight rather
   * than as invalid — a 22:00–01:00 event is ordinary, and refusing it would
   * reject exactly the events most worth having.
   */
  const toInstants = (): { startsAt: string; endsAt: string } | null => {
    const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(formData.date.trim());
    const start = /^(\d{1,2}):(\d{2})/.exec(formData.time.trim());
    const end = /^(\d{1,2}):(\d{2})/.exec(formData.endTime.trim());
    if (!date || !start || !end) return null;

    const wall = (t: RegExpExecArray) => ({
      year: Number(date[1]),
      month: Number(date[2]),
      day: Number(date[3]),
      hour: Number(t[1]),
      minute: Number(t[2]),
    });

    const zone = formData.timezone || 'UTC';
    const startsAt = convertToInstant(wall(start), zone).instant;
    let endsAt = convertToInstant(wall(end), zone).instant;

    if (endsAt.getTime() <= startsAt.getTime()) {
      endsAt = new Date(endsAt.getTime() + 24 * 60 * 60_000);
    }

    return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
  };

  /**
   * The create payload, as `CreateEventRequest` actually declares it.
   *
   * ── This screen could not create an event ──────────────────────────────────
   *
   * `CreateEventRequest` declares six `required` members and this payload
   * supplied **one**. C# `required` means System.Text.Json refuses the body
   * before any handler runs, so every publish and every draft-save 400'd, and
   * the screen reported "Failed to publish event" — which read as a network
   * problem.
   *
   * Wave E edited this very function: it corrected `coverImage` → `media` and
   * left a comment about *"a property the server has no field for, discarded
   * silently"*. It fixed the one field it was looking at and did not read the
   * other five. The comment it left is about this class of defect.
   *
   * What changed, field by field:
   *
   *   `summary`      new required field on the form; not truncated from
   *                  `description`, which the DTO declares separately.
   *   `categoryKey`  the seeded catalogue key, via `toEventCategoryKey`. The
   *                  display string ('Naming Ceremony') matched a real key for
   *                  6 of 28 categories by accident; writes 404 on the rest.
   *   `startsAt`/    composed from date + time in the event's IANA zone. `date`,
   *   `endsAt`       `time`, `endTime` and an abbreviation are all gone.
   *   `countryCode`  new required field, defaulted from residence, editable.
   *   `isFree`       replaces `price`/`currency` — the server has no price
   *                  field, so an amount typed here published as free.
   *   `venue`        `addressLine`/`landmark` nested where the DTO puts them.
   *   `contact`      phone/whatsapp/website/email likewise.
   *
   * **`status` is gone.** The DTO has no such member, and the route's own
   * summary says it *"lands as a private draft whatever this says"*. Sending it
   * asked for something the contract does not offer; publishing is a separate
   * act with its own permission and readiness checks.
   *
   * Returns null when the wall clock cannot be parsed, so the caller refuses
   * rather than posting a body the server will reject.
   */
  const buildPayload = (): Record<string, unknown> | null => {
    const instants = toInstants();
    if (!instants) return null;

    return {
      title: formData.title.trim(),
      summary: formData.summary.trim(),
      description: formData.description.trim() || undefined,
      categoryKey: toEventCategoryKey(formData.category),
      startsAt: instants.startsAt,
      endsAt: instants.endsAt,
      timeZoneId: formData.timezone || undefined,
      countryCode: formData.countryCode.trim().toUpperCase(),
      cityName: formData.cityName.trim() || undefined,
      regionName: formData.areaName.trim() || undefined,
      hostName: formData.organizerName.trim() || undefined,
      isFree: formData.isFree,
      venue: {
        addressLine1: formData.addressLine.trim() || undefined,
        landmark: formData.landmark?.trim() || undefined,
      },
      contact: {
        phone: formData.phone?.trim() || undefined,
        whatsapp: formData.whatsapp?.trim() || undefined,
        website: formData.website?.trim() || undefined,
        email: formData.email?.trim() || undefined,
      },
      media: formData.coverImage ? [{ mediaId: formData.coverImage, role: 'Cover' }] : [],
    };
  };

  /**
   * What the server needs before it will accept anything.
   *
   * Checked here rather than left to the 400, because a required field the form
   * never asked for produces an error the member cannot act on — which is what
   * this screen did for every submission it has ever made.
   */
  const missingRequired = (): string | null => {
    if (!formData.title.trim()) return 'Give the event a title.';
    if (!formData.summary.trim()) return 'Add a one-line summary — it is what people see in a list.';
    if (!formData.countryCode.trim()) return 'Choose the country the event is in.';
    if (!toInstants()) return 'Check the date and times.';
    return null;
  };

  const handleSaveDraft = async () => {
    const missing = missingRequired();
    if (missing) {
      showAlert({ type: 'error', title: 'Not saved', message: missing });
      return;
    }

    const payload = buildPayload();
    if (!payload) return;

    setIsDraftSaving(true);
    try {
      await apiClient.post('/community-life/events', payload);
      showAlert({
        type: 'success',
        title: 'Draft saved',
        message: 'Saved as a private draft. Nobody else can see it yet.',
      });
    } catch (err) {
      // The server's own sentence where it gave one. "Failed to save draft" was
      // what this screen said for a 400 it caused itself, and it reads as a
      // network problem the member should retry — which never worked.
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showAlert({
        type: 'error',
        title: 'Not saved',
        message: detail?.trim() || 'The draft could not be saved. Your details are still here.',
      });
    } finally {
      setIsDraftSaving(false);
    }
  };

  /**
   * Creates the event.
   *
   * **It does not publish it, and no longer says it does.** The route's own
   * summary: *"Lands as a private draft whatever this says. Publishing is a
   * separate act with its own permission, its own readiness checks and its own
   * spam pass."* The old handler sent `status: 'Published'` — a member the DTO
   * has no field for — and then navigated to a success screen, so a member was
   * told their event was live when the request had 400'd before any handler ran.
   *
   * The publish route is not called here because this wave did not verify its
   * contract. Saying "created as a draft" is the honest outcome, and naming the
   * next step is better than a success screen that overstates what happened.
   */
  const handlePublish = async () => {
    const missing = missingRequired();
    if (missing) {
      showAlert({ type: 'error', title: 'Not created', message: missing });
      return;
    }

    const payload = buildPayload();
    if (!payload) return;

    setIsSubmitting(true);
    try {
      await apiClient.post('/community-life/events', payload);
      showAlert({
        type: 'success',
        title: 'Event created',
        message:
          'Saved as a draft — it is not visible to anyone yet. You can publish it from your events.',
        buttons: [{ text: 'Done', onPress: () => router.replace('/listing-success') }],
      });
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showAlert({
        type: 'error',
        title: 'Not created',
        message: detail?.trim() || 'The event could not be created. Your details are still here.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FeatureGate featureName="Events">
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface-card">
      
      {/* Top Navbar */}
      <View className="px-6 py-4 border-b border-faint flex-row items-center justify-between bg-surface-card shadow-sm">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={handleBack} className="mr-3 p-1">
            <Ionicons name="arrow-back" size={24} color={tokens.color.text.primary} />
          </TouchableOpacity>
          <View>
            <Text className="text-lg font-black text-content-primary tracking-tight">Create Event</Text>
            <Text className="text-[10px] text-content-muted font-bold uppercase">Step {step} of 6</Text>
          </View>
        </View>

        {/* Auto-save draft action */}
        <TouchableOpacity
          onPress={handleSaveDraft}
          disabled={isDraftSaving}
          className="bg-surface-muted px-3 py-1.5 rounded-xl border border-subtle flex-row items-center"
        >
          {isDraftSaving ? (
            <ActivityIndicator size="small" color="#F59300" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={13} color={tokens.color.text.secondary} className="mr-1" />
              <Text className="text-[10px] font-black text-content-tertiary">SAVE DRAFT</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Progress Bar */}
      <View className="h-1 bg-surface-muted w-full">
        <View
          className="h-full bg-primary-500"
          style={{ width: `${(step / 6) * 100}%` }}
        />
      </View>

      {isSubmitting ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#F59300" />
          <Text className="text-xs text-content-faint font-semibold mt-3">Publishing Community Event...</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior="padding"
          className="flex-1"
        >
          <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          
          {/* STEP 1: CATEGORY */}
          {step === 1 && (
            <View>
              <Text className="text-lg font-black text-content-primary tracking-tight mb-1">Select Event Type</Text>
              <Text className="text-xs text-content-faint font-semibold mb-5">Categorize your event so members can find it under specific filters.</Text>
              
              {/* Dropdown Selector Trigger */}
              <TouchableOpacity
                onPress={() => setIsDropdownOpen(true)}
                className="flex-row justify-between items-center bg-surface-background border border-subtle rounded-2xl p-4 active:bg-surface-muted"
              >
                <View className="flex-row items-center">
                  <View className="w-8 h-8 rounded-full bg-primary-50 items-center justify-center mr-3">
                    <Ionicons name="calendar-outline" size={16} color="#F59300" />
                  </View>
                  <Text className="text-sm font-extrabold text-content-strong">
                    {formData.category || 'Select an event type...'}
                  </Text>
                </View>
                <Ionicons name="chevron-down" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 2: DETAILS */}
          {step === 2 && (
            <View className="gap-5">
              <View>
                <Text className="text-lg font-black text-content-primary tracking-tight mb-1">About Your Event</Text>
                <Text className="text-xs text-content-faint font-semibold">Introduce your event with a title, description and cover image.</Text>
              </View>

              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Event Title</Text>
                <TextInput
                  placeholder="e.g. Independence Celebration Barbecue"
                  value={formData.title}
                  onChangeText={(val) => updateField('title', val)}
                  className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                />
              </View>

              {/* Required by the server, and genuinely distinct from the
                  description below: the DTO declares `Summary` required and
                  `Description` optional, so a list card can show the short form
                  without loading the long one.

                  Not derived by truncating the description — a sentence cut at
                  140 characters reads as a mistake, and the member is the only
                  one who knows what the short version should say. */}
              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">
                  One-line summary
                </Text>
                <TextInput
                  placeholder="e.g. Monthly networking for Nigerian professionals in South London"
                  value={formData.summary}
                  onChangeText={(val) => updateField('summary', val)}
                  className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                  maxLength={200}
                />
                <Text className="text-[10px] text-content-faint font-medium mt-1.5">
                  This is what people see in a list, before they open the event.
                </Text>
              </View>

              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Description</Text>
                <TextInput
                  placeholder="Describe what will happen, agenda timeline, ticket details, or dietary info..."
                  value={formData.description}
                  onChangeText={(val) => updateField('description', val)}
                  className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                  multiline
                  numberOfLines={5}
                  textAlignVertical="top"
                />
              </View>

              <ImagePickerInput
                label="Cover Image"
                value={formData.coverImage}
                onChangeImage={(uri) => updateField('coverImage', uri)}
              />
            </View>
          )}

          {/* STEP 3: DATE & TIME */}
          {step === 3 && (
            <View className="gap-5">
              <View>
                <Text className="text-lg font-black text-content-primary tracking-tight mb-1">Timing Details</Text>
                <Text className="text-xs text-content-faint font-semibold">Specify the date, timings and recurring settings.</Text>
              </View>

              <DatePickerInput
                label="Date"
                value={formData.date}
                onChangeDate={(val) => updateField('date', val)}
                placeholder="Select event date..."
              />

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Start Time</Text>
                  <TextInput
                    placeholder="e.g. 13:00"
                    value={formData.time}
                    onChangeText={(val) => updateField('time', val)}
                    className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">End Time</Text>
                  <TextInput
                    placeholder="e.g. 17:00"
                    value={formData.endTime}
                    onChangeText={(val) => updateField('endTime', val)}
                    className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                  />
                </View>
              </View>

              {/* Recurring Event toggle with future-ready indicator */}
              <View className="bg-surface-background border border-subtle rounded-2xl p-4 mt-2">
                <View className="flex-row justify-between items-center">
                  <View className="flex-1 mr-3">
                    <Text className="text-xs font-black text-content-secondary">Recurring Event (Future-ready)</Text>
                    <Text className="text-[10px] text-content-muted font-bold mt-0.5">
                      Check this to define weekly, monthly or daily repeating schedules.
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => updateField('isRecurring', !formData.isRecurring)}
                    className={`w-10 h-6 rounded-full p-0.5 justify-center ${
                      formData.isRecurring ? 'bg-primary-500 items-end' : 'bg-line items-start'
                    }`}
                  >
                    <View className="w-5 h-5 bg-surface-card rounded-full shadow-sm" />
                  </TouchableOpacity>
                </View>

                {formData.isRecurring && (
                  <View className="border-t border-subtle mt-3 pt-3 flex-row gap-2">
                    {['Weekly', 'Monthly', 'Annual'].map(p => (
                      <TouchableOpacity
                        key={p}
                        onPress={() => updateField('recurrencePattern', p)}
                        className={`px-3 py-1.5 rounded-xl border ${
                          formData.recurrencePattern === p ? 'bg-primary-50 border-primary-300' : 'bg-surface-muted border-subtle'
                        }`}
                      >
                        <Text className={`text-[10px] font-black ${
                          formData.recurrencePattern === p ? 'text-primary-500' : 'text-content-muted'
                        }`}>{p}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>
          )}

          {/* STEP 4: LOCATION */}
          {step === 4 && (
            <View className="gap-5">
              <View>
                <Text className="text-lg font-black text-content-primary tracking-tight mb-1">Event Location</Text>
                <Text className="text-xs text-content-faint font-semibold">Where will the attendees gather?</Text>
              </View>

              <View className="flex-row gap-3">
                {/* Required by the server, and it had no source on this form at
                    all — which is one of the six reasons every submission 400'd.

                    Prefilled from the member's residence country and left
                    editable, because where an event is need not be where its
                    organiser lives, and a diaspora platform is the last place to
                    assume otherwise. Deliberately not defaulted silently: Wave A
                    had to remove `|| 'GB'` fallbacks from the registration flow,
                    and an event filed under the wrong country is worse than a
                    form with one more question. */}
                <View className="flex-1">
                  <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">
                    Country
                  </Text>
                  <TextInput
                    placeholder="e.g. GB"
                    value={formData.countryCode}
                    onChangeText={(val) => updateField('countryCode', val.toUpperCase().slice(0, 2))}
                    className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                    autoCapitalize="characters"
                    maxLength={2}
                    accessibilityLabel="Country the event is in, as a two-letter code"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">City</Text>
                  <TextInput
                    placeholder="e.g. London"
                    value={formData.cityName}
                    onChangeText={(val) => updateField('cityName', val)}
                    className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Area / Neighborhood</Text>
                  <TextInput
                    placeholder="e.g. Peckham"
                    value={formData.areaName}
                    onChangeText={(val) => updateField('areaName', val)}
                    className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                  />
                </View>
              </View>

              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Address Line</Text>
                <TextInput
                  placeholder="e.g. 128 Rye Lane, Peckham, SE15 4RZ"
                  value={formData.addressLine}
                  onChangeText={(val) => updateField('addressLine', val)}
                  className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                />
              </View>

              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Nearby Landmark</Text>
                <TextInput
                  placeholder="e.g. Opposite Peckham Rye Station"
                  value={formData.landmark}
                  onChangeText={(val) => updateField('landmark', val)}
                  className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                />
              </View>

              {/* Neighborhood Parameter (Future) */}
              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Neighborhood (Future-ready)</Text>
                <TextInput
                  placeholder="Define local neighborhood boundaries..."
                  value={formData.neighborhood}
                  onChangeText={(val) => updateField('neighborhood', val)}
                  className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                />
              </View>
            </View>
          )}

          {/* STEP 5: CONTACT & PRICING */}
          {step === 5 && (
            <View className="gap-5">
              <View>
                <Text className="text-lg font-black text-content-primary tracking-tight mb-1">Pricing & Contacts</Text>
                <Text className="text-xs text-content-faint font-semibold font-medium">Define entry costs and organizer coordinates.</Text>
              </View>

              {/* A flag, not an amount.

                  `CreateEventRequest` has **no price field**, and says why:
                  "paid events and ticketing are explicitly out of scope, and a
                  price field would be the first half of a payment system." The
                  two inputs that were here collected an amount, showed it back
                  on the confirm step, and dropped it — so an event advertised at
                  £15 in the preview published as free. */}
              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">
                  Is there anything to pay at the door?
                </Text>
                <TouchableOpacity
                  onPress={() => updateField('isFree', !formData.isFree)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: !formData.isFree }}
                  accessibilityLabel="Charge on the door"
                  className="bg-surface-background border border-subtle rounded-xl p-4 flex-row items-center justify-between"
                >
                  <Text className="text-xs font-black text-content-strong">
                    {formData.isFree ? 'Free entry' : 'Pay on the door'}
                  </Text>
                  <View
                    className={`w-12 h-6 rounded-full p-1 justify-center ${
                      !formData.isFree ? 'bg-primary-500 items-end' : 'bg-line items-start'
                    }`}
                  >
                    <View className="w-4 h-4 rounded-full bg-white" />
                  </View>
                </TouchableOpacity>
                <Text className="text-[10px] text-content-faint font-medium mt-1.5 leading-relaxed">
                  Diaspora does not handle event payments, so an amount cannot be listed here —
                  put the price in the description and collect it yourself.
                </Text>
              </View>

              <View>
                <PhoneInputWithCode
                  label="Phone"
                  value={formData.phone || ''}
                  onChangePhone={(val: string) => updateField('phone', val)}
                  placeholder="7700 900000"
                />
              </View>

              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Email Address</Text>
                <TextInput
                  placeholder="contact@organizer.org"
                  value={formData.email}
                  onChangeText={(val) => updateField('email', val)}
                  className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                />
              </View>
            </View>
          )}

          {/* STEP 6: PREVIEW & PUBLISH */}
          {step === 6 && (
            <View className="gap-5">
              <View>
                <Text className="text-lg font-black text-content-primary tracking-tight mb-1">Preview & Publish</Text>
                <Text className="text-xs text-content-faint font-semibold font-medium">Verify your event layout before sharing it with the diaspora.</Text>
              </View>

              {/* Card Preview Layout */}
              <View className="bg-surface-card rounded-3xl border border-subtle overflow-hidden shadow-md p-4">
                <View className="h-32 bg-subtle rounded-2xl overflow-hidden justify-center items-center">
                  <Ionicons name="sparkles" size={24} color="#9CA3AF" />
                  <Text className="text-[10px] text-content-muted font-black mt-1 uppercase">Image Preview Available</Text>
                </View>
                <View className="mt-3.5">
                  <Text className="text-[9px] font-black text-primary-500 uppercase">{formData.category}</Text>
                  <Text className="text-base font-black text-content-primary mt-1 leading-snug">{formData.title || 'Untitled Event'}</Text>
                  <Text className="text-xs text-content-muted font-bold mt-1">🗓 {formData.date} · ⏱ {formData.time} · 📍 {formData.areaName}</Text>
                  <Text className="text-[10px] font-black text-success-default uppercase mt-2">
                    {formData.isFree ? 'FREE ENTRY' : 'PAY ON THE DOOR'}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Buttons action group */}
          <View className="mt-8 mb-10 flex-row gap-3">
            {step > 1 && (
              <Button
                label="Back"
                variant="outline"
                className="flex-1"
                onPress={handleBack}
              />
            )}
            <Button
              label={step === 6 ? 'Publish' : 'Continue'}
              className="flex-1"
              isLoading={isSubmitting}
              onPress={step === 6 ? handlePublish : handleNext}
            />
          </View>

         </ScrollView>
        </KeyboardAvoidingView>
      )}
      {/* Event Type Bottom Sheet Modal */}
      <Modal
        visible={isDropdownOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setIsDropdownOpen(false);
          setSearchQuery('');
        }}
      
        statusBarTranslucent
        navigationBarTranslucent>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {
            setIsDropdownOpen(false);
            setSearchQuery('');
          }}
          className="flex-1 justify-end bg-black/50"
        >
          <TouchableWithoutFeedback>
            <View className="bg-surface-card rounded-t-[32px] h-[60%] max-h-[500px] p-6 shadow-2xl w-full">
              {/* Drag Handle Indicator */}
              <View className="w-12 h-1 bg-subtle rounded-full mx-auto mb-5" />

              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-lg font-black text-content-primary">Select Event Type</Text>
                <TouchableOpacity
                  onPress={() => {
                    setIsDropdownOpen(false);
                    setSearchQuery('');
                  }}
                  className="p-1"
                >
                  <Ionicons name="close" size={20} color={tokens.color.text.secondary} />
                </TouchableOpacity>
              </View>

              {/* Search Bar */}
              <View className="flex-row items-center border border-subtle rounded-2xl bg-surface-background px-4 py-2.5 mb-4">
                <Ionicons name="search" size={16} color="#9CA3AF" className="mr-2" />
                <TextInput
                  placeholder="Search event types..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  className="flex-1 text-xs font-semibold text-content-primary p-0"
                  placeholderTextColor={tokens.color.text.placeholder}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Options List */}
              <ScrollView className="flex-1 py-1" showsVerticalScrollIndicator={false}>
                {filteredCategories.map((cat) => {
                  const isSelected = formData.category === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      onPress={() => {
                        updateField('category', cat);
                        setIsDropdownOpen(false);
                        setSearchQuery('');
                      }}
                      className={`flex-row items-center justify-between p-3.5 my-1 rounded-2xl ${
                        isSelected ? 'bg-primary-50' : 'active:bg-surface-background'
                      }`}
                    >
                      <Text className={`text-xs ${isSelected ? 'text-primary-500 font-extrabold' : 'text-content-secondary font-bold'}`}>
                        {cat}
                      </Text>
                      {isSelected && <Ionicons name="checkmark-circle" size={18} color="#F59300" />}
                    </TouchableOpacity>
                  );
                })}
                {filteredCategories.length === 0 && (
                  <View className="p-8 items-center justify-center">
                    <Text className="text-xs text-content-muted font-bold">No event types match your search</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      </SafeAreaView>
    </FeatureGate>
  );
}
