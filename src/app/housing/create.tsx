import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Animated, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { CategoryChip } from '@/components/CategoryChip';
import { Input } from '@/components/Input';
import { AddressSearchField } from '@/components/maps/AddressSearchField';
import {
  createAndPublishListing,
  fetchAccommodationTypes,
  fetchHousingAmenities,
  fetchHousingListingOptions,
  fetchMyLandlordContact,
  type AccommodationType,
  type HousingAmenity,
  type HousingChoice,
  type LandlordContact,
} from '@/lib/housing-listings-api';
import {
  resolveDeviceLocationProvider,
  resolveLocationPermissionProvider,
} from '@/lib/maps/providers/device-location';
import { PhotoDropZone } from '@/components/PhotoDropZone';
import { useAuthStore } from '@/store/auth';
import { useTrustStore } from '@/store/trust';
import * as ImagePicker from 'expo-image-picker';
import { DatePickerInput } from '@/components/DatePickerInput';
import { PhoneInputWithCode } from '@/components/PhoneInputWithCode';
import { Ionicons } from '@expo/vector-icons';
import { useNotification } from '@/providers/notification-provider';
import type { AlertOptions } from '@/providers/notification-provider';
import { useMediaUpload, toLocalFile } from '@/hooks/media';
import type { ChosenPhoto } from '@/types/media';
import { backOr } from '@/lib/navigation';
import { CurrencyNote } from '@/components/CurrencyNote';
import { useMemberCurrency } from '@/lib/member-currency';

/** The designed alert modal, passed to helpers that sit outside a component. */
type ShowAlert = (options: AlertOptions) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Remediation Wave E — these two helpers used to end `return result.assets[0].uri`.
//
// That is a `file:///…` path into this app's own cache directory. It means
// something on exactly one device, for as long as that device keeps its cache,
// and nothing at all to the server. This screen stored it and posted it as
// `coverImage`, so every property photograph in this application was a path only
// the phone that took it could resolve.
//
// They now return the **picked asset**, and the upload happens in the component
// through the one media pipeline (`hooks/media` → `lib/media-api`). It has to be
// in the component: `useMediaUpload` is a hook, and progress and failure are
// things a member has to be able to see. What these helpers still own is the
// permission dance — which is why they stay at module scope, taking the alert
// function from their caller so a refusal lands in the designed modal rather
// than the operating system's dialog.
// ─────────────────────────────────────────────────────────────────────────────
const pickFromGallery = async (showAlert: ShowAlert): Promise<ImagePicker.ImagePickerAsset | null> => {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    showAlert({ type: 'error', title: 'Permission Denied', message: 'We need access to your photos to upload images.' });
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    quality: 0.8,
  });
  if (!result.canceled && result.assets && result.assets.length > 0) {
    return result.assets[0];
  }
  return null;
};

const pickFromCamera = async (showAlert: ShowAlert): Promise<ImagePicker.ImagePickerAsset | null> => {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    showAlert({ type: 'error', title: 'Permission Denied', message: 'We need access to your camera to take photos.' });
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: true,
    quality: 0.8,
  });
  if (!result.canceled && result.assets && result.assets.length > 0) {
    return result.assets[0];
  }
  return null;
};

// Module-level global draft storage
let globalHousingDraft: any = null;

const steps = [
  'Listing & Property Type',
  'Property Details',
  'Location & Landmark',
  'Pricing & Lease',
  'Contact Channels',
  'Gallery Photos',
  'Preview & Publish'
];

/**
 * Property types, furnishing and lease length all come from the server since
 * 13 Oct 2026 (`/housing/accommodation-types`, `/housing/listing-options`). The
 * form used to keep its own copies: twelve property labels mapped to keys by
 * guesswork, and four lease lengths and one furnishing value the server does not
 * have, which its parser turned into "unspecified" without a word.
 *
 * Only the pictures are the app's: an icon per key, and a house for any key the
 * server adds later.
 */
const PROPERTY_ICONS: Record<string, string> = {
  apartment: '🏢', studio: '📦', house: '🏡', duplex: '🏘️', villa: '🏝️',
  'shared-apartment': '👥', 'private-room': '🛏️', 'shared-room': '🛌', 'roommate-wanted': '🤝',
  'family-stay': '👨‍👩‍👧', hostel: '🏫', 'student-hostel': '🎓', 'guest-house': '🛎️',
  'temporary-accommodation': '⏱️', 'hotel-partnership': '🏨', 'company-accommodation': '💼',
};

const AVAILABILITY_OPTIONS = ['Available Now', 'Available This Week', 'Available Next Month', 'Custom Date'];

const LIFESTYLE_OPTIONS = [
  { label: '👨🎓 Student Friendly', value: 'Student Friendly' },
  { label: '👨👩👧 Family Friendly', value: 'Family Friendly' },
  { label: '👩 Women Preferred', value: 'Women Preferred' },
  { label: '🧑💻 Remote Worker Friendly', value: 'Remote Worker Friendly' },
  { label: '🌙 Quiet Environment', value: 'Quiet Environment' },
  { label: '🏠 Shared Living', value: 'Shared Living' },
  { label: '🚭 Non-Smoking Home', value: 'Non-Smoking Home' },
  { label: '🐶 Pet Friendly', value: 'Pet Friendly' },
  { label: '🚗 Parking Available', value: 'Parking Available' },
];

// Remediation Wave E: `MOCK_COVER_PHOTOS` and `MOCK_GALLERY_PHOTOS` stood here —
// two lists of Unsplash URLs that seeded what were supposed to be the member's
// own photographs. They are gone rather than emptied: a property with no
// photograph must look like a property with no photograph, which for a housing
// listing is not a cosmetic point — a member deciding where to live is entitled
// to know they are looking at nothing rather than at somebody else's flat.

