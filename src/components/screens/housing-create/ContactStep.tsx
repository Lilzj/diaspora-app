// List a home, step 5: how tenants reach the landlord.
// Lifted out of `app/housing/create.tsx` (FSOLID-001), which composes it.

import React from 'react';
import { View, Text } from 'react-native';
import { ContactChoice } from '@/components/forms/ContactChoice';
import { Input } from '@/components/Input';
import { PhoneInputWithCode } from '@/components/PhoneInputWithCode';
import type { HousingContact } from '@/components/screens/housing-create/useHousingContact';

interface ContactStepProps {
  contact: HousingContact;
}

export function ContactStep({ contact }: ContactStepProps) {
  const {
    contactPhone, setContactPhone, contactEmail, setContactEmail, publishContact, setPublishContact,
  } = contact;

  return (
    <View className="pb-8">
      <Text className="text-sm text-content-muted mb-6 leading-relaxed">
        How people reach you about your homes. These are kept on your landlord
        profile and used for every listing you post, not just this one.
      </Text>

      <PhoneInputWithCode
        label="WhatsApp / Call Phone Number"
        value={contactPhone}
        onChangePhone={setContactPhone}
      />

      <Input
        label="Email Address"
        placeholder="e.g. host@diasporahosts.co.uk"
        value={contactEmail}
        onChangeText={setContactEmail}
        keyboardType="email-address"
      />

      {/* Two options, not four, and the second one is "both". The
          platform keeps one flag for housing (`LandlordContact`): whether
          a browser may see the number and email. Messaging is never
          switched off by it. Shared with the marketplace since 16 Oct 2026. */}
      <ContactChoice
        shareDetails={publishContact}
        onChange={setPublishContact}
        privateDetail="Your number and email stay private. Members reach you in the app."
        sharedLabel="Messages, phone or email"
        sharedDetail="Members can still message you in the app, and your number and email are shown on your listings."
      />
    </View>
  );
}
