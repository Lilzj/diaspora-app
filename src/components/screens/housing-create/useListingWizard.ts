// List a home: which step the member is on, and whether Publish is in flight.
// Lifted out of `app/housing/create.tsx` (FSOLID-001), which composes it.

import { useState } from 'react';

export function useListingWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  return { currentStep, setCurrentStep, isSubmitting, setIsSubmitting };
}

/** What `useListingWizard` holds, as the screen reads it. */
export type ListingWizard = ReturnType<typeof useListingWizard>;
