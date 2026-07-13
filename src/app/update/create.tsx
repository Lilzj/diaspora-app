import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/Button';
import { mockCategories } from '@/mocks/data';

let globalUpdateDraft: any = null;

const TEMPLATES = [
  {
    label: '🚨 Checkpoint',
    category: 'Auto & Transport',
    message: 'Active document and vehicle check reported near Peckham High Street by local authorities. Expect minor traffic delays.',
    urgency: 'Normal',
    expiresHours: 4,
  },
  {
    label: '⚠️ Power Outage',
    category: 'Home Services',
    message: 'Local area electricity blackout reported affecting housing blocks near Atlantic Road. Maintenance is on site.',
    urgency: 'Urgent',
    expiresHours: 6,
  },
  {
    label: '💼 Visa Queue',
    category: 'Finance & Legal',
    message: 'Long wait times (>3 hours) reported today at the local immigration centre for visa documentation processing.',
    urgency: 'Normal',
    expiresHours: 8,
  },
  {
    label: '🎉 Cultural Fair',
    category: 'Events',
    message: 'Annual diaspora independence celebration fair starting at the community park. Traditional foods and music!',
    urgency: 'Low',
    expiresHours: 24,
  },
];

export default function CreateUpdateScreen() {
  const [draftBannerVisible, setDraftBannerVisible] = useState(false);

  // Form states
  const [selectedCategory, setSelectedCategory] = useState('');
  const [location, setLocation] = useState('Peckham, London');
  const [message, setMessage] = useState('');
  const [hasImage, setHasImage] = useState(false);
  const [urgency, setUrgency] = useState('Normal');
  const [expiresHours, setExpiresHours] = useState(6);

  // Check draft on mount
  useEffect(() => {
    if (globalUpdateDraft) {
      setDraftBannerVisible(true);
    }
  }, []);

  // Auto-save draft
  const saveDraft = () => {
    globalUpdateDraft = {
      selectedCategory,
      location,
      message,
      hasImage,
      urgency,
      expiresHours,
    };
  };

  useEffect(() => {
    if (message || selectedCategory) {
      saveDraft();
    }
  }, [selectedCategory, location, message, hasImage, urgency, expiresHours]);

  const restoreDraft = () => {
    if (globalUpdateDraft) {
      const d = globalUpdateDraft;
      setSelectedCategory(d.selectedCategory);
      setLocation(d.location);
      setMessage(d.message);
      setHasImage(d.hasImage);
      setUrgency(d.urgency);
      setExpiresHours(d.expiresHours);
      setDraftBannerVisible(false);
    }
  };

  const discardDraft = () => {
    globalUpdateDraft = null;
    setDraftBannerVisible(false);
  };

  const applyTemplate = (tpl: typeof TEMPLATES[0]) => {
    setSelectedCategory(tpl.category);
    setMessage(tpl.message);
    setUrgency(tpl.urgency);
    setExpiresHours(tpl.expiresHours);
  };

  const handlePublish = () => {
    globalUpdateDraft = null;
    router.replace('/(tabs)/knowledge/updates');
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <ScreenHeader
        title="Post Local Alert"
        rightAction={
          <TouchableOpacity onPress={() => router.replace('/(tabs)/knowledge/updates')} className="p-2">
            <Text className="text-xs font-bold text-neutral-400 uppercase">Cancel</Text>
          </TouchableOpacity>
        }
      />

      {/* Draft Recovery banner warning */}
      {draftBannerVisible && (
        <View className="bg-[#FFF8E1] border-b border-[#FFE082] px-6 py-4 flex-row items-center justify-between">
          <View className="flex-1 mr-4">
            <Text className="text-sm font-bold text-neutral-800">✏️ Alert Draft Detected</Text>
            <Text className="text-xs text-neutral-600 mt-0.5">
              Restore your draft checkpoint message?
            </Text>
          </View>
          <View className="flex-row">
            <TouchableOpacity onPress={restoreDraft} className="bg-primary-500 px-3 py-2 rounded-xl mr-2">
              <Text className="text-xs font-bold text-white">Restore</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={discardDraft} className="bg-neutral-100 border border-neutral-200 px-3 py-2 rounded-xl">
              <Text className="text-xs font-bold text-neutral-600">Discard</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView className="flex-1 px-6 pt-4" keyboardShouldPersistTaps="handled">
        
        {/* Quick Templates Panel */}
        <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">
          ⚡ 10-Second Quick Templates
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6 flex-row gap-2.5">
          {TEMPLATES.map((tpl, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => applyTemplate(tpl)}
              className="bg-neutral-50 border border-neutral-200 rounded-2xl px-4 py-3 mr-2 active:bg-neutral-100"
            >
              <Text className="text-xs font-bold text-neutral-700">{tpl.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* GPS location display */}
        <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Location Detection</Text>
        <View className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 mb-5 flex-row items-center justify-between">
          <View>
            <Text className="text-sm font-bold text-neutral-800">📍 Current Location</Text>
            <Text className="text-xs text-neutral-500 mt-0.5">{location}</Text>
          </View>
          <Text className="text-[10px] text-success-default font-extrabold bg-[#E6F4EA] px-2.5 py-1 rounded-lg">
            📡 GPS ACTIVE
          </Text>
        </View>

        {/* Category select dropdown simulation */}
        <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">
          Category <Text className="text-[10px] text-primary-500 font-extrabold">(Future AI Auto-Categorized)</Text>
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5 flex-row gap-2">
          {mockCategories.slice(0, 5).map((cat) => (
            <TouchableOpacity
              key={cat.id}
              onPress={() => setSelectedCategory(cat.name)}
              className={`px-4 py-2 rounded-full border ${
                selectedCategory === cat.name
                  ? 'bg-primary-500 border-primary-500'
                  : 'bg-white border-neutral-200'
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  selectedCategory === cat.name ? 'text-white' : 'text-neutral-600'
                }`}
              >
                {cat.icon} {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Message Input text area with char counter */}
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Alert Message</Text>
          <Text className="text-xs font-bold text-neutral-400">{message.length}/500</Text>
        </View>
        <TextInput
          placeholder="Share what is happening. Include times, streets, and specific details so neighbors can plan..."
          value={message}
          onChangeText={setMessage}
          maxLength={500}
          multiline
          className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 min-h-[120px] text-sm leading-relaxed text-neutral-800 mb-5"
          placeholderTextColor="#9CA3AF"
          textAlignVertical="top"
        />

        {/* Urgency levels picker */}
        <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Urgency Rating</Text>
        <View className="flex-row mb-5 justify-between">
          {[
            { label: 'Low', color: '#6B7280' },
            { label: 'Normal', color: '#2563EB' },
            { label: 'Urgent', color: '#D97706' },
            { label: 'Emergency', color: '#DC2626' },
          ].map((level) => {
            const isSelected = urgency === level.label;
            return (
              <TouchableOpacity
                key={level.label}
                onPress={() => setUrgency(level.label)}
                className={`flex-1 py-3.5 rounded-xl mr-2 items-center border ${
                  isSelected ? 'border-neutral-800 bg-neutral-900' : 'bg-white border-neutral-200'
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    isSelected ? 'text-white' : 'text-neutral-600'
                  }`}
                >
                  {level.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Expiration slider */}
        <View className="flex-row justify-between mb-2">
          <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Expiration Limit</Text>
          <Text className="text-xs font-extrabold text-primary-500">Expires in {expiresHours} hours</Text>
        </View>
        <View className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 mb-5">
          <Text className="text-[11px] text-neutral-500 mb-3">
            This alert will be archived and hidden automatically after this duration to prevent outdated notifications.
          </Text>
          {/* Simple mock slider using touch points since standard Slider requires native link package */}
          <View className="flex-row justify-between">
            {[2, 4, 6, 12, 24, 48].map((h) => (
              <TouchableOpacity
                key={h}
                onPress={() => setExpiresHours(h)}
                className={`w-10 h-10 rounded-full items-center justify-center border ${
                  expiresHours === h
                    ? 'bg-primary-500 border-primary-500'
                    : 'bg-white border-neutral-200'
                }`}
              >
                <Text className={`text-xs font-black ${expiresHours === h ? 'text-white' : 'text-neutral-600'}`}>
                  {h}h
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Image Attachment toggle selector */}
        <Text className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Optional Attachment</Text>
        <TouchableOpacity
          onPress={() => setHasImage(!hasImage)}
          className={`h-16 rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50 items-center justify-center mb-8 ${
            hasImage ? 'bg-primary-50 border-primary-500' : ''
          }`}
        >
          <Text className="text-xs font-extrabold text-neutral-600">
            {hasImage ? '📸 Image Attached' : '➕ Tap to simulate uploading location photo'}
          </Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Action Footer buttons */}
      <View className="px-6 py-4 border-t border-neutral-100 bg-white">
        <Button
          label="Publish Local Alert"
          disabled={!message || !selectedCategory}
          onPress={handlePublish}
        />
      </View>
    </SafeAreaView>
  );
}
