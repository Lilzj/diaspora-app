import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Animated, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { CategoryChip } from '@/components/CategoryChip';
import { Input } from '@/components/Input';
import { mockHousingCategories } from '@/mocks/housing-data';
import { apiClient } from '@/lib/apiClient';
import { useTrustStore } from '@/store/trust';
import { TrustEngine } from '@/lib/trustEngine';
import * as ImagePicker from 'expo-image-picker';
import { DatePickerInput } from '@/components/DatePickerInput';
import { PhoneInputWithCode } from '@/components/PhoneInputWithCode';
import { Ionicons } from '@expo/vector-icons';
import { useNotification } from '@/providers/notification-provider';
import type { AlertOptions } from '@/providers/notification-provider';

/** The designed alert modal, passed to helpers that sit outside a component. */
type ShowAlert = (options: AlertOptions) => void;

// Defined at module scope, so it cannot use the notification hook itself.
// The alert function comes from the component that calls it, which keeps the
// permission refusal in the designed modal rather than the Android dialog.
const pickFromGallery = async (showAlert: ShowAlert) => {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    showAlert({ type: 'error', title: 'Permission Denied', message: 'We need access to your photos to upload images.' });
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 0.8,
  });
  if (!result.canceled && result.assets && result.assets.length > 0) {
    return result.assets[0].uri;
  }
  return null;
};

