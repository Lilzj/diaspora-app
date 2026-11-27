// List a home, step 7: the preview and the listing checklist.
// Lifted out of `app/housing/create.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import type { HousingCatalogue } from '@/components/screens/housing-create/useHousingCatalogue';
import type { ListingCheck } from '@/components/screens/housing-create/useListingCheck';
import type { HousingDetails } from '@/components/screens/housing-create/useHousingDetails';
import type { HousingLocation } from '@/components/screens/housing-create/useHousingLocation';
import type { HousingPricing } from '@/components/screens/housing-create/useHousingPricing';

interface ReviewStepProps {
  catalogue: HousingCatalogue;
  check: ListingCheck;
  details: HousingDetails;
  location: HousingLocation;
  pricing: HousingPricing;
}

export function ReviewStep({ catalogue, check, details, location, pricing }: ReviewStepProps) {
  const { listingType, propertyTypeName } = catalogue;
  const { aiLoading, aiSuggestions, runListingCheck } = check;
  const { title, bedrooms, bathrooms, furnished } = details;
  const { cityName } = location;
  const { rent, getCurrencySymbol } = pricing;

  return (
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
          <Text className="text-xs font-medium text-content-secondary leading-relaxed bg-surface-muted border border-subtle p-3 rounded-xl">
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
          <View className="bg-surface-muted px-2 py-0.5 rounded border border-subtle mb-2 self-start">
            <Text className="text-[9px] font-bold text-primary-600 uppercase">{listingType} · {propertyTypeName ?? 'Property type not chosen'}</Text>
          </View>
          <Text className="text-base font-black text-content-primary leading-snug">{title || 'Opportunity Title'}</Text>
          <Text className="text-xs text-content-muted font-bold mt-1">📍 {cityName || 'Town not chosen'}</Text>
          
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
  );
}
