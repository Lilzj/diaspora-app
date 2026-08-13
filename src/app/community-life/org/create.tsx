import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal, TouchableWithoutFeedback, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FeatureGate } from '@/components/FeatureGate';
import { apiClient } from '@/lib/apiClient';
import type { OrgCategory, OrgFormState } from '@/types/community-life';
import { ImagePickerInput } from '@/components/ImagePickerInput';
import { PhoneInputWithCode } from '@/components/PhoneInputWithCode';
import { Button } from '@/components/Button';
import { useNotification } from '@/providers/notification-provider';

const ORG_CATEGORIES: OrgCategory[] = [
  'Churches', 'Mosques', 'Associations', 'Embassies', 'Student Associations',
  'Professional Associations', 'Community Centres', 'NGOs', 'Doctors', 'Lawyers',
  'Accountants', 'Immigration Consultants', 'Cultural Organizations', 'Sports Clubs',
  'Business Associations', 'Volunteer Organizations', 'Restaurants', 'Other'
];

export default function CreateOrgScreen() {
  const { showAlert } = useNotification();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDraftSaving, setIsDraftSaving] = useState(false);

  // Category Selector Dropdown State
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCategories = ORG_CATEGORIES.filter(cat => 
    cat.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Form State
  const [formData, setFormData] = useState<OrgFormState>({
    category: 'Associations',
    name: '',
    description: '',
    mission: '',
    logo: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=120',
    coverImage: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=600',
    services: [],
    cityName: 'London',
    areaName: 'Peckham',
    addressLine: '',
    phone: '',
    whatsapp: '',
    email: '',
    website: '',
    openingHours: [
      { day: 'Monday - Friday', hours: '09:00 - 17:00' },
      { day: 'Saturday', hours: '10:00 - 15:00' },
      { day: 'Sunday', hours: 'Closed' }
    ],
    verificationDocument: '',
    hasMembershipPlans: false
  });

  const updateField = (key: keyof OrgFormState, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleNext = () => {
    if (step === 2) {
      if (!formData.name.trim()) {
        showAlert({ type: 'error', title: 'Validation Error', message: 'Organization Name is required.' });
        return;
      }
      if (!formData.description.trim()) {
        showAlert({ type: 'error', title: 'Validation Error', message: 'Organization Description is required.' });
        return;
      }
    }
    if (step === 3) {
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

  // Draft Auto-saving Action
  const handleSaveDraft = async () => {
    setIsDraftSaving(true);
    try {
      await apiClient.post('/community-life/organizations', { ...formData, status: 'Draft' });
      showAlert({ type: 'success', title: 'Draft Saved', message: 'Your organization profile draft has been saved.' });
    } catch (err) {
      showAlert({ type: 'error', title: 'Error', message: 'Failed to save draft.' });
    } finally {
      setIsDraftSaving(false);
    }
  };

  const handlePublish = async () => {
    setIsSubmitting(true);
    try {
      await apiClient.post('/community-life/organizations', { ...formData, status: 'Published' });
      router.replace('/listing-success');
    } catch (err) {
      showAlert({ type: 'error', title: 'Error', message: 'Failed to register community hub.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FeatureGate featureName="Organizations">
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface-card">
      
      {/* Top Navbar */}
      <View className="px-6 py-4 border-b border-faint flex-row items-center justify-between bg-surface-card shadow-sm">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={handleBack} className="mr-3 p-1">
            <Ionicons name="arrow-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <View>
            <Text className="text-lg font-black text-content-primary tracking-tight">Register Hub</Text>
            <Text className="text-[10px] text-neutral-450 font-bold uppercase">Step {step} of 6</Text>
          </View>
        </View>

        {/* Auto-save draft action */}
        <TouchableOpacity
          onPress={handleSaveDraft}
          disabled={isDraftSaving}
          className="bg-surface-muted px-3 py-1.5 rounded-xl border border-neutral-250 flex-row items-center"
        >
          {isDraftSaving ? (
            <ActivityIndicator size="small" color="#F59300" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={13} color="#4B5563" className="mr-1" />
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
          <Text className="text-xs text-content-faint font-semibold mt-3">Registering Community Hub...</Text>
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
              <Text className="text-lg font-black text-content-primary tracking-tight mb-1">Select Hub Category</Text>
              <Text className="text-xs text-content-faint font-semibold mb-5">Categorize your organization so members can locate you.</Text>
              
              {/* Dropdown Selector Trigger */}
              <TouchableOpacity
                onPress={() => setIsDropdownOpen(true)}
                className="flex-row justify-between items-center bg-surface-background border border-subtle rounded-2xl p-4 active:bg-surface-muted"
              >
                <View className="flex-row items-center">
                  <View className="w-8 h-8 rounded-full bg-primary-50 items-center justify-center mr-3">
                    <Ionicons name="business-outline" size={16} color="#F59300" />
                  </View>
                  <Text className="text-sm font-extrabold text-content-strong">
                    {formData.category || 'Select a hub category...'}
                  </Text>
                </View>
                <Ionicons name="chevron-down" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 2: BASIC INFO */}
          {step === 2 && (
            <View className="gap-5">
              <View>
                <Text className="text-lg font-black text-content-primary tracking-tight mb-1">Hub Details</Text>
                <Text className="text-xs text-content-faint font-semibold">Introduce your mission and services to members.</Text>
              </View>

              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Organization Name</Text>
                <TextInput
                  placeholder="e.g. London African Sports Association"
                  value={formData.name}
                  onChangeText={(val) => updateField('name', val)}
                  className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                />
              </View>

              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Mission Statement</Text>
                <TextInput
                  placeholder="e.g. Connecting communities through sports and cultural events..."
                  value={formData.mission}
                  onChangeText={(val) => updateField('mission', val)}
                  className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                />
              </View>

              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Description</Text>
                <TextInput
                  placeholder="Tell the community about your history, weekly programs, and other details..."
                  value={formData.description}
                  onChangeText={(val) => updateField('description', val)}
                  className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <ImagePickerInput
                    label="Logo"
                    value={formData.logo}
                    onChangeImage={(uri) => updateField('logo', uri)}
                    aspect={[1, 1]}
                    circle
                  />
                </View>
                <View className="flex-1">
                  <ImagePickerInput
                    label="Cover Image"
                    value={formData.coverImage}
                    onChangeImage={(uri) => updateField('coverImage', uri)}
                  />
                </View>
              </View>
            </View>
          )}

          {/* STEP 3: LOCATION */}
          {step === 3 && (
            <View className="gap-5">
              <View>
                <Text className="text-lg font-black text-content-primary tracking-tight mb-1">Hub Location</Text>
                <Text className="text-xs text-content-faint font-semibold">Where can members visit your organization?</Text>
              </View>

              <View className="flex-row gap-3">
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
                  placeholder="Street address, building number..."
                  value={formData.addressLine}
                  onChangeText={(val) => updateField('addressLine', val)}
                  className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                />
              </View>
            </View>
          )}

          {/* STEP 4: CONTACT & SOCIALS */}
          {step === 4 && (
            <View className="gap-5">
              <View>
                <Text className="text-lg font-black text-content-primary tracking-tight mb-1">Contact & Social Channels</Text>
                <Text className="text-xs text-content-faint font-semibold">Help diaspora members consult or reach your leadership.</Text>
              </View>

              <View>
                <PhoneInputWithCode
                  label="Phone"
                  value={formData.phone || ''}
                  onChangePhone={(val) => updateField('phone', val)}
                  placeholder="7700 900000"
                />
              </View>

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Email Address</Text>
                  <TextInput
                    placeholder="contact@mygroup.org"
                    value={formData.email}
                    onChangeText={(val) => updateField('email', val)}
                    className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Website</Text>
                  <TextInput
                    placeholder="https://..."
                    value={formData.website}
                    onChangeText={(val) => updateField('website', val)}
                    className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                  />
                </View>
              </View>

              {/* Social Channels placeholders */}
              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Social Media Links (Facebook, Twitter, Instagram)</Text>
                <TextInput
                  placeholder="Facebook link"
                  className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong mb-2"
                />
                <TextInput
                  placeholder="Instagram link"
                  className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                />
              </View>
            </View>
          )}

          {/* STEP 5: VERIFICATION */}
          {step === 5 && (
            <View className="gap-5">
              <View>
                <Text className="text-lg font-black text-content-primary tracking-tight mb-1">Identity Verification</Text>
                <Text className="text-xs text-content-faint font-semibold font-medium">To unlock the verified badge and directory priority, upload official documents.</Text>
              </View>

              <View>
                <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Charity or Corporate Registration ID</Text>
                <TextInput
                  placeholder="e.g. Charity Commission ID, corporate register number"
                  value={formData.verificationDocument}
                  onChangeText={(val) => updateField('verificationDocument', val)}
                  className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                />
              </View>

              <View className="bg-surface-background border border-subtle border-dashed rounded-2xl p-6 items-center justify-center mt-2">
                <Ionicons name="shield-checkmark-outline" size={32} color="#10B981" />
                <Text className="text-xs font-black text-content-strong mt-2">Verification Under Review (Simulated)</Text>
                <Text className="text-[10px] text-content-muted mt-0.5 text-center max-w-[240px]">
                  Your hub profile will be published immediately. Once verified by admins, it will display the trust checkmark.
                </Text>
              </View>
            </View>
          )}

          {/* STEP 6: PREVIEW & PUBLISH */}
          {step === 6 && (
            <View className="gap-5">
              <View>
                <Text className="text-lg font-black text-content-primary tracking-tight mb-1">Preview & Publish Hub</Text>
                <Text className="text-xs text-content-faint font-semibold font-medium">Review your organization profile before sharing.</Text>
              </View>

              <View className="bg-surface-card border border-subtle rounded-3xl p-4 shadow-sm flex-row items-center">
                <View className="w-12 h-12 rounded-2xl bg-neutral-200 justify-center items-center mr-3">
                  <Ionicons name="home" size={20} color="#6B7280" />
                </View>
                <View className="flex-1">
                  <Text className="text-[9px] font-black text-primary-500 uppercase">{formData.category}</Text>
                  <Text className="text-sm font-black text-content-primary mt-0.5">{formData.name || 'Untitled Organization'}</Text>
                  <Text className="text-[10px] text-neutral-450 font-bold mt-0.5">📍 {formData.areaName}</Text>
                </View>
              </View>

              {/* Membership Plans checkbox indicator (Future) */}
              <View className="bg-surface-background border border-subtle rounded-2xl p-4 mt-2">
                <View className="flex-row justify-between items-center">
                  <View className="flex-1 mr-3">
                    <Text className="text-xs font-black text-content-secondary">Hub Membership Programs (Future)</Text>
                    <Text className="text-[10px] text-neutral-450 font-bold mt-0.5">
                      Enable members to subscribe or buy membership plans for your hub.
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => updateField('hasMembershipPlans', !formData.hasMembershipPlans)}
                    className={`w-10 h-6 rounded-full p-0.5 justify-center ${
                      formData.hasMembershipPlans ? 'bg-primary-500 items-end' : 'bg-neutral-300 items-start'
                    }`}
                  >
                    <View className="w-5 h-5 bg-surface-card rounded-full shadow-sm" />
                  </TouchableOpacity>
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
      {/* Category Bottom Sheet Modal */}
      <Modal
        visible={isDropdownOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setIsDropdownOpen(false);
          setSearchQuery('');
        }}
      >
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
              <View className="w-12 h-1 bg-neutral-200 rounded-full mx-auto mb-5" />

              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-lg font-black text-content-primary">Select Hub Category</Text>
                <TouchableOpacity
                  onPress={() => {
                    setIsDropdownOpen(false);
                    setSearchQuery('');
                  }}
                  className="p-1"
                >
                  <Ionicons name="close" size={20} color="#4B5563" />
                </TouchableOpacity>
              </View>

              {/* Search Bar */}
              <View className="flex-row items-center border border-subtle rounded-2xl bg-surface-background px-4 py-2.5 mb-4">
                <Ionicons name="search" size={16} color="#9CA3AF" className="mr-2" />
                <TextInput
                  placeholder="Search categories..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  className="flex-1 text-xs font-semibold text-neutral-850 p-0"
                  placeholderTextColor="#9CA3AF"
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
                    <Text className="text-xs text-neutral-450 font-bold">No categories match your search</Text>
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
