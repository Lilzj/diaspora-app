import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, TextInput, TouchableWithoutFeedback } from 'react-native';

interface CountryItem {
  name: string;
  code: string;
  flag: string;
}

const COUNTRIES: CountryItem[] = [
  { name: 'Mauritius', code: '+230', flag: '🇲🇺' },
  { name: 'United Kingdom', code: '+44', flag: '🇬🇧' },
  { name: 'Nigeria', code: '+234', flag: '🇳🇬' },
  { name: 'Ghana', code: '+233', flag: '🇬🇭' },
  { name: 'Senegal', code: '+221', flag: '🇸🇳' },
  { name: 'Kenya', code: '+254', flag: '🇰🇪' },
  { name: 'United States', code: '+1', flag: '🇺🇸' },
];

interface PhoneInputWithCodeProps {
  label: string;
  value: string;
  onChangePhone: (fullNumber: string) => void;
  placeholder?: string;
}

export function PhoneInputWithCode({ label, value, onChangePhone, placeholder = '7700 900000' }: PhoneInputWithCodeProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<CountryItem>(COUNTRIES[0]);
  const [rawPhone, setRawPhone] = useState('');

  // Sync internal state with value
  useEffect(() => {
    if (value) {
      // Find if value starts with any of our country codes
      const matched = COUNTRIES.find(c => value.startsWith(c.code));
      if (matched) {
        setSelectedCountry(matched);
        setRawPhone(value.substring(matched.code.length));
      } else {
        setRawPhone(value);
      }
    } else {
      setRawPhone('');
    }
  }, [value]);

  const handlePhoneChange = (text: string) => {
    setRawPhone(text);
    const cleanRaw = text.replace(/\s+/g, '');
    onChangePhone(`${selectedCountry.code}${cleanRaw}`);
  };

  const handleCountrySelect = (country: CountryItem) => {
    setSelectedCountry(country);
    setIsModalOpen(false);
    const cleanRaw = rawPhone.replace(/\s+/g, '');
    onChangePhone(`${country.code}${cleanRaw}`);
  };

  return (
    <View className="mb-4 w-full">
      <Text className="text-xs font-bold text-neutral-450 uppercase tracking-widest mb-2">{label}</Text>

      <View className="flex-row items-center border border-neutral-200 rounded-2xl bg-neutral-55 px-4 h-14">
        {/* Country Selector */}
        <TouchableOpacity
          onPress={() => setIsModalOpen(true)}
          className="flex-row items-center pr-3 border-r border-neutral-200"
          activeOpacity={0.7}
        >
          <Text className="text-xl mr-1.5">{selectedCountry.flag}</Text>
          <Text className="text-base font-semibold text-neutral-800">{selectedCountry.code}</Text>
          <Text className="text-xs text-neutral-400 ml-1.5">▼</Text>
        </TouchableOpacity>

        {/* Input Field */}
        <TextInput
          placeholder={placeholder}
          value={rawPhone}
          onChangeText={handlePhoneChange}
          keyboardType="phone-pad"
          className="flex-1 text-base font-semibold pl-3"
          style={{ color: '#1F2937' }}
          placeholderTextColor="#9CA3AF"
        />
      </View>

      {/* Country List Modal */}
      <Modal
        visible={isModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsModalOpen(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setIsModalOpen(false)}
          className="flex-1 justify-end bg-black/40"
        >
          <TouchableWithoutFeedback>
            <View className="bg-white rounded-t-3xl p-6 min-h-[350px] shadow-2xl w-full">
              <View className="flex-row items-center justify-between mb-6">
                <Text className="text-xl font-bold text-neutral-900">Select Country</Text>
                <TouchableOpacity onPress={() => setIsModalOpen(false)} className="p-2">
                  <Text className="text-neutral-500 font-semibold">Cancel</Text>
                </TouchableOpacity>
              </View>

              <FlatList
                data={COUNTRIES}
                keyExtractor={(item) => item.code}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => handleCountrySelect(item)}
                    className="flex-row items-center justify-between py-4 border-b border-neutral-100 active:bg-neutral-50"
                  >
                    <View className="flex-row items-center">
                      <Text className="text-2xl mr-3">{item.flag}</Text>
                      <Text className="text-base font-medium text-neutral-800">{item.name}</Text>
                    </View>
                    <Text className="text-base font-semibold text-neutral-500">{item.code}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
