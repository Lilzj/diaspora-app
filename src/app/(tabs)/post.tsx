import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, TextInput, Animated, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { CategoryChip } from '@/components/CategoryChip';
import { mockCategories } from '@/mocks/data';
import { CurrencyNote } from '@/components/CurrencyNote';
import { useMemberCurrency } from '@/lib/member-currency';
import { Image } from 'expo-image';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useNotification } from '@/providers/notification-provider';
import { useAuthStore } from '@/store/auth';
import { toLocalFile } from '@/hooks/media';
import { Ionicons } from '@expo/vector-icons';
import { PhotoDropZone } from '@/components/PhotoDropZone';
import type { LocalFile } from '@/types/media';
import {
  createAndPublishProvider,
  type ProviderHoursDay,
  type ProviderServiceRequest,
} from '@/lib/provider-registration-api';
import { PhoneInputWithCode } from '@/components/PhoneInputWithCode';
import { useServiceCategories } from '@/hooks/providers';

// Global variable for self-contained draft storage
let globalDraftStorage: any = null;

const steps = ['Basics', 'Contact Info', 'Services & Menu', 'Photos', 'Business Hours', 'Preview'];

interface ServiceItem {
  id: string;
  name: string;
  minPrice: string;
  maxPrice: string;
}

// Empty, deliberately (UAT-002).
//
// This used to open with three Ghanaian takeaway dishes and their prices, so a
// barber, an accountant and a mechanic all began by deleting somebody else's
// menu — and anyone who did not notice published it. A prefilled form is a
// suggestion the member did not ask for and, on a listing, a claim about their
// business that they did not make.
const DEFAULT_SERVICES: ServiceItem[] = [];

interface HourItem {
  day: string;
  open: string;
  close: string;
  closed: boolean;
}


const INITIAL_HOURS: HourItem[] = [
  { day: 'Monday', open: '09:00', close: '18:00', closed: false },
  { day: 'Tuesday', open: '09:00', close: '18:00', closed: false },
  { day: 'Wednesday', open: '09:00', close: '18:00', closed: false },
  { day: 'Thursday', open: '09:00', close: '18:00', closed: false },
  { day: 'Friday', open: '09:00', close: '18:00', closed: false },
  { day: 'Saturday', open: '10:00', close: '16:00', closed: false },
  { day: 'Sunday', open: '10:00', close: '16:00', closed: true },
];

/**
 * The wizard's services, as the platform's `ProviderServiceRequest`.
 *
 * `PricingModel` is chosen from what the member actually entered rather than
 * fixed, because the server validates the two against each other: `Range`
 * demands both amounts with the minimum at or below the maximum, and `Fixed`
 * demands that the maximum be absent. Sending `Range` for a single price — the
 * obvious shortcut — is refused, and the refusal would read to the member as
 * "your price is wrong".
 *
 * A service with no amounts is sent with no pricing at all, which the server
 * reads as `Unspecified`: "the provider will tell you if you ask". That is a
 * true statement about a service somebody chose not to price, and it is not the
 * same as free.
 */
function toServiceRequests(
  services: ServiceItem[],
  currency: string
): ProviderServiceRequest[] {
  return services
    .filter((service) => service.name.trim().length > 0)
    .map((service) => {
      const min = Number.parseFloat(service.minPrice);
      const max = Number.parseFloat(service.maxPrice);
      const hasMin = Number.isFinite(min);
      const hasMax = Number.isFinite(max);

      if (!hasMin && !hasMax) {
        return { name: service.name.trim() };
      }

      // A max on its own is still one price; a max equal to the min is one
      // price the member happened to type twice.
      const isRange = hasMin && hasMax && max > min;

      return {
        name: service.name.trim(),
        pricing: isRange
          ? { model: 'Range', minAmount: min, maxAmount: max, currency }
          : { model: 'Fixed', minAmount: hasMin ? min : max, currency },
      };
    });
}

/**
 * The wizard's week, as the platform's `OperatingHoursRequest` list.
 *
 * Every day is sent, including the closed ones: `isClosed` is the statement
 * "we do not open on Sundays", and omitting the day instead would say nothing
 * and leave whatever was stored in place. On a first registration those are
 * indistinguishable; on a later edit they are not, and the two must not diverge
 * between the create path and the edit path.
 */
function toOperatingHours(hours: HourItem[], is24Hours: boolean): ProviderHoursDay[] {
  return hours.map((hour) => {
    if (is24Hours) {
      // 23:59 rather than 24:00: `TimeOnly` has no 24th hour, and 00:00–00:00
      // would be read as a zero-length window rather than a whole day.
      return { dayOfWeek: hour.day, isClosed: false, windows: [{ opensAt: '00:00', closesAt: '23:59' }] };
    }

    if (hour.closed) {
      return { dayOfWeek: hour.day, isClosed: true, windows: [] };
    }

    return {
      dayOfWeek: hour.day,
      isClosed: false,
      windows: [{ opensAt: hour.open, closesAt: hour.close }],
    };
  });
}