const pickFromCamera = async (showAlert: ShowAlert) => {
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
    return result.assets[0].uri;
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

const PROPERTY_TYPES = [
  { label: 'Apartment', icon: '🏢' },
  { label: 'Studio', icon: '📦' },
  { label: 'Single Room', icon: '🛏️' },
  { label: 'Shared Room', icon: '👥' },
  { label: 'Roommate Needed', icon: '🤝' },
  { label: 'Family House', icon: '🏡' },
  { label: 'Hostel', icon: '🏫' },
  { label: 'Student Accommodation', icon: '🎓' },
  { label: 'Temporary Stay', icon: '⏱️' },
  { label: 'Guest House', icon: '🏡' },
  { label: 'Vacation Rental', icon: '🌴' },
  { label: 'Serviced Apartment', icon: '🛎️' }
];

const CURRENCIES = ['GBP', 'MUR', 'USD', 'EUR', 'NGN', 'GHS'];
const FURNISHING_OPTIONS = ['Furnished', 'Unfurnished', 'Partially Furnished'];
const LEASE_DURATION_OPTIONS = ['6 Months', '1 Year', 'Flexible', 'Short-let'];
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

const MOCK_COVER_PHOTOS = [
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600',
  'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=600',
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600',
  'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=600'
];

const MOCK_GALLERY_PHOTOS = [
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600',
  'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=600',
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600',
  'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=600',
  'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=600',
  'https://images.unsplash.com/photo-1544148103-0773bf10d330?w=600'
];

export default function CreateHousingScreen() {
  const trustStore = useTrustStore();
  const { showAlert } = useNotification();
  const evaluation = TrustEngine.evaluateAction('PostHousing', 'GB');

  const [currentStep, setCurrentStep] = useState(0);
  const [draftBannerVisible, setDraftBannerVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);



  // STEP 1: Listing & Property Type
  const [listingType, setListingType] = useState<'Rent' | 'Share'>('Rent');
  const [propertyType, setPropertyType] = useState<string | null>(null);

  // STEP 2: Property details & Lifestyle match checkboxes
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bedrooms, setBedrooms] = useState('2');
  const [bathrooms, setBathrooms] = useState('1');
  const [furnished, setFurnished] = useState('Furnished');
  const [amenitiesText, setAmenitiesText] = useState('High-speed Internet, Washing Machine, Heating');
  const [houseRulesText, setHouseRulesText] = useState('No smoking inside, Respect quiet hours');
  const [selectedLifestyleMatches, setSelectedLifestyleMatches] = useState<Record<string, boolean>>({});

  // STEP 3: Location & Landmark
  const [cityName, setCityName] = useState('London');
  const [areaName, setAreaName] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [landmark, setLandmark] = useState('');
  const [isSelectingPin, setIsSelectingPin] = useState(false);
  const [coordinates, setCoordinates] = useState({ latitude: 51.4702, longitude: -0.0691 });

  // STEP 4: Pricing & Lease
  const [rent, setRent] = useState('');
  const [currency, setCurrency] = useState('GBP');
  const [deposit, setDeposit] = useState('');
  const [billsIncluded, setBillsIncluded] = useState(false);
  const [internetIncluded, setInternetIncluded] = useState(true);
  const [parkingAvailable, setParkingAvailable] = useState(false);
  const [leaseDuration, setLeaseDuration] = useState('1 Year');
  const [availabilityDate, setAvailabilityDate] = useState('Available Now');

  // STEP 5: Contact
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [preferredContactMethod, setPreferredContactMethod] = useState<'phone' | 'email' | 'whatsapp' | 'in_app'>('whatsapp');

  // STEP 6: Photos
  const [coverImage, setCoverImage] = useState('https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600');
  const [galleryPhotos, setGalleryPhotos] = useState<string[]>([
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600',
    'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=600'
  ]);

  const handleCoverPhotoSelect = async () => {
    const title = 'Select Cover Image';
    const message = 'Choose an action to add your property cover photo';
    const options = [
      {
        text: '📷 Take Photo (Camera)',
        onPress: async () => {
          const uri = await pickFromCamera(showAlert);
          if (uri) setCoverImage(uri);
        }
      },
      {
        text: '🖼️ Choose from Gallery',
        onPress: async () => {
          const uri = await pickFromGallery(showAlert);
          if (uri) setCoverImage(uri);
        }
      },
      { text: 'Cancel', style: 'cancel' as const }
    ];

    if (Platform.OS === 'web') {
      const uri = await pickFromGallery(showAlert);
      if (uri) setCoverImage(uri);
    } else {
      showAlert({ type: 'info', title: title, message: message, buttons: options });
    }
  };

  const handleAddGalleryPhoto = async () => {
    const title = 'Select Gallery Image';
    const message = 'Choose an action to add a property gallery photo';
    const options = [
      {
        text: '📷 Take Photo (Camera)',
        onPress: async () => {
          const uri = await pickFromCamera(showAlert);
          if (uri) setGalleryPhotos(prev => [...prev, uri]);
        }
      },
      {
        text: '🖼️ Choose from Gallery',
        onPress: async () => {
          const uri = await pickFromGallery(showAlert);
          if (uri) setGalleryPhotos(prev => [...prev, uri]);
        }
      },
      { text: 'Cancel', style: 'cancel' as const }
    ];

    if (Platform.OS === 'web') {
      const uri = await pickFromGallery(showAlert);
      if (uri) setGalleryPhotos(prev => [...prev, uri]);
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

  // Auto-save draft triggers
  const saveDraft = () => {
    globalHousingDraft = {
      listingType, propertyType, title, description, bedrooms, bathrooms, furnished,
      amenitiesText, houseRulesText, selectedLifestyleMatches, cityName, areaName,
      addressLine, landmark, rent, currency, deposit, billsIncluded, internetIncluded,
      parkingAvailable, leaseDuration, availabilityDate, contactPhone, contactEmail,
      preferredContactMethod, coverImage, galleryPhotos, currentStep
    };
  };

  useEffect(() => {
    if (title || description || propertyType || rent) {
      saveDraft();
    }
  }, [
    listingType, propertyType, title, description, bedrooms, bathrooms, furnished,
    amenitiesText, houseRulesText, selectedLifestyleMatches, cityName, areaName,
    addressLine, landmark, rent, currency, deposit, billsIncluded, internetIncluded,
    parkingAvailable, leaseDuration, availabilityDate, contactPhone, contactEmail,
    preferredContactMethod, coverImage, galleryPhotos
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
      setAmenitiesText(d.amenitiesText);
      setHouseRulesText(d.houseRulesText);
      setSelectedLifestyleMatches(d.selectedLifestyleMatches || {});
      setCityName(d.cityName);
      setAreaName(d.areaName);
      setAddressLine(d.addressLine);
      setLandmark(d.landmark);
      setRent(d.rent);
      setCurrency(d.currency);
      setDeposit(d.deposit);
      setBillsIncluded(d.billsIncluded);
      setInternetIncluded(d.internetIncluded);
      setParkingAvailable(d.parkingAvailable);
      setLeaseDuration(d.leaseDuration);
      setAvailabilityDate(d.availabilityDate);
      setContactPhone(d.contactPhone);
      setContactEmail(d.contactEmail);
      setPreferredContactMethod(d.preferredContactMethod);
      setCoverImage(d.coverImage);
      setGalleryPhotos(d.galleryPhotos || []);
      setCurrentStep(d.currentStep || 0);
      setDraftBannerVisible(false);
    }
  };

  const discardDraft = () => {
    globalHousingDraft = null;
    setDraftBannerVisible(false);
  };

  // AI Checker
  const runAiChecker = () => {
    setAiLoading(true);
    setAiSuggestions(null);
    setTimeout(() => {
      setAiLoading(false);
      setAiSuggestions(
        `🤖 AI Housing Evaluator:\n\n` +
        `• Title Check: "Excellent. Includes area, bed size, and transit proximity."\n` +
        `• Pricing Check: "Average rent for a ${bedrooms}-bed ${propertyType} in ${areaName || cityName} is around ${currency === 'GBP' ? '£' : ''}${currency} ${rent || '1500'}/mo. Your pricing is competitive."\n` +
        `• Lifestyle: "Great lifestyle matching flags! It matches settlement tags search."`
      );
    }, 1200);
  };

  const handlePublish = async () => {
    // Record the rate limit hit when actually submitting/publishing
    const recordCheck = TrustEngine.evaluateAction('PostHousing', 'GB', false);
    if (!recordCheck.allowed) {
      const errMsg = recordCheck.reason || 'Rate limit active. Please try again later.';
      if (Platform.OS === 'web') {
        alert(errMsg);
      } else {
        showAlert({ type: 'error', title: 'Rate Limit Active', message: errMsg });
      }
      return;
    }

    setIsSubmitting(true);

    const parseCommaItems = (text: string) =>
      text.split(',').map((line) => line.trim()).filter((line) => line.length > 0);

    const lifestyleArr = Object.keys(selectedLifestyleMatches)
      .filter((k) => selectedLifestyleMatches[k])
      .map((k) => {
        const item = LIFESTYLE_OPTIONS.find((opt) => opt.value === k);
        return item ? item.label : k;
      });

    const payload = {
      title,
      description,
      listingType,
      propertyType,
      bedrooms: Number(bedrooms) || 1,
      bathrooms: Number(bathrooms) || 1,
      rent: Number(rent) || 0,
      currency,
      deposit: Number(deposit) || 0,
      billsIncluded,
      internetIncluded,
      parkingAvailable,
      furnished,
      availabilityDate,
      leaseDuration,
      coverImage,
      gallery: [coverImage, ...galleryPhotos],
      location: {
        cityName,
        areaName: areaName || cityName,
        addressLine,
        landmark,
        distanceKm: 0.8,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude
      },
      host: {
        providerId: 'user-123',
        name: 'Amara Kone',
        avatarUrl: null,
        isVerified: true,
        rating: 4.9,
        reputationLevel: 'VerifiedResident',
        yearsOnPlatform: 2,
        responseTime: 'Within 1 hour',
        languagesSpoken: ['English'],
        contactPhone,
        contactEmail,
        preferredContactMethod
      },
      amenities: parseCommaItems(amenitiesText),
      houseRules: parseCommaItems(houseRulesText),
      lifestyleMatches: lifestyleArr,
      status: 'Active'
    };

    try {
      await apiClient.post('/housing', payload);
      globalHousingDraft = null;
      setIsSubmitting(false);

      // Log security audit logs
      trustStore.addAuditLog('Housing Posted', `Successfully listed housing accommodation: "${title}"`);

      showAlert({
        type: 'success',
        title: 'Listing Published!',
        message: 'Your property has been listed for the community.',
        buttons: [
          {
            text: 'View Discover Hub',
            onPress: () => {
              router.replace({ pathname: '/(tabs)/discover', params: { tab: 'Housing' } });
            }
          }
        ]
      });
    } catch (err) {
      setIsSubmitting(false);
      const msg = 'Failed to publish housing listing. Please verify inputs.';
      if (Platform.OS === 'web') {
        alert(msg);
      } else {
        showAlert({ type: 'error', title: 'Publish Error', message: msg });
      }
    }
  };

  const progressPct = ((currentStep + 1) / steps.length) * 100;
  const getCurrencySymbol = () => {
    return currency === 'GBP' ? '£' : currency === 'MUR' ? 'Rs ' : currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'NGN' ? '₦' : currency === 'GHS' ? '₵' : `${currency} `;
  };

  // If publishing is locked under current governance parameters, render explainable progress checklist
  if (!evaluation.allowed) {
    const housingUnlock = TrustEngine.getFeatureUnlockRequirements('GB').find((f) => f.featureId === 'housing');
    return (
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface-card">
        <ScreenHeader title="Posting Locked" />
        <ScrollView className="flex-1 p-6" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          <View className="items-center mb-8">
            <View className="w-20 h-20 bg-amber-50 border border-amber-200 rounded-full items-center justify-center mb-6">
              <Text className="text-4xl">🔒</Text>
            </View>
            <Text className="text-2xl font-black text-content-primary text-center mb-3 tracking-tight">
              Housing Listing Locked
            </Text>
            <Text className="text-sm text-content-muted text-center leading-relaxed max-w-[280px]">
              Listing accommodations requires verified residency and phone status to prevent marketplace rental scams.
            </Text>
          </View>

          {/* Progress checklists */}
          <View className="bg-surface-background border border-subtle rounded-3xl p-5 w-full mb-8">
            <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-4">Requirements Checklist</Text>
            <View className="gap-3">
              {housingUnlock?.requirements.map((r, idx) => (
                <View key={idx} className="flex-row justify-between items-center py-2 border-t border-faint first:border-t-0">
                  <View className="flex-row items-center flex-1 mr-3">
                    <Text className="text-xs mr-2">{r.isMet ? '✅' : '❌'}</Text>
                    <Text className="text-xs font-extrabold text-content-primary">{r.description}</Text>
                  </View>
                  <Text className="text-[10px] font-bold text-content-muted">{r.currentProgress}</Text>
                </View>
              ))}
            </View>
          </View>

          <Button 
            label="Go back to Housing" 
            variant="primary" 
            onPress={() => router.replace({ pathname: '/(tabs)/discover', params: { tab: 'Housing' } })} 
            className="w-full mb-3" 
          />
          <Button label="Visit Trust Center" variant="outline" onPress={() => router.push('/profile/trust-center')} className="w-full" />
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
          <TouchableOpacity onPress={() => router.back()} className="p-2">
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
                {PROPERTY_TYPES.map((cat) => {
                  const isSelected = propertyType === cat.label;
                  return (
                    <CategoryChip
                      key={cat.label}
                      label={cat.label}
                      icon={cat.icon}
                      isSelected={isSelected}
                      onPress={() => setPropertyType(cat.label)}
                    />
                  );
                })}
              </View>
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
                {FURNISHING_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => setFurnished(opt)}
                    className={`flex-1 py-3 items-center justify-center border-r border-subtle ${
                      furnished === opt ? 'bg-primary-500' : 'bg-transparent'
                    }`}
                  >
                    <Text className={`text-[10px] font-bold ${furnished === opt ? 'text-white' : 'text-content-secondary'}`}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Input
                label="Amenities (comma-separated)"
                placeholder="e.g. High-speed Internet, Air Conditioning, Washing Machine, Balcony"
                value={amenitiesText}
                onChangeText={setAmenitiesText}
              />

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

              <Text className="text-xs font-bold text-content-secondary mb-3">Map Coordinates</Text>
              <TouchableOpacity
                onPress={() => {
                  setIsSelectingPin(true);
                  setTimeout(() => {
                    setIsSelectingPin(false);
                    // Generate pseudo random coordinates matching city
                    const pseudoCoords = cityName === 'London'
                      ? { latitude: 51.4702, longitude: -0.0691 }
                      : cityName === 'Lagos' ? { latitude: 6.5863, longitude: 3.3601 }
                      : cityName === 'Accra' ? { latitude: 5.6322, longitude: -0.1554 }
                      : { latitude: -20.1642, longitude: 57.5029 };
                    
                    setCoordinates(pseudoCoords);
                    showAlert({ type: 'success', title: 'Map Pin Configured', message: 'Simulated GPS coordinates saved for this address.' });
                  }, 1000);
                }}
                className="h-32 bg-surface-muted rounded-2xl border border-subtle overflow-hidden items-center justify-center"
              >
                {isSelectingPin ? (
                  <ActivityIndicator size="small" color="#F59300" />
                ) : (
                  <View className="items-center">
                    <Text className="text-2xl mb-1">🗺️</Text>
                    <Text className="text-xs font-extrabold text-content-muted uppercase">Simulated Map Picker</Text>
                    <Text className="text-[10px] text-content-faint mt-1 font-semibold">Tap to set coordinates pin</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 4: Pricing & Availability */}
          {currentStep === 3 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Configure rent, currency, required deposit, utility parameters, and availability date.
              </Text>

              <Text className="text-xs font-bold text-content-secondary mb-2">Currency</Text>
              <View className="flex-row flex-wrap gap-2.5 mb-4">
                {CURRENCIES.map((cur) => (
                  <TouchableOpacity
                    key={cur}
                    onPress={() => setCurrency(cur)}
                    className={`px-4 py-2 rounded-xl border ${
                      currency === cur ? 'bg-primary-50 border-primary-500' : 'bg-surface-background border-subtle'
                    }`}
                  >
                    <Text className="text-xs font-bold text-content-strong">{cur}</Text>
                  </TouchableOpacity>
                ))}
              </View>

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
              <View className="flex-row gap-2.5 mb-6">
                {LEASE_DURATION_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => setLeaseDuration(opt)}
                    className={`flex-1 py-3 rounded-xl border items-center ${
                      leaseDuration === opt ? 'bg-primary-50 border-primary-500' : 'bg-surface-background border-subtle'
                    }`}
                  >
                    <Text className="text-xs font-bold text-content-primary">{opt}</Text>
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
                Provide contact phone, email, and preferences to start receiving housing applications.
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

              <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3">Preferred Contact Channel</Text>
              <View className="flex-row flex-wrap gap-2.5">
                {[
                  { label: 'WhatsApp', value: 'whatsapp' },
                  { label: 'Phone Call', value: 'phone' },
                  { label: 'Email', value: 'email' },
                  { label: 'In-App Message', value: 'in_app' },
                ].map((method) => {
                  const isSel = preferredContactMethod === method.value;
                  return (
                    <TouchableOpacity
                      key={method.value}
                      onPress={() => setPreferredContactMethod(method.value as any)}
                      className={`px-4 py-3 rounded-xl border flex-row items-center justify-between ${
                        isSel ? 'bg-primary-50 border-primary-500' : 'bg-surface-background border-subtle'
                      }`}
                      style={{ width: '47%' }}
                    >
                      <Text className="text-xs font-bold text-content-strong">{method.label}</Text>
                      <Text className="text-xs">{isSel ? '🟢' : '⚪'}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* STEP 6: Photos */}
          {currentStep === 5 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Add high-quality photos representing your property space. You can select files from your library or take new photos.
              </Text>

              {/* Cover Photo Box */}
              <Text className="text-xs font-bold text-content-secondary mb-2">Cover Image *</Text>
              <TouchableOpacity
                onPress={handleCoverPhotoSelect}
                className="h-40 border-2 border-dashed border-line rounded-2xl bg-surface-background justify-center items-center overflow-hidden mb-5"
              >
                {coverImage ? (
                  <View className="w-full h-full relative">
                    <Image source={{ uri: coverImage }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    <View className="absolute inset-0 bg-black/30 justify-center items-center">
                      <Text className="text-white font-extrabold text-xs bg-black/40 px-3 py-1.5 rounded-full">📷 Change Cover Photo</Text>
                    </View>
                  </View>
                ) : (
                  <View className="items-center">
                    <Text className="text-3xl mb-1.5">🖼️</Text>
                    <Text className="text-xs font-bold text-content-muted">Tap to upload cover image</Text>
                    <Text className="text-[9px] text-content-faint mt-1 font-semibold">Camera or Photo Gallery</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Gallery Images Grid */}
              <Text className="text-xs font-bold text-content-secondary mb-2">Gallery Images</Text>
              <View className="flex-row flex-wrap gap-3.5 mb-6">
                {galleryPhotos.map((photo, index) => (
                  <View key={index} className="w-[85px] h-[85px] rounded-2xl overflow-hidden border border-subtle relative bg-surface-muted">
                    <Image source={{ uri: photo }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    <TouchableOpacity
                      onPress={() => setGalleryPhotos(galleryPhotos.filter((_, idx) => idx !== index))}
                      className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 items-center justify-center"
                    >
                      <Text className="text-[10px] font-black text-white">✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                
                <TouchableOpacity
                  onPress={handleAddGalleryPhoto}
                  className="w-[85px] h-[85px] border-2 border-dashed border-line rounded-2xl bg-surface-background justify-center items-center"
                >
                  <Text className="text-xl text-content-faint mb-0.5">+</Text>
                  <Text className="text-[9px] font-bold text-content-muted uppercase">Add Photo</Text>
                </TouchableOpacity>
              </View>

              {/* Advanced Image Selector from Gallery */}
              <Text className="text-[10px] font-bold text-content-faint uppercase tracking-widest mb-2 mt-4">Select Fallback Cover Image</Text>
              <TouchableOpacity
                onPress={handleCoverPhotoSelect}
                className="flex-row items-center justify-between border border-subtle bg-surface-background rounded-xl px-4 py-3"
              >
                <Text className="text-xs font-bold text-content-tertiary">Select cover image from gallery</Text>
                <Ionicons name="images-outline" size={18} color="#F59300" />
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 7: Preview & Smart AI evaluates */}
          {currentStep === 6 && (
            <View className="pb-8">
              <View className="bg-surface-background border border-subtle rounded-2xl p-4 mb-6">
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-xs font-black text-content-faint uppercase tracking-wider">🤖 Smart AI Evaluator</Text>
                  <TouchableOpacity onPress={runAiChecker} className="bg-primary-500 px-3 py-1.5 rounded-lg">
                    <Text className="text-[10px] font-black text-white uppercase">Evaluate listing</Text>
                  </TouchableOpacity>
                </View>

                {aiLoading && (
                  <View className="flex-row items-center py-2">
                    <ActivityIndicator size="small" color="#F59300" className="mr-2" />
                    <Text className="text-xs font-medium text-content-tertiary">Analyzing listing description...</Text>
                  </View>
                )}

                {aiSuggestions ? (
                  <Text className="text-xs font-medium text-content-secondary leading-relaxed bg-[#FFF8E1] border border-[#FFE082] p-3 rounded-xl">
                    {aiSuggestions}
                  </Text>
                ) : (
                  <Text className="text-xs text-content-muted font-semibold italic leading-relaxed">
                    Tap Evaluate to analyze listing description clarity, check local pricing averages, and optimize for settlement search.
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
                    <Text className="text-[9px] font-bold text-primary-600 uppercase">{listingType} · {propertyType || 'Apartment'}</Text>
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
        <View className="px-6 py-4 border-t border-faint bg-surface-card">
          <View className="flex-row gap-3">
            {currentStep > 0 && (
              <Button
                label="Back"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => setCurrentStep(currentStep - 1)}
              />
            )}
            <Button
              label={currentStep === steps.length - 1 ? 'Publish' : 'Next'}
              style={{ flex: 1 }}
              isLoading={isSubmitting}
              disabled={
                (currentStep === 0 && !propertyType) ||
                (currentStep === 1 && (!title || !description)) ||
                (currentStep === 2 && (!areaName || !addressLine)) ||
                (currentStep === 3 && !rent) ||
                (currentStep === 4 && !contactPhone)
              }
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
      >
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
