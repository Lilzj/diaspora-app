import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Animated, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { CategoryChip } from '@/components/CategoryChip';
import { Input } from '@/components/Input';
import { mockMarketplaceCategories } from '@/mocks/marketplace-data';
import { apiClient } from '@/lib/apiClient';
import { useTrustStore } from '@/store/trust';
import { TrustEngine } from '@/lib/trustEngine';
import * as ImagePicker from 'expo-image-picker';
import { PhoneInputWithCode } from '@/components/PhoneInputWithCode';
import { Ionicons } from '@expo/vector-icons';
import { useNotification } from '@/providers/notification-provider';
import type { AlertOptions } from '@/providers/notification-provider';
import { useBottomInset } from '@/components/layout/bottom-inset';
import { useThemeTokens } from '@/design-system';

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

// Module-level global draft store
let globalMarketplaceDraft: any = null;

const steps = [
  'Listing Type & Intent',
  'Category & Condition',
  'Product Information',
  'Location & Proximity',
  'Photos & Ordering',
  'Contact Preferences',
  'Preview & Publish'
];

const INTENTS = [
  { label: 'Selling', value: 'Selling', desc: 'Sell your item to local community members', icon: '🛍️' },
  { label: 'Buying Request', value: 'Buying Request', desc: 'Request to buy an item from others', icon: '🙋' },
  { label: 'Giving Away', value: 'Giving Away', desc: 'Give away an item for free to the community', icon: '🎁' },
  { label: 'Exchange / Swap', value: 'Exchange / Swap', desc: 'Trade or swap your item with someone else', icon: '🔄' },
  { label: 'Donation', value: 'Donation', desc: 'Support a charitable cause with goods or services', icon: '🤝' }
];

const CONDITIONS = [
  { label: 'New', desc: 'Brand new, never opened, in original packaging' },
  { label: 'Like New', desc: 'Looks and functions like new, minimal or no signs of wear' },
  { label: 'Very Good', desc: 'Minor cosmetic wear, fully operational and clean' },
  { label: 'Good', desc: 'Some wear and tear, but works perfectly' },
  { label: 'Fair', desc: 'Visible wear, scratches or issues, but still usable' }
];

const CURRENCIES = ['GBP', 'MUR', 'USD', 'EUR', 'NGN', 'GHS'];

const MOCK_COVER_PHOTOS = [
  'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600',
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600',
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600',
  'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=600',
  'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600'
];

const MOCK_GALLERY_PHOTOS = [
  'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600',
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600',
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600',
  'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=600',
  'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600',
  'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=600'
];