export default function PostScreen() {
  // Under the tab bar, which is in the layout flow and reserves the safe
  // area itself, so this is the breathing room above it.
  const bottomInset = useBottomInset({ chrome: 'tab-bar' });

  const { showAlert } = useNotification();
  const user = useAuthStore((state) => state.user);

  const [currentStep, setCurrentStep] = useState(0);
  const [draftBannerVisible, setDraftBannerVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form States
  const [businessName, setBusinessName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  // The server's own top-level categories, by slug (13 Oct 2026). This listed the
  // `mockCategories` fixture, whose ids the server did not know — every listing
  // failed with "category not found" — and which lacked four of its categories.
  const { categories: serviceCategories } = useServiceCategories();
  const topCategories = serviceCategories.filter((category) => !category.parentId);
  const categoryName = (key: string) =>
    serviceCategories.find((category) => category.slug === categoryKey(key))?.name ?? 'Category';
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [email, setEmail] = useState('');
  const [instagram, setInstagram] = useState('');
  const [facebook, setFacebook] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [socialsExpanded, setSocialsExpanded] = useState(false);

  // Services & Menu State
  const [services, setServices] = useState<ServiceItem[]>(DEFAULT_SERVICES);
  const [newServiceName, setNewServiceName] = useState('');
  const [newMinPrice, setNewMinPrice] = useState('');
  const [newMaxPrice, setNewMaxPrice] = useState('');
  // The member's own currency, from their country of residence (13 Oct 2026).
  // The chip row that stood here defaulted to GBP, so a business in Mauritius
  // that did not notice it published its menu in pounds.
  const memberCurrency = useMemberCurrency();
  const currency = memberCurrency.code;

  // Photos
  //
  // `LocalFile`, not a URL string. The old state held a *remote* URL because
  // nothing was ever picked — the slots were filled with stock photographs. The
  // member's own file is what belongs here, and it is uploaded at publish time
  // rather than at pick time because `POST /media/uploads/direct` needs an owner
  // and the provider does not exist yet.
  // **A list, not four fixed slots.** The four dashed boxes were a fourth
  // design of a control this application now has one of, and holding them as
  // `(LocalFile | null)[4]` meant every reader of this state had to filter the
  // holes out first — `photos:` on submit does, the preview's sub-gallery does,
  // and a reader that forgot would have sent nulls to the platform. The first
  // photograph is the cover, here as in the other two wizards.
  const [uploadedPhotos, setUploadedPhotos] = useState<LocalFile[]>([]);
  const [isPicking, setIsPicking] = useState(false);

  // Business Hours
  const [businessHours, setBusinessHours] = useState<HourItem[]>(INITIAL_HOURS);
  const [is24Hours, setIs24Hours] = useState(false);
  const [holidayExpanded, setHolidayExpanded] = useState(false);

  // Draft Recovery triggers on mount
  useEffect(() => {
    if (globalDraftStorage) {
      setDraftBannerVisible(true);
    }
  }, []);

  // Save draft state periodically
  const saveDraft = () => {
    globalDraftStorage = {
      businessName,
      description,
      selectedCategories,
      phone,
      website,
      email,
      instagram,
      facebook,
      tiktok,
      services,
      uploadedPhotos,
      businessHours,
      is24Hours,
      currentStep,
    };
  };

  useEffect(() => {
    if (businessName || phone || description) {
      saveDraft();
    }
  }, [
    businessName,
    description,
    selectedCategories,
    phone,
    website,
    email,
    instagram,
    facebook,
    tiktok,
    services,
    uploadedPhotos,
    businessHours,
    is24Hours,
  ]);

  const restoreDraft = () => {
    if (globalDraftStorage) {
      const d = globalDraftStorage;
      setBusinessName(d.businessName);
      setDescription(d.description);
      setSelectedCategories(d.selectedCategories);
      setPhone(d.phone);
      setWebsite(d.website);
      setEmail(d.email);
      setInstagram(d.instagram);
      setFacebook(d.facebook);
      setTiktok(d.tiktok);
      if (d.services) setServices(d.services);
      // A draft saved before the list replaced the four slots carries nulls, and
      // `globalDraftStorage` is `any`, so the shape has to be named here or the
      // holes come through untyped.
      const restoredPhotos: (LocalFile | null)[] = d.uploadedPhotos ?? [];
      setUploadedPhotos(restoredPhotos.filter((photo): photo is LocalFile => !!photo));
      setBusinessHours(d.businessHours);
      setIs24Hours(d.is24Hours);
      setCurrentStep(d.currentStep || 0);
      setDraftBannerVisible(false);
    }
  };

  const discardDraft = () => {
    globalDraftStorage = null;
    setDraftBannerVisible(false);
  };

  /**
   * Pick a photograph. (UAT-002)
   *
   * What this replaced: a `setInterval` that animated a progress bar from 10 %
   * to 100 % and then assigned a hardcoded Unsplash URL chosen by slot index. No
   * picker opened, no permission was asked for, and no file left the device —
   * so a barber's listing was illustrated with a stock photograph of a
   * restaurant, and the member had been shown a progress bar to believe
   * otherwise.
   *
   * The upload itself happens in `createAndPublishProvider`, once the provider
   * exists to own it.
   */
  /** Four is the ceiling: `RegisterProviderRequest` carries a gallery, not an album. */
  const MAX_PHOTOS = 4;

  /**
   * What each step needs before it can be left, in the member's own words.
   *
   * `RegisterProviderRequest` marks `Name`, `ProviderType` and `Category`
   * required. The type is not asked for — the wizard offers one kind of
   * listing and sends `Business` — so the two the member supplies are the name
   * and the first category.
   *
   * The remaining five steps are genuinely optional: a provider with no
   * telephone number, no services, no photographs and no opening hours is a
   * thin listing, not a refused one, and the server accepts it. Saying so here
   * is the point of the list — an empty array is a step somebody decided about,
   * where a missing entry is a step nobody looked at.
   */
  const requiredByStep: { label: string; filled: boolean }[][] = [
    [
      { label: 'Business or service name', filled: !!businessName.trim() },
      { label: 'At least one category', filled: selectedCategories.length > 0 },
    ],
    [],
    [],
    [],
    [],
    [],
  ];

  const stillNeeded = (requiredByStep[currentStep] ?? [])
    .filter((field) => !field.filled)
    .map((field) => field.label);

  const handleAddPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      showAlert({
        type: 'error',
        title: 'Permission needed',
        message: 'Diaspora needs access to your photos to add pictures to your listing.',
      });
      return;
    }

    try {
      setIsPicking(true);

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) return;

      setUploadedPhotos((current) => [...current, toLocalFile(result.assets[0])]);
    } catch {
      showAlert({
        type: 'error',
        title: 'Could not add that photo',
        message: 'Something went wrong choosing the picture. Please try again.',
      });
    } finally {
      setIsPicking(false);
    }
  };

  const handleRemovePhoto = (index: number) =>
    setUploadedPhotos((current) => current.filter((_, at) => at !== index));

  // Category selection helper (multi-select)
  const toggleCategory = (catId: string) => {
    if (selectedCategories.includes(catId)) {
      setSelectedCategories(selectedCategories.filter((id) => id !== catId));
    } else {
      setSelectedCategories([...selectedCategories, catId]);
    }
  };

  // Hours helpers
  const handleCopyWeekdays = () => {
    const mondayHours = businessHours[0];
    setBusinessHours(
      businessHours.map((h, i) =>
        i >= 1 && i <= 4 ? { ...h, open: mondayHours.open, close: mondayHours.close, closed: mondayHours.closed } : h
      )
    );
  };

  const handleCopyAllDays = () => {
    const mondayHours = businessHours[0];
    setBusinessHours(
      businessHours.map((h, i) =>
        i >= 1 ? { ...h, open: mondayHours.open, close: mondayHours.close, closed: mondayHours.closed } : h
      )
    );
  };

  const updateDayHour = (idx: number, field: 'open' | 'close' | 'closed', val: any) => {
    const next = [...businessHours];
    next[idx] = { ...next[idx], [field]: val };
    setBusinessHours(next);
  };

  const handleAddService = () => {
    if (!newServiceName.trim()) return;
    const newItem: ServiceItem = {
      id: `svc-${Date.now()}`,
      name: newServiceName.trim(),
      minPrice: newMinPrice.trim() || '0',
      maxPrice: newMaxPrice.trim() || newMinPrice.trim() || '0',
    };
    setServices([...services, newItem]);
    setNewServiceName('');
    setNewMinPrice('');
    setNewMaxPrice('');
  };

  const handleRemoveService = (id: string) => {
    setServices(services.filter((s) => s.id !== id));
  };


  /**
   * Publish. (UAT-002 — the defect this whole file was raised for.)
   *
   * What this replaced, in full:
   *
   *     const handlePublish = () => {
   *       globalDraftStorage = null;
   *       router.push('/listing-success');
   *     };
   *
   * Three lines, no network call, and a success screen reading *"Listing
   * Published! Your business is now live on Diaspora."* The draft was discarded
   * at the moment the member was congratulated, so their work was destroyed by
   * the same statement that told them it was safe.
   *
   * **The draft is now cleared only after the server has answered.** If anything
   * fails the member still has everything they typed, and can try again.
   */
  const handlePublish = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const outcome = await createAndPublishProvider({
        provider: {
          name: businessName.trim(),
          // The wizard offers one kind of listing — "Add a new business,
          // professional, or service" — and `ProviderType` has no member that
          // covers all three, so `Business` is the honest default. A type
          // picker belongs on the edit screen, not in the way of registration.
          providerType: 'Business',
          // `ServiceCategoryResolver` accepts an id, slug, name or legacy alias,
          // which is why the wizard's own label goes straight through. Only the
          // first is sent: `RegisterProviderRequest` takes one category, and the
          // rest are tags below rather than being silently dropped.
          //
          // The SLUG, not the id. `cat-1` is this fixture's own key and means
          // nothing to the server: every provider registration answered 404
          // CategoryNotFound until 13 Oct 2026, which the alert below then
          // reported as "could not reach Diaspora". The ten slugs match the
          // server's ten top-level categories exactly.
          category: categoryKey(selectedCategories[0]),
          description: description.trim() || undefined,
          countryCode: user?.residenceCountry || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          website: website.trim() || undefined,
          tags: selectedCategories.slice(1).map(categoryKey),
        },
        photos: uploadedPhotos,
        services: toServiceRequests(services, currency),
        hours: toOperatingHours(businessHours, is24Hours),
      });

      // Only now. The server has a provider with an id.
      globalDraftStorage = null;

      router.replace({
        pathname: '/listing-success',
        params: {
          providerId: outcome.providerId,
          published: outcome.kind === 'published' ? '1' : '0',
          reason: outcome.kind === 'draft-only' ? outcome.reason : '',
          incomplete: outcome.incomplete.join(','),
        },
      });
    } catch (cause) {
      // Creation itself failed, so nothing exists and nothing was lost. The
      // draft is deliberately still in place.
      //
      // Three messages rather than one, because the member's next step differs
      // completely and the first version of this got it wrong: a 403 was
      // reported as "check your connection", which sends somebody who needs to
      // verify their account to their wifi settings instead.
      const status = (cause as { response?: { status?: number } })?.response?.status;

      // 401 and 403 are different facts about the member and need different
      // remedies. Collapsing them — as the first version of this did — tells
      // somebody who is simply signed out to go and verify their identity.
      if (status === 401) {
        showAlert({
          type: 'error',
          title: 'Please sign in again',
          message:
            'Your session has expired. Your listing is saved here — sign in and come back to publish it.',
        });
        return;
      }

      if (status === 403) {
        showAlert({
          type: 'error',
          title: 'Verification needed first',
          message:
            'Listing a business needs a verified Diaspora account. Your details are saved — finish verification and come back to publish.',
          buttons: [
            { text: 'Not now' },
            { text: 'Verify now', onPress: () => router.push('/verification/diaspora') },
          ],
        });
        return;
      }

      if (status === 400 || status === 404 || status === 422) {
        showAlert({
          type: 'error',
          title: 'Check your listing details',
          message:
            'Diaspora could not accept these details. Your listing is saved here — go back and check the business name and category.',
        });
        return;
      }

      // Only a request that got no answer is a connection problem. Anything
      // else is the server speaking, and blaming the member's wifi for it sent
      // them looking in the wrong place.
      showAlert({
        type: 'error',
        title: 'Could not publish your listing',
        message:
          status === undefined
            ? 'We could not reach Diaspora to save your listing. Your details are still here — please check your connection and try again.'
            : 'Diaspora could not save your listing just now. Your details are still here — please try again in a moment.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  /** The same six-currency mapping `marketplace/create.tsx` uses, so a price
   *  reads identically wherever a member sets one. Unknown codes print the code
   *  itself rather than a wrong symbol. */
  const currencySymbol = (() => {
    switch (currency) {
      case 'GBP': return '£';
      case 'EUR': return '€';
      case 'USD': return '$';
      case 'NGN': return '₦';
      case 'GHS': return '₵';
      case 'MUR': return 'Rs ';
      default: return `${currency} `;
    }
  })();

  const progressPct = ((currentStep + 1) / steps.length) * 100;

  return (
    <SafeAreaView className="flex-1 bg-surface-card">
      {/* Explicit Stepper & Progress Bar */}
      <View className="bg-surface-card border-b border-faint px-6 py-3">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest">
            Create Provider Listing
          </Text>
          <Text className="text-xs font-extrabold text-primary-500">
            Step {currentStep + 1} of {steps.length}
          </Text>
        </View>
        <View className="h-2 bg-surface-muted rounded-full w-full overflow-hidden">
          <View className="h-full bg-primary-500 rounded-full" style={{ width: `${progressPct}%` }} />
        </View>
      </View>

      <ScreenHeader
        title={steps[currentStep]}
        showBack={currentStep > 0}
        rightAction={
          <TouchableOpacity onPress={() => router.replace('/(tabs)')} className="p-2">
            <Text className="text-xs font-bold text-content-faint uppercase">Save & Exit</Text>
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView
        behavior="padding"
        className="flex-1"
      >
        {/* Draft Recovery banner notification */}
        {draftBannerVisible && currentStep === 0 && (
          <View className="bg-[#FFF8E1] border-b border-[#FFE082] px-6 py-4 flex-row items-center justify-between">
            <View className="flex-1 mr-4">
              <Text className="text-sm font-bold text-content-strong">✏️ Unfinished draft detected</Text>
              <Text className="text-xs text-content-tertiary mt-0.5">
                Would you like to restore your progress?
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
          
          {/* Step 1: Basics */}
          {currentStep === 0 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Provide foundational details about your service so that community members can discover your brand in directory searches.
              </Text>
              
              <Input
                label="Business or Service Name"
                placeholder="e.g. Mama Afrika Kitchen"
                value={businessName}
                onChangeText={setBusinessName}
              />
              
              <Input
                label="Short Description"
                placeholder="Describe your dishes, services, background or specialty..."
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                className="h-28"
              />

              <Text className="text-sm font-bold text-content-secondary mb-3">
                Business Categories (Multi-select)
              </Text>
              <View className="flex-row flex-wrap">
                {topCategories.map((cat) => {
                  const isSelected = selectedCategories.includes(cat.slug);
                  return (
                    <CategoryChip
                      key={cat.categoryId}
                      label={cat.name}
                      icon={categoryIcon(cat.slug)}
                      isSelected={isSelected}
                      onPress={() => toggleCategory(cat.slug)}
                    />
                  );
                })}
              </View>
            </View>
          )}

          {/* Step 2: Contact Information */}
          {currentStep === 1 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Help customers reach you. Keep this details current to ensure smooth service bookings.
              </Text>

              {/* The member's own dialling code, locked (13 Oct 2026). This was free
                  text with a British example, so numbers arrived in any shape. */}
              <PhoneInputWithCode
                label="Primary Phone Number"
                value={phone}
                onChangePhone={setPhone}
              />



              <Input
                label="Website (optional)"
                placeholder="e.g. https://mamaafrika.com"
                value={website}
                onChangeText={setWebsite}
                keyboardType="url"
              />

              {/* Expandable Social Links */}
              <TouchableOpacity
                onPress={() => setSocialsExpanded(!socialsExpanded)}
                className="flex-row items-center justify-between py-4 border-t border-faint mt-4"
              >
                <Text className="text-sm font-bold text-content-strong">
                  🌐 Expand Optional Social Links & Email
                </Text>
                <Text className="text-content-faint text-xs">{socialsExpanded ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {socialsExpanded && (
                <View className="mt-2 flex-col gap-1.5">
                  <Input
                    label="Business Email Address"
                    placeholder="e.g. info@mamaafrika.com"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                  />
                  <Input
                    label="Instagram Account"
                    placeholder="@mamaafrikakitchen"
                    value={instagram}
                    onChangeText={setInstagram}
                  />
                  <Input
                    label="Facebook Page Url"
                    placeholder="facebook.com/mamaafrikakitchen"
                    value={facebook}
                    onChangeText={setFacebook}
                  />
                  <Input
                    label="TikTok Handler"
                    placeholder="@mamaafrikacooking"
                    value={tiktok}
                    onChangeText={setTiktok}
                  />
                </View>
              )}
            </View>
          )}

          {/* Step 3: Services & Menu */}
          {currentStep === 2 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-4 leading-relaxed">
                Add key dishes, menu offerings, or service packages with price ranges so customers can browse your menu in your directory listing.
              </Text>

              {/* The preset row that stood here offered four Ghanaian dishes —
                  Jollof Rice, Banku & Tilapia, Waakye, Suya — with prices in
                  pounds, to every business on the platform. A barber, an
                  accountant and a mechanic were each shown a takeaway menu to
                  add with one tap. Presets are a good idea; presets that assume
                  one trade and one currency are not, and there is no data yet
                  from which to generate real ones. */}

              <CurrencyNote currency={memberCurrency} />

              {/* Current Services & Menu List */}
              <Text className="text-sm font-bold text-content-strong mb-3">Current Offerings ({services.length})</Text>
              <View className="bg-surface-background border border-subtle rounded-2xl p-4 mb-6">
                {services.map((svc) => (
                  <View key={svc.id} className="flex-row items-center justify-between py-2.5 border-b border-faint last:border-b-0">
                    <View className="flex-1 mr-2">
                      <Text className="text-sm font-bold text-content-primary">{svc.name}</Text>
                    </View>
                    <View className="flex-row items-center gap-3">
                      <Text className="text-sm font-extrabold text-content-tertiary">
                        {currencySymbol}{svc.minPrice} — {currencySymbol}{svc.maxPrice}
                      </Text>
                      <TouchableOpacity onPress={() => handleRemoveService(svc.id)} className="p-1">
                        <Text className="text-error-default font-black text-xs">✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                {services.length === 0 && (
                  <Text className="text-xs text-content-faint text-center py-3">No services or menu items added yet.</Text>
                )}
              </View>

              {/* Add Custom Service Form */}
              <View className="bg-surface-card border border-subtle rounded-2xl p-4">
                <Text className="text-xs font-bold text-content-strong uppercase tracking-widest mb-3">Add Custom Item</Text>
                <Input
                  label="Service / Item Name"
                  placeholder="e.g. Men’s haircut, or Egusi soup"
                  value={newServiceName}
                  onChangeText={setNewServiceName}
                />
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Input
                      label={`Min Price (${currency})`}
                      placeholder="8"
                      value={newMinPrice}
                      onChangeText={setNewMinPrice}
                      keyboardType="numeric"
                    />
                  </View>
                  <View className="flex-1">
                    <Input
                      label={`Max Price (${currency})`}
                      placeholder="12"
                      value={newMaxPrice}
                      onChangeText={setNewMaxPrice}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
                <Button
                  label="+ Add Service / Menu Item"
                  variant="outline"
                  size="sm"
                  disabled={!newServiceName.trim()}
                  onPress={handleAddService}
                  className="mt-2"
                />
              </View>
            </View>
          )}

          {/* Step 4: Photos */}
          {currentStep === 3 && (
            <View className="pb-8">
              {/* Photo Motivation Box */}
              <View className="bg-primary-50 border border-primary-100 p-4 rounded-2xl mb-6">
                <Text className="text-sm font-bold text-primary-600 mb-1">📸 Double your customer conversions</Text>
                <Text className="text-xs text-content-tertiary leading-relaxed">
                  Listings with real photos get 3x more views and higher customer trust in the directory. Add up to 4 high-quality photos.
                </Text>
              </View>

              {/* The same control as the housing and marketplace wizards, and
                  for the same reason: asking a member for a photograph is one
                  task, and until today this screen drew it as four 112px dashed
                  boxes while they drew it two other ways again. */}
              <PhotoDropZone
                label="Gallery Photos"
                prompt={
                  uploadedPhotos.length >= MAX_PHOTOS
                    ? 'Four photos is the maximum — remove one to add another'
                    : 'Tap to add a photo'
                }
                hint={
                  uploadedPhotos.length === 0
                    ? 'The first photo is your cover image'
                    : `${uploadedPhotos.length} of ${MAX_PHOTOS} added`
                }
                busy={isPicking}
                busyLabel="Choosing…"
                disabled={uploadedPhotos.length >= MAX_PHOTOS}
                onPress={handleAddPhoto}
              >
                {uploadedPhotos.length > 0 && (
                  <View className="flex-row flex-wrap gap-3 mb-3">
                    {uploadedPhotos.map((photo, index) => (
                      <View
                        key={`${photo.uri}-${index}`}
                        className="w-[30%] h-24 bg-surface-muted rounded-xl overflow-hidden relative border border-subtle"
                      >
                        <Image
                          source={{ uri: photo.uri }}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="cover"
                        />

                        {/* Said, not implied. The first photograph is the one the
                            directory shows, and a member who does not know that
                            cannot choose it. */}
                        {index === 0 && (
                          <View className="absolute bottom-1 left-1 bg-surface-card/80 px-1 rounded">
                            <Text className="text-[8px] font-extrabold text-content-strong">
                              COVER
                            </Text>
                          </View>
                        )}

                        <TouchableOpacity
                          onPress={() => handleRemovePhoto(index)}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove photo ${index + 1}`}
                          className="absolute top-1 right-1 bg-black/60 w-5 h-5 rounded-full items-center justify-center"
                        >
                          <Text className="text-white text-[10px] font-bold">✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </PhotoDropZone>
            </View>
          )}

          {/* Step 5: Business Hours */}
          {currentStep === 4 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-4 leading-relaxed">
                Specify your active business hours so community members know when you are open.
              </Text>

              {/* 24-Hours & Copy Quick Tools */}
              <View className="flex-row justify-between mb-4 border-b border-faint pb-3">
                <TouchableOpacity
                  onPress={() => {
                    setIs24Hours(!is24Hours);
                    setBusinessHours(
                      businessHours.map((h) => ({ ...h, open: '00:00', close: '24:00', closed: false }))
                    );
                  }}
                  className="flex-row items-center"
                >
                  <Text className="text-lg mr-1.5">{is24Hours ? '✅' : '⬜'}</Text>
                  <Text className="text-xs font-extrabold text-content-strong">24/7 Operations</Text>
                </TouchableOpacity>

                <View className="flex-row">
                  <TouchableOpacity onPress={handleCopyWeekdays} className="mr-3 bg-surface-muted px-2 py-1 rounded">
                    <Text className="text-[10px] font-extrabold text-content-tertiary">Copy Mon to Weekdays</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleCopyAllDays} className="bg-surface-muted px-2 py-1 rounded">
                    <Text className="text-[10px] font-extrabold text-content-tertiary">Copy Mon to All</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Hours day checklist */}
              {businessHours.map((dayItem, idx) => (
                <View key={dayItem.day} className="flex-row items-center justify-between py-3 border-b border-faint">
                  <View className="w-24">
                    <Text className="text-sm font-semibold text-content-strong">{dayItem.day}</Text>
                  </View>

                  <View className="flex-row items-center">
                    {!dayItem.closed ? (
                      <View className="flex-row items-center">
                        <TextInput
                          value={dayItem.open}
                          onChangeText={(v) => updateDayHour(idx, 'open', v)}
                          className="bg-surface-muted border border-subtle rounded px-2 py-1 text-xs font-bold text-center w-12"
                        />
                        <Text className="text-content-faint mx-1">—</Text>
                        <TextInput
                          value={dayItem.close}
                          onChangeText={(v) => updateDayHour(idx, 'close', v)}
                          className="bg-surface-muted border border-subtle rounded px-2 py-1 text-xs font-bold text-center w-12"
                        />
                      </View>
                    ) : (
                      <Text className="text-xs font-extrabold text-content-faint">CLOSED</Text>
                    )}

                    {/* Closed Switch */}
                    <TouchableOpacity
                      onPress={() => updateDayHour(idx, 'closed', !dayItem.closed)}
                      className="ml-4 bg-surface-muted border border-subtle px-2 py-1 rounded"
                    >
                      <Text className="text-[10px] font-bold text-content-tertiary">
                        {dayItem.closed ? 'Open' : 'Close'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {/* Expandable Holiday Placeholder */}
              <TouchableOpacity
                onPress={() => setHolidayExpanded(!holidayExpanded)}
                className="flex-row items-center justify-between py-4 mt-2"
              >
                <Text className="text-sm font-bold text-content-strong">
                  📅 Set Custom Holiday Hours (Future-ready)
                </Text>
                <Text className="text-content-faint text-xs">{holidayExpanded ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {holidayExpanded && (
                <View className="bg-surface-background border border-faint p-4 rounded-2xl mt-1">
                  <Text className="text-xs text-content-muted leading-relaxed">
                    Set specific custom closing hours for national holidays, bank breaks, or seasonal vacations. (Feature details coming soon).
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Step 6: Realistic Listing Preview */}
          {currentStep === 5 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                A preview of how your listing will appear in the directory. Nothing is published until you tap Publish.
              </Text>

              {/* Published page preview card block */}
              <View className="bg-surface-card rounded-3xl border border-subtle overflow-hidden shadow-sm shadow-neutral-100">
                {/* Photo Display Carousel representation
                    The fallback here was a hardcoded Unsplash photograph of a
                    restaurant interior, so a listing with no picture previewed
                    as somebody else's business — and, with the upload faked too,
                    that is what every listing previewed as. A listing without a
                    photograph now looks like one. */}
                {uploadedPhotos[0] ? (
                  <Image
                    source={{ uri: uploadedPhotos[0].uri }}
                    style={{ width: '100%', height: 160 }}
                    contentFit="cover"
                  />
                ) : (
                  <View
                    style={{ width: '100%', height: 160 }}
                    className="bg-surface-muted items-center justify-center"
                  >
                    <Text className="text-3xl mb-1">📷</Text>
                    <Text className="text-[11px] text-content-muted font-bold">No photo added</Text>
                  </View>
                )}

                {/* Sub Gallery */}
                <View className="flex-row bg-surface-muted p-2">
                  {uploadedPhotos
                    .filter((photo): photo is LocalFile => photo !== null)
                    .map((photo, i) => (
                      <Image
                        key={i}
                        source={{ uri: photo.uri }}
                        style={{ width: 44, height: 44, borderRadius: 8, marginRight: 6 }}
                      />
                    ))}
                </View>

                {/* Listing Core details */}
                <View className="p-5">
                  <View className="flex-row justify-between items-center mb-1">
                    <View className="flex-row flex-wrap">
                      {selectedCategories.map((catId) => (
                        <Text key={catId} className="text-[10px] font-bold text-primary-500 uppercase tracking-widest mr-2 bg-primary-50 px-2 py-0.5 rounded">
                          {categoryName(catId)}
                        </Text>
                      ))}
                    </View>
                    {/* Neutral, not green. This read "✓ PREVIEW VERIFIED" in
                        success colours, so an unverified member previewing an
                        unpublished listing was shown a verification tick — the
                        one badge on this platform that is supposed to mean
                        somebody checked. */}
                    <Text className="text-[10px] bg-surface-muted text-content-muted px-2 py-0.5 rounded font-extrabold">
                      PREVIEW
                    </Text>
                  </View>

                  {/* `businessName || 'Mama Afrika Kitchen'` stood here, so a
                      member who had not filled the name in previewed somebody
                      else's business. The name is required to reach this step,
                      so the fallback only ever fired on a bug — and then lied
                      about it. */}
                  <Text className="text-xl font-bold text-content-primary mb-1.5">
                    {businessName || 'Your business name'}
                  </Text>
                  <Text className="text-sm text-content-tertiary mb-4 leading-relaxed">{description || 'No description provided.'}</Text>

                  {/* Services & Menu Preview Block */}
                  {services.length > 0 && (
                    <View className="mb-4">
                      <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-2">Services & Menu</Text>
                      <View className="bg-surface-background rounded-2xl p-3 border border-faint">
                        {services.map((svc) => (
                          <View key={svc.id} className="flex-row justify-between py-1.5 border-b border-faint last:border-b-0">
                            <Text className="text-xs text-content-strong font-bold">{svc.name}</Text>
                            <Text className="text-xs text-content-tertiary font-semibold">{currencySymbol}{svc.minPrice} — {currencySymbol}{svc.maxPrice}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Contact Buttons */}
                  <View className="flex-row border-t border-b border-faint py-3 mb-4">
                    <View className="flex-1 items-center border-r border-faint">
                      <Text className="text-xs text-content-faint">Call Phone</Text>
                      <Text className="text-xs font-bold text-content-strong mt-0.5">{phone || 'None'}</Text>
                    </View>
                    <View className="flex-1 items-center border-r border-faint">
                      <Text className="text-xs text-content-faint">Email</Text>
                      <Text className="text-xs font-bold text-primary-500 mt-0.5" numberOfLines={1}>{email || 'None'}</Text>
                    </View>
                    <View className="flex-1 items-center">
                      <Text className="text-xs text-content-faint">Website</Text>
                      <Text className="text-xs font-bold text-primary-500 mt-0.5" numberOfLines={1}>{website ? 'Link' : 'None'}</Text>
                    </View>
                  </View>

                  {/* Hours preview */}
                  <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-2">Business Hours</Text>
                  <View className="bg-surface-background rounded-2xl p-3 border border-faint">
                    {businessHours.slice(0, 3).map((h) => (
                      <View key={h.day} className="flex-row justify-between mb-1">
                        <Text className="text-xs text-content-tertiary font-semibold">{h.day}</Text>
                        <Text className="text-xs text-content-secondary font-bold">
                          {h.closed ? 'Closed' : `${h.open} - ${h.close}`}
                        </Text>
                      </View>
                    ))}
                    <Text className="text-[10px] text-content-faint text-center font-bold mt-1">Show other days...</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

        </ScrollView>

        {/* Fixed Footer Buttons */}
        {stillNeeded.length > 0 ? (
          <View className="px-6 pt-3 flex-row items-start">
            <Ionicons name="alert-circle-outline" size={14} color="#F59300" />
            <Text className="text-[11px] font-semibold text-content-tertiary ml-1.5 flex-1">
              Still needed: {stillNeeded.join(', ')}
            </Text>
          </View>
        ) : null}

        <View className="px-6 py-4 border-t border-faint bg-surface-card">
          <View className="flex-row">
            {currentStep > 0 && (
              <Button
                label="Back"
                variant="outline"
                className="flex-1 mr-2"
                onPress={() => setCurrentStep(currentStep - 1)}
              />
            )}
            <Button
              label={
                currentStep === steps.length - 1
                  ? isSubmitting
                    ? 'Publishing…'
                    : 'Publish Listing'
                  : 'Next'
              }
              className="flex-1"
              // Disabled while the request is in flight, so a second tap cannot
              // create a second provider. The wizard has no idempotency key, and
              // a duplicate listing is not something a member can undo.
              disabled={isSubmitting || stillNeeded.length > 0}
              onPress={() => {
                if (currentStep < steps.length - 1) {
                  setCurrentStep(currentStep + 1);
                } else {
                  handlePublish();
                }
              }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * The server's key for a picked category: its slug. Picks are slugs since
 * 13 Oct 2026; a draft saved before holds the fixture's `cat-1` ids, which are
 * translated here so it can still be published.
 */
function categoryKey(id: string | undefined): string {
  if (!id) return '';
  return mockCategories.find((category) => category.id === id)?.slug ?? id;
}

/** An emoji for a category chip. The server's icon field names an icon set, not an emoji. */
function categoryIcon(slug: string): string {
  const known = mockCategories.find((category) => category.slug === slug)?.icon;
  if (known) return known;
  return ({ 'faith-worship': '🙏', 'community-associations': '🤝', 'government-embassies': '🏛️', other: '🏷️' } as Record<string, string>)[slug] ?? '🏷️';
}
