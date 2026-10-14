import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FeatureGate } from '@/components/FeatureGate';
import { SearchableSelect } from '@/components/forms/SearchableSelect';
import { TownPicker } from '@/components/forms/TownPicker';
import { coordinatesOf } from '@/lib/place-coordinates';
import { apiClient } from '@/lib/apiClient';
import type { EventFormState } from '@/types/community-life';
import { useCommunityLifeCatalogue } from '@/hooks/community-life-catalogue';
import { useAuthStore } from '@/store/auth';
import { useLocationStore, getActiveLocation } from '@/store/location';
import { toEventCategoryKey } from '@/lib/community-life-catalogue';
import { convertToInstant } from '@/lib/integrations/calendar';
import { ImagePickerInput } from '@/components/ImagePickerInput';
import { DatePickerInput } from '@/components/DatePickerInput';
import { PhoneInputWithCode } from '@/components/PhoneInputWithCode';
import { Button } from '@/components/Button';
import { useNotification } from '@/providers/notification-provider';
import { useThemeTokens } from '@/design-system';
import { defaultScheduleDate } from '@/utils/calendar-date';
import {
  createEventSeries,
  type CreateEventSeriesRequest,
} from '@/lib/community-life-api';
import {
  deviceTimeZone,
  isKnownTimeZone,
  suggestTimeZones,
} from '@/lib/event-timezone';
import { backOr } from '@/lib/navigation';

// Event categories are the server's since 13 Oct 2026 (`useCommunityLifeCatalogue`).
// The form's own 29 labels were folded onto the server's 18 keys, so a member who
// picked "Birthday" or "Comedy Show" saw that and was filed under something else.

/**
 * The form's words for how often, in the platform's.
 *
 * "Annual" is this screen's; `RecurrenceFrequency.Yearly` is the platform's.
 */
const RECURRENCE_FREQUENCIES: Record<string, string> = {
  Weekly: 'Weekly',
  Monthly: 'Monthly',
  Annual: 'Yearly',
};

