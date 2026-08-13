import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, TextInput, Animated, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { CategoryChip } from '@/components/CategoryChip';
import { mockCategories } from '@/mocks/data';
import { Image } from 'expo-image';

// Global variable for self-contained draft storage
let globalDraftStorage: any = null;

const steps = ['Basics', 'Contact Info', 'Services & Menu', 'Photos', 'Business Hours', 'Preview'];

interface ServiceItem {
  id: string;
  name: string;
  minPrice: string;
  maxPrice: string;
}

const DEFAULT_SERVICES: ServiceItem[] = [
  { id: 's-1', name: 'Jollof Rice & Chicken', minPrice: '8', maxPrice: '12' },
  { id: 's-2', name: 'Banku & Tilapia', minPrice: '10', maxPrice: '15' },
  { id: 's-3', name: 'Waakye Special', minPrice: '9', maxPrice: '12' },
];

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

export default function PostScreen() {
  const [currentStep, setCurrentStep] = useState(0);
  const [draftBannerVisible, setDraftBannerVisible] = useState(false);

  // Form States
  const [businessName, setBusinessName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
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

  // Photos
  const [uploadedPhotos, setUploadedPhotos] = useState<(string | null)[]>(Array(4).fill(null));
  const [uploadProgress, setUploadProgress] = useState<Record<number, number>>({});

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
      setUploadedPhotos(d.uploadedPhotos);
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

  // Photo uploading simulation
  const handleUploadPhoto = (idx: number) => {
    if (uploadedPhotos[idx]) {
      // Clear photo if already exists
      const nextPhotos = [...uploadedPhotos];
      nextPhotos[idx] = null;
      setUploadedPhotos(nextPhotos);
      return;
    }

    setUploadProgress((prev) => ({ ...prev, [idx]: 10 }));
    let progress = 10;
    const interval = setInterval(() => {
      progress += 30;
      if (progress >= 100) {
        clearInterval(interval);
        setUploadProgress((prev) => {
          const next = { ...prev };
          delete next[idx];
          return next;
        });
        const nextPhotos = [...uploadedPhotos];
        // Set mock image depending on index
        const mockUrls = [
          'https://images.unsplash.com/photo-1544148103-0773bf10d330?w=600',
          'https://images.unsplash.com/photo-1560014169-42b78ce13eb0?w=600',
          'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=600',
          'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600',
        ];
        nextPhotos[idx] = mockUrls[idx];
        setUploadedPhotos(nextPhotos);
      } else {
        setUploadProgress((prev) => ({ ...prev, [idx]: progress }));
      }
    }, 400);
  };

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

  const handleQuickAddService = (name: string, min: string, max: string) => {
    if (services.some((s) => s.name === name)) return;
    setServices([...services, { id: `svc-${Date.now()}`, name, minPrice: min, maxPrice: max }]);
  };

  const handlePublish = () => {
    // Clear draft storage upon publishing success
    globalDraftStorage = null;
    router.push('/listing-success');
  };

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

        <ScrollView className="flex-1 px-6 pt-4" keyboardShouldPersistTaps="handled">
          
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
                {mockCategories.map((cat) => {
                  const isSelected = selectedCategories.includes(cat.id);
                  return (
                    <CategoryChip
                      key={cat.id}
                      label={cat.name}
                      icon={cat.icon}
                      isSelected={isSelected}
                      onPress={() => toggleCategory(cat.id)}
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

              <Input
                label="Primary Phone Number"
                placeholder="e.g. +44 7700 900000"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
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

              {/* Quick Suggestion Pills */}
              <Text className="text-xs font-bold text-content-secondary mb-2">Quick Presets</Text>
              <View className="flex-row flex-wrap gap-2 mb-5">
                {[
                  { name: 'Jollof Rice & Chicken', min: '8', max: '12' },
                  { name: 'Banku & Tilapia', min: '10', max: '15' },
                  { name: 'Waakye Special', min: '9', max: '12' },
                  { name: 'Suya Platter', min: '12', max: '18' },
                ].map((preset) => (
                  <TouchableOpacity
                    key={preset.name}
                    onPress={() => handleQuickAddService(preset.name, preset.min, preset.max)}
                    className="bg-primary-50 border border-primary-100 px-3 py-1.5 rounded-full"
                  >
                    <Text className="text-xs font-bold text-primary-600">+ {preset.name} (£{preset.min}-£{preset.max})</Text>
                  </TouchableOpacity>
                ))}
              </View>

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
                        £{svc.minPrice} — £{svc.maxPrice}
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
                  placeholder="e.g. Egusi Soup & Pounded Yam"
                  value={newServiceName}
                  onChangeText={setNewServiceName}
                />
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Input
                      label="Min Price (£)"
                      placeholder="8"
                      value={newMinPrice}
                      onChangeText={setNewMinPrice}
                      keyboardType="numeric"
                    />
                  </View>
                  <View className="flex-1">
                    <Input
                      label="Max Price (£)"
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

              <Text className="text-sm font-bold text-content-strong mb-3">Upload Gallery (Tap to select)</Text>
              
              {/* 4 grid upload boxes */}
              <View className="flex-row flex-wrap justify-between">
                {uploadedPhotos.map((photo, idx) => {
                  const uploading = uploadProgress[idx] != null;
                  return (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => handleUploadPhoto(idx)}
                      activeOpacity={0.8}
                      className="w-[47%] h-28 border-2 border-dashed border-line rounded-2xl items-center justify-center bg-surface-background mb-4 overflow-hidden"
                    >
                      {photo ? (
                        <View className="w-full h-full relative">
                          <Image source={{ uri: photo }} className="w-full h-full" />
                          <View className="absolute top-1.5 right-1.5 bg-black/50 w-6 h-6 rounded-full items-center justify-center">
                            <Text className="text-white text-xs font-bold">✕</Text>
                          </View>
                        </View>
                      ) : uploading ? (
                        <View className="items-center justify-center">
                          <ActivityIndicator size="small" color="#F59300" />
                          <Text className="text-[10px] text-content-faint font-extrabold mt-1">
                            Uploading {uploadProgress[idx]}%
                          </Text>
                        </View>
                      ) : (
                        <View className="items-center">
                          <Text className="text-2xl mb-1">➕</Text>
                          <Text className="text-[11px] text-content-muted font-bold">Add Photo</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
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
                This is a mock representation of how your verified listing will display in the directory results.
              </Text>

              {/* Published page preview card block */}
              <View className="bg-surface-card rounded-3xl border border-subtle overflow-hidden shadow-sm shadow-neutral-100">
                {/* Photo Display Carousel representation */}
                <Image
                  source={{ uri: uploadedPhotos[0] || 'https://images.unsplash.com/photo-1544148103-0773bf10d330?w=600' }}
                  style={{ width: '100%', height: 160 }}
                  contentFit="cover"
                />

                {/* Sub Gallery */}
                <View className="flex-row bg-surface-muted p-2">
                  {uploadedPhotos.filter(Boolean).map((photo, i) => (
                    <Image
                      key={i}
                      source={{ uri: photo! }}
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
                          {mockCategories.find(c => c.id === catId)?.name || 'Category'}
                        </Text>
                      ))}
                    </View>
                    <Text className="text-[10px] bg-success-surface text-success-default px-2 py-0.5 rounded font-extrabold">
                      ✓ PREVIEW VERIFIED
                    </Text>
                  </View>

                  <Text className="text-xl font-bold text-content-primary mb-1.5">{businessName || 'Mama Afrika Kitchen'}</Text>
                  <Text className="text-sm text-content-tertiary mb-4 leading-relaxed">{description || 'No description provided.'}</Text>

                  {/* Services & Menu Preview Block */}
                  {services.length > 0 && (
                    <View className="mb-4">
                      <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-2">Services & Menu</Text>
                      <View className="bg-surface-background rounded-2xl p-3 border border-faint">
                        {services.map((svc) => (
                          <View key={svc.id} className="flex-row justify-between py-1.5 border-b border-faint last:border-b-0">
                            <Text className="text-xs text-content-strong font-bold">{svc.name}</Text>
                            <Text className="text-xs text-content-tertiary font-semibold">£{svc.minPrice} — £{svc.maxPrice}</Text>
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
              label={currentStep === steps.length - 1 ? 'Publish Listing' : 'Next'}
              className="flex-1"
              disabled={currentStep === 0 && (!businessName || selectedCategories.length === 0)}
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
