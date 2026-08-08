import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { CategoryChip } from '@/components/CategoryChip';
import { mockMarketplaceCategories } from '@/mocks/marketplace-data';
import { apiClient } from '@/lib/apiClient';
import { useNotification } from '@/providers/notification-provider';
import { Ionicons } from '@expo/vector-icons';

const CONDITIONS = ['New', 'Like New', 'Very Good', 'Good', 'Fair'];
const CURRENCIES = ['GBP', 'MUR', 'USD', 'EUR', 'NGN', 'GHS'];

const SWAP_STEPS = [
  'What You\'re Offering',
  'What You Want in Return',
  'Location & Contact',
  'Preview & Publish',
];

export default function SwapCreateScreen() {
  const insets = useSafeAreaInsets();
  const { showAlert } = useNotification();
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: What you're offering
  const [offeringTitle, setOfferingTitle] = useState('');
  const [offeringDesc, setOfferingDesc] = useState('');
  const [offeringCategory, setOfferingCategory] = useState<string | null>(null);
  const [offeringSubcategory, setOfferingSubcategory] = useState('');
  const [offeringCondition, setOfferingCondition] = useState('Good');

  // Modal visibility states
  const [categorySelectorFor, setCategorySelectorFor] = useState<'offering' | 'wanted' | null>(null);
  const [subcategoryModalVisible, setSubcategoryModalVisible] = useState(false);

  // Step 2: What you want in return
  const [wantedCategory, setWantedCategory] = useState<string | null>(null);
  const [wantedKeyword, setWantedKeyword] = useState('');
  const [wantedDesc, setWantedDesc] = useState('');
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpCurrency, setTopUpCurrency] = useState('GBP');
  const [topUpDirection, setTopUpDirection] = useState<'I will pay' | 'They should pay' | 'None'>('None');

  // Step 3: Location & contact
  const [cityName, setCityName] = useState('London');
  const [areaName, setAreaName] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const handleNext = () => {
    if (step === 0) {
      if (!offeringTitle.trim()) { showAlert({ type: 'error', title: 'Required', message: 'Please provide a title for what you are offering.' }); return; }
      if (!offeringCategory) { showAlert({ type: 'error', title: 'Required', message: 'Please select a category for your item.' }); return; }
    }
    if (step === 1) {
      if (!wantedKeyword.trim() && !wantedCategory) { showAlert({ type: 'error', title: 'Required', message: 'Please describe or select a category for what you want in return.' }); return; }
    }
    if (step === 2) {
      if (!areaName.trim()) { showAlert({ type: 'error', title: 'Required', message: 'Please enter your area / neighbourhood.' }); return; }
      if (!contactPhone.trim()) { showAlert({ type: 'error', title: 'Required', message: 'Please enter a contact phone number.' }); return; }
    }
    setStep((s) => s + 1);
  };

  const handlePublish = async () => {
    setIsSubmitting(true);
    try {
      const offeringCatObj = mockMarketplaceCategories.find(c => c.id === offeringCategory);
      const wantedCatObj = mockMarketplaceCategories.find(c => c.id === wantedCategory);

      await apiClient.post('/marketplace', {
        intent: 'Exchange / Swap',
        title: offeringTitle,
        description: offeringDesc,
        condition: offeringCondition,
        category: offeringCategory,
        subcategory: offeringSubcategory || undefined,
        price: topUpDirection === 'None' ? 0 : Number(topUpAmount) || 0,
        currency: topUpCurrency,
        swapDetails: {
          wantedCategory: wantedCatObj?.name || wantedKeyword,
          wantedKeyword,
          wantedDescription: wantedDesc,
          topUpAmount: topUpDirection !== 'None' ? Number(topUpAmount) || 0 : 0,
          topUpCurrency,
          topUpDirection,
        },
        location: {
          cityName,
          areaName,
          distanceKm: 0.5,
        },
        seller: {
          sellerId: 'user-123',
          name: 'Amara Kone',
          isVerified: true,
          rating: 4.8,
          reputationLevel: 'VerifiedResident',
          yearsOnPlatform: 2,
          responseTime: 'Immediate',
          languagesSpoken: ['English', 'French'],
          contactPhone,
          preferredContactMethod: 'in_app',
        },
        status: 'Active',
      });
      setIsSubmitting(false);
      showAlert({ type: 'success', title: 'Swap Listed! 🔄', message: 'Your swap listing is now visible on the Diaspora Marketplace.' });
      router.replace('/(tabs)/discover');
    } catch {
      setIsSubmitting(false);
      showAlert({ type: 'error', title: 'Error', message: 'Something went wrong. Please try again.' });
    }
  };

  const offeringCatObj = mockMarketplaceCategories.find(c => c.id === offeringCategory);
  const wantedCatObj = mockMarketplaceCategories.find(c => c.id === wantedCategory);

  const isFormInvalid = (() => {
    if (step === 0) return !offeringTitle.trim() || !offeringCategory;
    if (step === 1) return !wantedKeyword.trim() && !wantedCategory;
    if (step === 2) return !areaName.trim() || !contactPhone.trim();
    return false;
  })();

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-neutral-50">
      <ScreenHeader
        title="Exchange / Swap"
        showBack
        rightAction={
          <TouchableOpacity onPress={() => router.back()} className="p-2">
            <Text className="text-xs font-bold text-neutral-400 uppercase">Cancel</Text>
          </TouchableOpacity>
        }
      />

      {/* Step Progress Bar */}
      <View className="px-6 pt-3 pb-1">
        <View className="flex-row gap-1.5 mb-2">
          {SWAP_STEPS.map((_, i) => (
            <View
              key={i}
              className={`flex-1 h-1.5 rounded-full ${i <= step ? 'bg-primary-500' : 'bg-neutral-200'}`}
            />
          ))}
        </View>
        <Text className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
          Step {step + 1} of {SWAP_STEPS.length} — {SWAP_STEPS[step]}
        </Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          className="flex-1 px-6 pt-4"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        >
          {/* STEP 1: What you're offering */}
          {step === 0 && (
            <View>
              <Text className="text-sm text-neutral-500 mb-5 leading-relaxed">
                Describe the item you're offering for exchange. Be accurate about its condition and category.
              </Text>

              <View className="mb-4">
                <Text className="text-xs font-extrabold text-neutral-700 mb-2 uppercase tracking-wider">Item Title *</Text>
                <TextInput
                  value={offeringTitle}
                  onChangeText={setOfferingTitle}
                  placeholder="e.g. Samsung Galaxy S21 128GB"
                  placeholderTextColor="#9CA3AF"
                  className="border border-neutral-200 rounded-2xl px-4 py-3.5 text-sm text-neutral-900 bg-white"
                />
              </View>

              <View className="mb-4">
                <Text className="text-xs font-extrabold text-neutral-700 mb-2 uppercase tracking-wider">Description</Text>
                <TextInput
                  value={offeringDesc}
                  onChangeText={setOfferingDesc}
                  placeholder="Describe your item — any faults, accessories included, reason for swapping..."
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  className="border border-neutral-200 rounded-2xl px-4 py-3.5 text-sm text-neutral-900 bg-white"
                  style={{ minHeight: 80 }}
                />
              </View>

              {/* Product Category Dropdown */}
              <View className="flex-col w-full mb-4">
                <Text className="mb-2 text-xs font-extrabold text-neutral-700 uppercase tracking-wider">Product Category *</Text>
                <TouchableOpacity
                  onPress={() => setCategorySelectorFor('offering')}
                  activeOpacity={0.7}
                  className="h-14 rounded-2xl px-4 bg-white border border-neutral-200 flex-row items-center justify-between"
                >
                  <Text className={`text-sm ${offeringCatObj ? 'text-neutral-900 font-medium' : 'text-[#9BA3B8]'}`}>
                    {offeringCatObj ? `${offeringCatObj.icon} ${offeringCatObj.name}` : 'Select a category'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {/* Subcategory Dropdown */}
              <View className="flex-col w-full mb-4">
                <Text className="mb-2 text-xs font-extrabold text-neutral-700 uppercase tracking-wider">Subcategory (Optional)</Text>
                <TouchableOpacity
                  onPress={() => {
                    if (!offeringCategory) {
                      showAlert({ type: 'error', title: 'Category Required', message: 'Please select a product category first.' });
                      return;
                    }
                    setSubcategoryModalVisible(true);
                  }}
                  activeOpacity={0.7}
                  className={`h-14 rounded-2xl px-4 border flex-row items-center justify-between ${
                    offeringCategory ? 'bg-white border-neutral-200' : 'bg-neutral-100/50 border-neutral-100'
                  }`}
                  disabled={!offeringCategory}
                >
                  <Text className={`text-sm ${offeringSubcategory ? 'text-neutral-900 font-medium' : 'text-[#9BA3B8]'}`}>
                    {offeringSubcategory || (offeringCategory ? 'Select a subcategory' : 'Select a category first')}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <View className="mb-4">
                <Text className="text-xs font-extrabold text-neutral-700 mb-3 uppercase tracking-wider">Condition</Text>
                <View className="flex-row flex-wrap gap-2">
                  {CONDITIONS.map((c) => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setOfferingCondition(c)}
                      className={`px-3 py-1.5 rounded-xl border ${offeringCondition === c ? 'bg-primary-500 border-primary-500' : 'bg-white border-neutral-200'}`}
                    >
                      <Text className={`text-xs font-bold ${offeringCondition === c ? 'text-white' : 'text-neutral-600'}`}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* STEP 2: What you want in return */}
          {step === 1 && (
            <View>
              <Text className="text-sm text-neutral-500 mb-5 leading-relaxed">
                Describe or select a category for the item you'd like in exchange. You can also offer or request a top-up amount to balance the trade.
              </Text>

              <View className="mb-4">
                <Text className="text-xs font-extrabold text-neutral-700 mb-2 uppercase tracking-wider">Keyword / Item Name *</Text>
                <TextInput
                  value={wantedKeyword}
                  onChangeText={setWantedKeyword}
                  placeholder="e.g. iPhone 13, laptop, bicycle..."
                  placeholderTextColor="#9CA3AF"
                  className="border border-neutral-200 rounded-2xl px-4 py-3.5 text-sm text-neutral-900 bg-white"
                />
              </View>

              {/* Preferred Category Dropdown */}
              <View className="flex-col w-full mb-4">
                <Text className="mb-2 text-xs font-extrabold text-neutral-700 uppercase tracking-wider">Preferred Category</Text>
                <TouchableOpacity
                  onPress={() => setCategorySelectorFor('wanted')}
                  activeOpacity={0.7}
                  className="h-14 rounded-2xl px-4 bg-white border border-neutral-200 flex-row items-center justify-between"
                >
                  <Text className={`text-sm ${wantedCatObj ? 'text-neutral-900 font-medium' : 'text-[#9BA3B8]'}`}>
                    {wantedCatObj ? `${wantedCatObj.icon} ${wantedCatObj.name}` : 'Select a category'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <View className="mb-4">
                <Text className="text-xs font-extrabold text-neutral-700 mb-2 uppercase tracking-wider">Additional Details</Text>
                <TextInput
                  value={wantedDesc}
                  onChangeText={setWantedDesc}
                  placeholder="Any specific requirements, preferred condition, colour, etc..."
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                  className="border border-neutral-200 rounded-2xl px-4 py-3.5 text-sm text-neutral-900 bg-white"
                  style={{ minHeight: 70 }}
                />
              </View>

              {/* Top-up direction */}
              <View className="mb-4">
                <Text className="text-xs font-extrabold text-neutral-700 mb-2 uppercase tracking-wider">Top-Up Amount</Text>
                <Text className="text-xs text-neutral-400 mb-3">If the items are unequal in value, who should pay a top-up?</Text>
                <View className="flex-row gap-2 mb-3">
                  {(['None', 'I will pay', 'They should pay'] as const).map((d) => (
                    <TouchableOpacity
                      key={d}
                      onPress={() => setTopUpDirection(d)}
                      className={`flex-1 py-2 rounded-xl border items-center ${topUpDirection === d ? 'bg-primary-500 border-primary-500' : 'bg-white border-neutral-200'}`}
                    >
                      <Text className={`text-[10px] font-bold ${topUpDirection === d ? 'text-white' : 'text-neutral-600'}`}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {topUpDirection !== 'None' && (
                  <View className="flex-row gap-2">
                    <TextInput
                      value={topUpAmount}
                      onChangeText={setTopUpAmount}
                      placeholder="Amount"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="numeric"
                      className="flex-1 border border-neutral-200 rounded-2xl px-4 py-3.5 text-sm text-neutral-900 bg-white"
                    />
                    <View className="flex-row flex-wrap gap-1">
                      {CURRENCIES.slice(0, 3).map((c) => (
                        <TouchableOpacity
                          key={c}
                          onPress={() => setTopUpCurrency(c)}
                          className={`px-2.5 py-3.5 rounded-xl border ${topUpCurrency === c ? 'bg-primary-500 border-primary-500' : 'bg-white border-neutral-200'}`}
                        >
                          <Text className={`text-xs font-bold ${topUpCurrency === c ? 'text-white' : 'text-neutral-600'}`}>{c}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* STEP 3: Location & Contact */}
          {step === 2 && (
            <View>
              <Text className="text-sm text-neutral-500 mb-5 leading-relaxed">
                Enter your location for local swap matching and your contact details for interested swappers.
              </Text>

              <View className="mb-4">
                <Text className="text-xs font-extrabold text-neutral-700 mb-2 uppercase tracking-wider">City</Text>
                <TextInput
                  value={cityName}
                  onChangeText={setCityName}
                  placeholder="e.g. London"
                  placeholderTextColor="#9CA3AF"
                  className="border border-neutral-200 rounded-2xl px-4 py-3.5 text-sm text-neutral-900 bg-white"
                />
              </View>

              <View className="mb-4">
                <Text className="text-xs font-extrabold text-neutral-700 mb-2 uppercase tracking-wider">Area / Neighbourhood *</Text>
                <TextInput
                  value={areaName}
                  onChangeText={setAreaName}
                  placeholder="e.g. Peckham, Brixton, Lewisham..."
                  placeholderTextColor="#9CA3AF"
                  className="border border-neutral-200 rounded-2xl px-4 py-3.5 text-sm text-neutral-900 bg-white"
                />
              </View>

              <View className="mb-4">
                <Text className="text-xs font-extrabold text-neutral-700 mb-2 uppercase tracking-wider">Contact Phone *</Text>
                <TextInput
                  value={contactPhone}
                  onChangeText={setContactPhone}
                  placeholder="+44 7900 000000"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                  className="border border-neutral-200 rounded-2xl px-4 py-3.5 text-sm text-neutral-900 bg-white"
                />
              </View>

              <View className="mb-4" />
            </View>
          )}

          {/* STEP 4: Preview & Publish */}
          {step === 3 && (
            <View>
              <Text className="text-sm text-neutral-500 mb-5 leading-relaxed">
                Review your swap listing before publishing to the community marketplace.
              </Text>

              <View className="bg-white border border-neutral-200 rounded-3xl p-5 mb-4">
                <View className="flex-row items-center mb-3">
                  <Text className="text-2xl mr-3">🔄</Text>
                  <View className="flex-1">
                    <Text className="text-xs font-black text-primary-500 uppercase tracking-widest">Exchange / Swap</Text>
                    <Text className="text-base font-extrabold text-neutral-900 mt-0.5">{offeringTitle}</Text>
                  </View>
                </View>
                {offeringDesc ? <Text className="text-xs text-neutral-600 mb-3 leading-relaxed">{offeringDesc}</Text> : null}
                <View className="flex-row gap-2 mb-3 flex-wrap">
                  <View className="bg-neutral-100 px-2.5 py-1 rounded-lg"><Text className="text-[10px] font-bold text-neutral-600">{offeringCatObj?.name || 'Uncategorised'}</Text></View>
                  <View className="bg-neutral-100 px-2.5 py-1 rounded-lg"><Text className="text-[10px] font-bold text-neutral-600">{offeringCondition}</Text></View>
                </View>

                <View className="border-t border-neutral-100 pt-3 mt-2">
                  <Text className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Looking For</Text>
                  <Text className="text-sm font-bold text-neutral-800">{wantedKeyword || wantedCatObj?.name || 'Open to offers'}</Text>
                  {wantedDesc ? <Text className="text-xs text-neutral-500 mt-1">{wantedDesc}</Text> : null}
                  {topUpDirection !== 'None' && topUpAmount ? (
                    <View className="mt-2 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl">
                      <Text className="text-xs font-bold text-amber-700">
                        {topUpDirection === 'I will pay' ? `I'll pay ${topUpCurrency} ${topUpAmount} top-up` : `They should pay ${topUpCurrency} ${topUpAmount} top-up`}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View className="border-t border-neutral-100 pt-3 mt-3 flex-row gap-4">
                  <Text className="text-[10px] text-neutral-400">📍 {areaName}, {cityName}</Text>
                  <Text className="text-[10px] text-neutral-400">📞 {contactPhone}</Text>
                </View>
              </View>

              <Button
                label={isSubmitting ? 'Publishing...' : '🔄 Publish Swap Listing'}
                onPress={handlePublish}
                isLoading={isSubmitting}
                className="mt-2"
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer navigation */}
      {step < 3 && (
        <View
          style={{ paddingBottom: insets.bottom + 16 }}
          className="bg-white border-t border-neutral-100 px-6 pt-4 flex-row gap-3"
        >
          {step > 0 && (
            <Button
              label="Back"
              variant="outline"
              className="flex-1"
              onPress={() => setStep((s) => s - 1)}
            />
          )}
          <Button
            label="Continue"
            className="flex-1"
            disabled={isFormInvalid}
            onPress={handleNext}
          />
        </View>
      )}

      {/* Category Select Modal Overlay */}
      <Modal
        visible={categorySelectorFor !== null}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCategorySelectorFor(null)}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
            activeOpacity={1}
            onPress={() => setCategorySelectorFor(null)}
          />
          <View 
            style={{ maxHeight: 450, width: '100%', maxWidth: 500, alignSelf: 'center' }}
            className="bg-white rounded-t-3xl shadow-2xl"
          >
            <View className="flex-row items-center justify-between p-5 border-b border-neutral-100">
              <Text className="text-lg font-black text-neutral-900">Select Category</Text>
              <TouchableOpacity onPress={() => setCategorySelectorFor(null)} className="p-1">
                <Ionicons name="close" size={24} color="#374151" />
              </TouchableOpacity>
            </View>
            <ScrollView className="px-5 py-2">
              {mockMarketplaceCategories.map((cat) => {
                const isSel = categorySelectorFor === 'offering' ? offeringCategory === cat.id : wantedCategory === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => {
                      if (categorySelectorFor === 'offering') {
                        setOfferingCategory(cat.id);
                        setOfferingSubcategory(''); // Reset subcategory when category changes
                      } else if (categorySelectorFor === 'wanted') {
                        setWantedCategory(wantedCategory === cat.id ? null : cat.id); // Toggle select for optional wanted category
                      }
                      setCategorySelectorFor(null);
                    }}
                    className="py-4 flex-row items-center justify-between border-b border-neutral-50 last:border-b-0"
                  >
                    <View className="flex-row items-center">
                      <Text className="text-xl mr-3">{cat.icon}</Text>
                      <Text className={`text-base ${isSel ? 'text-primary-500 font-bold' : 'text-neutral-700 font-semibold'}`}>{cat.name}</Text>
                    </View>
                    {isSel && <Ionicons name="checkmark" size={20} color="#F59E0B" />}
                  </TouchableOpacity>
                );
              })}
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
            className="bg-white rounded-t-3xl shadow-2xl"
          >
            <View className="flex-row items-center justify-between p-5 border-b border-neutral-100">
              <Text className="text-lg font-black text-neutral-900">Select Subcategory</Text>
              <TouchableOpacity onPress={() => setSubcategoryModalVisible(false)} className="p-1">
                <Ionicons name="close" size={24} color="#374151" />
              </TouchableOpacity>
            </View>
            <ScrollView className="px-5 py-2">
              {offeringCatObj?.subcategories?.map((sub) => {
                const isSel = offeringSubcategory === sub;
                return (
                  <TouchableOpacity
                    key={sub}
                    onPress={() => {
                      setOfferingSubcategory(sub);
                      setSubcategoryModalVisible(false);
                    }}
                    className="py-4 flex-row items-center justify-between border-b border-neutral-50 last:border-b-0"
                  >
                    <Text className={`text-base ${isSel ? 'text-primary-500 font-bold' : 'text-neutral-700 font-semibold'}`}>{sub}</Text>
                    {isSel && <Ionicons name="checkmark" size={20} color="#F59E0B" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
