// List a home, step 4: the rent and the lease.
// Lifted out of `app/housing/create.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Input } from '@/components/Input';
import { DatePickerInput } from '@/components/DatePickerInput';
import { CurrencyNote } from '@/components/CurrencyNote';
import { AVAILABILITY_OPTIONS } from '@/components/screens/housing-create/form';
import type {
  AvailabilityCalendar,
} from '@/components/screens/housing-create/useAvailabilityCalendar';
import type { HousingCatalogue } from '@/components/screens/housing-create/useHousingCatalogue';
import type { HousingPricing } from '@/components/screens/housing-create/useHousingPricing';

interface PricingStepProps {
  calendar: AvailabilityCalendar;
  catalogue: HousingCatalogue;
  pricing: HousingPricing;
}

export function PricingStep({ calendar, catalogue, pricing }: PricingStepProps) {
  const { setCalendarVisible } = calendar;
  const { leaseOptions } = catalogue;
  const {
    rent, setRent, memberCurrency, deposit, setDeposit, billsIncluded, setBillsIncluded,
    internetIncluded, setInternetIncluded, parkingAvailable, setParkingAvailable, leaseDuration,
    setLeaseDuration, availabilityDate, setAvailabilityDate,
  } = pricing;

  return (
    <View className="pb-8">
      <Text className="text-sm text-content-muted mb-6 leading-relaxed">
        Configure rent, required deposit, utility parameters, and availability date.
      </Text>

      <CurrencyNote currency={memberCurrency} />

      <Input
        label="Monthly Rent Amount"
        placeholder="e.g. 1500"
        value={rent}
        onChangeText={setRent}
        keyboardType="numeric"
      />

      <Input
        label="Security Deposit Required"
        placeholder="e.g. 1500"
        value={deposit}
        onChangeText={setDeposit}
        keyboardType="numeric"
      />

      {/* Utility switches */}
      <Text className="text-xs font-extrabold text-content-faint uppercase tracking-widest mb-3">Amenities Included in Rent</Text>
      <View className="flex-row flex-wrap gap-2.5 mb-6">
        {[
          { label: '🔌 Bills Included', value: billsIncluded, setter: setBillsIncluded },
          { label: '🌐 Internet Included', value: internetIncluded, setter: setInternetIncluded },
          { label: '🚗 Parking Included', value: parkingAvailable, setter: setParkingAvailable },
        ].map((perk, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => perk.setter(!perk.value)}
            className={`px-4 py-2.5 rounded-2xl flex-row items-center border ${
                      perk.value ? 'bg-surface-muted border-primary-300' : 'bg-surface-background border-subtle'
                    }`}
          >
            <Text className={`text-xs font-bold ${perk.value ? 'text-primary-600' : 'text-content-secondary'}`}>
              {perk.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Lease */}
      <Text className="text-xs font-bold text-content-secondary mb-2">Lease Length</Text>
      <View className="flex-row flex-wrap gap-2.5 mb-6">
        {leaseOptions.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            onPress={() => setLeaseDuration(opt.key)}
            className={`px-4 py-3 rounded-xl border items-center ${
                      leaseDuration === opt.key ? 'bg-surface-muted border-primary-500' : 'bg-surface-background border-subtle'
                    }`}
          >
            <Text className="text-xs font-bold text-content-primary">{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Move-in */}
      <Text className="text-xs font-bold text-content-secondary mb-2">Availability Date</Text>
      <View className="flex-row flex-wrap gap-2 mb-3">
        {AVAILABILITY_OPTIONS.map((opt) => {
          const isPresetActive = opt !== 'Custom Date' 
            ? availabilityDate === opt
            : !['Available Now', 'Available This Week', 'Available Next Month'].includes(availabilityDate);
          return (
            <TouchableOpacity
              key={opt}
              onPress={() => {
                if (opt === 'Custom Date') {
                  setCalendarVisible(true);
                } else {
                  setAvailabilityDate(opt);
                }
              }}
              className={`px-3 py-2 rounded-xl border ${
                        isPresetActive ? 'bg-surface-muted border-primary-500' : 'bg-surface-background border-subtle'
                      }`}
            >
              <Text className="text-xs font-bold text-content-primary">{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {!['Available Now', 'Available This Week', 'Available Next Month'].includes(availabilityDate) && (
        <DatePickerInput
          label="Selected Availability Date"
          value={availabilityDate.match(/^\d{4}-\d{2}-\d{2}$/) ? availabilityDate : ''}
          onChangeDate={setAvailabilityDate}
          placeholder="Select custom availability date..."
        />
      )}
    </View>
  );
}
