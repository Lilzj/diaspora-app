// List a home, step 2: the property's details.
// Lifted out of `app/housing/create.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Input } from '@/components/Input';
import type { HousingAmenity } from '@/lib/api/housing-listings-api';
import { LIFESTYLE_OPTIONS } from '@/components/screens/housing-create/form';
import type { HousingAmenities } from '@/components/screens/housing-create/useHousingAmenities';
import type { HousingCatalogue } from '@/components/screens/housing-create/useHousingCatalogue';
import type { HousingDetails } from '@/components/screens/housing-create/useHousingDetails';

interface PropertyDetailsStepProps {
  amenities: HousingAmenities;
  catalogue: HousingCatalogue;
  details: HousingDetails;
}

export function PropertyDetailsStep({ amenities, catalogue, details }: PropertyDetailsStepProps) {
  const { amenityKeys, amenitiesUnavailable, amenityGroups, toggleAmenity } = amenities;
  const { furnishingOptions } = catalogue;
  const {
    setTitle, title, setSummary, summary, description, setDescription, bedrooms, setBedrooms,
    bathrooms, setBathrooms, furnished, setFurnished, houseRulesText, setHouseRulesText,
    selectedLifestyleMatches, setSelectedLifestyleMatches,
  } = details;

  return (
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
                                  ? 'bg-surface-muted border-primary-300'
                                  : 'bg-surface-background border-subtle'
                              }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                                  selected ? 'text-primary-600' : 'text-content-secondary'
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
                        isSel ? 'bg-surface-muted border-primary-300' : 'bg-surface-background border-subtle'
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
  );
}
