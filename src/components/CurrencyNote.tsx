// Stands where a "Currency" chip row used to be (13 Oct 2026): it tells the
// member what their prices are in, and offers no choice. See member-currency.

import React from 'react';
import { Text, View } from 'react-native';

import type { MemberCurrency } from '@/lib/member-currency';
import { allCountries } from '@/mocks/countries';

export function CurrencyNote({ currency }: { currency: MemberCurrency }) {
  const country = allCountries.find((item) => item.code === currency.countryCode)?.name;

  return (
    <View
      accessibilityRole="text"
      className="flex-row items-center bg-surface-muted rounded-xl px-3 py-2 mb-4"
    >
      <Text className="text-xs font-bold text-content-secondary">
        {currency.isKnown && country
          ? `Prices are in ${currency.code}, the currency of ${country}.`
          : `Prices are in ${currency.code}.`}
      </Text>
    </View>
  );
}
