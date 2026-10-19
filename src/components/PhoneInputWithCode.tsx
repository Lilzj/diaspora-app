// ─────────────────────────────────────────────────────────────────────────────
// A phone number, with the dialling code of the member's own country locked in
//
// The owner's decision (13 Oct 2026): we know the country a member lives in,
// so a contact number starts with that country's code and the member types
// only the local number. Registration already worked this way.
//
// What this replaced: a picker of seven hard-coded countries that always
// opened on Mauritius whoever was signed in, so a member in Lagos who did not
// notice it saved a Nigerian number behind +230. It also reported the bare code
// ("+230") as the number when nothing was typed, so an empty optional field
// was sent as a phone number.
//
// The value it reports is E.164 ("+23057123456"), built by `composeE164`, which
// drops a leading trunk zero ("05712…" is typed out of habit) — or an empty
// string when there are no digits.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { useThemeTokens } from '@/design-system';
import { callingCodeForCountry, composeE164, countryByCode } from '@/lib/calling-code';
import { useAuthStore } from '@/store/auth';

interface PhoneInputWithCodeProps {
  label: string;
  value: string;
  onChangePhone: (fullNumber: string) => void;
  placeholder?: string;
}

/** The national part of a stored number, when it carries this calling code. */
function nationalPart(value: string, callingCode: string | null): string {
  if (!value) return '';
  if (callingCode && value.replace(/\s+/g, '').startsWith(callingCode)) {
    return value.replace(/\s+/g, '').slice(callingCode.length);
  }
  return value;
}

// No national example (16 Oct 2026): '5 712 3456' and callers' '7700 900000' were one
// country's format shown to every member, beside every calling code.
export function PhoneInputWithCode({ label, value, onChangePhone, placeholder = 'Phone number' }: PhoneInputWithCodeProps) {
  const tokens = useThemeTokens();
  const residence = useAuthStore((state) => state.user?.residenceCountry ?? null);

  const country = countryByCode(residence);
  const callingCode = callingCodeForCountry(residence);

  const [national, setNational] = useState(() => nationalPart(value, callingCode));

  // A value set from outside (a restored draft, a saved contact) replaces what is shown.
  useEffect(() => {
    setNational(nationalPart(value, callingCode));
  }, [value, callingCode]);

  const handleChange = (text: string) => {
    setNational(text);

    const hasDigits = /\d/.test(text);
    if (!hasDigits) {
      onChangePhone('');
    } else if (text.trim().startsWith('+')) {
      // A number already in international form — one saved before this field
      // locked the code, or a foreign line the member wrote out in full — is
      // kept as written rather than glued behind the member's own code.
      onChangePhone(text.replace(/\s+/g, ''));
    } else if (callingCode) {
      onChangePhone(composeE164(callingCode, text));
    } else {
      // No country on the account: the member types the whole number.
      onChangePhone(text.trim());
    }
  };

  return (
    <View className="mb-4 w-full">
      <Text className="text-xs font-bold text-content-muted uppercase tracking-widest mb-2">{label}</Text>

      <View className="flex-row items-center border border-subtle rounded-2xl bg-surface-background px-4 h-14">
        {callingCode ? (
          <View
            accessible
            accessibilityLabel={`Dialling code ${callingCode}${country ? `, ${country.name}` : ''}`}
            className="flex-row items-center pr-3 border-r border-subtle"
          >
            {country ? <Text className="text-xl mr-1.5">{country.flag}</Text> : null}
            <Text className="text-base font-semibold text-content-strong">{callingCode}</Text>
          </View>
        ) : null}

        <TextInput
          placeholder={callingCode ? placeholder : 'Phone number, with country code'}
          value={national}
          onChangeText={handleChange}
          keyboardType="phone-pad"
          accessibilityLabel={label}
          className={`flex-1 text-base font-semibold ${callingCode ? 'pl-3' : ''}`}
          style={{ color: tokens.color.text.primary }}
          placeholderTextColor={tokens.color.text.placeholder}
        />
      </View>
    </View>
  );
}