export default function CreateHousingScreen() {
  const trustStore = useTrustStore();

  // Whether this member may list a home, as the Housing service itself says:
  // the `housing.listings.create` feature on their access decision, which it
  // grants to verified accounts. Null until the session is restored — an
  // unanswered question is not a no, and the server still refuses a listing it
  // does not allow.
  //
  // This screen used to lock itself with the device's trust engine, asked about
  // a hard-coded 'GB' whatever country the member lives in, against thresholds —
  // residency verification, 100 points, a year — that the Housing service never
  // checked and no member could meet. Decided 15 Sep 2026: a verified account is
  // enough, as it is for posting a job.
  const access = useAuthStore((state) => state.access);
  const mayList = access ? access.grantedFeatures.includes('housing.listings.create') : null;

  const { showAlert } = useNotification();


  const [currentStep, setCurrentStep] = useState(0);
  const [draftBannerVisible, setDraftBannerVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);



  /**
   * Prefill the country from the member's residence, once.
   *
   * An effect rather than a state initialiser because the session restores
   * asynchronously — at first render `user` is null, and an initialiser would
   * capture the empty string permanently. Guarded on the field being untouched
   * so it can never overwrite a country the landlord chose.
   */
  const residenceCountry = useAuthStore((state) => state.user?.residenceCountry);

  useEffect(() => {
    if (!residenceCountry) return;
    setCountryCode((prev) => prev || residenceCountry);
  }, [residenceCountry]);

  /**
   * The name a landlord profile is opened under, if the member has never let
   * anything before. Their own name rather than an invented letting-agency
   * name — the platform's landlord model treats an individual as themselves.
   */
  const memberName = useAuthStore((state) => state.user?.fullName);
  const landlordDisplayName = (memberName ?? '').trim() || 'Diaspora member';

  // STEP 1: Listing & Property Type
  const [listingType, setListingType] = useState<'Rent' | 'Share'>('Rent');
  const [propertyType, setPropertyType] = useState<string | null>(null);

  // STEP 2: Property details & Lifestyle match checkboxes
  const [title, setTitle] = useState('');
  /**
   * The one-line blurb. **Required by the server.**
   *
   * `CreateHousingListingRequest` declares `Summary` required and `Description`
   * optional — a search card shows the short form without loading the long one.
   * Not truncated from the description: a sentence cut mid-clause reads as a
   * fault in the listing, and the landlord is the only one who knows which
   * sentence sells the room.
   */
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [bedrooms, setBedrooms] = useState('2');
  const [bathrooms, setBathrooms] = useState('1');
  // Server keys (`Furnished`, `MonthToMonth`…), never labels.
  const [furnished, setFurnished] = useState('');
  // **Keys the catalogue knows, never text somebody typed.**
  //
  // This was `useState('High-speed Internet, Washing Machine, Heating')`, split
  // on commas and posted as amenity keys. The catalogue's keys are slugs —
  // `air-conditioning`, `parking`, `elevator` — so the server answered
  // `AmenityNotFound`, a 404, and refused the listing. The field was filled by
  // default, so a landlord who never touched it still could not post: on
  // 21 Sep 2026 production held one landlord profile and nought listings.
  const [amenityKeys, setAmenityKeys] = useState<string[]>([]);
  const [amenityCatalog, setAmenityCatalog] = useState<HousingAmenity[]>([]);
  const [amenitiesUnavailable, setAmenitiesUnavailable] = useState(false);
  const [houseRulesText, setHouseRulesText] = useState('No smoking inside, Respect quiet hours');
  const [selectedLifestyleMatches, setSelectedLifestyleMatches] = useState<Record<string, boolean>>({});

  // STEP 3: Location & Landmark
  /**
   * ISO-3166-1 alpha-2. **Required by the server**, and this form had no source
   * for it at all — one of the four reasons every submission was refused.
   *
   * Prefilled from the member's residence country and editable, because a
   * landlord may well be letting a property somewhere other than where they
   * live. Deliberately not silently defaulted: Wave A had to remove `|| 'GB'`
   * fallbacks from registration for the same reason, and a listing filed under
   * the wrong country is worse than a form with one more question.
   */
  const [countryCode, setCountryCode] = useState('');
  const [cityName, setCityName] = useState('London');
  const [areaName, setAreaName] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [landmark, setLandmark] = useState('');
  const [isSelectingPin, setIsSelectingPin] = useState(false);
  // **Null until the landlord gives one, and London never again.**
  //
  // This was `useState({ latitude: 51.4702, longitude: -0.0691 })` — Peckham —
  // and the payload sent it on every listing whether or not the picker was ever
  // opened. Opening it did not help: the picker was a one-second delay that
  // assigned the *city centre* by name, so every Port Louis property came out
  // on the same point. The one created on 21 Sep 2026 stored
  // `-20.164200, 57.502900` and was filed under `/MU/port-louis/…/ward-iv`,
  // which is where the city hall is, not where the flat is.
  //
  // A pin is optional on the server and optional here. An absent pin is honest;
  // a wrong one sends people to the wrong street.
  const [coordinates, setCoordinates] =
    useState<{ latitude: number; longitude: number } | null>(null);
  const [pinProblem, setPinProblem] = useState<string | null>(null);
  // Where the pin came from, in words the landlord will recognise: their own
  // position, or the address they picked. Never a guess from the town.
  const [pinSource, setPinSource] = useState<string | null>(null);

  // STEP 4: Pricing & Lease
  const [rent, setRent] = useState('');
  // From the country of residence, not chosen (13 Oct 2026). It defaulted to GBP,
  // so a home in Mauritius could be listed at a rent in pounds.
  const memberCurrency = useMemberCurrency();
  const currency = memberCurrency.code;
  const [deposit, setDeposit] = useState('');
  const [billsIncluded, setBillsIncluded] = useState(false);
  const [internetIncluded, setInternetIncluded] = useState(true);
  const [parkingAvailable, setParkingAvailable] = useState(false);
  const [leaseDuration, setLeaseDuration] = useState('');
  const [availabilityDate, setAvailabilityDate] = useState('Available Now');

  // STEP 5: Contact
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  // **Whether the platform says these out loud, which is the only part of this
  // it keeps.** This was `preferredContactMethod`, one of WhatsApp, a phone
  // call, email or an in-app message — and the platform models none of that for
  // housing. `LandlordContact` holds a number, an address, a website and one
  // flag, `ShowPublicly`, defaulting to no; a member choosing between WhatsApp
  // and a phone call was choosing between two things that are stored
  // identically. Nor did any of it leave the screen: the whole step was
  // collected, written into the draft, and never sent anywhere.
  //
  // Default false, matching the domain. A phone number on a public page is
  // harvested within the hour, and publishing one by default is not a decision
  // this form gets to make on a member's behalf.
  const [publishContact, setPublishContact] = useState(false);

  // What the platform already holds, so an unchanged field is not re-sent and a
  // returning landlord is not asked to type their own number again.
  const [heldContact, setHeldContact] = useState<LandlordContact | null>(null);

  // STEP 6: Photos
  //
  // Empty, and empty renders as empty. Both of these used to be seeded with
  // Unsplash URLs, so a property listed without a single photograph was posted
  // and previewed as though it had three.
  const [coverPhoto, setCoverPhoto] = useState<ChosenPhoto | null>(null);
  const [galleryPhotos, setGalleryPhotos] = useState<ChosenPhoto[]>([]);

  // Two upload slots rather than one, because `useMediaUpload` aborts whatever
  // it was doing when a new upload starts — sharing a single instance would mean
  // adding a gallery photo silently cancelled the cover that was still going up.
  const coverUpload = useMediaUpload({ kind: 'image' });
  const galleryUpload = useMediaUpload({ kind: 'image' });

  // The hook's own definition of busy: `uploading` *or* `processing`. The
  // member's waiting is not over when the bytes land — variants are derived
  // afterwards — and a picker reopened in between would abort the slot.
  const coverBusy = coverUpload.isUploading;
  const galleryBusy = galleryUpload.isUploading;

  /**
   * A picked file, uploaded, as something this screen can hold.
   *
   * The single point where a device path becomes a platform identifier — there
   * is one upload implementation in this application and this calls it.
   */
  const uploadPicked = useCallback(
    async (
      picked: ImagePicker.ImagePickerAsset,
      slot: ReturnType<typeof useMediaUpload>
    ): Promise<ChosenPhoto | null> => {
      const asset = await slot.upload(toLocalFile(picked));

      // Null is a failed or cancelled upload. The slot holds the server's own
      // sentence and step 6 renders it; nothing enters state. That is the point
      // of returning early rather than storing the local URI as a consolation:
      // a photograph the platform never received must not sit in the grid
      // looking exactly like one it did.
      if (!asset) return null;

      // The device's copy is the preview until the platform has a rendition of
      // its own. A direct upload answers at `pending` or `processing` — variants
      // are derived afterwards — so `thumbnailUrl` is usually still null here,
      // and `asset.url` is a route into Media rather than an image that is ready
      // to paint. The identifier below is the part that gets posted, and it is
      // stable from this moment whatever the preview is showing.
      return {
        mediaId: asset.mediaId,
        previewUri: asset.thumbnailUrl ?? picked.uri,
      };
    },
    []
  );

  const chooseCoverPhoto = useCallback(
    async (from: 'camera' | 'gallery') => {
      const picked = from === 'camera' ? await pickFromCamera(showAlert) : await pickFromGallery(showAlert);
      if (!picked) return;

      const photo = await uploadPicked(picked, coverUpload);
      if (photo) setCoverPhoto(photo);
    },
    [coverUpload, showAlert, uploadPicked]
  );

  const addGalleryPhoto = useCallback(
    async (from: 'camera' | 'gallery') => {
      const picked = from === 'camera' ? await pickFromCamera(showAlert) : await pickFromGallery(showAlert);
      if (!picked) return;

      const photo = await uploadPicked(picked, galleryUpload);
      // Appended, so the member's order is the order the gallery is sent in.
      if (photo) setGalleryPhotos(prev => [...prev, photo]);
    },
    [galleryUpload, showAlert, uploadPicked]
  );

  const handleCoverPhotoSelect = async () => {
    const title = 'Select Cover Image';
    const message = 'Choose an action to add your property cover photo';
    const options = [
      { text: '📷 Take Photo (Camera)', onPress: () => { void chooseCoverPhoto('camera'); } },
      { text: '🖼️ Choose from Gallery', onPress: () => { void chooseCoverPhoto('gallery'); } },
      { text: 'Cancel', style: 'cancel' as const }
    ];

    if (Platform.OS === 'web') {
      await chooseCoverPhoto('gallery');
    } else {
      showAlert({ type: 'info', title: title, message: message, buttons: options });
    }
  };

  const handleAddGalleryPhoto = async () => {
    const title = 'Select Gallery Image';
    const message = 'Choose an action to add a property gallery photo';
    const options = [
      { text: '📷 Take Photo (Camera)', onPress: () => { void addGalleryPhoto('camera'); } },
      { text: '🖼️ Choose from Gallery', onPress: () => { void addGalleryPhoto('gallery'); } },
      { text: 'Cancel', style: 'cancel' as const }
    ];

    if (Platform.OS === 'web') {
      await addGalleryPhoto('gallery');
    } else {
      showAlert({ type: 'info', title: title, message: message, buttons: options });
    }
  };

  // STEP 7: Smart AI polisher check
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string | null>(null);

  // Calendar states and handlers
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

  const monthsList = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handleDaySelect = (day: number) => {
    const formattedMonth = String(calendarMonth + 1).padStart(2, '0');
    const formattedDay = String(day).padStart(2, '0');
    setAvailabilityDate(`${calendarYear}-${formattedMonth}-${formattedDay}`);
    setCalendarVisible(false);
  };

  const nextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(calendarYear + 1);
    } else {
      setCalendarMonth(calendarMonth + 1);
    }
  };

  const prevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(calendarYear - 1);
    } else {
      setCalendarMonth(calendarMonth - 1);
    }
  };

  const renderCalendarDays = () => {
    const totalDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
    
    const dayCells = [];
    for (let i = 0; i < firstDayIndex; i++) {
      dayCells.push(<View key={`empty-${i}`} style={{ width: '14.28%', height: 40 }} />);
    }
    
    for (let day = 1; day <= totalDays; day++) {
      const formattedMonth = String(calendarMonth + 1).padStart(2, '0');
      const formattedDay = String(day).padStart(2, '0');
      const dateStr = `${calendarYear}-${formattedMonth}-${formattedDay}`;
      const isSelected = availabilityDate === dateStr;

      dayCells.push(
        <TouchableOpacity
          key={`day-${day}`}
          onPress={() => handleDaySelect(day)}
          style={{ width: '14.28%', height: 40 }}
          className={`items-center justify-center rounded-full ${
            isSelected ? 'bg-primary-500' : 'active:bg-surface-muted'
          }`}
        >
          <Text className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-content-strong'}`}>
            {day}
          </Text>
        </TouchableOpacity>
      );
    }
    return dayCells;
  };

  // Check draft on mount
  useEffect(() => {
    if (globalHousingDraft) {
      setDraftBannerVisible(true);
    }
  }, []);

  // The contact details the platform already has, if this member has let
  // something before. A first-time landlord has no profile and no details, and
  // the read says so rather than failing.
  useEffect(() => {
    let cancelled = false;

    fetchMyLandlordContact()
      .then((held) => {
        if (cancelled || !held) return;

        setHeldContact(held);
        setContactPhone(held.phoneNumber ?? '');
        setContactEmail(held.email ?? '');
        setPublishContact(held.showContactPublicly);
      })
      .catch(() => {
        // Not fatal and not worth a message: the fields stay empty, whatever
        // the member types is sent, and the listing is unaffected either way.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // The catalogue, read once. Anonymous on the server, so it does not wait on
  // anything else this screen is doing.
  useEffect(() => {
    let cancelled = false;

    fetchHousingAmenities()
      .then((amenities) => {
        if (cancelled) return;
        setAmenityCatalog(amenities);
        setAmenitiesUnavailable(amenities.length === 0);
      })
      .catch(() => {
        // Said out loud rather than swallowed: without the catalogue a landlord
        // cannot choose amenities, and a silent empty list would look like a
        // platform that has none.
        if (!cancelled) setAmenitiesUnavailable(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Property types, furnishing and lease length: the server's lists, not ours.
  const [accommodationTypes, setAccommodationTypes] = useState<AccommodationType[]>([]);
  const [furnishingOptions, setFurnishingOptions] = useState<HousingChoice[]>([]);
  const [leaseOptions, setLeaseOptions] = useState<HousingChoice[]>([]);
  const [choicesUnavailable, setChoicesUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchAccommodationTypes(), fetchHousingListingOptions()])
      .then(([types, options]) => {
        if (cancelled) return;
        setAccommodationTypes(types);
        setFurnishingOptions(options.furnishing);
        setLeaseOptions(options.leaseTypes);
        setChoicesUnavailable(types.length === 0);
      })
      .catch(() => {
        if (!cancelled) setChoicesUnavailable(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Rent shows the whole-place types, Share the shared ones, as the server marks them.
  const visibleTypes = useMemo(
    () => accommodationTypes.filter((type) => type.isShared === (listingType === 'Share')),
    [accommodationTypes, listingType]
  );
  const propertyTypeName = accommodationTypes.find((type) => type.key === propertyType)?.name ?? null;

  // A choice made under Rent is not one of the Share types, and vice versa.
  useEffect(() => {
    if (propertyType && accommodationTypes.length > 0 && !visibleTypes.some((type) => type.key === propertyType)) {
      setPropertyType(null);
    }
  }, [visibleTypes, accommodationTypes.length, propertyType]);

  /** The catalogue in the order the server grouped it, which is how it renders. */
  const amenityGroups = useMemo(() => {
    const groups: { group: string; items: HousingAmenity[] }[] = [];

    for (const amenity of amenityCatalog) {
      const existing = groups.find((entry) => entry.group === amenity.group);
      if (existing) existing.items.push(amenity);
      else groups.push({ group: amenity.group, items: [amenity] });
    }

    return groups;
  }, [amenityCatalog]);

  /**
   * The pin, from the device that is standing at the property.
   *
   * **Nothing is guessed.** There are two honest sources: the device standing at
   * the property, and (since 27 Sep 2026) an address the landlord picks from
   * `AddressSearchField`, which resolves through the platform's configured
   * vendor. Inventing a point from the town is what both replaced. The label
   * says which one set the pin.
   */
  const usePinFromDevice = async () => {
    setIsSelectingPin(true);
    setPinProblem(null);

    try {
      const permissions = resolveLocationPermissionProvider();

      let state = await permissions.check();

      // Asked only from this tap. §6 forbids prompting on mount.
      if (state.status === 'notRequested' || state.status === 'denied') {
        state = await permissions.request();
      }

      // `grantedApproximate` is accepted rather than refused: a coarse fix is
      // still the landlord's own position, and the alternative on offer is no
      // pin at all. It is named in the confirmation so nobody reads a
      // neighbourhood-sized circle as a doorstep.
      if (state.status !== 'granted' && state.status !== 'grantedApproximate') {
        setPinProblem(
          state.status === 'deniedPermanently'
            ? state.canOpenSettings
              ? 'Location is turned off for Diaspora. You can turn it on in Settings, or post this property without a pin.'
              : 'Location is turned off for Diaspora. You can post this property without a pin.'
            : state.status === 'servicesDisabled'
              ? 'Location services are switched off on this device. You can turn them on, or post this property without a pin.'
              : state.status === 'unavailable'
                ? 'This device cannot report its location. You can post this property without a pin.'
                : 'Diaspora needs your location to set the pin. You can post this property without one.'
        );
        return;
      }

      const position = await resolveDeviceLocationProvider().getCurrentPosition({
        highAccuracy: true,
      });

      if (!position.ok) {
        // Said, not swallowed. A pin that silently fails to set is how the old
        // picker convinced everybody it worked.
        setPinProblem(
          'Diaspora could not read your location just now. You can try again, or post this property without a pin.'
        );
        return;
      }

      setCoordinates({
        latitude: position.value.coordinate.latitude,
        longitude: position.value.coordinate.longitude,
      });
      setPinSource('your current location');

      if (state.status === 'grantedApproximate') {
        setPinProblem(
          'This pin is approximate, because Diaspora only has your rough location. It places the property in the right area rather than on the right street.'
        );
      }
    } finally {
      setIsSelectingPin(false);
    }
  };

  const toggleAmenity = (key: string) =>
    setAmenityKeys((current) =>
      current.includes(key) ? current.filter((held) => held !== key) : [...current, key]
    );

  /**
   * What each step needs before it can be left, in the member's own words.
   *
   * **Declared rather than computed inline, and it is not a style choice.** The
   * gate used to be one boolean expression on the Next button, and it was
   * missing `summary` — a field `CreateHousingListingRequest` marks `required`
   * and `HousingDescription.Create` refuses when blank. A landlord who skipped
   * the one-line summary passed all seven steps and was refused at Publish with
   * "Diaspora could not save your listing", naming nothing. Watched on a device
   * on 21 Sep 2026.
   *
   * Three things follow from having the list rather than the boolean: the
   * member is told which field is missing instead of meeting a dead button; a
   * test can check this list against the fields the server actually requires;
   * and a step added later cannot arrive with no rules and go unnoticed.
   *
   * Photos are step 6 and are required to *publish*, not to leave the step —
   * the server accepts a draft without one — so the cover is required on the
   * last step, where Publish is.
   */
  const requiredByStep: { label: string; filled: boolean }[][] = [
    [{ label: 'Property category', filled: !!propertyType }],
    [
      { label: 'Listing title', filled: !!title.trim() },
      { label: 'One-line summary', filled: !!summary.trim() },
      { label: 'Description', filled: !!description.trim() },
    ],
    [
      { label: 'Neighbourhood or area', filled: !!areaName.trim() },
      { label: 'Address line', filled: !!addressLine.trim() },
    ],
    [{ label: 'Monthly rent', filled: !!rent.trim() }],
    [{ label: 'Phone number', filled: !!contactPhone.trim() }],
    [],
    [{ label: 'Cover image', filled: !!coverPhoto }],
  ];

  const stillNeeded = (requiredByStep[currentStep] ?? [])
    .filter((field) => !field.filled)
    .map((field) => field.label);

  // Auto-save draft triggers
  const saveDraft = () => {
    globalHousingDraft = {
      listingType, propertyType, title, description, bedrooms, bathrooms, furnished,
      amenityKeys, houseRulesText, selectedLifestyleMatches, cityName, areaName,
      addressLine, landmark, rent, currency, deposit, billsIncluded, internetIncluded,
      parkingAvailable, leaseDuration, availabilityDate, contactPhone, contactEmail,
      publishContact, coverPhoto, galleryPhotos, currentStep
    };
  };

  useEffect(() => {
    if (title || description || propertyType || rent) {
      saveDraft();
    }
  }, [
    listingType, propertyType, title, description, bedrooms, bathrooms, furnished,
    amenityKeys, houseRulesText, selectedLifestyleMatches, cityName, areaName,
    addressLine, landmark, rent, currency, deposit, billsIncluded, internetIncluded,
    parkingAvailable, leaseDuration, availabilityDate, contactPhone, contactEmail,
    publishContact, coverPhoto, galleryPhotos
  ]);

  const restoreDraft = () => {
    if (globalHousingDraft) {
      const d = globalHousingDraft;
      setListingType(d.listingType);
      setPropertyType(d.propertyType);
      setTitle(d.title);
      setDescription(d.description);
      setBedrooms(d.bedrooms);
      setBathrooms(d.bathrooms);
      setFurnished(d.furnished);
      setAmenityKeys(d.amenityKeys ?? []);
      setHouseRulesText(d.houseRulesText);
      setSelectedLifestyleMatches(d.selectedLifestyleMatches || {});
      setCityName(d.cityName);
      setAreaName(d.areaName);
      setAddressLine(d.addressLine);
      setLandmark(d.landmark);
      setRent(d.rent);
      // A draft's saved currency is ignored: rent is always in the member's own.
      setDeposit(d.deposit);
      setBillsIncluded(d.billsIncluded);
      setInternetIncluded(d.internetIncluded);
      setParkingAvailable(d.parkingAvailable);
      setLeaseDuration(d.leaseDuration);
      setAvailabilityDate(d.availabilityDate);
      setContactPhone(d.contactPhone);
      setContactEmail(d.contactEmail);
      setPublishContact(d.publishContact ?? false);
      // A restored draft carries identifiers the platform already holds, so the
      // photographs survive without re-uploading. `null` rather than a fallback:
      // a draft saved before any photograph was chosen has none.
      setCoverPhoto(d.coverPhoto || null);
      setGalleryPhotos(d.galleryPhotos || []);
      setCurrentStep(d.currentStep || 0);
      setDraftBannerVisible(false);
    }
  };

  const discardDraft = () => {
    globalHousingDraft = null;
    setDraftBannerVisible(false);
  };

  /**
   * Listing checklist — formerly the "Smart AI Evaluator".
   *
   * ── What it used to say, and why it was the worst item in the sweep ────────
   *
   * Three bullet points after a 1200ms fake spinner. The middle one:
   *
   *   > Average rent for a {bedrooms}-bed {propertyType} in {areaName} is
   *   > around {currency} {rent}/mo. Your pricing is competitive.
   *
   * `{rent}` is **the member's own input**, read straight back to them as the
   * market average, followed by a verdict that their figure is competitive with
   * itself. It is a mirror wearing the costume of a valuation, and it could
   * never disagree with the member no matter what they typed — £300 was
   * competitive, £30,000 was competitive. A landlord pricing a room on it, or a
   * newcomer checking they were not overcharging, was reading their own guess.
   *
   * (When `rent` was empty it fell back to a hardcoded `1500`, so an untouched
   * form asserted a specific average rent for any area in any currency.)
   *
   * The first and third bullets were plain fabrication of a different kind:
   * fixed strings praising a title for "transit proximity" and lifestyle flags
   * for "matching settlement tags search", printed identically whether the
   * title said anything of the sort or the member had selected no flags at all.
   *
   * ── Why it is not wired to a route instead ────────────────────────────────
   *
   * **No pricing, market, benchmark, comparable or valuation endpoint exists
   * anywhere in the platform**, and neither does any listing-quality or content
   * scoring route. The one real market datum in the backend is median/low/high
   * rent embedded in `GET /housing/neighborhoods/{idOrSlug}` — keyed by an
   * approved neighbourhood id this screen does not hold (it collects free-text
   * city and area names), computed only over *let* listings with a disclosed
   * amount, and dropped entirely below a three-listing sample. It is empty for
   * most areas, and quoting a three-let median as "the average rent" would be
   * the same defect with a citation.
   *
   * ── What it does now ──────────────────────────────────────────────────────
   *
   * It checks the form against itself and shows its working. Every line is
   * derived from something the member typed on this screen, states the input it
   * used, and makes no claim about the market, about other listings, or about
   * whether a price is good. It cannot be wrong, because it only reports what
   * is in front of it — and it is genuinely useful, because publication really
   * does require a photo, a description and a property type.
   */
  const runListingCheck = () => {
    setAiLoading(true);
    setAiSuggestions(null);

    const lines: string[] = [];

    // Publication requirements first — these mirror the server's `IsPublishable`
    // check, so a member who clears them will not meet the not-publishable
    // refusal after filling in seven steps.
    lines.push(
      coverPhoto
        ? `✅ Cover photo — added (plus ${galleryPhotos.length} gallery photo${galleryPhotos.length === 1 ? '' : 's'}).`
        : '❌ Cover photo — missing. Diaspora cannot publish a listing without at least one photo.'
    );
    lines.push(
      description.trim().length >= 80
        ? `✅ Description — ${description.trim().length} characters.`
        : `⚠️ Description — ${description.trim().length} characters. Listings with more detail get fewer repeat questions.`
    );
    lines.push(
      propertyType
        ? `✅ Property type — ${propertyTypeName ?? propertyType}.`
        : '❌ Property type — not chosen. Required before publishing.'
    );

    // Then things that are simply true or not, with the input quoted back so the
    // member can see exactly what was measured.
    lines.push(
      title.trim().length >= 25
        ? `✅ Title — ${title.trim().length} characters.`
        : `⚠️ Title — ${title.trim().length} characters. Short titles are easy to scroll past.`
    );
    lines.push(
      areaName.trim()
        ? `✅ Area — ${areaName.trim()}, ${cityName || 'city not set'}.`
        : `⚠️ Area — not set. Only the city (${cityName || 'not set'}) will show, which makes the listing harder to find nearby.`
    );

    const rentValue = Number(rent);
    lines.push(
      rent && rentValue > 0
        ? `✅ Rent — ${currency} ${rentValue} per month entered.`
        : '❌ Rent — not entered.'
    );

    const lifestyleCount = Object.values(selectedLifestyleMatches).filter(Boolean).length;
    lines.push(
      lifestyleCount > 0
        ? `✅ Lifestyle tags — ${lifestyleCount} selected.`
        : '⚠️ Lifestyle tags — none selected. These are what lifestyle filters match on.'
    );

    setAiLoading(false);
    setAiSuggestions(
      `Checklist for this listing\n\n${lines.join('\n')}\n\n` +
      `This is a check of what you have filled in on this screen. Diaspora does not estimate rents and cannot tell you what similar homes charge.`
    );
  };

  const handlePublish = async () => {
    setIsSubmitting(true);

    const parseCommaItems = (text: string) =>
      text.split(',').map((line) => line.trim()).filter((line) => line.length > 0);

    // Remediation Wave E — `CreateHousingListingRequest.Media`, a list of
    // `HousingMediaRequest { mediaId, role, caption? }`.
    //
    // The role is **explicit** here, and its vocabulary is the server's: `Cover`,
    // `Gallery`, `FloorPlan`, `Video`, `VirtualTour`, `Document`,
    // `LeaseDocument`. So this screen names the cover rather than implying it by
    // position — which is exactly what marketplace's contract does instead, with
    // a flat `mediaIds` ordered cover-first and no role field at all.
    //
    // The two are not unified, and the difference is not an oversight to tidy
    // away: housing needs roles a marketplace listing has no use for, a floor
    // plan and a lease document among them. Making the two screens post the same
    // shape would mean one of them is posting a shape its server does not bind.
    //
    // This replaces `coverImage` (a `file:///…` device path) and `gallery` (the
    // same path repeated at the front of a list of others). Neither field exists
    // on the request the server binds.
    const media = [
      ...(coverPhoto ? [{ mediaId: coverPhoto.mediaId, role: 'Cover' }] : []),
      ...galleryPhotos.map((photo) => ({ mediaId: photo.mediaId, role: 'Gallery' })),
    ];

    const lifestyleArr = Object.keys(selectedLifestyleMatches)
      .filter((k) => selectedLifestyleMatches[k])
      .map((k) => {
        const item = LIFESTYLE_OPTIONS.find((opt) => opt.value === k);
        return item ? item.label : k;
      });

    /**
     * The create payload, as `CreateHousingListingRequest` actually declares it.
     *
     * ── This screen could not create a listing ─────────────────────────────
     *
     * The DTO declares three `required` members — `Title`, `Summary`,
     * `AccommodationTypeKey`, `CountryCode` — and this payload supplied one.
     * C# `required` means System.Text.Json refuses the body **before any
     * handler runs**, so every submission 400'd. It sent thirteen further keys
     * the DTO does not declare, each discarded by the binder without comment.
     *
     * Found by the request-binding check, which compares what leaves the device
     * against the DTO. Every earlier wave verified *responses* and could not
     * see this, because there was no response to inspect.
     *
     * What changed:
     *
     *   `summary`               new required field; distinct from description.
     *   `accommodationTypeKey`  one seeded key, from what were two client
     *                           concepts (`listingType` + `propertyType`).
     *   `countryCode`           new required field, prefilled from residence.
     *   `rent`/`currency`/      flattened onto `rentAmount`, `currencyCode`,
     *   `deposit`               `depositAmount` — the names the DTO binds.
     *   `billsIncluded`         → `utilitiesIncluded`.
     *   `furnished`             → `furnishedStatus`.
     *   `leaseDuration`         → `leaseType`.
     *   `parkingAvailable`      → `parking`, which is a **string** describing
     *                           the arrangement, not a boolean.
     *   `location: {…}`         flattened; the DTO has no nested location.
     *   `amenities`             `string[]` → `[{ key }]`.
     *   `houseRules`            `string[]` → `[{ text, order }]`.
     *
     * **`host` is deleted outright**, and it is the worst thing that was here.
     * The DTO has no such member, so none of it ever reached the server — but
     * it carried `providerId: 'user-123'`, `name: 'Amara Kone'`, `rating: 4.9`,
     * `isVerified: true` and `yearsOnPlatform: 2`. A fabricated landlord
     * identity, with a fabricated verification badge and a fabricated rating,
     * assembled on every submission. The host is the authenticated caller and
     * the server knows who that is.
     *
     * `location.distanceKm: 0.8` went with it — a distance from nobody.
     *
     * **`lifestyleMatches` is dropped and reported.** There is no field for it
     * anywhere on the request, so the checkboxes collect a preference the
     * platform cannot store. Left in the UI would be an affordance that does
     * nothing; see the note rendered beneath them.
     */
    // The server's own key, chosen from its own list.
    const accommodationTypeKey = accommodationTypes.some((type) => type.key === propertyType)
      ? propertyType
      : null;
    if (!accommodationTypeKey) {
      showAlert({
        type: 'error',
        title: 'Not created',
        message: 'Choose a property type — Diaspora needs it to file the listing.',
      });
      setIsSubmitting(false);
      return;
    }

    const payload = {
      title: title.trim(),
      summary: summary.trim(),
      description: description.trim() || undefined,
      accommodationTypeKey,
      countryCode: countryCode.trim().toUpperCase(),
      regionName: areaName.trim() || undefined,
      cityName: cityName.trim() || undefined,
      addressLine1: addressLine.trim() || undefined,
      // `undefined` rather than a spread, so the key disappears from the body
      // and the payload stays one readable literal — `backend-request-binding-drift`
      // enumerates these keys, and a spread turns its checks into vacuous passes.
      // Absent when the landlord set no pin: the server then treats the address
      // as undisclosed and files the property from its town, which is the truth.
      latitude: coordinates?.latitude,
      longitude: coordinates?.longitude,
      bedrooms: Number(bedrooms) || 1,
      bathrooms: Number(bathrooms) || 1,
      rentAmount: rent ? Number(rent) : undefined,
      // ── Without this, every priced listing is refused ──────────────────────
      //
      // `rentPeriod` was never sent. The server's `BuildPrice` treats a missing
      // rent as "price on application" and succeeds, but a rent *with* an
      // unparseable period as a failure:
      //
      //     if (request.RentAmount is null) return OnApplication(…);
      //     if (!Enum.TryParse<RentPeriod>(request.RentPeriod, …)) return PriceRequired;
      //
      // So a listing with no rent was created and a listing *with* a rent was
      // rejected `400 housing.price.required` — "State the rent, or mark the
      // price as on application" — shown to a landlord who had just stated it.
      // Confirmed against the deployment: identical payloads, one with this
      // field and one without, answered 201 and 400.
      //
      // `PerMonth` is the enum member, and it matches the only rent field this
      // form has: "Monthly Rent Amount". A per-week or per-night let needs a
      // period selector on the form before it can be offered here — sending a
      // period the member did not choose for a field they did not see would be
      // the same class of guess this comment block exists to record.
      rentPeriod: rent ? 'PerMonth' : undefined,
      currencyCode: currency || undefined,
      depositAmount: deposit ? Number(deposit) : undefined,
      utilitiesIncluded: billsIncluded,
      internetIncluded,
      // A string on the wire, not a flag: "Off-street parking" and "Permit
      // zone, no allocated space" are the same boolean and a very different
      // arrangement.
      parking: parkingAvailable ? 'Available' : undefined,
      // Only a value the server listed; a draft saved before 13 Oct holds old labels.
      furnishedStatus: furnishingOptions.some((o) => o.key === furnished) ? furnished : undefined,
      leaseType: leaseOptions.some((o) => o.key === leaseDuration) ? leaseDuration : undefined,
      isSharedAccommodation: listingType === 'Share',
      // Straight from the catalogue. Nothing here was typed, so nothing here
      // can fail to resolve.
      amenities: amenityKeys.map((key) => ({ key })),
      houseRules: parseCommaItems(houseRulesText).map((text, order) => ({ text, order })),
      media,
    };

    // Compared against what was read, not sent wholesale: `PATCH` coalesces
    // against what is stored, so an empty field would clear an address the
    // member has and an unchanged one would cost a request for nothing.
    const contactChanges = {
      ...(contactPhone.trim() && contactPhone.trim() !== (heldContact?.phoneNumber ?? '')
        ? { phoneNumber: contactPhone.trim() }
        : {}),
      ...(contactEmail.trim() && contactEmail.trim() !== (heldContact?.email ?? '')
        ? { email: contactEmail.trim() }
        : {}),
      ...(publishContact !== (heldContact?.showContactPublicly ?? false)
        ? { showContactPublicly: publishContact }
        : {}),
    };

    try {
      // Create, then publish — the two-step the contract actually requires. The
      // reasoning, the refusal codes and why publication failure is not
      // creation failure all live in `lib/housing-listings-api.ts`.
      //
      // The landlord profile is the step *before* that two-step, and the client
      // never took it: every listing write is `403 housing.not-landlord`
      // without one, and no surface called `POST /housing/landlords`. Opened on
      // demand, under the member's own name, at the moment the platform's model
      // says they become a landlord.
      const outcome = await createAndPublishListing(payload, {
        displayName: landlordDisplayName,
        countryCode: countryCode.trim().toUpperCase(),
        // Only what changed. These live on the landlord profile rather than on
        // the listing — the platform has no contact fields on a home — and the
        // profile is shared by every listing this member has, so sending an
        // unchanged value is a write nobody asked for.
        contact: contactChanges,
      });
      globalHousingDraft = null;
      setIsSubmitting(false);

      if (outcome.kind === 'published') {
        // The only branch permitted to say "published", and it says it only
        // because `POST .../publish` returned success.
        trustStore.addAuditLog('Housing Posted', `Published housing listing: "${title}"`);

        showAlert({
          type: 'success',
          title: 'Listing published',
          message: 'Your property is now visible to the community in Discover.',
          buttons: [
            {
              text: 'View Discover Hub',
              onPress: () => {
                router.replace({ pathname: '/(tabs)/discover', params: { tab: 'Housing' } });
              }
            }
          ]
        });
        return;
      }

      // Saved but not visible. The audit log records what really happened, so a
      // member reading their own security history is not told it was published.
      trustStore.addAuditLog('Housing Draft Saved', `Saved housing listing as a draft: "${title}"`);

      // Each refusal gets its own sentence. "Something went wrong" would leave a
      // landlord with an invisible listing and no idea which of the three
      // situations they are in.
      const reasonMessage =
        outcome.reason === 'incomplete'
          ? 'Your listing is saved as a draft but is not visible yet. Publishing needs at least one photo, a description, and a property type — add what is missing and publish it from your listings.'
          : outcome.reason === 'refused'
            ? 'Your listing is saved as a draft but Diaspora could not publish it. Listings are checked before they go live, and this one needs review. Contact support if you think this is wrong.'
            : 'Your listing is saved as a draft but Diaspora could not publish it just now. Nothing you entered was lost — open it from your listings and publish it again.';

      showAlert({
        type: 'warning',
        title: 'Saved as a draft — not yet visible',
        message: reasonMessage,
      });
    } catch (err) {
      setIsSubmitting(false);
      // Reached only when *creation* failed, so this is the one case where the
      // member genuinely has nothing saved — and it now says so.
      const msg = 'Diaspora could not save your listing. Nothing was posted. Please check your details and try again.';
      if (Platform.OS === 'web') {
        alert(msg);
      } else {
        showAlert({ type: 'error', title: 'Listing not saved', message: msg });
      }
    }
  };

  const progressPct = ((currentStep + 1) / steps.length) * 100;
  const getCurrencySymbol = () => {
    return currency === 'GBP' ? '£' : currency === 'MUR' ? 'Rs ' : currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'NGN' ? '₦' : currency === 'GHS' ? '₵' : `${currency} `;
  };

  if (mayList === false) {
    return (
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface-card">
        <ScreenHeader title="List a home" />
        <ScrollView className="flex-1 px-6 pt-6">
          <Text className="text-lg font-black text-content-primary mb-2">Listing homes is locked for now</Text>
          <Text className="text-sm text-content-muted mb-5 leading-relaxed">
            Listing a home needs a verified Diaspora account. Once your account is verified, you can
            list straight away.
          </Text>
          <Button label="Open Trust Centre" variant="outline" onPress={() => router.push('/profile/trust-center')} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-card">
      {/* Stepper tracker */}
      <View className="bg-surface-card border-b border-faint px-6 py-3">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest">
            Post Housing Accommodation
          </Text>
          <Text className="text-xs font-extrabold text-primary-500">
            Step {currentStep + 1} of {steps.length}
          </Text>
        </View>
        <View className="h-1.5 bg-surface-muted rounded-full w-full overflow-hidden">
          <View className="h-full bg-primary-500 rounded-full" style={{ width: `${progressPct}%` }} />
        </View>
      </View>

      <ScreenHeader
        title={steps[currentStep]}
        showBack={currentStep > 0}
        rightAction={
          <TouchableOpacity onPress={() => backOr()} className="p-2">
            <Text className="text-xs font-bold text-content-faint uppercase">Save & Exit</Text>
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView
        behavior="padding"
        className="flex-1"
      >
        {/* Draft recover alert banner */}
        {draftBannerVisible && currentStep === 0 && (
          <View className="bg-[#FFF8E1] border-b border-[#FFE082] px-6 py-4 flex-row items-center justify-between">
            <View className="flex-1 mr-4">
              <Text className="text-sm font-bold text-content-strong">✏️ Unfinished Draft</Text>
              <Text className="text-xs text-content-tertiary mt-0.5">
                Would you like to restore your previously saved housing draft details?
              </Text>
            </View>
            <View className="flex-row">
              <TouchableOpacity onPress={restoreDraft} className="bg-primary-500 px-3.5 py-2 rounded-xl mr-2">
                <Text className="text-xs font-bold text-white">Restore</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={discardDraft} className="bg-surface-muted border border-subtle px-3.5 py-2 rounded-xl">
                <Text className="text-xs font-bold text-content-tertiary">Discard</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <ScrollView className="flex-1 px-6 pt-4" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          
          {/* STEP 1: Type Selection */}
          {currentStep === 0 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Choose the rental classification and specify the property layout type.
              </Text>

              <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3">Listing Type</Text>
              <View className="flex-row mb-6 bg-surface-background p-1.5 rounded-2xl border border-subtle">
                {(['Rent', 'Share'] as const).map((type) => {
                  const isSel = listingType === type;
                  return (
                    <TouchableOpacity
                      key={type}
                      onPress={() => setListingType(type)}
                      className={`flex-1 py-3 rounded-xl items-center justify-center ${
                        isSel ? 'bg-surface-card shadow-sm' : 'bg-transparent'
                      }`}
                    >
                      <Text className={`text-xs font-bold ${isSel ? 'text-primary-500' : 'text-content-muted'}`}>
                        {type === 'Rent' ? 'Entire Place for Rent' : 'Shared Room / Flatmate Search'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3">Property Category</Text>
              <View className="flex-row flex-wrap gap-2.5">
                {visibleTypes.map((type) => (
                  <CategoryChip
                    key={type.key}
                    label={type.name}
                    icon={PROPERTY_ICONS[type.key] ?? '🏠'}
                    isSelected={propertyType === type.key}
                    onPress={() => setPropertyType(type.key)}
                  />
                ))}
                {visibleTypes.length === 0 && !choicesUnavailable && <ActivityIndicator />}
              </View>
              {choicesUnavailable && (
                <Text className="text-xs text-error-default mt-3">
                  Diaspora could not load the property types. Check your connection and open this form again.
                </Text>
              )}
            </View>
          )}

          {/* STEP 2: Property details & LIFESTYLE BADGES */}
          {currentStep === 1 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Provide high-quality descriptive titles, layout rooms info, and select community lifestyle matches.
              </Text>

              <Input
                label="Listing Title"
                placeholder="e.g. Spacious 2-Bed Flat Near City Centre"
                value={title}
                onChangeText={setTitle}
              />

              {/* Required by the server, and genuinely distinct from the
                  description below: `Summary` is required and `Description` is
                  optional, so a search card can show the short form without
                  loading the long one. */}
              <Input
                label="One-line summary"
                placeholder="e.g. Bright double room, 10 min walk to the station"
                value={summary}
                onChangeText={setSummary}
                maxLength={200}
              />

              {/* Required by the server, prefilled from the member's residence
                  and editable — a landlord may be letting somewhere other than
                  where they live. Never silently defaulted. */}
              <Input
                label="Country (2-letter code)"
                placeholder="e.g. GB"
                value={countryCode}
                onChangeText={(val: string) => setCountryCode(val.toUpperCase().slice(0, 2))}
                autoCapitalize="characters"
                maxLength={2}
              />

              <Input
                label="Description"
                placeholder="Details about building security, transit access, interior decor, etc..."
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                className="h-24"
              />

              {/* Rooms count selects */}
              <View className="flex-row gap-4 mb-4">
                <View className="flex-1">
                  <Text className="text-xs font-bold text-content-secondary mb-2">Bedrooms</Text>
                  <View className="flex-row border border-subtle rounded-xl overflow-hidden bg-surface-background">
                    {['1', '2', '3', '4+'].map((num) => (
                      <TouchableOpacity
                        key={num}
                        onPress={() => setBedrooms(num)}
                        className={`flex-1 py-3 items-center justify-center border-r border-subtle ${
                          bedrooms === num ? 'bg-primary-500' : 'bg-transparent'
                        }`}
                      >
                        <Text className={`text-xs font-bold ${bedrooms === num ? 'text-white' : 'text-content-secondary'}`}>
                          {num}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View className="flex-1">
                  <Text className="text-xs font-bold text-content-secondary mb-2">Bathrooms</Text>
                  <View className="flex-row border border-subtle rounded-xl overflow-hidden bg-surface-background">
                    {['1', '2', '3+'].map((num) => (
                      <TouchableOpacity
                        key={num}
                        onPress={() => setBathrooms(num)}
                        className={`flex-1 py-3 items-center justify-center border-r border-subtle ${
                          bathrooms === num ? 'bg-primary-500' : 'bg-transparent'
                        }`}
                      >
                        <Text className={`text-xs font-bold ${bathrooms === num ? 'text-white' : 'text-content-secondary'}`}>
                          {num}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              {/* Furnishing */}
              <Text className="text-xs font-bold text-content-secondary mb-2">Furnishing Status</Text>
              <View className="flex-row mb-6 border border-subtle rounded-xl overflow-hidden bg-surface-background">
                {furnishingOptions.map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => setFurnished(opt.key)}
                    className={`flex-1 py-3 items-center justify-center border-r border-subtle ${
                      furnished === opt.key ? 'bg-primary-500' : 'bg-transparent'
                    }`}
                  >
                    <Text className={`text-[10px] font-bold text-center ${furnished === opt.key ? 'text-white' : 'text-content-secondary'}`}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Chosen from the catalogue, never typed — see `amenityKeys`. */}
              <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-2.5">
                Amenities
              </Text>

              {amenitiesUnavailable ? (
                <View className="bg-surface-muted rounded-2xl p-4 mb-5">
                  <Text className="text-xs text-content-secondary leading-relaxed">
                    Diaspora could not load the amenity list just now. You can post this
                    property without amenities and add them later.
                  </Text>
                </View>
              ) : amenityGroups.length === 0 ? (
                <View className="py-4 mb-5">
                  <ActivityIndicator size="small" color="#F59300" />
                </View>
              ) : (
                <View className="mb-5">
                  {amenityGroups.map((section: { group: string; items: HousingAmenity[] }) => (
                    <View key={section.group} className="mb-4">
                      <Text className="text-[11px] font-bold text-content-muted mb-2">
                        {section.group}
                      </Text>
                      <View className="flex-row flex-wrap gap-2">
                        {section.items.map((amenity: HousingAmenity) => {
                          const selected = amenityKeys.includes(amenity.key);
                          return (
                            <TouchableOpacity
                              key={amenity.key}
                              onPress={() => toggleAmenity(amenity.key)}
                              accessibilityRole="button"
                              accessibilityState={{ selected }}
                              className={`px-4 py-2 rounded-2xl border ${
                                selected
                                  ? 'bg-primary-50 border-primary-300'
                                  : 'bg-surface-background border-subtle'
                              }`}
                            >
                              <Text
                                className={`text-xs font-bold ${
                                  selected ? 'text-primary-700' : 'text-content-secondary'
                                }`}
                              >
                                {amenity.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </View>
              )}

              <Input
                label="House Rules (comma-separated)"
                placeholder="e.g. Non-smoking home, Quiet hours after 10 PM, No pets allowed"
                value={houseRulesText}
                onChangeText={setHouseRulesText}
              />

              {/* Lifestyle Match Badges Select checklist */}
              <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3">Lifestyle Matches Preferences</Text>
              <View className="flex-row flex-wrap gap-2.5">
                {LIFESTYLE_OPTIONS.map((opt) => {
                  const isSel = !!selectedLifestyleMatches[opt.value];
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setSelectedLifestyleMatches({
                        ...selectedLifestyleMatches,
                        [opt.value]: !isSel
                      })}
                      className={`px-3 py-2 rounded-2xl flex-row items-center border ${
                        isSel ? 'bg-primary-50 border-primary-300' : 'bg-surface-background border-subtle'
                      }`}
                    >
                      <Text className={`text-xs font-bold ${isSel ? 'text-primary-600' : 'text-content-secondary'}`}>
                        {opt.label} {isSel ? '✓' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* STEP 3: Location */}
          {currentStep === 2 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Provide the listing address, local area, and set map coordinates pin.
              </Text>

              <Text className="text-xs font-bold text-content-secondary mb-2">City</Text>
              <View className="flex-row gap-2 mb-4">
                {['London', 'Port Louis', 'Lagos', 'Accra'].map((city) => (
                  <TouchableOpacity
                    key={city}
                    onPress={() => setCityName(city)}
                    className={`flex-1 py-3 rounded-xl border items-center justify-center ${
                      cityName === city ? 'bg-primary-50 border-primary-500' : 'bg-surface-background border-subtle'
                    }`}
                  >
                    <Text className="text-xs font-bold text-content-strong">{city}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Input
                label="Neighborhood / Area"
                placeholder="e.g. Peckham, Ward IV, East Legon, Ikeja"
                value={areaName}
                onChangeText={setAreaName}
              />

              <Input
                label="Address Line"
                placeholder="e.g. 12 Harold Shodipo Crescent, GRA"
                value={addressLine}
                onChangeText={setAddressLine}
              />

              <Input
                label="Nearby Landmark"
                placeholder="e.g. Near Caudan Metro, 3 mins to park"
                value={landmark}
                onChangeText={setLandmark}
              />

              <Text className="text-xs font-bold text-content-secondary mb-3">
                Map Pin (optional)
              </Text>

              {coordinates ? (
                <View className="bg-surface-muted rounded-2xl border border-subtle p-4">
                  <Text className="text-xs font-bold text-content-primary mb-1">
                    📍 Pin set from {pinSource ?? 'your current location'}
                  </Text>
                  <Text className="text-[11px] text-content-tertiary font-semibold">
                    {coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setCoordinates(null);
                      setPinProblem(null);
                      setPinSource(null);
                    }}
                    accessibilityRole="button"
                    className="mt-3 self-start px-4 py-2 rounded-2xl bg-surface-background border border-subtle"
                  >
                    <Text className="text-xs font-bold text-content-secondary">Remove pin</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                {/* The address the landlord picks is their own words, so it may set
                    the pin and fill an empty address line. It hides itself on a
                    deployment with no address search. */}
                <AddressSearchField
                  label="Find the property's address"
                  placeholder="Start typing the street address"
                  countryCodes={/^[A-Za-z]{2}$/.test(countryCode.trim()) ? [countryCode.trim().toUpperCase()] : undefined}
                  onResolved={(address, pickedText) => {
                    setCoordinates({ latitude: address.latitude, longitude: address.longitude });
                    setPinProblem(null);
                    setPinSource(`the address you chose: ${address.formattedAddress ?? pickedText}`);
                    if (!addressLine.trim() && address.formattedAddress) setAddressLine(address.formattedAddress);
                  }}
                  testID="housing-address-search"
                />
                <TouchableOpacity
                  disabled={isSelectingPin}
                  onPress={usePinFromDevice}
                  accessibilityRole="button"
                  accessibilityLabel="Use my current location as the map pin"
                  className="h-32 bg-surface-muted rounded-2xl border border-subtle overflow-hidden items-center justify-center"
                >
                  {isSelectingPin ? (
                    <ActivityIndicator size="small" color="#F59300" />
                  ) : (
                    <View className="items-center px-6">
                      <Text className="text-2xl mb-1">📍</Text>
                      <Text className="text-xs font-extrabold text-content-muted uppercase">
                        Use my current location
                      </Text>
                      <Text className="text-[10px] text-content-faint mt-1 font-semibold text-center">
                        Only if you are at the property. You can post without a pin.
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                </>
              )}

              {pinProblem ? (
                <Text className="text-[11px] text-content-tertiary mt-2 leading-relaxed">
                  {pinProblem}
                </Text>
              ) : null}
            </View>
          )}

          {/* STEP 4: Pricing & Availability */}
          {currentStep === 3 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Configure rent, required deposit, utility parameters, and availability date.
              </Text>

              <CurrencyNote currency={memberCurrency} />

              <Input
                label="Monthly Rent Amount"
                placeholder="e.g. 1500"
                value={rent}
                onChangeText={setRent}
                keyboardType="numeric"
              />

              <Input
                label="Security Deposit Required"
                placeholder="e.g. 1500"
                value={deposit}
                onChangeText={setDeposit}
                keyboardType="numeric"
              />

              {/* Utility switches */}
              <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3">Amenities Included in Rent</Text>
              <View className="flex-row flex-wrap gap-2.5 mb-6">
                {[
                  { label: '🔌 Bills Included', value: billsIncluded, setter: setBillsIncluded },
                  { label: '🌐 Internet Included', value: internetIncluded, setter: setInternetIncluded },
                  { label: '🚗 Parking Included', value: parkingAvailable, setter: setParkingAvailable },
                ].map((perk, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => perk.setter(!perk.value)}
                    className={`px-4 py-2.5 rounded-2xl flex-row items-center border ${
                      perk.value ? 'bg-primary-50 border-primary-300' : 'bg-surface-background border-subtle'
                    }`}
                  >
                    <Text className={`text-xs font-bold ${perk.value ? 'text-primary-600' : 'text-content-secondary'}`}>
                      {perk.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Lease */}
              <Text className="text-xs font-bold text-content-secondary mb-2">Lease Length</Text>
              <View className="flex-row flex-wrap gap-2.5 mb-6">
                {leaseOptions.map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => setLeaseDuration(opt.key)}
                    className={`px-4 py-3 rounded-xl border items-center ${
                      leaseDuration === opt.key ? 'bg-primary-50 border-primary-500' : 'bg-surface-background border-subtle'
                    }`}
                  >
                    <Text className="text-xs font-bold text-content-primary">{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Move-in */}
              <Text className="text-xs font-bold text-content-secondary mb-2">Availability Date</Text>
              <View className="flex-row flex-wrap gap-2 mb-3">
                {AVAILABILITY_OPTIONS.map((opt) => {
                  const isPresetActive = opt !== 'Custom Date' 
                    ? availabilityDate === opt
                    : !['Available Now', 'Available This Week', 'Available Next Month'].includes(availabilityDate);
                  return (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => {
                        if (opt === 'Custom Date') {
                          setCalendarVisible(true);
                        } else {
                          setAvailabilityDate(opt);
                        }
                      }}
                      className={`px-3 py-2 rounded-xl border ${
                        isPresetActive ? 'bg-primary-50 border-primary-500' : 'bg-surface-background border-subtle'
                      }`}
                    >
                      <Text className="text-xs font-bold text-content-primary">{opt}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {!['Available Now', 'Available This Week', 'Available Next Month'].includes(availabilityDate) && (
                <DatePickerInput
                  label="Selected Availability Date"
                  value={availabilityDate.match(/^\d{4}-\d{2}-\d{2}$/) ? availabilityDate : ''}
                  onChangeDate={setAvailabilityDate}
                  placeholder="Select custom availability date..."
                />
              )}
            </View>
          )}

          {/* STEP 5: Contact channels */}
          {currentStep === 4 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                How people reach you about your homes. These are kept on your landlord
                profile and used for every listing you post, not just this one.
              </Text>

              <PhoneInputWithCode
                label="WhatsApp / Call Phone Number"
                value={contactPhone}
                onChangePhone={setContactPhone}
                placeholder="7700 900000"
              />

              <Input
                label="Email Address"
                placeholder="e.g. host@diasporahosts.co.uk"
                value={contactEmail}
                onChangeText={setContactEmail}
                keyboardType="email-address"
              />

              <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3">
                How Should People Reach You
              </Text>

              {/* Two options, not four — and the second one is "both".

                  This was WhatsApp, a phone call, email or an in-app message.
                  The platform keeps none of that for housing: `LandlordContact`
                  holds a number, an address, a website and one flag saying
                  whether a browser may see them. So three of those four choices
                  were stored identically, and the fourth — in-app — was the
                  same flag turned the other way.

                  **There is no third choice to add.** Publishing a number does
                  not switch messaging off: the Message button on a listing is
                  unconditional, and `LandlordContact`'s own note calls itself
                  "the fallback for a deployment that has no such module yet",
                  not an alternative to one. So `true` has always meant *both*,
                  and the first labelling here said "by phone or email" as
                  though it meant instead. A third option setting the same flag
                  would be two buttons storing the same value, which is the
                  defect this control replaced. */}
              {[
                {
                  publish: false,
                  label: 'Diaspora messages only',
                  detail: 'Your number and email stay private. Members reach you in the app.',
                },
                {
                  publish: true,
                  label: 'Messages, phone or email',
                  detail:
                    'Members can still message you in the app, and your number and email are '
                    + 'shown on your listings.',
                },
              ].map((choice) => {
                const isSel = publishContact === choice.publish;

                return (
                  <TouchableOpacity
                    key={choice.label}
                    onPress={() => setPublishContact(choice.publish)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSel }}
                    className={`px-4 py-3.5 rounded-xl border mb-2.5 ${
                      isSel ? 'bg-primary-50 border-primary-500' : 'bg-surface-background border-subtle'
                    }`}
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-bold text-content-strong flex-1 pr-3">
                        {choice.label}
                      </Text>
                      <Text className="text-xs">{isSel ? '🟢' : '⚪'}</Text>
                    </View>
                    <Text className="text-[11px] text-content-muted mt-1 leading-relaxed">
                      {choice.detail}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* STEP 6: Photos */}
          {currentStep === 5 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Add high-quality photos representing your property space. You can select files from your library or take new photos.
              </Text>

              {/* Three controls, one design.

                  Each of these asks the member for a photograph, and until
                  today each asked differently: a 160px dashed panel, an 85px
                  dashed square reading "+ ADD PHOTO", and a thin bordered row.
                  Nothing about the task differs between them, so the only
                  thing that differs now is the heading and what it asks for. */}
              <PhotoDropZone
                label="Cover Image *"
                prompt="Tap to upload cover image"
                previewUri={coverPhoto?.previewUri ?? null}
                changeLabel="📷 Change Cover Photo"
                busy={coverBusy}
                busyLabel={
                  coverUpload.phase === 'processing'
                    ? 'Processing…'
                    : `Uploading ${Math.round(coverUpload.progress * 100)}%`
                }
                // The platform's own sentence where it gave one — it knows
                // whether the file was too large, the wrong type or refused by
                // a scanner, and each needs a different next step. Nothing was
                // added to the listing, and this is how they find that out.
                error={coverUpload.phase === 'failed' ? coverUpload.error : null}
                onPress={handleCoverPhotoSelect}
              />

              <PhotoDropZone
                label="Gallery Images"
                prompt="Tap to add a gallery photo"
                busy={galleryBusy}
                busyLabel={
                  galleryUpload.phase === 'processing'
                    ? 'Processing…'
                    : `Uploading ${Math.round(galleryUpload.progress * 100)}%`
                }
                error={galleryUpload.phase === 'failed' ? galleryUpload.error : null}
                onPress={handleAddGalleryPhoto}
              >
                {/* Above the panel rather than inside it: these are a set the
                    member has already built, and the panel is the thing that
                    adds to it. A photograph mid-upload is in neither — showing
                    it in the grid would put it in the listing before the
                    platform had agreed to hold it — so the wait is the panel's
                    overlay, which is where every other wait on this step is. */}
                {galleryPhotos.length > 0 && (
                  <View className="flex-row flex-wrap gap-3.5 mb-3">
                    {galleryPhotos.map((photo, index) => (
                      <View
                        key={`${photo.mediaId}-${index}`}
                        className="w-[85px] h-[85px] rounded-2xl overflow-hidden border border-subtle relative bg-surface-muted"
                      >
                        <Image
                          source={{ uri: photo.previewUri }}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="cover"
                        />
                        <TouchableOpacity
                          onPress={() =>
                            setGalleryPhotos(galleryPhotos.filter((_, idx) => idx !== index))
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`Remove gallery photo ${index + 1}`}
                          className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 items-center justify-center"
                        >
                          <Text className="text-[10px] font-black text-white">✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </PhotoDropZone>

              {/* There was a third control here, headed "Select Fallback Cover
                  Image". It called `handleCoverPhotoSelect` — the same handler
                  as "Cover Image" above — and there was no fallback of any kind
                  behind it, in this screen or in the contract. It was a second
                  door to the cover photograph under a name that promised
                  something else, and drawing it like the others is what made
                  that visible. Removed 21 Sep 2026. */}
            </View>
          )}

          {/* STEP 7: Preview & listing checklist */}
          {currentStep === 6 && (
            <View className="pb-8">
              <View className="bg-surface-background border border-subtle rounded-2xl p-4 mb-6">
                <View className="flex-row items-center justify-between mb-3">
                  {/*
                    Was "🤖 Smart AI Evaluator" with a button reading "Evaluate
                    listing". No model was ever consulted and no evaluation was
                    ever performed — see `runListingCheck` for what the three
                    bullet points actually contained. The label now describes
                    the thing the button does.
                  */}
                  <Text className="text-xs font-black text-content-faint uppercase tracking-wider">📋 Listing checklist</Text>
                  <TouchableOpacity onPress={runListingCheck} className="bg-primary-500 px-3 py-1.5 rounded-lg">
                    <Text className="text-[10px] font-black text-white uppercase">Check listing</Text>
                  </TouchableOpacity>
                </View>

                {aiLoading && (
                  <View className="flex-row items-center py-2">
                    <ActivityIndicator size="small" color="#F59300" className="mr-2" />
                    <Text className="text-xs font-medium text-content-tertiary">Checking what you have filled in...</Text>
                  </View>
                )}

                {aiSuggestions ? (
                  <Text className="text-xs font-medium text-content-secondary leading-relaxed bg-[#FFF8E1] border border-[#FFE082] p-3 rounded-xl">
                    {aiSuggestions}
                  </Text>
                ) : (
                  <Text className="text-xs text-content-muted font-semibold italic leading-relaxed">
                    Tap Check listing to see what is still missing before this can be published. Diaspora does not estimate rents.
                  </Text>
                )}
              </View>

              <Text className="text-xs font-bold text-content-faint uppercase tracking-widest mb-3">Housing Card Preview</Text>
              
              {/* Simulated Card design */}
              <View className="bg-surface-card border border-line rounded-2xl overflow-hidden shadow-sm mb-4">
                <View className="bg-surface-muted h-36 justify-center items-center">
                  <Text className="text-xs font-semibold text-content-muted">Image Cover Placeholder</Text>
                </View>
                <View className="p-4">
                  <View className="bg-primary-50 px-2 py-0.5 rounded border border-primary-100 mb-2 self-start">
                    <Text className="text-[9px] font-bold text-primary-600 uppercase">{listingType} · {propertyTypeName ?? 'Property type not chosen'}</Text>
                  </View>
                  <Text className="text-base font-black text-content-primary leading-snug">{title || 'Opportunity Title'}</Text>
                  <Text className="text-xs text-content-muted font-bold mt-1">📍 {areaName || 'Peckham'} · {cityName}</Text>
                  
                  <View className="flex-row items-center gap-3 border-t border-faint pt-2.5 mt-2.5 mb-2.5">
                    <Text className="text-[10px] text-content-muted font-semibold">🛏️ {bedrooms} Bed</Text>
                    <Text className="text-[10px] text-content-muted font-semibold">🚿 {bathrooms} Bath</Text>
                    <Text className="text-[10px] text-content-muted font-semibold">🛋️ {furnished}</Text>
                  </View>

                  <View className="flex-row justify-between items-center border-t border-faint pt-2.5">
                    <Text className="text-sm font-black text-primary-500">
                      {getCurrencySymbol()}{rent || '0'}/mo
                    </Text>
                    <View className="bg-surface-background px-3 py-1 rounded border border-subtle">
                      <Text className="text-[9px] font-bold text-content-muted uppercase">PREVIEW</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          )}

        </ScrollView>

        {/* Navigation Footer */}
        {/* Named, not implied. A disabled button with no explanation is the
            reason a landlord scrolls a seven-step form looking for what they
            missed — and on the step where the missing field was the summary,
            the only feedback was a 400 five steps later. */}
        {stillNeeded.length > 0 ? (
          <View className="px-6 pt-3 flex-row items-start">
            <Ionicons name="alert-circle-outline" size={14} color="#F59300" />
            <Text className="text-[11px] font-semibold text-content-tertiary ml-1.5 flex-1">
              Still needed: {stillNeeded.join(', ')}
            </Text>
          </View>
        ) : null}

        <View className="px-6 py-4 border-t border-faint bg-surface-card">
          {/* `fullWidth={false}` on both, and it is not decoration.

              `Button` defaults to `fullWidth`, which is `w-full` — width 100%
              of the row. Two of those in a `flex-row` do not share it: the
              first takes the whole 954px, the second is laid out after it and
              runs off the screen. On a 1080px device the Next button measured
              31px wide, hard against the right edge — clickable, and no use to
              anybody. `flex: 1` never got a look in, because an explicit width
              is not something it can override.

              Found on an emulator on 21 Sep 2026. Nothing in tsc or jest can
              see a layout that overflows its screen. */}
          <View className="flex-row gap-3">
            {currentStep > 0 && (
              <Button
                label="Back"
                variant="outline"
                fullWidth={false}
                className="flex-1"
                onPress={() => setCurrentStep(currentStep - 1)}
              />
            )}
            <Button
              label={currentStep === steps.length - 1 ? 'Publish' : 'Next'}
              fullWidth={false}
              className="flex-1"
              isLoading={isSubmitting}
              disabled={stillNeeded.length > 0}
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
      {/* Calendar Picker Modal */}
      <Modal
        visible={calendarVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCalendarVisible(false)}
      
        statusBarTranslucent
        navigationBarTranslucent>
        <View className="flex-1 bg-black/40 justify-center items-center px-6" style={Platform.OS === 'web' ? { zIndex: 9999 } : undefined}>
          <View className="bg-surface-card w-full max-w-[320px] rounded-3xl p-5 shadow-2xl">
            {/* Header row */}
            <View className="flex-row justify-between items-center mb-4 border-b border-faint pb-2">
              <TouchableOpacity onPress={prevMonth} className="p-2">
                <Text className="text-lg font-black text-content-muted">‹</Text>
              </TouchableOpacity>
              <Text className="text-sm font-extrabold text-content-primary">
                {monthsList[calendarMonth]} {calendarYear}
              </Text>
              <TouchableOpacity onPress={nextMonth} className="p-2">
                <Text className="text-lg font-black text-content-muted">›</Text>
              </TouchableOpacity>
            </View>

            {/* Days of the week row */}
            <View className="flex-row justify-between mb-2">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                <View key={d} style={{ width: '14.28%' }} className="items-center">
                  <Text className="text-[10px] font-black text-content-faint uppercase">{d}</Text>
                </View>
              ))}
            </View>

            {/* Calendar Days Grid */}
            <View className="flex-row flex-wrap">
              {renderCalendarDays()}
            </View>

            <TouchableOpacity
              onPress={() => setCalendarVisible(false)}
              className="mt-6 py-3 bg-surface-muted rounded-2xl items-center"
            >
              <Text className="text-xs font-bold text-content-muted">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
