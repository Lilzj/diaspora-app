import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal, TouchableWithoutFeedback, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FeatureGate } from '@/components/FeatureGate';
import { apiClient } from '@/lib/apiClient';
import type { EventCategory, EventFormState } from '@/types/community-life';
import { ImagePickerInput } from '@/components/ImagePickerInput';
import { DatePickerInput } from '@/components/DatePickerInput';
import { PhoneInputWithCode } from '@/components/PhoneInputWithCode';
import { Button } from '@/components/Button';
import { useNotification } from '@/providers/notification-provider';

const EVENT_CATEGORIES: EventCategory[] = [
  'Wedding', 'Naming Ceremony', 'Birthday', 'Graduation', 'Football Match',
  'Basketball', 'Concert', 'Comedy Show', 'Networking', 'Career Fair', 'Job Fair',
  'Business Seminar', 'Conference', 'Training', 'Workshop', 'Church Program',
  'Mosque Event', 'Bible Study', 'Prayer Meeting', 'Youth Program', 'Cultural Festival',
  'Independence Celebration', 'Food Festival', 'Picnic', 'Volunteer Activity',
  'Charity Event', 'Embassy Event', 'Student Orientation', 'Other'
];

export default function CreateEventScreen() {
  const { showAlert } = useNotification();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDraftSaving, setIsDraftSaving] = useState(false);

  // Wizard state
  const [formData, setFormData] = useState<EventFormState>({
    category: 'Networking',
    title: '',
    description: '',
    coverImage: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=600',
    gallery: [],
    date: '2026-07-15',
    time: '18:00',
    endTime: '20:00',
    timezone: 'BST',
    cityName: 'London',
    areaName: 'Peckham',
    addressLine: '',
    landmark: '',
    organizerName: '',
    phone: '',
    whatsapp: '',
    website: '',
    email: '',
    price: '',
    currency: 'GBP',
    isRecurring: false,
    recurrencePattern: 'Weekly',
    neighborhood: ''
  });

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

  // Draft Auto-saving Action
  const handleSaveDraft = async () => {
    setIsDraftSaving(true);
    try {
      await apiClient.post('/community-life/events', { ...formData, status: 'Draft' });
      showAlert({ type: 'success', title: 'Draft Saved', message: 'Your event setup progress has been auto-saved as a draft.' });
    } catch (err) {
      showAlert({ type: 'error', title: 'Error', message: 'Failed to save draft.' });
    } finally {
      setIsDraftSaving(false);
    }
  };

  const handlePublish = async () => {
    setIsSubmitting(true);
    try {
      await apiClient.post('/community-life/events', { ...formData, status: 'Published' });
      router.replace('/listing-success');
    } catch (err) {
      showAlert({ type: 'error', title: 'Error', message: 'Failed to publish event.' });
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
            <Ionicons name="arrow-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <View>
            <Text className="text-lg font-black text-content-primary tracking-tight">Create Event</Text>
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
                    <Text className="text-[10px] text-neutral-450 font-bold mt-0.5">
                      Check this to define weekly, monthly or daily repeating schedules.
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => updateField('isRecurring', !formData.isRecurring)}
                    className={`w-10 h-6 rounded-full p-0.5 justify-center ${
                      formData.isRecurring ? 'bg-primary-500 items-end' : 'bg-neutral-300 items-start'
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

              <View className="flex-row gap-3">
                <View className="flex-2" style={{ flex: 2 }}>
                  <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Price (Leave blank or 0 for Free)</Text>
                  <TextInput
                    placeholder="e.g. 15"
                    value={formData.price}
                    onChangeText={(val) => updateField('price', val)}
                    className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                    keyboardType="numeric"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-bold text-content-faint uppercase tracking-wider mb-2">Currency</Text>
                  <TextInput
                    placeholder="GBP"
                    value={formData.currency}
                    onChangeText={(val) => updateField('currency', val)}
                    className="bg-surface-background border border-subtle rounded-xl p-4 text-xs font-semibold text-content-strong"
                  />
                </View>
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
                <View className="h-32 bg-neutral-200 rounded-2xl overflow-hidden justify-center items-center">
                  <Ionicons name="sparkles" size={24} color="#9CA3AF" />
                  <Text className="text-[10px] text-content-muted font-black mt-1 uppercase">Image Preview Available</Text>
                </View>
                <View className="mt-3.5">
                  <Text className="text-[9px] font-black text-primary-500 uppercase">{formData.category}</Text>
                  <Text className="text-base font-black text-content-primary mt-1 leading-snug">{formData.title || 'Untitled Event'}</Text>
                  <Text className="text-xs text-content-muted font-bold mt-1">🗓 {formData.date} · ⏱ {formData.time} · 📍 {formData.areaName}</Text>
                  <Text className="text-[10px] font-black text-success-default uppercase mt-2">
                    {!formData.price || formData.price === '0' ? 'FREE ENTRY' : `Price: £${formData.price}`}
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
                <Text className="text-lg font-black text-content-primary">Select Event Type</Text>
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
                  placeholder="Search event types..."
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
                    <Text className="text-xs text-neutral-450 font-bold">No event types match your search</Text>
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