export default function CreateListingScreen() {
  const tokens = useThemeTokens();
  // The guard rail: the phone's gesture area plus breathing room.
  const bottomInset = useBottomInset();

  const trustStore = useTrustStore();
  const { showAlert } = useNotification();
  const evaluation = TrustEngine.evaluateAction('SellItem', 'GB');

  const [currentStep, setCurrentStep] = useState(0);
  const [draftBannerVisible, setDraftBannerVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);



  // STEP 1: Listing Type
  const [intent, setIntent] = useState<'Selling' | 'Buying Request' | 'Giving Away' | 'Exchange / Swap' | 'Wanted' | 'Donation'>('Selling');

  // STEP 2: Category & Condition
  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState('');
  const [brand, setBrand] = useState('');
  const [condition, setCondition] = useState<'New' | 'Like New' | 'Very Good' | 'Good' | 'Fair'>('New');

  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [subcategoryModalVisible, setSubcategoryModalVisible] = useState(false);

  // STEP 3: Product Information
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [currency, setCurrency] = useState('GBP');
  const [negotiable, setNegotiable] = useState(true);
  const [quantity, setQuantity] = useState('1');

  // STEP 4: Location & landmark
  const [cityName, setCityName] = useState('London');
  const [areaName, setAreaName] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [landmark, setLandmark] = useState('');
  const [isSelectingPin, setIsSelectingPin] = useState(false);
  const [coordinates, setCoordinates] = useState({ latitude: 51.4702, longitude: -0.0691 });

  // STEP 5: Photos & Ordering
  const [coverImage, setCoverImage] = useState('https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600');
  const [galleryPhotos, setGalleryPhotos] = useState<string[]>([
    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600',
    'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600'
  ]);

  // STEP 6: Contact Channels
  const [contactPhone, setContactPhone] = useState('');
  const [preferredContactMethod, setPreferredContactMethod] = useState<'in_app' | 'phone' | 'email'>('in_app');

  // Step 7 AI price checks
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string | null>(null);

  // Check draft on mount
  useEffect(() => {
    if (globalMarketplaceDraft) {
      setDraftBannerVisible(true);
    }
  }, []);

  // Save Draft logic
  const saveDraft = () => {
    globalMarketplaceDraft = {
      intent, category, subcategory, brand, condition, title, description, price,
      currency, negotiable, quantity, cityName, areaName, addressLine, landmark,
      coverImage, galleryPhotos, contactPhone, preferredContactMethod,
      currentStep
    };
  };

  useEffect(() => {
    if (title || description || category || price) {
      saveDraft();
    }
  }, [
    intent, category, subcategory, brand, condition, title, description, price,
    currency, negotiable, quantity, cityName, areaName, addressLine, landmark,
    coverImage, galleryPhotos, contactPhone, preferredContactMethod
  ]);

  const restoreDraft = () => {
    if (globalMarketplaceDraft) {
      const d = globalMarketplaceDraft;
      setIntent(d.intent);
      setCategory(d.category);
      setSubcategory(d.subcategory || '');
      setBrand(d.brand || '');
      setCondition(d.condition);
      setTitle(d.title);
      setDescription(d.description);
      setPrice(d.price);
      setCurrency(d.currency);
      setNegotiable(d.negotiable);
      setQuantity(d.quantity || '1');
      setCityName(d.cityName);
      setAreaName(d.areaName || '');
      setAddressLine(d.addressLine || '');
      setLandmark(d.landmark || '');
      setCoverImage(d.coverImage);
      setGalleryPhotos(d.galleryPhotos || []);
      setContactPhone(d.contactPhone || '');
      setPreferredContactMethod(d.preferredContactMethod || 'in_app');
      setCurrentStep(d.currentStep || 0);
      setDraftBannerVisible(false);
    }
  };

  const discardDraft = () => {
    globalMarketplaceDraft = null;
    setDraftBannerVisible(false);
  };

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

  const reorderGallery = (idx: number) => {
    if (idx === 0) return;
    const next = [...galleryPhotos];
    const temp = next[idx];
    next[idx] = next[idx - 1];
    next[idx - 1] = temp;
    setGalleryPhotos(next);
  };

  const deleteGalleryPhoto = (idx: number) => {
    const next = [...galleryPhotos];
    next.splice(idx, 1);
    setGalleryPhotos(next);
  };

  // AI Price Evaluator
  const runAiPriceSuggester = () => {
    setAiLoading(true);
    setAiSuggestions(null);
    setTimeout(() => {
      setAiLoading(false);
      const catObj = mockMarketplaceCategories.find(c => c.id === category);
      const targetPrice = intent === 'Giving Away' ? 0 : Number(price) || 50;
      setAiSuggestions(
        `🤖 AI Price & Valuation Guide:\n\n` +
        `• Category: "${catObj?.name || 'Other'}" · Condition: "${condition}"\n` +
        `• Suggestion: "A fair market price for a '${condition}' ${catObj?.name || 'Item'} in ${cityName} is between ${currency === 'GBP' ? '£' : ''}${currency} ${(targetPrice * 0.8).toFixed(0)} and ${(targetPrice * 1.2).toFixed(0)}."\n` +
        `• Feedback: "${targetPrice === 0 ? 'Free listings convert 3x faster' : 'Your pricing is positioned within optimal community ranges.'}"`
      );
    }, 1200);
  };

  const handlePublish = async () => {
    // Record the rate limit hit when actually submitting/publishing
    const recordCheck = TrustEngine.evaluateAction('SellItem', 'GB', false);
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

    const payload = {
      title,
      description,
      price: intent === 'Giving Away' ? 0 : Number(price) || 0,
      currency,
      negotiable: intent === 'Giving Away' ? false : negotiable,
      quantity: Number(quantity) || 1,
      condition,
      intent,
      category,
      subcategory,
      brand,
      coverImage,
      gallery: [coverImage, ...galleryPhotos],
      location: {
        cityName,
        areaName: areaName || cityName,
        addressLine,
        landmark,
        distanceKm: 0.5,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude
      },
      seller: {
        sellerId: 'user-123',
        name: 'Amara Kone',
        avatarUrl: null,
        isVerified: true,
        rating: 4.8,
        reputationLevel: 'VerifiedResident',
        yearsOnPlatform: 2,
        responseTime: 'Immediate',
        languagesSpoken: ['English', 'French'],
        contactPhone,
        preferredContactMethod,
        countryVerifications: [
          { countryCode: 'CI', countryName: "Côte d'Ivoire", flag: '🇨🇮', arrivalYear: 2000, yearsOfResidence: 26, isVerified: true, expertiseAreas: ['Food'] },
          { countryCode: 'GB', countryName: 'United Kingdom', flag: '🇬🇧', arrivalYear: 2024, yearsOfResidence: 2, isVerified: true, expertiseAreas: ['Culture'] },
        ]
      },
      status: 'Active',
      deliveryAvailable: true,
      pickupOnly: false
    };

    try {
      await apiClient.post('/marketplace', payload);
      globalMarketplaceDraft = null;
      setIsSubmitting(false);
      
      // Log audit security logs
      trustStore.addAuditLog('Marketplace Listing Created', `Successfully listed marketplace item: "${title}"`);

      showAlert({
        type: 'success',
        title: 'Listing Published!',
        message: 'Your item is now visible on the Diaspora Marketplace.',
        buttons: [
          {
            text: 'Browse Marketplace',
            onPress: () => {
              router.replace({ pathname: '/(tabs)/discover', params: { tab: 'Marketplace' } });
            }
          }
        ]
      });
    } catch (err) {
      setIsSubmitting(false);
      const msg = 'Failed to publish marketplace listing. Please review the inputs.';
      if (Platform.OS === 'web') {
        alert(msg);
      } else {
        showAlert({ type: 'error', title: 'Publish Error', message: msg });
      }
    }
  };

  const progressPct = ((currentStep + 1) / steps.length) * 100;
  const selectedCategoryObj = mockMarketplaceCategories.find(c => c.id === category);
  const getCurrencySymbol = () => {
    switch (currency) {
      case 'GBP': return '£';
      case 'EUR': return '€';
      case 'USD': return '$';
      case 'NGN': return '₦';
      case 'GHS': return '₵';
      case 'MUR': return 'Rs ';
      default: return `${currency} `;
    }
  };

  const handleNext = () => {
    // Special routing for Donation — go to dedicated causes screen
    if (currentStep === 0 && intent === 'Donation') {
      router.push('/marketplace/donation-causes' as any);
      return;
    }
    // Special routing for Exchange/Swap — go to dedicated swap flow screen
    if (currentStep === 0 && intent === 'Exchange / Swap') {
      router.push('/marketplace/swap-create' as any);
      return;
    }
    // Step validation checks
    if (currentStep === 0 && !intent) {
      showAlert({ type: 'error', title: 'Required Field', message: 'Please select a listing intent.' });
      return;
    }
    if (currentStep === 1 && !category) {
      showAlert({ type: 'error', title: 'Required Field', message: 'Please select a product category.' });
      return;
    }
    if (currentStep === 2) {
      if (!title.trim()) {
        showAlert({ type: 'error', title: 'Required Field', message: 'Please provide a product title.' });
        return;
      }
      if (!description.trim()) {
        showAlert({ type: 'error', title: 'Required Field', message: 'Please write a short description.' });
        return;
      }
      if (intent !== 'Giving Away') {
        if (intent === 'Buying Request' || intent === 'Wanted') {
          if (!minPrice || !maxPrice) {
            showAlert({ type: 'error', title: 'Required Field', message: 'Please specify both minimum and maximum price range.' });
            return;
          }
          if (Number(minPrice) > Number(maxPrice)) {
            showAlert({ type: 'error', title: 'Invalid Range', message: 'Minimum price cannot be greater than maximum price.' });
            return;
          }
        } else {
          if (!price) {
            showAlert({ type: 'error', title: 'Required Field', message: 'Please enter a price.' });
            return;
          }
        }
      }
    }
    if (currentStep === 3 && (!cityName || !areaName.trim())) {
      showAlert({ type: 'error', title: 'Required Field', message: 'Please specify a city and neighborhood.' });
      return;
    }

    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  // If publishing is locked under current governance parameters, render explainable progress checklist
  if (!evaluation.allowed) {
    const marketplaceUnlock = TrustEngine.getFeatureUnlockRequirements('GB').find((f) => f.featureId === 'marketplace');
    return (
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface-card">
        <ScreenHeader title="Posting Locked" />
        <ScrollView className="flex-1 p-6" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingBottom: bottomInset }}>
          <View className="items-center mb-8">
            <View className="w-20 h-20 bg-amber-50 border border-amber-200 rounded-full items-center justify-center mb-6">
              <Text className="text-4xl">🔒</Text>
            </View>
            <Text className="text-2xl font-black text-content-primary text-center mb-3 tracking-tight">
              Marketplace Posting Locked
            </Text>
            <Text className="text-sm text-content-muted text-center leading-relaxed max-w-[280px]">
              Listing items in the community directories requires active phone verified status to secure transactions.
            </Text>
          </View>

          {/* Progress checklists */}
          <View className="bg-surface-background border border-subtle rounded-3xl p-5 w-full mb-8">
            <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-4">Requirements Checklist</Text>
            <View className="gap-3">
              {marketplaceUnlock?.requirements.map((r, idx) => (
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
            label="Go back to Marketplace" 
            variant="primary" 
            onPress={() => router.replace({ pathname: '/(tabs)/discover', params: { tab: 'Marketplace' } })} 
            className="w-full mb-3" 
          />
          <Button label="Visit Trust Center" variant="outline" onPress={() => router.push('/profile/trust-center')} className="w-full" />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-card">
      {/* Stepper Progress Tracker */}
      <View className="bg-surface-card border-b border-faint px-6 py-3">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-xs font-bold text-content-faint uppercase tracking-widest">
            Post Marketplace Listing
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
        {/* Draft Restore Alert */}
        {draftBannerVisible && currentStep === 0 && (
          <View className="bg-[#FFF8E1] border-b border-[#FFE082] px-6 py-4 flex-row items-center justify-between">
            <View className="flex-1 mr-4">
              <Text className="text-sm font-bold text-content-strong">✏️ Unfinished Draft</Text>
              <Text className="text-xs text-content-tertiary mt-0.5">
                Restore your previously saved marketplace draft details?
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
          
          {/* STEP 1: Intent Selection */}
          {currentStep === 0 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Choose the listing intent for this marketplace transaction. Admin-configurable types support flexible exchanges.
              </Text>
              {INTENTS.map((item) => {
                const isSel = intent === item.value;
                const isSpecial = item.value === 'Donation' || item.value === 'Exchange / Swap';
                return (
                  <TouchableOpacity
                    key={item.value}
                    onPress={() => setIntent(item.value as any)}
                    className={`p-4 mb-3 border rounded-2xl flex-row items-center justify-between active:scale-[0.99] ${
                      isSel ? 'bg-primary-50/50 border-primary-500' : 'bg-surface-card border-subtle'
                    }`}
                  >
                    <View className="flex-row items-center flex-1 mr-3">
                      <Text className="text-3xl mr-4">{item.icon}</Text>
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <Text className={`text-base font-extrabold ${isSel ? 'text-primary-500' : 'text-content-primary'}`}>
                            {item.label}
                          </Text>
                          {isSpecial && (
                            <View className="bg-primary-50 border border-primary-200 px-1.5 py-0.5 rounded-md">
                              <Text className="text-[9px] font-black text-primary-500">SPECIAL</Text>
                            </View>
                          )}
                        </View>
                        <Text className="text-xs text-content-muted mt-0.5 leading-relaxed">{item.desc}</Text>
                        {isSpecial && (
                          <Text className="text-[10px] text-primary-400 font-semibold mt-1">
                            {item.value === 'Donation' ? 'Opens dedicated charitable causes browser →' : 'Opens swap-specific listing form →'}
                          </Text>
                        )}
                      </View>
                    </View>
                    <View className={`w-5 h-5 rounded-full border items-center justify-center ${
                      isSel ? 'border-primary-500 bg-primary-500' : 'border-line'
                    }`}>
                      {isSel && <Text className="text-[10px] text-white font-bold">✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* STEP 2: Category & Condition */}
          {currentStep === 1 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Select the listing category and report the item condition. Subcategories support nested listings.
              </Text>

              {/* Product Category Dropdown */}
              <View className="flex-col w-full mb-4">
                <Text className="mb-2 text-sm font-medium text-content-muted">Product Category</Text>
                <TouchableOpacity
                  onPress={() => setCategoryModalVisible(true)}
                  activeOpacity={0.7}
                  className="h-14 rounded-xl px-4 bg-surface-background border border-subtle flex-row items-center justify-between"
                >
                  <Text className={`text-base ${selectedCategoryObj ? 'text-content-primary font-medium' : 'text-[#9BA3B8]'}`}>
                    {selectedCategoryObj ? `${selectedCategoryObj.icon} ${selectedCategoryObj.name}` : 'Select a category'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {/* Subcategory Dropdown */}
              <View className="flex-col w-full mb-6">
                <Text className="mb-2 text-sm font-medium text-content-muted">Subcategory (Optional)</Text>
                <TouchableOpacity
                  onPress={() => {
                    if (!category) {
                      showAlert({ type: 'error', title: 'Category Required', message: 'Please select a product category first.' });
                      return;
                    }
                    setSubcategoryModalVisible(true);
                  }}
                  activeOpacity={0.7}
                  className={`h-14 rounded-xl px-4 border flex-row items-center justify-between ${
                    category ? 'bg-surface-background border-subtle' : 'bg-surface-muted/50 border-faint'
                  }`}
                  disabled={!category}
                >
                  <Text className={`text-base ${subcategory ? 'text-content-primary font-medium' : 'text-[#9BA3B8]'}`}>
                    {subcategory || (category ? 'Select a subcategory' : 'Select a category first')}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {/* Category Select Modal Overlay */}
              <Modal
                visible={categoryModalVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setCategoryModalVisible(false)}
              >
                <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
                  <TouchableOpacity
                    style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
                    activeOpacity={1}
                    onPress={() => setCategoryModalVisible(false)}
                  />
                  <View 
                    style={{ maxHeight: 450, width: '100%', maxWidth: 500, alignSelf: 'center' }}
                    className="bg-surface-card rounded-t-3xl shadow-2xl"
                  >
                    <View className="flex-row items-center justify-between p-5 border-b border-faint">
                      <Text className="text-lg font-black text-content-primary">Select Category</Text>
                      <TouchableOpacity onPress={() => setCategoryModalVisible(false)} className="p-1">
                        <Ionicons name="close" size={24} color={tokens.color.text.primary} />
                      </TouchableOpacity>
                    </View>
                    <ScrollView className="px-5 py-2">
                      {mockMarketplaceCategories.map((cat) => {
                        const isSel = category === cat.id;
                        return (
                          <TouchableOpacity
                            key={cat.id}
                            onPress={() => {
                              setCategory(cat.id);
                              setSubcategory(''); // Reset subcategory when category changes
                              setCategoryModalVisible(false);
                            }}
                            className="py-4 flex-row items-center justify-between border-b border-faint last:border-b-0"
                          >
                            <View className="flex-row items-center">
                              <Text className="text-xl mr-3">{cat.icon}</Text>
                              <Text className={`text-base ${isSel ? 'font-black text-primary-500' : 'text-content-strong font-bold'}`}>
                                {cat.name}
                              </Text>
                            </View>
                            {isSel && <Ionicons name="checkmark" size={20} color="#F59300" />}
                          </TouchableOpacity>
                        );
                      })}
                      <View className="h-10" />
                    </ScrollView>
                  </View>
                </View>
              </Modal>

              {/* Subcategory Select Modal Overlay */}
              <Modal
                visible={subcategoryModalVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setSubcategoryModalVisible(false)}
              >
                <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
                  <TouchableOpacity
                    style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
                    activeOpacity={1}
                    onPress={() => setSubcategoryModalVisible(false)}
                  />
                  <View 
                    style={{ maxHeight: 450, width: '100%', maxWidth: 500, alignSelf: 'center' }}
                    className="bg-surface-card rounded-t-3xl shadow-2xl"
                  >
                    <View className="flex-row items-center justify-between p-5 border-b border-faint">
                      <Text className="text-lg font-black text-content-primary">Select Subcategory</Text>
                      <TouchableOpacity onPress={() => setSubcategoryModalVisible(false)} className="p-1">
                        <Ionicons name="close" size={24} color={tokens.color.text.primary} />
                      </TouchableOpacity>
                    </View>
                    <ScrollView className="px-5 py-2">
                      {selectedCategoryObj?.subcategories?.map((sub) => {
                        const isSel = subcategory === sub;
                        return (
                          <TouchableOpacity
                            key={sub}
                            onPress={() => {
                              setSubcategory(sub);
                              setSubcategoryModalVisible(false);
                            }}
                            className="py-4 flex-row items-center justify-between border-b border-faint last:border-b-0"
                          >
                            <Text className={`text-base ${isSel ? 'font-black text-primary-500' : 'text-content-strong font-bold'}`}>
                              {sub}
                            </Text>
                            {isSel && <Ionicons name="checkmark" size={20} color="#F59300" />}
                          </TouchableOpacity>
                        );
                      })}
                      <View className="h-10" />
                    </ScrollView>
                  </View>
                </View>
              </Modal>

              <Input
                label="Brand (Optional)"
                placeholder="e.g. Apple, Nike, Samsung, IKEA"
                value={brand}
                onChangeText={setBrand}
              />

              <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3">Item Condition</Text>
              {CONDITIONS.map((cond) => {
                const isSel = condition === cond.label;
                return (
                  <TouchableOpacity
                    key={cond.label}
                    onPress={() => setCondition(cond.label as any)}
                    className={`p-3.5 mb-3 border rounded-2xl flex-row items-center justify-between ${
                      isSel ? 'bg-primary-50/50 border-primary-500' : 'bg-surface-card border-subtle'
                    }`}
                  >
                    <View className="flex-1 mr-3">
                      <Text className="text-sm font-extrabold text-content-strong">{cond.label}</Text>
                      <Text className="text-[11px] text-content-muted mt-0.5 leading-relaxed">{cond.desc}</Text>
                    </View>
                    <View className={`w-4 h-4 rounded-full border items-center justify-center ${
                      isSel ? 'border-primary-500 bg-primary-500' : 'border-line'
                    }`}>
                      {isSel && <Text className="text-[8px] text-white font-bold">✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* STEP 3: Product Information */}
          {currentStep === 2 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Provide core details about your listing, including price options.
              </Text>

              <Input
                label="Product Title"
                placeholder="e.g. iPhone 13 Pro Max - 128GB Unlocked"
                value={title}
                onChangeText={setTitle}
              />

              <Input
                label="Description"
                placeholder="Write a clear, detailed description highlighting any key features, defects, size or dimensions..."
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                className="h-24"
              />

              {intent !== 'Giving Away' && (
                <View>
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

                  {intent === 'Buying Request' || intent === 'Wanted' ? (
                    <View className="flex-row gap-4 mb-2">
                      <View className="flex-1">
                        <Input
                          label="Min Price"
                          placeholder="e.g. 100"
                          value={minPrice}
                          onChangeText={setMinPrice}
                          keyboardType="numeric"
                        />
                      </View>
                      <View className="flex-1">
                        <Input
                          label="Max Price"
                          placeholder="e.g. 300"
                          value={maxPrice}
                          onChangeText={setMaxPrice}
                          keyboardType="numeric"
                        />
                      </View>
                    </View>
                  ) : (
                    <>
                      <Input
                        label="Price"
                        placeholder="e.g. 250"
                        value={price}
                        onChangeText={setPrice}
                        keyboardType="numeric"
                      />

                      {/* Negotiable Checkbox */}
                      <TouchableOpacity
                        onPress={() => setNegotiable(!negotiable)}
                        className="flex-row items-center mb-5 bg-surface-background p-3 rounded-xl border border-subtle"
                      >
                        <Text className="text-xs font-bold text-content-secondary flex-1">Price is Negotiable (Or Best Offer)</Text>
                        <Text className="text-base">{negotiable ? '✅' : '⬜'}</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {/* Run AI valuation checks */}
                  <TouchableOpacity
                    onPress={runAiPriceSuggester}
                    className="bg-surface-inverse py-3.5 rounded-xl justify-center items-center mb-6 active:bg-black"
                  >
                    {aiLoading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text className="text-content-inverse font-extrabold text-xs">🤖 Run AI Price Valuation</Text>
                    )}
                  </TouchableOpacity>

                  {aiSuggestions && (
                    <View className="bg-surface-background border border-subtle p-4 rounded-2xl mb-6">
                      <Text className="text-xs text-content-secondary leading-relaxed font-semibold">{aiSuggestions}</Text>
                    </View>
                  )}
                </View>
              )}

              <Input
                label="Quantity Available"
                placeholder="e.g. 1"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="numeric"
              />
            </View>
          )}

          {/* STEP 4: Location & landmark */}
          {currentStep === 3 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Confirm your local address, area neighborhood, and nearby landmarks. Location is the foundation of discovery.
              </Text>

              <Text className="text-xs font-bold text-content-secondary mb-2">City</Text>
              <View className="flex-row gap-2 mb-4">
                {['London', 'Manchester', 'Port Louis', 'Lagos'].map((city) => (
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
                placeholder="e.g. Peckham, MediaCity, Sainte Croix, Ikeja"
                value={areaName}
                onChangeText={setAreaName}
              />

              <Input
                label="Address Line"
                placeholder="e.g. 42 Chapel Street"
                value={addressLine}
                onChangeText={setAddressLine}
              />

              <Input
                label="Nearby Landmark / Area Point"
                placeholder="e.g. Opposite the library, 2 mins from Metro"
                value={landmark}
                onChangeText={setLandmark}
              />

              <Text className="text-xs font-bold text-content-secondary mb-3">Map Picker Proximity Pin</Text>
              <TouchableOpacity
                onPress={() => {
                  setIsSelectingPin(true);
                  setTimeout(() => {
                    setIsSelectingPin(false);
                    const coords = cityName === 'London'
                      ? { latitude: 51.4702, longitude: -0.0691 }
                      : cityName === 'Manchester' ? { latitude: 53.4789, longitude: -2.2923 }
                      : cityName === 'Lagos' ? { latitude: 6.5863, longitude: 3.3601 }
                      : { latitude: -20.1482, longitude: 57.5186 };
                    
                    setCoordinates(coords);
                    showAlert({ type: 'success', title: 'Map Location Saved', message: 'Simulated GPS coordinates locked successfully.' });
                  }, 800);
                }}
                className="h-36 bg-surface-background rounded-2xl border border-subtle overflow-hidden items-center justify-center"
              >
                {isSelectingPin ? (
                  <ActivityIndicator size="small" color="#F59300" />
                ) : (
                  <View className="items-center">
                    <Text className="text-3xl mb-1.5">🗺️</Text>
                    <Text className="text-xs font-bold text-content-tertiary">Simulated Location Map Picker</Text>
                    <Text className="text-[10px] text-content-faint mt-1 font-semibold">Tap to lock simulated GPS pin</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 5: Photos & Ordering */}
          {currentStep === 4 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Add photos for your listing. The first image will be set as the main cover photo.
              </Text>

              <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3">Cover Image</Text>
              <View className="relative h-44 bg-surface-background rounded-2xl border border-subtle overflow-hidden mb-6 items-center justify-center">
                {coverImage ? (
                  <View className="w-full h-full">
                    <Image source={{ uri: coverImage }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    <TouchableOpacity
                      onPress={handleCoverPhotoSelect}
                      className="absolute bottom-3 right-3 bg-black/60 px-3 py-1.5 rounded-full"
                    >
                      <Text className="text-white text-xs font-bold">Replace Cover</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={handleCoverPhotoSelect} className="items-center">
                    <Text className="text-3xl mb-1">📸</Text>
                    <Text className="text-xs font-bold text-content-muted">Add Cover Image</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3">Gallery Photos</Text>
              <View className="flex-row flex-wrap gap-3 mb-6">
                {galleryPhotos.map((photo, index) => (
                  <View key={index} className="w-[30%] h-24 bg-surface-muted rounded-xl overflow-hidden relative border border-subtle">
                    <Image source={{ uri: photo }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    
                    <TouchableOpacity
                      onPress={() => deleteGalleryPhoto(index)}
                      className="absolute top-1 right-1 bg-black/60 w-5 h-5 rounded-full items-center justify-center"
                    >
                      <Text className="text-white text-[10px] font-bold">✕</Text>
                    </TouchableOpacity>

                    {index > 0 && (
                      <TouchableOpacity
                        onPress={() => reorderGallery(index)}
                        className="absolute bottom-1 left-1 bg-surface-card/80 px-1 rounded"
                      >
                        <Text className="text-[8px] font-extrabold text-content-strong">◀ MOVE</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                
                <TouchableOpacity
                  onPress={handleAddGalleryPhoto}
                  className="w-[30%] h-24 bg-surface-background rounded-xl border border-dashed border-line items-center justify-center"
                >
                  <Text className="text-xl mb-1">➕</Text>
                  <Text className="text-[10px] font-bold text-content-muted">Add Photo</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* STEP 6: Contact preferences */}
          {currentStep === 5 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Provide secure contact information and select how you prefer to communicate with potential buyers.
              </Text>

              <PhoneInputWithCode
                label="Contact Phone Number"
                value={contactPhone}
                onChangePhone={setContactPhone}
                placeholder="7700 900000"
              />

              <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mt-6 mb-3">Preferred Contact Method</Text>
              {['in_app', 'phone', 'email'].map((method) => {
                const isSel = preferredContactMethod === method;
                return (
                  <TouchableOpacity
                    key={method}
                    onPress={() => setPreferredContactMethod(method as any)}
                    className={`p-3.5 mb-3 border rounded-2xl flex-row items-center justify-between ${
                      isSel ? 'bg-primary-50/50 border-primary-500' : 'bg-surface-card border-subtle'
                    }`}
                  >
                    <Text className="text-xs font-bold text-content-strong capitalize">
                      {method === 'in_app' ? '💬 In-App Chat' : method === 'phone' ? '📞 Direct Call' : '✉️ Email Enquiry'}
                    </Text>
                    <View className={`w-4 h-4 rounded-full border items-center justify-center ${
                      isSel ? 'border-primary-500 bg-primary-500' : 'border-line'
                    }`}>
                      {isSel && <Text className="text-[8px] text-white font-bold">✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* STEP 7: Preview & Publish */}
          {currentStep === 6 && (
            <View className="pb-8">
              <Text className="text-sm text-content-muted mb-6 leading-relaxed">
                Review your marketplace listing details before publishing to the community.
              </Text>

              {/* Listing Card Preview */}
              <View className="bg-surface-card rounded-3xl border border-subtle overflow-hidden mb-6 p-4">
                <Image source={{ uri: coverImage }} style={{ width: '100%', height: 160, borderRadius: 16 }} contentFit="cover" />
                <View className="mt-4">
                  <View className="flex-row justify-between items-center mb-1">
                    <Text className="text-xs font-bold text-primary-500 uppercase tracking-widest">
                      {mockMarketplaceCategories.find(c => c.id === category)?.name || 'Other'} · {intent}
                    </Text>
                    <View className="bg-[#EFF6FF] px-2 py-0.5 rounded border border-[#BFDBFE]">
                      <Text className="text-[8px] font-bold text-[#2563EB] uppercase">{condition}</Text>
                    </View>
                  </View>
                  <Text className="text-lg font-extrabold text-content-primary leading-snug">{title || 'Untitled Item'}</Text>
                  <Text className="text-xs text-content-muted mt-1 font-semibold">📍 {areaName || cityName} · {cityName}</Text>
                  <Text className="text-base font-black text-primary-500 mt-2">
                    {intent === 'Giving Away'
                      ? 'FREE'
                      : intent === 'Buying Request' || intent === 'Wanted'
                      ? `${getCurrencySymbol()}${minPrice || '0'} - ${getCurrencySymbol()}${maxPrice || '0'}`
                      : `${getCurrencySymbol()}${price || '0'}`}
                    {negotiable && intent !== 'Giving Away' && intent !== 'Buying Request' && intent !== 'Wanted' && (
                      <Text className="text-[10px] font-bold text-success-default"> (Negotiable)</Text>
                    )}
                  </Text>
                </View>
              </View>

              <Button
                label={isSubmitting ? 'Publishing...' : (intent === 'Buying Request' || intent === 'Wanted' ? 'Publish Request' : 'Publish Listing')}
                onPress={handlePublish}
                disabled={isSubmitting}
                variant="primary"
                className="py-4"
              />
            </View>
          )}

        </ScrollView>

        {/* Next / Previous Sticky Row */}
        <View className="bg-surface-card border-t border-faint p-4 flex-row justify-between items-center px-6">
          {currentStep > 0 ? (
            <TouchableOpacity
              onPress={() => setCurrentStep(currentStep - 1)}
              className="px-5 py-3 bg-surface-background border border-subtle rounded-xl"
            >
              <Text className="text-xs font-bold text-content-tertiary">Back</Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}

          {currentStep < steps.length - 1 ? (
            <TouchableOpacity
              onPress={handleNext}
              className="bg-primary-500 px-6 py-3 rounded-xl"
            >
              <Text className="text-xs font-bold text-white">Next Step</Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
