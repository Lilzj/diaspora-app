// List a home: the rent, in the member's currency, and the terms of the lease.
// Lifted out of `app/housing/create.tsx` (FSOLID-001), which composes it.

import { useState } from 'react';
import { useMemberCurrency } from '@/lib/domain/member-currency';
import { currencySymbol as symbolFor } from '@/lib/domain/money';

export function useHousingPricing() {
  // STEP 4: Pricing & Lease
  const [rent, setRent] = useState('');
  // From the country of residence, not chosen (13 Oct 2026). It defaulted to GBP,
  // so a home in Mauritius could be listed at a rent in pounds.
  const memberCurrency = useMemberCurrency();
  const currency = memberCurrency.code;
  const [deposit, setDeposit] = useState('');
  const [billsIncluded, setBillsIncluded] = useState(false);
  const [internetIncluded, setInternetIncluded] = useState(true);
  const [parkingAvailable, setParkingAvailable] = useState(false);
  const [leaseDuration, setLeaseDuration] = useState('');
  const [availabilityDate, setAvailabilityDate] = useState('Available Now');
  const getCurrencySymbol = () => {
    return symbolFor(currency);
  };

  return {
    rent, setRent, memberCurrency, currency, deposit, setDeposit, billsIncluded, setBillsIncluded,
    internetIncluded, setInternetIncluded, parkingAvailable, setParkingAvailable, leaseDuration,
    setLeaseDuration, availabilityDate, setAvailabilityDate, getCurrencySymbol,
  };
}

/** What `useHousingPricing` holds, as the screen reads it. */
export type HousingPricing = ReturnType<typeof useHousingPricing>;
