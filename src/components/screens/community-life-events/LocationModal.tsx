// Community Life: choosing the town the screen looks at.
// Lifted out of `app/community-life/events.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { Modal, TouchableOpacity, TouchableWithoutFeedback, View, Text } from 'react-native';
import { TownPicker } from '@/components/forms/TownPicker';
import type { EventsPlace } from '@/components/screens/community-life-events/useEventsPlace';

interface LocationModalProps {
  place: EventsPlace;
}

export function LocationModal({ place }: LocationModalProps) {
  const {
    setChosenLocation, selectedLocation, isLocationModalOpen, setIsLocationModalOpen,
  } = place;

  return (
    <Modal
      visible={isLocationModalOpen}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setIsLocationModalOpen(false)}
    
      statusBarTranslucent
      navigationBarTranslucent>
      <TouchableOpacity
        activeOpacity={1}
        onPress={() => setIsLocationModalOpen(false)}
        className="flex-1 justify-end bg-black/40"
      >
        <TouchableWithoutFeedback>
          <View className="bg-surface-card rounded-t-3xl p-6 min-h-[280px] shadow-2xl w-full">
            <View className="flex-row items-center justify-between mb-5">
              <Text className="text-lg font-black text-content-primary">Choose a town</Text>
              <TouchableOpacity onPress={() => setIsLocationModalOpen(false)}>
                <Text className="text-primary-500 font-bold text-sm">Close</Text>
              </TouchableOpacity>
            </View>

            {/* The shared town search, in the country being browsed. */}
            <TownPicker
              label={selectedLocation.country ? `Town in ${selectedLocation.country}` : 'Town or city'}
              value={selectedLocation.city}
              countryCode={selectedLocation.countryCode || undefined}
              onChange={(town) => {
                setChosenLocation({ ...selectedLocation, city: town.cityName });
                setIsLocationModalOpen(false);
              }}
              testID="events-town"
            />
            {selectedLocation.city ? (
              <TouchableOpacity
                onPress={() => {
                  setChosenLocation({ ...selectedLocation, city: '' });
                  setIsLocationModalOpen(false);
                }}
                className="py-4"
              >
                <Text className="text-sm font-bold text-primary-500">
                  {selectedLocation.country
                    ? `Show all of ${selectedLocation.country}`
                    : 'Show every town'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </TouchableWithoutFeedback>
      </TouchableOpacity>
    </Modal>
  );
}
