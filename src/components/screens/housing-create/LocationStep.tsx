// List a home, step 3: the town, the address and the pin.
// Lifted out of `app/housing/create.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { TownPicker } from '@/components/forms/TownPicker';
import { Input } from '@/components/Input';
import { AddressSearchField } from '@/components/maps/AddressSearchField';
import { resolveLocationPermissionProvider } from '@/lib/maps/providers/device-location';
import type { ListingAccount } from '@/components/screens/housing-create/useListingAccount';
import type { HousingLocation } from '@/components/screens/housing-create/useHousingLocation';

interface LocationStepProps {
  account: ListingAccount;
  location: HousingLocation;
}

export function LocationStep({ account, location }: LocationStepProps) {
  const { countryCode } = account;
  const {
    cityName, setCityName, addressLine, setAddressLine, landmark, setLandmark, isSelectingPin,
    coordinates, setCoordinates, pinProblem, setPinProblem, pinSource, setPinSource,
    pinOffersSettings, setPinOffersSettings, usePinFromDevice,
  } = location;

  return (
    <View className="pb-8">
      <Text className="text-sm text-content-muted mb-6 leading-relaxed">
        Provide the listing address, local area, and set map coordinates pin.
      </Text>

      {/* No country field: a home is listed in the member's country of
          residence. Said plainly when the account holds none, because
          the server will not file a listing without one. */}
      {!countryCode ? (
        <View className="bg-surface-muted rounded-2xl border border-subtle p-4 mb-4">
          <Text className="text-xs font-bold text-content-primary mb-1">
            Your country of residence is missing
          </Text>
          <Text className="text-[11px] text-content-tertiary leading-relaxed">
            A home is always listed in the country you live in, and your account does not
            say which that is yet. Add it to your profile, then come back: this draft is kept.
          </Text>
        </View>
      ) : null}

      {/* The town: searched in the residence country. Its centre is not
          the property, so only the name is kept (see `cityName`). */}
      <TownPicker
        label="Town or city"
        value={cityName}
        onChange={(town) => setCityName(town.cityName)}
        countryCode={countryCode || null}
        testID="housing-town"
      />

      <Input
        label="Address Line"
        placeholder="e.g. 12 Royal Road"
        value={addressLine}
        onChangeText={setAddressLine}
      />

      <Input
        label="Nearby Landmark"
        placeholder="e.g. Near the bus station, 3 mins to the market"
        value={landmark}
        onChangeText={setLandmark}
        maxLength={200}
      />

      <Text className="text-xs font-bold text-content-secondary mb-3">
        Map Pin (optional)
      </Text>

      {coordinates ? (
        <View className="bg-surface-muted rounded-2xl border border-subtle p-4">
          <Text className="text-xs font-bold text-content-primary mb-1">
            📍 Pin set from {pinSource ?? 'your current location'}
          </Text>
          <Text className="text-[11px] text-content-tertiary font-semibold">
            {coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}
          </Text>
          <TouchableOpacity
            onPress={() => {
              setCoordinates(null);
              setPinProblem(null);
              setPinSource(null);
              setPinOffersSettings(false);
            }}
            accessibilityRole="button"
            className="mt-3 self-start px-4 py-2 rounded-2xl bg-surface-background border border-subtle"
          >
            <Text className="text-xs font-bold text-content-secondary">Remove pin</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
        {/* The address the landlord picks is their own words, so it may set
            the pin and fill an empty address line. It hides itself on a
            deployment with no address search. */}
        <AddressSearchField
          label="Find the property's address"
          placeholder="Start typing the street address"
          countryCodes={/^[A-Z]{2}$/.test(countryCode) ? [countryCode] : undefined}
          onResolved={(address, pickedText) => {
            setCoordinates({ latitude: address.latitude, longitude: address.longitude });
            setPinProblem(null);
            setPinSource(`the address you chose: ${address.formattedAddress ?? pickedText}`);
            if (!addressLine.trim() && address.formattedAddress) setAddressLine(address.formattedAddress);
          }}
          testID="housing-address-search"
        />
        <TouchableOpacity
          disabled={isSelectingPin}
          onPress={usePinFromDevice}
          accessibilityRole="button"
          accessibilityLabel="Use my current location as the map pin"
          className="h-32 bg-surface-muted rounded-2xl border border-subtle overflow-hidden items-center justify-center"
        >
          {isSelectingPin ? (
            <ActivityIndicator size="small" color="#F59300" />
          ) : (
            <View className="items-center px-6">
              <Text className="text-2xl mb-1">📍</Text>
              <Text className="text-xs font-extrabold text-content-muted uppercase">
                Use my current location
              </Text>
              <Text className="text-[10px] text-content-faint mt-1 font-semibold text-center">
                Only if you are at the property. You can post without a pin.
              </Text>
            </View>
          )}
        </TouchableOpacity>
        </>
      )}

      {pinProblem ? (
        <Text className="text-[11px] text-content-tertiary mt-2 leading-relaxed">
          {pinProblem}
        </Text>
      ) : null}

      {/* The way back after a refusal. Android will not ask twice, so
          without this the sentence above was a dead end. */}
      {pinProblem && pinOffersSettings && !coordinates ? (
        <TouchableOpacity
          onPress={() => {
            void resolveLocationPermissionProvider().openSettings();
          }}
          accessibilityRole="button"
          accessibilityLabel="Open Settings to turn on location for Diaspora"
          className="mt-3 self-start px-4 py-2 rounded-2xl bg-primary-500"
        >
          <Text className="text-xs font-bold text-white">Open Settings</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
