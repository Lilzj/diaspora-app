import React, { useState } from 'react';
import { TouchableOpacity, Text, View, Modal, TouchableWithoutFeedback, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface RadiusSliderProps {
  value: number; // in kilometers. -1 = City, -2 = Country
  onChange: (radius: number) => void;
}

const RADIUS_OPTIONS = [
  { label: '500m', value: 0.5 },
  { label: '1 km', value: 1 },
  { label: '3 km', value: 3 },
  { label: '5 km', value: 5 },
  { label: '10 km', value: 10 },
  { label: '25 km', value: 25 },
  { label: 'City-wide', value: -1 },
  { label: 'Country-wide', value: -2 },
];

export function RadiusSlider({ value, onChange }: RadiusSliderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const activeOption = RADIUS_OPTIONS.find((opt) => opt.value === value) || RADIUS_OPTIONS[3];

  return (
    <View className="px-6 mb-2">
      {/* Dropdown Selector Trigger */}
      <TouchableOpacity
        onPress={() => setIsOpen(true)}
        className="flex-row justify-between items-center bg-neutral-50 border border-neutral-200 rounded-2xl p-4 active:bg-neutral-100"
      >
        <View className="flex-row items-center">
          <View className="w-8 h-8 rounded-full bg-primary-50 items-center justify-center mr-3">
            <Ionicons name="navigate-outline" size={16} color="#F59300" />
          </View>
          <View className="flex-col">
            <Text className="text-[10px] font-black text-neutral-450 uppercase tracking-widest">
              Discovery Radius
            </Text>
            <Text className="text-sm font-extrabold text-neutral-800 mt-0.5">
              {activeOption.label}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-down" size={20} color="#9CA3AF" />
      </TouchableOpacity>

      {/* Radius selector Bottom Sheet Modal */}
      <Modal
        visible={isOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsOpen(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setIsOpen(false)}
          className="flex-1 justify-end bg-black/50"
        >
          <TouchableWithoutFeedback>
            <View className="bg-white rounded-t-[32px] h-[55%] max-h-[480px] p-6 shadow-2xl w-full">
              {/* Drag Handle Indicator */}
              <View className="w-12 h-1 bg-neutral-200 rounded-full mx-auto mb-5" />

              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-lg font-black text-neutral-900">Select Discovery Radius</Text>
                <TouchableOpacity
                  onPress={() => setIsOpen(false)}
                  className="p-1"
                >
                  <Ionicons name="close" size={20} color="#4B5563" />
                </TouchableOpacity>
              </View>

              {/* Options List */}
              <ScrollView className="flex-1 py-1" showsVerticalScrollIndicator={false}>
                {RADIUS_OPTIONS.map((opt) => {
                  const isActive = value === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.label}
                      onPress={() => {
                        onChange(opt.value);
                        setIsOpen(false);
                      }}
                      className={`flex-row items-center justify-between p-3.5 my-1 rounded-2xl ${
                        isActive ? 'bg-primary-50' : 'active:bg-neutral-50'
                      }`}
                    >
                      <Text className={`text-xs ${isActive ? 'text-primary-500 font-extrabold' : 'text-neutral-700 font-bold'}`}>
                        {opt.label}
                      </Text>
                      {isActive && <Ionicons name="checkmark-circle" size={18} color="#F59300" />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