export default function CreateEventScreen() {
  const tokens = useThemeTokens();
  const { showAlert } = useNotification();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDraftSaving, setIsDraftSaving] = useState(false);

  // Wizard state
  const residenceCountry = useAuthStore((state) => state.user?.residenceCountry);
  const activeLocation = useLocationStore(getActiveLocation);

  const [formData, setFormData] = useState<EventFormState>({
    category: 'networking',
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
    endDate: '',
    // IANA, not an abbreviation. `TimeZoneId` cannot parse 'BST', and 'BST' is
    // British Summer Time for half the year and Bangladesh Standard Time all of
    // it. `startsAt`/`endsAt` are computed in this zone.
    // ── The device's zone, not Europe/London ────────────────────────────────
    //
    // This was hardcoded to `Europe/London`, three lines above a comment
    // promising the place was "defaulted from the member's residence, editable,
    // never silently assumed". `countryCode` honoured that promise; the city,
    // the area and the zone did not: a member in Port Louis opened the form on
    // country MU, city London, area Peckham and British Summer Time, and
    // `startsAt`/`endsAt` were computed in that zone.
    timezone:
      (typeof Intl !== 'undefined' &&
        Intl.DateTimeFormat().resolvedOptions().timeZone) ||
      'UTC',
    // The member's verified country of residence, never asked (owner's rule,
    // 14 Oct 2026); filled by the effect below once the session is restored.
    countryCode: '',
    // Empty, because the app does not know. The effect below fills these from
    // the member's active discovery location when there is one.
    cityName: '',
    areaName: '',
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
    recurrencePattern: 'Weekly'
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

  // The member's active discovery location is the best guess for where they are
  // holding an event, and it is a guess they made — either by choosing a place
  // or by letting the handset locate them. Only fills blanks, never overwrites.
  useEffect(() => {
    if (!activeLocation) return;
    setFormData((prev) => ({
      ...prev,
      cityName: prev.cityName || activeLocation.cityName,
      areaName: prev.areaName || activeLocation.neighborhood,
    }));
  }, [activeLocation]);

  // **The event's clock, stated rather than assumed.**
  //
  // `timezone` defaults to this handset's, and the country defaults to the
  // member's residence QQ two different questions that can disagree. The first
  // event this platform published was created in Port Louis on a handset set
  // to Africa/Lagos and stored three hours out, and nothing on the form said
  // which clock it was using.
  const [zoneDraft, setZoneDraft] = useState<string | null>(null);

  const { eventCategories, eventCategoryName, isLoading: catalogueLoading, isUnavailable: catalogueUnavailable } = useCommunityLifeCatalogue();

  const updateField = (key: keyof EventFormState, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleNext = () => {
    setStep(prev => prev + 1);
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(prev => prev - 1);
    } else {
      backOr();
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
    // The end's own day, for an event over several days. Blank: the start's day.
    const endDay = /^(\d{4})-(\d{2})-(\d{2})$/.exec(formData.endDate.trim()) ?? date;
    const start = /^(\d{1,2}):(\d{2})/.exec(formData.time.trim());
    const end = /^(\d{1,2}):(\d{2})/.exec(formData.endTime.trim());
    if (!date || !start || !end) return null;

    const wall = (t: RegExpExecArray, day: RegExpExecArray) => ({
      year: Number(day[1]),
      month: Number(day[2]),
      day: Number(day[3]),
      hour: Number(t[1]),
      minute: Number(t[2]),
    });

    const zone = formData.timezone || 'UTC';
    const startsAt = convertToInstant(wall(start, date), zone).instant;
    let endsAt = convertToInstant(wall(end, endDay!), zone).instant;

    // Past midnight only when no end date was given. With one, the member said
    // which day it ends, and an end before the start is refused by the step rule.
    if (endDay === date && endsAt.getTime() <= startsAt.getTime()) {
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
  /**
   * The venue's coordinates (14 Oct 2026). The form has no venue pin of its
   * own, so it is the picked town's, when the town was picked from Google and
   * is still the one on the form; otherwise none, never half a pair.
   */
  const venueCoordinates = (): { latitude?: number; longitude?: number } => {
    if (!formData.cityName.trim()) return {};
    const pin = coordinatesOf(formData);
    return pin.latitude === null || pin.longitude === null
      ? {}
      : { latitude: pin.latitude, longitude: pin.longitude };
  };

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
        ...venueCoordinates(),
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
   * The same event, as a repeating one.
   *
   * **The toggle collected a pattern and threw it away.** `CreateEventRequest`
   * has no recurrence fields, so a member who set up a weekly meetup got a
   * single event and nothing said otherwise. A series is its own route with its
   * own shape: a start date and time with a duration, because a series has no
   * one start.
   *
   * `endKind: 'Never'` matches what the form asks — it asks how often, not
   * until when — and the platform tops occurrences up to a rolling horizon,
   * so "never" is a real answer here rather than a missing one.
   */
  const buildSeriesPayload = (publish: boolean): CreateEventSeriesRequest | null => {
    const instants = toInstants();

    if (!instants) {
      return null;
    }

    const start = new Date(instants.startsAt);
    const end = new Date(instants.endsAt);
    const durationMinutes = Math.max(Math.round((end.getTime() - start.getTime()) / 60000), 1);

    // **`TimeOnly` wants two digits for the hour.** The form's own regex takes
    // `9:30` — it parses that itself, so a single event created at half nine
    // works — but `System.Text.Json` reads a `TimeOnly` as ISO 8601 and
    // refuses `9:30`. Unpadded, this path alone would 400, and only for people
    // who happen not to type a leading zero.
    const wall = /^(\d{1,2}):(\d{2})/.exec(formData.time.trim());
    const startTime = wall
      ? `${wall[1].padStart(2, '0')}:${wall[2]}`
      : formData.time.trim();

    return {
      title: formData.title.trim(),
      summary: formData.summary.trim(),
      description: formData.description.trim() || undefined,
      categoryKey: toEventCategoryKey(formData.category),
      startDate: formData.date,
      startTime,
      durationMinutes,
      timeZoneId: formData.timezone || undefined,
      recurrence: {
        frequency: RECURRENCE_FREQUENCIES[formData.recurrencePattern ?? 'Weekly'] ?? 'Weekly',
        interval: 1,
        endKind: 'Never',
      },
      countryCode: formData.countryCode.trim().toUpperCase(),
      cityName: formData.cityName.trim() || undefined,
      regionName: formData.areaName.trim() || undefined,
      venue: {
        addressLine1: formData.addressLine.trim() || undefined,
        landmark: formData.landmark?.trim() || undefined,
        ...venueCoordinates(),
      },
      contact: {
        phone: formData.phone?.trim() || undefined,
        whatsApp: formData.whatsapp?.trim() || undefined,
        email: formData.email?.trim() || undefined,
        website: formData.website?.trim() || undefined,
      },
      isFree: formData.isFree,
      isFamilyFriendly: false,
      isChildFriendly: false,
      isStudentFocused: false,
      publish,
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
    if (!formData.countryCode.trim()) return 'Your profile has no country of residence. Set it on your profile first.';
    if (!toInstants()) return 'Check the date and times.';
    return null;
  };

  /**
   * What each step will not go forward without, by the name above the field.
   *
   * <p>
   * <b>Two of these were never asked for until the last tap.</b> The steps
   * checked the title, the summary, the description and the address line, each
   * in a "Validation Error" alert after the member had already moved; the
   * country and the date were checked only in `missingRequired`, which runs at
   * Publish. So an organiser could fill in six steps, tap Publish, and be told
   * to choose a country they last saw two steps ago.
   * </p>
   * <p>
   * Step 1 is the event type, which is defaulted rather than blank, and steps 5
   * and 6 collect nothing the platform refuses a draft without. They declare
   * empty lists, which is a step somebody decided about rather than one nobody
   * looked at.
   * </p>
   */
  const requiredByStep: Record<number, { label: string; ok: boolean }[]> = {
    1: [],
    2: [
      { label: 'Event Title', ok: formData.title.trim().length > 0 },
      { label: 'One-line summary', ok: formData.summary.trim().length > 0 },
      { label: 'Description', ok: formData.description.trim().length > 0 },
    ],
    3: [
      { label: 'Date', ok: formData.date.trim().length > 0 },
      { label: 'Start Time', ok: formData.time.trim().length > 0 },
      { label: 'End Time', ok: formData.endTime.trim().length > 0 },
      // Optional, but when given it must not be before the start. ISO dates compare
      // as strings. The server's own ceiling is 30 days.
      {
        label: 'An end date on or after the start date',
        ok: !formData.endDate.trim() || formData.endDate.trim() >= formData.date.trim(),
      },
    ],
    4: [
      { label: 'Country of residence (set it on your profile)', ok: formData.countryCode.trim().length > 0 },
      { label: 'Address Line', ok: formData.addressLine.trim().length > 0 },
    ],
    5: [],
    6: [],
  };

  const stillNeeded = (requiredByStep[step] ?? [])
    .filter((field) => !field.ok)
    .map((field) => field.label);

  /**
   * What is wrong with a step whose fields are all filled in.
   *
   * The times are the only ones: they are typed, so they can be present and
   * unreadable. At the last step this is `missingRequired`, which reads every
   * step at once — a member can walk back, empty the title and walk forward.
   */
  const valueProblem =
    stillNeeded.length > 0
      ? null
      : step === 3
        ? toInstants()
          ? null
          : 'Check the date and times — the date as YYYY-MM-DD, the times as HH:MM.'
        : step === 6
          ? missingRequired()
          : null;

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
      if (formData.isRecurring) {
        // **A repeating event is a different thing on the platform.** The
        // toggle used to collect a pattern that went nowhere; it now creates
        // the series the pattern describes.
        const series = buildSeriesPayload(false);

        if (!series) return;

        const created = await createEventSeries(series);

        showAlert({
          type: 'success',
          title: 'Series created',
          // The server's sentence for the rule, not one composed here.
          // `RecurrenceRuleRequest` asks for exactly that: the semantics live
          // on the platform, and a sentence written beside a different set of
          // rules drifts from them. See CreatedSeries.
          message: created.description
            ? `${created.description}. Saved as a draft ${'\u2014'} nobody else can see it yet.`
            : `Saved as a draft ${'\u2014'} nobody else can see it yet.`,
          buttons: [
            {
              // **To the series, not to a success page.** A draft series has to
              // be publishable, and the only screen that can do that is its own.
              // Sending the organiser to `/listing-success` left the thing they
              // had just made with nothing pointing at it \u2014 the same way the
              // first draft organisation on this platform became unreachable.
              text: created.id ? 'Open it' : 'Done',
              onPress: () =>
                router.replace(
                  created.id
                    ? (`/community-life/series/${created.id}` as never)
                    : ('/listing-success' as never)
                ),
            },
          ],
        });

        return;
      }

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
      const noun = formData.isRecurring ? 'series' : 'event';
      showAlert({
        type: 'error',
        title: 'Not created',
        message:
          detail?.trim() ||
          `The ${noun} could not be created. Your details are still here.`,
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
              
              {/* The shared dropdown with search (14 Oct 2026). Server keys. */}
              <SearchableSelect
                label="Event type"
                placeholder="Select an event type..."
                searchPlaceholder="Search event types"
                options={eventCategories.map((cat) => ({ key: cat.key, label: cat.name }))}
                value={formData.category || null}
                onChange={(key) => updateField('category', key)}
                isLoading={catalogueLoading}
                unavailableMessage={
                  catalogueUnavailable ? 'Diaspora could not load the event types. Check your connection and try again.' : null
                }
                testID="event-category"
              />
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

              {/* Added 5 Oct 2026: without it the form could not post anything longer
                  than a day, though the platform accepts events of up to 30 days. */}
              <DatePickerInput
                label="End date (if it runs over several days)"
                value={formData.endDate}
                onChangeDate={(val) => updateField('endDate', val)}
                placeholder="Same day"
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
                    <Text className="text-xs font-black text-content-secondary">Repeats</Text>
                    <Text className="text-[10px] text-content-muted font-bold mt-0.5">
                      Creates a series. Every occurrence is generated for you.
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

              {/* The country is the member's verified residence, never asked
                  (14 Oct 2026); it was a typed two-letter field. The town comes
                  from the one shared search of towns in that country. */}
              <TownPicker
                label="City"
                value={formData.cityName}
                onChange={(town) =>
                  setFormData((prev) => ({ ...prev, cityName: town.cityName, ...coordinatesOf(town) }))
                }
                testID="event-town"
              />

              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Area / Neighborhood</Text>
                <TextInput
                  placeholder="e.g. Rose Hill, Peckham, East Legon"
                  value={formData.areaName}
                  onChangeText={(val) => updateField('areaName', val)}
                  className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                />
              </View>

              {/*
                **Which clock the times are on.**

                This was never shown. `timezone` is taken from the handset and
                the country from the member's residence, so an organiser in
                Port Louis with a phone set to Africa/Lagos filed an event three
                hours out and had no way to notice — the form asked for a time
                and never said whose.

                Deriving it from the country would need a table this repository
                does not have, and being confidently wrong about somebody's
                event time is worse than a default that is at least stated. So
                it is stated, and it can be changed.
              */}
              <View className="bg-surface-background border border-subtle rounded-2xl p-4 mt-2">
                <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-1">
                  Times are saved in
                </Text>
                <Text className="text-sm font-black text-content-strong">{formData.timezone}</Text>
                <Text className="text-[10px] text-content-muted font-semibold mt-1 leading-relaxed">
                  {formData.timezone === deviceTimeZone()
                    ? "This device's timezone. Change it if the event is somewhere else."
                    : 'You chose this.'}
                </Text>

                {zoneDraft === null ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Change the timezone this event is saved in"
                    onPress={() => setZoneDraft(formData.timezone)}
                    className="mt-3 self-start"
                  >
                    <Text className="text-[11px] font-black text-primary-500 uppercase tracking-widest">
                      Change timezone
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View className="mt-3">
                    <TextInput
                      placeholder="e.g. Indian/Mauritius"
                      value={zoneDraft}
                      onChangeText={setZoneDraft}
                      autoCapitalize="none"
                      autoCorrect={false}
                      className="bg-surface-card border border-subtle rounded-xl p-3 text-xs font-semibold text-content-strong"
                      accessibilityLabel="Timezone identifier"
                    />

                    {suggestTimeZones(formData.countryCode, formData.cityName).length > 0 ? (
                      <View className="flex-row flex-wrap gap-2 mt-2">
                        {suggestTimeZones(formData.countryCode, formData.cityName)
                          .slice(0, 4)
                          .map((zone) => (
                            <TouchableOpacity
                              key={zone}
                              accessibilityRole="button"
                              onPress={() => setZoneDraft(zone)}
                              className="bg-surface-card border border-subtle rounded-full px-3 py-1.5"
                            >
                              <Text className="text-[10px] font-black text-content-secondary">
                                {zone}
                              </Text>
                            </TouchableOpacity>
                          ))}
                      </View>
                    ) : null}

                    <View className="flex-row gap-2 mt-3">
                      <TouchableOpacity
                        accessibilityRole="button"
                        onPress={() => {
                          const zone = (zoneDraft ?? '').trim();

                          // A name this runtime cannot resolve would be stored
                          // and then silently ignored by every reader of it.
                          if (!isKnownTimeZone(zone)) {
                            showAlert({
                              type: 'error',
                              title: 'Not a timezone',
                              message:
                                'Use an identifier like Indian/Mauritius or Africa/Lagos.',
                            });
                            return;
                          }

                          updateField('timezone', zone);
                          setZoneDraft(null);
                        }}
                        className="bg-primary-500 rounded-full px-5 py-2.5"
                      >
                        <Text className="text-white text-[10px] font-black uppercase tracking-widest">
                          Save
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        accessibilityRole="button"
                        onPress={() => setZoneDraft(null)}
                        className="border border-subtle rounded-full px-5 py-2.5"
                      >
                        <Text className="text-[10px] font-black text-content-secondary uppercase tracking-widest">
                          Cancel
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>

              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Address Line</Text>
                <TextInput
                  placeholder="e.g. 12 Royal Road, Rose Hill"
                  value={formData.addressLine}
                  onChangeText={(val) => updateField('addressLine', val)}
                  className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                />
              </View>

              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Nearby Landmark</Text>
                <TextInput
                  placeholder="e.g. Opposite the bus station"
                  value={formData.landmark}
                  onChangeText={(val) => updateField('landmark', val)}
                  className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                />
              </View>

              {/*
                **There was a second neighbourhood box here, and it went
                nowhere.** It collected free text that no payload carried, and
                it sat directly beneath "Area / Neighborhood" — which is
                sent, as `regionName`. So the field the organiser was most
                likely to fill in was the dead one.

                It cannot be connected as written either: the platform takes a
                `NeighborhoodAreaId`, a reference into the area catalogue, not
                a name somebody typed. Naming a boundary is a real feature and
                this was never the start of it.
              */}
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
                  <Text className="text-[9px] font-black text-primary-500 uppercase">{eventCategoryName(formData.category)}</Text>
                  <Text className="text-base font-black text-content-primary mt-1 leading-snug">{formData.title || 'Untitled Event'}</Text>
                  {/* The review is what the member checks before publishing, so it shows what
                      will be saved: both days of a multi-day event, and a place even when the
                      optional area is blank (it was a bare 📍 for an event with a city only). */}
                  <Text className="text-xs text-content-muted font-bold mt-1">
                    🗓 {formData.endDate.trim() && formData.endDate.trim() !== formData.date.trim()
                      ? `${formData.date} – ${formData.endDate}`
                      : formData.date}
                    {' · '}⏱ {formData.time}–{formData.endTime}
                    {' · '}📍 {[formData.areaName, formData.cityName, formData.countryCode]
                      .map((part) => part.trim())
                      .filter(Boolean)
                      .join(', ') || 'No place yet'}
                  </Text>
                  {/*
                    The preview is the last thing an organiser reads before
                    pressing Publish, and for a repeating event it showed one
                    date and said nothing about the rest — the single fact that
                    makes this a series rather than an event.

                    The sentence stays deliberately plain: the platform writes
                    the real one and only answers with it after the series
                    exists, so anything more specific here would be the client
                    composing recurrence semantics of its own.
                  */}
                  {formData.isRecurring ? (
                    <Text className="text-xs text-content-muted font-bold mt-1">
                      🔁 Repeats {(formData.recurrencePattern ?? 'Weekly').toLowerCase()} from this date
                    </Text>
                  ) : null}
                  <Text className="text-[10px] font-black text-success-default uppercase mt-2">
                    {formData.isFree ? 'FREE ENTRY' : 'PAY ON THE DOOR'}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Buttons action group */}
          <View className="mt-8 mb-10">
            {/* Named, on the step that needs it, rather than as an alert after
                the member has already tapped. */}
            {stillNeeded.length > 0 ? (
              <Text className="text-xs font-semibold text-content-muted mb-3">
                Still needed: {stillNeeded.join(', ')}
              </Text>
            ) : valueProblem ? (
              <Text className="text-xs font-semibold text-content-muted mb-3">{valueProblem}</Text>
            ) : null}

            <View className="flex-row gap-3">
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
                disabled={stillNeeded.length > 0 || valueProblem !== null}
                onPress={step === 6 ? handlePublish : handleNext}
              />
            </View>
          </View>

         </ScrollView>
        </KeyboardAvoidingView>
      )}

      </SafeAreaView>
    </FeatureGate>
  );
}
