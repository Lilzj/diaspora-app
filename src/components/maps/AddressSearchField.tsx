// ─────────────────────────────────────────────────────────────────────────────
// A field that finds a street address and hands back its coordinate.
//
// Renders nothing once the deployment has said it has no address search, so a
// build without a vendor shows the screen exactly as it was. The provider's
// credit sits under the suggestions whenever they are shown: Google requires it
// for results displayed away from a Google map, and this list is one.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Input } from '@/components/Input';
import { useAddressSearch } from '@/hooks/address-search';
import type { ResolvedAddress } from '@/lib/maps/address-search';
import type { GeoCoordinate } from '@/types/maps';

export interface AddressSearchFieldProps {
  label: string;
  placeholder?: string;
  near?: GeoCoordinate;
  countryCodes?: string[];
  onResolved: (address: ResolvedAddress, pickedText: string) => void;
  testID?: string;
}

export function AddressSearchField({
  label,
  placeholder,
  near,
  countryCodes,
  onResolved,
  testID = 'address-search',
}: AddressSearchFieldProps) {
  const [text, setText] = useState('');
  const search = useAddressSearch(text, { near, countryCodes });

  if (search.isUnavailable) return null;

  return (
    <View testID={testID}>
      <Input
        label={label}
        placeholder={placeholder ?? 'Start typing the street address'}
        value={text}
        onChangeText={setText}
        autoCorrect={false}
      />

      {search.isSearching || search.isResolving ? (
        <ActivityIndicator size="small" color="#F59300" style={{ marginBottom: 8 }} />
      ) : null}

      {search.suggestions.length > 0 ? (
        <View className="bg-surface-background rounded-2xl border border-subtle mb-3 overflow-hidden">
          {search.suggestions.map((suggestion) => (
            <TouchableOpacity
              key={suggestion.placeId}
              testID={`${testID}-suggestion`}
              accessibilityRole="button"
              accessibilityLabel={suggestion.text}
              disabled={search.isResolving}
              onPress={async () => {
                const resolved = await search.pick(suggestion);
                if (resolved) {
                  setText('');
                  onResolved(resolved, suggestion.mainText);
                }
              }}
              className="px-4 py-3 border-b border-subtle"
            >
              <Text className="text-sm font-bold text-content-strong">{suggestion.mainText}</Text>
              {suggestion.secondaryText ? (
                <Text className="text-[11px] font-semibold text-content-tertiary mt-0.5">
                  {suggestion.secondaryText}
                </Text>
              ) : null}
            </TouchableOpacity>
          ))}

          {search.attribution ? (
            <Text
              testID={`${testID}-attribution`}
              className="text-[12px] font-semibold text-content-tertiary px-4 py-2"
            >
              {search.attribution}
            </Text>
          ) : null}
        </View>
      ) : null}

      {search.notice ? (
        <Text className="text-[11px] text-content-tertiary mb-3 leading-relaxed">{search.notice}</Text>
      ) : null}
    </View>
  );
}
