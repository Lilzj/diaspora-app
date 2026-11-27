// List a home, step 1: the listing type and the property type.
// Lifted out of `app/housing/create.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SearchableSelect } from '@/components/forms/SearchableSelect';
import { PROPERTY_ICONS } from '@/components/screens/housing-create/form';
import type { HousingCatalogue } from '@/components/screens/housing-create/useHousingCatalogue';

interface ListingTypeStepProps {
  catalogue: HousingCatalogue;
}

export function ListingTypeStep({ catalogue }: ListingTypeStepProps) {
  const {
    listingType, setListingType, propertyType, setPropertyType, accommodationTypes,
    choicesUnavailable, visibleTypes,
  } = catalogue;

  return (
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

      {/* The server's types, filtered by Rent/Share, in the one
          category control every form uses (14 Oct 2026). */}
      <SearchableSelect
        label="Property Category"
        placeholder="Choose the property type"
        searchPlaceholder="Search property types"
        options={visibleTypes.map((type) => ({
          key: type.key,
          label: type.name,
          icon: PROPERTY_ICONS[type.key] ?? '🏠',
        }))}
        value={propertyType}
        onChange={setPropertyType}
        isLoading={accommodationTypes.length === 0 && !choicesUnavailable}
        unavailableMessage={
          choicesUnavailable
            ? 'Diaspora could not load the property types. Check your connection and open this form again.'
            : null
        }
        testID="housing-property-type"
      />
      {choicesUnavailable && (
        <Text className="text-xs text-error-default mt-3">
          Diaspora could not load the property types. Check your connection and open this form again.
        </Text>
      )}
    </View>
  );
}
