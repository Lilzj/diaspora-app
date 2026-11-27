// List a home: the landlord's contact details, prefilled from what the platform already holds.
// Lifted out of `app/housing/create.tsx` (FSOLID-001), which composes it.

import { useState, useEffect } from 'react';
import { type LandlordContact, fetchMyLandlordContact } from '@/lib/api/housing-listings-api';

export function useHousingContact() {
  // STEP 5: Contact
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  // **Whether the platform says these out loud, which is the only part of this
  // it keeps.** This was `preferredContactMethod`, one of WhatsApp, a phone
  // call, email or an in-app message — and the platform models none of that for
  // housing. `LandlordContact` holds a number, an address, a website and one
  // flag, `ShowPublicly`, defaulting to no; a member choosing between WhatsApp
  // and a phone call was choosing between two things that are stored
  // identically. Nor did any of it leave the screen: the whole step was
  // collected, written into the draft, and never sent anywhere.
  //
  // Default false, matching the domain. A phone number on a public page is
  // harvested within the hour, and publishing one by default is not a decision
  // this form gets to make on a member's behalf.
  const [publishContact, setPublishContact] = useState(false);

  // What the platform already holds, so an unchanged field is not re-sent and a
  // returning landlord is not asked to type their own number again.
  const [heldContact, setHeldContact] = useState<LandlordContact | null>(null);

  // The contact details the platform already has, if this member has let
  // something before. A first-time landlord has no profile and no details, and
  // the read says so rather than failing.
  useEffect(() => {
    let cancelled = false;

    fetchMyLandlordContact()
      .then((held) => {
        if (cancelled || !held) return;

        setHeldContact(held);
        setContactPhone(held.phoneNumber ?? '');
        setContactEmail(held.email ?? '');
        setPublishContact(held.showContactPublicly);
      })
      .catch(() => {
        // Not fatal and not worth a message: the fields stay empty, whatever
        // the member types is sent, and the listing is unaffected either way.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    contactPhone, setContactPhone, contactEmail, setContactEmail, publishContact, setPublishContact,
    heldContact,
  };
}

/** What `useHousingContact` holds, as the screen reads it. */
export type HousingContact = ReturnType<typeof useHousingContact>;
